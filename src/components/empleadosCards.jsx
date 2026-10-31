import { createPortal } from "react-dom";
import { DollarSign, Pencil, Link2, Save, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
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
    departamento,
    id_puesto,
    id_departamento,
    fecha_ingreso,
    cuenta_bancaria,
    departamentosLaborales = [],
    puestosLaborales = [],
    salario_mensual,
    clase_trabajador,
    frecuencia_pago,
    id_sucursal,
    id_perfil,
    rolAccesoPuesto,
    estado,
    rol,
    onActualizar,
    onPagoRegistrado,
}) {
    const { empresaId } = useEmpresa();
    const puedePagar = ROLES_PAGO.includes(rol);
    const puedeContabilizar = ["superadmin", "admin"].includes(rol);
    const puedeVincularCuenta = ["superadmin", "admin"].includes(rol);
    const puedeAdministrarPin = ["superadmin", "admin"].includes(rol);
    const [generandoPin, setGenerandoPin] = useState(false);

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
    const [modalCredenciales, setModalCredenciales] = useState(false);
    const [modoCredenciales, setModoCredenciales] = useState("create");
    const [correoCredencial, setCorreoCredencial] = useState(email || "");
    const [contrasenaTemporal, setContrasenaTemporal] = useState("");
    const [guardandoCredenciales, setGuardandoCredenciales] = useState(false);
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
        id_departamento: id_departamento ? String(id_departamento) : "",
        id_puesto: id_puesto ? String(id_puesto) : "",
        salario_mensual: salario_mensual || 0,
        cuenta_bancaria: cuenta_bancaria || "",
        estado: estado || "Activo",
        clase_trabajador: clase_trabajador || "empleado",
    });
    const puestosDisponiblesEdit = puestosLaborales.filter((puestoItem) =>
        String(puestoItem.id_departamento || "") === editForm.id_departamento
    );
    const puestoEditado = puestosLaborales.find(
        (puestoItem) => String(puestoItem.id_puesto) === editForm.id_puesto
    );

    useEffect(() => {
        setEditForm({
            nombre_completo: nombre_completo || "",
            identificacion: identificacion || "",
            email: email || "",
            telefono: telefono || "",
            id_departamento: id_departamento ? String(id_departamento) : "",
            id_puesto: id_puesto ? String(id_puesto) : "",
            salario_mensual: salario_mensual || 0,
            cuenta_bancaria: cuenta_bancaria || "",
            estado: estado || "Activo",
            clase_trabajador: clase_trabajador || "empleado",
        });
    }, [nombre_completo, identificacion, email, telefono, id_departamento, id_puesto, salario_mensual, cuenta_bancaria, estado, clase_trabajador]);

    /* ---- Handlers ---- */
    const generarPinAsistencia = async () => {
        const confirmacion = await Swal.fire({
            title: "¿Generar o restablecer PIN?",
            text: "El PIN anterior dejará de funcionar. El nuevo PIN solo se mostrará una vez.",
            icon: "warning",
            ...SWAL_OPTS,
            confirmButtonText: "Continuar",
        });
        if (!confirmacion.isConfirmed) return;

        setGenerandoPin(true);
        const { data: pin, error } = await supabase.rpc("generar_pin_asistencia", {
            p_id_empleado: id_empleado,
        });
        setGenerandoPin(false);
        if (error) return toast.error(`No se pudo generar el PIN: ${error.message}`);

        await Swal.fire({
            title: "PIN de asistencia generado",
            text: `PIN de ${nombre_completo}: ${pin}. Anótalo o entrégalo ahora; no se podrá volver a consultar.`,
            icon: "success",
            confirmButtonText: "Entendido",
            background: "#1e1e1e",
            color: "#fff",
        });
    };

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
            .in("rol", rol === "superadmin"
                ? ["admin", "gerente", "contador", "cajero", "despacho", "bodega"]
                : ["gerente", "contador", "cajero", "despacho", "bodega"])
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

    const abrirCredenciales = (modo) => {
        setModoCredenciales(modo);
        setCorreoCredencial(email || "");
        setContrasenaTemporal("");
        setModalCredenciales(true);
    };

    const guardarCredenciales = async (event) => {
        event.preventDefault();
        const correo = correoCredencial.trim().toLowerCase();
        if (!correo) return toast.error("El correo de acceso es obligatorio.");
        if (modoCredenciales === "create" && contrasenaTemporal.length < 12) {
            return toast.error("La contraseña temporal debe tener al menos 12 caracteres.");
        }

        setGuardandoCredenciales(true);
        const { data, error } = await supabase.functions.invoke("gestion-cuenta-empleado", {
            body: {
                action: modoCredenciales,
                id_empleado,
                email: correo,
                ...(contrasenaTemporal ? { password: contrasenaTemporal } : {}),
            },
        });
        setGuardandoCredenciales(false);
        if (error) {
            const detail = await error.context?.json().catch(() => null);
            return toast.error(`No se pudo gestionar la cuenta: ${detail?.error || error.message}`);
        }
        if (data?.error) return toast.error(`No se pudo gestionar la cuenta: ${data.error}`);

        toast.success(data?.message || "Acceso actualizado.");
        setModalCredenciales(false);
        onActualizar?.();
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
        if (id_perfil && puestoEditado?.rol_acceso !== rolAccesoPuesto) {
            if (!puestoEditado?.rol_acceso) {
                return toast.error("Desvincula la cuenta antes de asignar un puesto sin acceso.");
            }
            const confirmacion = await Swal.fire({
                title: "¿Cambiar puesto y acceso?",
                text: `Al guardar, la cuenta vinculada adoptará el rol "${puestoEditado.rol_acceso}".`,
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Guardar y cambiar rol",
                cancelButtonText: "Cancelar",
                background: "#1e1e1e",
                color: "#fff",
            });
            if (!confirmacion.isConfirmed) return;
        }
        setGuardandoEdit(true);
        const { error } = await supabase
            .from("empleados")
            .update({
                nombre_completo: editForm.nombre_completo,
                identificacion: editForm.identificacion,
                email: editForm.email,
                telefono: editForm.telefono,
                id_departamento: editForm.id_departamento ? Number(editForm.id_departamento) : null,
                id_puesto: editForm.id_puesto ? Number(editForm.id_puesto) : null,
                salario_mensual: Number(editForm.salario_mensual) || 0,
                cuenta_bancaria: editForm.cuenta_bancaria || null,
                estado: editForm.estado,
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
                    <p className="text-xs text-subtitle">
                        {[puesto, departamento].filter(Boolean).join(" · ") || "Sin puesto asignado"}
                    </p>
                    {fecha_ingreso && <p className="text-xs text-subtitle">Ingreso: {fecha_ingreso}</p>}
                    {id_perfil && <p className="text-xs text-green-500">Cuenta del panel vinculada</p>}
                </div>
                <div className="flex flex-row flex-wrap gap-3 items-center mt-4 md:mt-0">
                    {puedeAdministrarPin && (
                        <button
                            onClick={generarPinAsistencia}
                            disabled={generandoPin}
                            className="border border-secondary text-blue-400 p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition flex items-center gap-1"
                        >
                            <KeyRound size={14} /> {generandoPin ? "Generando..." : "Generar/restablecer PIN"}
                        </button>
                    )}
                    <button
                        onClick={handleDarDeBaja}
                        disabled={estado === "Inactivo"}
                        className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Dar de baja
                    </button>
                    {(puedePagar && (Boolean(rolAccesoPuesto) || Boolean(id_perfil))) && (
                        <button
                            onClick={abrirPago}
                            className="border border-secondary text-green-500 p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition flex items-center gap-1"
                        >
                            <DollarSign size={14} /> Pagar Salario
                        </button>
                    )}
                    {!rolAccesoPuesto && !id_perfil && (
                        <span className="text-xs text-subtitle">Sin acceso de sistema para este puesto</span>
                    )}
                    {puedeVincularCuenta && (
                        <button
                            onClick={() => abrirCredenciales(id_perfil ? "update" : "create")}
                            disabled={guardandoCredenciales}
                            className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition flex items-center gap-1 disabled:opacity-60"
                        >
                            <KeyRound size={14} /> {id_perfil ? "Gestionar acceso" : "Crear cuenta"}
                        </button>
                    )}
                    {puedeVincularCuenta && (
                        <button
                            onClick={abrirVinculoPerfil}
                            disabled={cargandoPerfiles}
                            className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition flex items-center gap-1 disabled:opacity-60"
                        >
                            <Link2 size={14} /> {cargandoPerfiles ? "Cargando..." : "Vincular cuenta existente"}
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
                        <p className="text-xs text-subtitle mb-4">
                            Al guardar, la cuenta recibirá el rol configurado en el puesto del empleado.
                        </p>
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

            {modalCredenciales && createPortal(
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-[9999] backdrop-blur-sm p-4">
                    <div className="absolute inset-0" onClick={() => setModalCredenciales(false)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-secondary bg-primary p-7 text-title shadow-2xl">
                        <h3 className="mb-2 text-xl font-semibold">
                            {modoCredenciales === "create" ? "Crear cuenta de acceso" : "Gestionar cuenta de acceso"}
                        </h3>
                        <p className="mb-5 text-sm text-subtitle">{nombre_completo}</p>
                        <form onSubmit={guardarCredenciales} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <label htmlFor={`correo-acceso-${id_empleado}`} className="text-sm font-medium">
                                    Correo de acceso
                                </label>
                                <input
                                    id={`correo-acceso-${id_empleado}`}
                                    type="email"
                                    value={correoCredencial}
                                    onChange={(event) => setCorreoCredencial(event.target.value)}
                                    required
                                    className="rounded-lg border border-secondary bg-input p-3"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label htmlFor={`password-acceso-${id_empleado}`} className="text-sm font-medium">
                                    {modoCredenciales === "create" ? "Contraseña temporal" : "Nueva contraseña temporal (opcional)"}
                                </label>
                                <input
                                    id={`password-acceso-${id_empleado}`}
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={contrasenaTemporal}
                                    onChange={(event) => setContrasenaTemporal(event.target.value)}
                                    required={modoCredenciales === "create"}
                                    className="rounded-lg border border-secondary bg-input p-3"
                                />
                                <p className="text-xs text-subtitle">
                                    Mínimo 12 caracteres. {modoCredenciales === "create"
                                        ? "El empleado deberá cambiarla al iniciar sesión."
                                        : "Si la dejas vacía, solo se cambiará el correo."}
                                </p>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setModalCredenciales(false)}
                                    className="rounded-lg border border-secondary px-5 py-2"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={guardandoCredenciales}
                                    className="flex items-center gap-2 rounded-lg bg-button px-5 py-2 text-button disabled:opacity-60"
                                >
                                    <Save size={16} />
                                    {guardandoCredenciales ? "Guardando..." : modoCredenciales === "create" ? "Crear cuenta" : "Guardar cambios"}
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
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={setEdit("email")}
                                    readOnly={Boolean(id_perfil)}
                                    className={`bg-input border border-secondary rounded-lg p-3 ${id_perfil ? "opacity-70" : ""}`}
                                />
                                {id_perfil && (
                                    <span className="text-xs text-subtitle">
                                        Cambia el correo de acceso desde «Gestionar acceso».
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Teléfono</label>
                                <input type="tel" value={editForm.telefono} onChange={setEdit("telefono")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Departamento</label>
                                <select
                                    value={editForm.id_departamento}
                                    onChange={(event) => setEditForm((form) => ({
                                        ...form,
                                        id_departamento: event.target.value,
                                        id_puesto: "",
                                    }))}
                                    className="bg-input border border-secondary rounded-lg p-3"
                                >
                                    <option value="">Sin departamento</option>
                                    {departamentosLaborales.map((item) => (
                                        <option key={item.id_departamento} value={item.id_departamento}>{item.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Puesto</label>
                                <select
                                    value={editForm.id_puesto}
                                    onChange={(event) => {
                                        const selected = puestosLaborales.find((item) => String(item.id_puesto) === event.target.value);
                                        setEditForm((form) => ({
                                            ...form,
                                            id_puesto: event.target.value,
                                            id_departamento: selected?.id_departamento ? String(selected.id_departamento) : form.id_departamento,
                                        }));
                                    }}
                                    className="bg-input border border-secondary rounded-lg p-3"
                                >
                                    <option value="">Sin puesto</option>
                                    {puestosDisponiblesEdit.map((item) => (
                                        <option key={item.id_puesto} value={item.id_puesto}>
                                            {item.nombre}{!item.rol_acceso ? " · Sin acceso al sistema" : ""}
                                        </option>
                                    ))}
                                </select>
                                {puestoEditado?.rol_acceso && (
                                    <span className="text-xs text-subtitle">Al guardar, la cuenta vinculada adoptará el rol {puestoEditado.rol_acceso}.</span>
                                )}
                                {id_perfil && !puestoEditado?.rol_acceso && (
                                    <span className="text-xs text-amber-400">Para cambiar a un puesto sin acceso, primero desvincula la cuenta y desactívala en Usuarios.</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Salario Mensual (C$)</label>
                                <input type="number" step="0.01" value={editForm.salario_mensual} onChange={setEdit("salario_mensual")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Cuenta bancaria</label>
                                <input type="text" value={editForm.cuenta_bancaria} onChange={setEdit("cuenta_bancaria")} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Estado laboral</label>
                                <select value={editForm.estado} onChange={setEdit("estado")} className="bg-input border border-secondary rounded-lg p-3">
                                    <option value="Activo">Activo</option>
                                    <option value="Inactivo">Inactivo</option>
                                    <option value="Suspendido">Suspendido</option>
                                    <option value="Terminado">Terminado</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2 md:col-span-2">
                                <label className="text-sm font-medium">Clasificación para calendario de pago</label>
                                <select value={editForm.clase_trabajador} onChange={setEdit("clase_trabajador")} className="bg-input border border-secondary rounded-lg p-3">
                                    <option value="obrero">Obrero — semanal, máximo 7 días</option>
                                    <option value="empleado">Empleado — quincenal, máximo 15 días</option>
                                </select>
                            </div>
                            <p className="md:col-span-2 text-xs text-subtitle">
                                Fecha de ingreso: {fecha_ingreso || "No registrada"}. Esta fecha no se puede cambiar desde la edición.
                                Los cambios de salario afectan nóminas futuras, no las ya procesadas.
                            </p>
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
