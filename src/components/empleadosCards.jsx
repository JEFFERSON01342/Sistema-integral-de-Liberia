import { createPortal } from "react-dom";
import { DollarSign, Pencil, Link2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

const ROLES_PAGO = ["superadmin", "admin", "gerente"];
const fechaHoyLocal = () => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
};

const SWAL_OPTS = {
    background: "#1e1e1e",
    color: "#fff",
    confirmButtonColor: "#d33",
    cancelButtonColor: "#6b7280",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
};

export default function EmpleadosCards({
    id_empleado,
    nombre_completo,
    identificacion,
    email,
    telefono,
    puesto,
    salario_mensual,
    clase_trabajador,
    frecuencia_pago,
    id_sucursal,
    id_perfil,
    estado,
    rol,
    onActualizar,
    onPagoRegistrado,
}) {
    const { empresaId } = useEmpresa();
    const puedePagar = ROLES_PAGO.includes(rol);
    const puedeContabilizar = ["superadmin", "admin"].includes(rol);

    /* ---- Modal Pagar Salario ---- */
    const [modalPago, setModalPago] = useState(false);
    const [guardandoPago, setGuardandoPago] = useState(false);
    const [monto, setMonto] = useState(salario_mensual || 0);
    const [idDetalleNomina, setIdDetalleNomina] = useState(null);
    const [idPeriodoPago, setIdPeriodoPago] = useState(null);
    const [pagoRegistrado, setPagoRegistrado] = useState(false);
    const [devengoContabilizado, setDevengoContabilizado] = useState(false);
    const [cuentasPago, setCuentasPago] = useState([]);
    const [idCuentaPago, setIdCuentaPago] = useState("");
    const [metodo, setMetodo] = useState("Efectivo");
    const [fecha, setFecha] = useState(fechaHoyLocal);
    const [concepto, setConcepto] = useState("Pago de salario");
    const [modalPerfil, setModalPerfil] = useState(false);
    const [perfiles, setPerfiles] = useState([]);
    const [perfilSeleccionado, setPerfilSeleccionado] = useState(id_perfil || "");
    const [cargandoPerfiles, setCargandoPerfiles] = useState(false);
    const [guardandoPerfil, setGuardandoPerfil] = useState(false);
    const [contabilizandoPago, setContabilizandoPago] = useState(false);
    const cuentasDisponiblesPago = cuentasPago.filter((cuenta) =>
        metodo === "Efectivo" ? cuenta.es_efectivo : cuenta.es_banco
    );

    /* ---- Modal Editar ---- */
    const [modalEdit, setModalEdit] = useState(false);
    const [guardandoEdit, setGuardandoEdit] = useState(false);
    const [editForm, setEditForm] = useState({
        nombre_completo: nombre_completo || "",
        identificacion: identificacion || "",
        email: email || "",
        telefono: telefono || "",
        puesto: puesto || "",
        salario_mensual: salario_mensual || 0,
        clase_trabajador: clase_trabajador || "empleado",
    });

    /* ---- Handlers ---- */
    const abrirPago = async () => {
        const { data, error } = await supabase
            .from("nomina_detalle")
            .select("id, salario_neto, monto_pagado, id_periodo")
            .eq("id_empresa", empresaId)
            .eq("id_empleado", id_empleado)
            .eq("pagado", false)
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) {
            toast.error(`No se pudo consultar el saldo pendiente: ${error.message}`);
            return;
        }
        if (!data) {
            toast.error("No hay una nómina procesada pendiente para este empleado.");
            return;
        }
        const [cuentasResult, pagosResult, periodoResult] = await Promise.all([
            supabase
                .from("cuentas_contables")
                .select("id_cuenta, codigo, nombre, es_banco, es_efectivo")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .eq("naturaleza", "ACTIVO")
                .eq("es_grupo", false)
                .eq("permite_movimientos", true)
                .or("es_banco.eq.true,es_efectivo.eq.true")
                .order("codigo", { ascending: true }),
            supabase
                .from("pagos_salarios")
                .select("id_pago_salario, id_comprobante_pago")
                .eq("id_empresa", empresaId)
                .eq("id_detalle_nomina", data.id)
                .is("id_comprobante_pago", null),
            supabase
                .from("nomina_periodos")
                .select("id_comprobante_nomina")
                .eq("id", data.id_periodo)
                .maybeSingle(),
        ]);
        if (cuentasResult.error || pagosResult.error || periodoResult.error) {
            const error = cuentasResult.error || pagosResult.error || periodoResult.error;
            toast.error(`No se pudo preparar el pago: ${error.message}`);
            return;
        }
        if (pagosResult.data?.length) {
            toast.error("Hay pagos previos de este período sin contabilizar. Contabilícelos en el historial antes de agregar otro.");
            return;
        }
        setCuentasPago(cuentasResult.data || []);
        setIdCuentaPago("");
        setIdDetalleNomina(data.id);
        setIdPeriodoPago(data.id_periodo);
        setPagoRegistrado(false);
        setDevengoContabilizado(Boolean(periodoResult.data?.id_comprobante_nomina));
        setMonto(Math.max(0, Number(data.salario_neto) - Number(data.monto_pagado || 0)).toFixed(2));
        setMetodo("Efectivo");
        setFecha(fechaHoyLocal());
        setConcepto("Pago de salario");
        setModalPago(true);
    };

    const registrarPago = async (e) => {
        e.preventDefault();
        const montoNum = parseFloat(monto);
        if (!montoNum || montoNum <= 0) {
            toast.error("⚠️ El monto debe ser mayor a cero.");
            return;
        }
        setGuardandoPago(true);
        try {
            const { error } = await supabase.rpc("registrar_pago_nomina", {
                p_id_detalle: idDetalleNomina,
                p_monto: montoNum,
                p_metodo: metodo,
                p_fecha_pago: fecha,
                p_concepto: concepto?.trim() || "Pago de salario",
                p_id_cuenta_pago: Number(idCuentaPago),
            });
            if (error) throw error;
            toast.success(`Pago registrado para ${nombre_completo}. El asiento se contabiliza por separado.`);
            setPagoRegistrado(true);
            onPagoRegistrado?.();
        } catch (err) {
            toast.error(`⚠️ ${err.message || "Error al registrar el pago"}`);
        } finally {
            setGuardandoPago(false);
        }
    };

    const contabilizarPago = async () => {
        setContabilizandoPago(true);
        try {
            const { data, error } = await supabase.rpc("contabilizar_pagos_nomina", {
                p_id_periodo: idPeriodoPago,
            });
            if (error) throw error;
            toast.success(data === 0
                ? "No hay pagos pendientes de contabilizar."
                : `Se contabilizaron ${data} grupo(s) de pago.`);
            setModalPago(false);
            onPagoRegistrado?.();
        } catch (error) {
            toast.error(`No se pudo contabilizar el pago: ${error.message}`);
        } finally {
            setContabilizandoPago(false);
        }
    };

    const handleDarDeBaja = async () => {
        const res = await Swal.fire({
            ...SWAL_OPTS,
            title: "¿Dar de baja?",
            text: `Se cambiará el estado de ${nombre_completo} a Inactivo.`,
            icon: "warning",
            confirmButtonText: "Sí, dar de baja",
        });
        if (!res.isConfirmed) return;
        const { error } = await supabase
            .from("empleados")
            .update({ estado: "Inactivo" })
            .eq("id_empleado", id_empleado);
        if (error) return toast.error("Error: " + error.message);
        toast.success(`${nombre_completo} dado de baja`);
        onActualizar?.();
    };

    const abrirVinculoPerfil = async () => {
        setCargandoPerfiles(true);
        let query = supabase
            .from("perfiles")
            .select("id, nombre_completo, email, rol")
            .eq("id_empresa", empresaId)
            .eq("activo", true)
            .neq("rol", "cliente")
            .order("nombre_completo", { ascending: true });
        query = id_sucursal == null
            ? query.is("id_sucursal", null)
            : query.eq("id_sucursal", id_sucursal);
        const { data, error } = await query;
        setCargandoPerfiles(false);
        if (error) {
            toast.error(`No se pudieron cargar las cuentas de personal: ${error.message}`);
            return;
        }
        setPerfiles(data || []);
        setPerfilSeleccionado(id_perfil || "");
        setModalPerfil(true);
    };

    const guardarVinculoPerfil = async (e) => {
        e.preventDefault();
        setGuardandoPerfil(true);
        try {
            const { error } = await supabase.rpc("vincular_perfil_empleado", {
                p_id_empleado: id_empleado,
                p_id_perfil: perfilSeleccionado || null,
            });
            if (error) throw error;
            toast.success("Vínculo de cuenta actualizado.");
            setModalPerfil(false);
            onActualizar?.();
        } catch (error) {
            toast.error(`No se pudo vincular la cuenta: ${error.message}`);
        } finally {
            setGuardandoPerfil(false);
        }
    };

    const handleGuardarEdit = async (e) => {
        e.preventDefault();
        setGuardandoEdit(true);
        const { error } = await supabase
            .from("empleados")
            .update({
                nombre_completo: editForm.nombre_completo,
                identificacion: editForm.identificacion,
                email: editForm.email,
                telefono: editForm.telefono,
                puesto: editForm.puesto,
                salario_mensual: Number(editForm.salario_mensual) || 0,
                clase_trabajador: editForm.clase_trabajador,
                frecuencia_pago: editForm.clase_trabajador === "obrero" ? "semanal" : "quincenal",
            })
            .eq("id_empleado", id_empleado);
        setGuardandoEdit(false);
        if (error) return toast.error("Error: " + error.message);
        toast.success("Empleado actualizado");
        setModalEdit(false);
        onActualizar?.();
    };

    const setEdit = (k) => (e) =>
        setEditForm((f) => ({ ...f, [k]: e.target.value }));

    /* ---- Render ---- */
    return (
        <>
            <div className="flex flex-col md:flex-row border border-secondary rounded-lg p-4 justify-between md:items-center shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="flex flex-col">
                    <div className="flex flex-row gap-2 items-center mb-2 flex-wrap">
                        <h4 className="font-semibold text-title text-lg">{nombre_completo}</h4>
                        <span className={`text-xs rounded-[20px] py-1 px-3 ${estado === "Activo" ? "bg-button text-button" : "bg-red-600/20 text-red-400"}`}>
                            {estado || "Activo"}
                        </span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:gap-2 text-sm text-subtitle mb-1">
                        <span>{identificacion}</span>
                        <span className="hidden md:inline">|</span>
                        <span>{email}</span>
                        <span className="hidden md:inline">|</span>
                        <span>{telefono}</span>
                    </div>
                    <p><span className="text-subtitle">Salario: </span>C$ {(salario_mensual || 0).toFixed(2)}</p>
                    <p className="text-xs text-subtitle">
                        {clase_trabajador === "obrero" ? "Obrero · semanal" : "Empleado · quincenal"}
                        {frecuencia_pago ? ` (máximo ${frecuencia_pago === "semanal" ? 7 : 15} días)` : ""}
                    </p>
                    {id_perfil && <p className="text-xs text-green-500">Cuenta del panel vinculada</p>}
                </div>
                <div className="flex flex-row flex-wrap gap-3 items-center mt-4 md:mt-0">
                    <button
                        onClick={handleDarDeBaja}
                        disabled={estado === "Inactivo"}
                        className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Dar de baja
                    </button>
                    {puedePagar && (
                        <button
                            onClick={abrirPago}
                            className="border border-secondary text-green-500 p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition flex items-center gap-1"
                        >
                            <DollarSign size={14} /> Pagar Salario
                        </button>
                    )}
                    {puedePagar && (
                        <button
                            onClick={abrirVinculoPerfil}
                            disabled={cargandoPerfiles}
                            className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition flex items-center gap-1 disabled:opacity-60"
                        >
                            <Link2 size={14} /> {cargandoPerfiles ? "Cargando..." : id_perfil ? "Cambiar cuenta" : "Vincular cuenta"}
                        </button>
                    )}
                    <button
                        onClick={() => setModalEdit(true)}
                        className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"
                    >
                        <Pencil size={14} />
                    </button>
                </div>
            </div>

            {/* ---- Modal Pagar Salario (portal) ---- */}
            {modalPago && createPortal(
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-[9999] backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setModalPago(false)} />
                    <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-md shadow-lg animate-fade-in border border-secondary">
                        <h3 className="text-2xl font-semibold mb-6">Pagar Salario</h3>
                        <form onSubmit={registrarPago} className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Empleado</label>
                                <input type="text" value={nombre_completo} readOnly className="bg-input border border-secondary rounded-lg p-3 opacity-80" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Monto (C$)</label>
                                <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Método de Pago</label>
                                <select
                                    value={metodo}
                                    onChange={(e) => {
                                        setMetodo(e.target.value);
                                        setIdCuentaPago("");
                                    }}
                                    className="bg-input border border-secondary rounded-lg p-3"
                                >
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia">Transferencia</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Cuenta contable de salida</label>
                                <select
                                    value={idCuentaPago}
                                    onChange={(e) => setIdCuentaPago(e.target.value)}
                                    required
                                    disabled={pagoRegistrado}
                                    className="bg-input border border-secondary rounded-lg p-3"
                                >
                                    <option value="">Seleccione banco o caja...</option>
                                    {cuentasDisponiblesPago.map((cuenta) => (
                                        <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                            {cuenta.codigo} — {cuenta.nombre}
                                        </option>
                                    ))}
                                </select>
                                {!cuentasDisponiblesPago.length && (
                                    <span className="text-xs text-amber-400">No hay una cuenta activa compatible con este método.</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Fecha del Pago</label>
                                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="bg-input border border-secondary rounded-lg p-3 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Concepto</label>
                                <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex justify-end gap-4 mt-2">
                                <button type="button" onClick={() => setModalPago(false)} className="bg-secondary text-button-text cursor-pointer border border-secondary py-2 px-6 rounded-lg hover:scale-110 transition">Cerrar</button>
                                {!pagoRegistrado ? (
                                    <button type="submit" disabled={guardandoPago || !cuentasDisponiblesPago.length} className="bg-button text-button py-2 cursor-pointer px-4 rounded-lg hover:bg-[#E8E8E8] transition flex items-center gap-2 disabled:opacity-60">
                                        <Save size={18} />{guardandoPago ? "Registrando..." : "Registrar Pago"}
                                    </button>
                                ) : (
                                    !devengoContabilizado ? (
                                        <span className="text-xs text-subtitle">Contabilice primero la nómina desde Historial.</span>
                                    ) : puedeContabilizar ? (
                                        <button type="button" onClick={contabilizarPago} disabled={contabilizandoPago} className="bg-button text-button py-2 cursor-pointer px-4 rounded-lg hover:bg-[#E8E8E8] transition flex items-center gap-2 disabled:opacity-60">
                                            <Save size={18} />{contabilizandoPago ? "Contabilizando..." : "Contabilizar Pago"}
                                        </button>
                                    ) : (
                                        <span className="text-xs text-subtitle">Un administrador debe contabilizar el desembolso desde el historial.</span>
                                    )
                                )}
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {modalPerfil && createPortal(
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-[9999] backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setModalPerfil(false)} />
                    <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-md shadow-lg border border-secondary">
                        <h3 className="text-xl font-semibold mb-2">Vincular cuenta de acceso</h3>
                        <p className="text-sm text-subtitle mb-5">{nombre_completo}</p>
                        <form onSubmit={guardarVinculoPerfil} className="flex flex-col gap-5">
                            <select
                                value={perfilSeleccionado}
                                onChange={(e) => setPerfilSeleccionado(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                            >
                                <option value="">Sin cuenta vinculada</option>
                                {perfiles.map((perfil) => (
                                    <option key={perfil.id} value={perfil.id}>
                                        {perfil.nombre_completo || perfil.email} — {perfil.rol}
                                    </option>
                                ))}
                            </select>
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setModalPerfil(false)} className="bg-secondary border border-secondary py-2 px-5 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={guardandoPerfil} className="bg-button text-button py-2 px-5 rounded-lg flex items-center gap-2 disabled:opacity-60">
                                    <Save size={16} /> {guardandoPerfil ? "Guardando..." : "Guardar"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ---- Modal Editar Empleado (portal) ---- */}
            {modalEdit && createPortal(
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-[9999] backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setModalEdit(false)} />
                    <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-lg shadow-lg animate-fade-in border border-secondary">
                        <h3 className="text-2xl font-semibold mb-6">Editar Empleado</h3>
                        <form onSubmit={handleGuardarEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Nombre Completo</label>
                                <input type="text" required value={editForm.nombre_completo} onChange={setEdit("nombre_completo")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Identificación</label>
                                <input type="text" value={editForm.identificacion} onChange={setEdit("identificacion")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Email</label>
                                <input type="email" value={editForm.email} onChange={setEdit("email")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Teléfono</label>
                                <input type="tel" value={editForm.telefono} onChange={setEdit("telefono")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Puesto</label>
                                <input type="text" value={editForm.puesto} onChange={setEdit("puesto")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Salario Mensual (C$)</label>
                                <input type="number" step="0.01" value={editForm.salario_mensual} onChange={setEdit("salario_mensual")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2 md:col-span-2">
                                <label className="text-sm font-medium">Clasificación para calendario de pago</label>
                                <select value={editForm.clase_trabajador} onChange={setEdit("clase_trabajador")} className="bg-input border border-secondary rounded-lg p-3">
                                    <option value="obrero">Obrero — semanal, máximo 7 días</option>
                                    <option value="empleado">Empleado — quincenal, máximo 15 días</option>
                                </select>
                            </div>
                            <div className="md:col-span-2 flex justify-end gap-4 mt-2">
                                <button type="button" onClick={() => setModalEdit(false)} className="bg-secondary text-button-text border border-secondary py-2 px-6 rounded-lg cursor-pointer hover:scale-110 transition">Cancelar</button>
                                <button type="submit" disabled={guardandoEdit} className="bg-button text-button py-2 px-4 rounded-lg cursor-pointer hover:bg-[#E8E8E8] transition flex items-center gap-2 disabled:opacity-60">
                                    <Save size={18} />{guardandoEdit ? "Guardando..." : "Guardar"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
