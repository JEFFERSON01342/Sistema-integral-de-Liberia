import { createPortal } from "react-dom";
import { DollarSign, Pencil, Trash, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

const ROLES_PAGO = ["superadmin", "admin", "gerente"];

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
    estado,
    rol,
    onActualizar,
}) {
    const { empresaId } = useEmpresa();
    const puedePagar = ROLES_PAGO.includes(rol);

    /* ---- Modal Pagar Salario ---- */
    const [modalPago, setModalPago] = useState(false);
    const [guardandoPago, setGuardandoPago] = useState(false);
    const [monto, setMonto] = useState(salario_mensual || 0);
    const [metodo, setMetodo] = useState("Efectivo");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [concepto, setConcepto] = useState("Pago de salario");

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
    });

    /* ---- Handlers ---- */
    const abrirPago = () => {
        setMonto(salario_mensual || 0);
        setMetodo("Efectivo");
        setFecha(new Date().toISOString().slice(0, 10));
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
            const { error } = await supabase.from("pagos_salarios").insert({
                id_empresa: empresaId,
                id_empleado,
                monto: montoNum,
                metodo,
                fecha_pago: fecha,
                concepto: concepto?.trim() || "Pago de salario",
            });
            if (error) throw error;
            toast.success(`✅ Pago registrado para ${nombre_completo}`);
            setModalPago(false);
        } catch (err) {
            toast.error(`⚠️ ${err.message || "Error al registrar el pago"}`);
        } finally {
            setGuardandoPago(false);
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

    const handleEliminar = async () => {
        const res = await Swal.fire({
            ...SWAL_OPTS,
            title: "¿Eliminar empleado?",
            text: "Esta acción no se puede deshacer.",
            icon: "warning",
            confirmButtonText: "Sí, eliminar",
        });
        if (!res.isConfirmed) return;
        const { error } = await supabase
            .from("empleados")
            .delete()
            .eq("id_empleado", id_empleado);
        if (error) return toast.error("Error: " + error.message);
        toast.success("Empleado eliminado");
        onActualizar?.();
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
                    <button
                        onClick={() => setModalEdit(true)}
                        className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        onClick={handleEliminar}
                        className="border border-secondary text-red-400 p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"
                    >
                        <Trash size={14} />
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
                                <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia">Transferencia</option>
                                </select>
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
                                <button type="button" onClick={() => setModalPago(false)} className="bg-secondary text-button-text cursor-pointer border border-secondary py-2 px-6 rounded-lg hover:scale-110 transition">Cancelar</button>
                                <button type="submit" disabled={guardandoPago} className="bg-button text-button py-2 cursor-pointer px-4 rounded-lg hover:bg-[#E8E8E8] transition flex items-center gap-2 disabled:opacity-60">
                                    <Save size={18} />{guardandoPago ? "Registrando..." : "Registrar Pago"}
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
