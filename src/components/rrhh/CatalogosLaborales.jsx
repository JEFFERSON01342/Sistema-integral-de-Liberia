import { useMemo, useState } from "react";
import { Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { supabase } from "../../supabase/supabaseclient";
import { useEmpresa } from "../../contexts/empresacontext";
import { useAuth } from "../../contexts/authcontext";
import { useCatalogosLaborales } from "../../hooks/useCatalogosLaborales";

const ROLES = [
    { value: "gerente", label: "Gerente" },
    { value: "contador", label: "Contador" },
    { value: "cajero", label: "Cajero" },
    { value: "despacho", label: "Despacho" },
    { value: "bodega", label: "Bodega" },
];

export default function CatalogosLaborales() {
    const { empresaId } = useEmpresa();
    const { rol } = useAuth();
    const { departamentos, puestos, isLoading, fetchCatalogos } = useCatalogosLaborales({ incluirInactivos: true });
    const [departamentoEditando, setDepartamentoEditando] = useState(null);
    const [puestoEditando, setPuestoEditando] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [nombreDepartamento, setNombreDepartamento] = useState("");
    const [nombrePuesto, setNombrePuesto] = useState("");
    const [idDepartamentoPuesto, setIdDepartamentoPuesto] = useState("");
    const [rolAcceso, setRolAcceso] = useState("");

    const departamentosPorId = useMemo(
        () => new Map(departamentos.map((departamento) => [Number(departamento.id_departamento), departamento.nombre])),
        [departamentos]
    );

    const limpiarDepartamento = () => {
        setDepartamentoEditando(null);
        setNombreDepartamento("");
    };

    const limpiarPuesto = () => {
        setPuestoEditando(null);
        setNombrePuesto("");
        setIdDepartamentoPuesto("");
        setRolAcceso("");
    };

    const guardarDepartamento = async (event) => {
        event.preventDefault();
        if (!empresaId || !nombreDepartamento.trim()) return;
        setGuardando(true);
        try {
            const query = departamentoEditando
                ? supabase.from("departamentos_empresa")
                    .update({ nombre: nombreDepartamento.trim() })
                    .eq("id_empresa", empresaId)
                    .eq("id_departamento", departamentoEditando.id_departamento)
                : supabase.from("departamentos_empresa")
                    .insert({ id_empresa: empresaId, nombre: nombreDepartamento.trim() });
            const { data, error } = departamentoEditando
                ? await query.select("id_departamento").maybeSingle()
                : await query.select("id_departamento").single();
            if (error) throw error;
            if (!data) throw new Error("No se encontró el departamento o no tienes permiso para editarlo.");
            toast.success(departamentoEditando ? "Departamento actualizado." : "Departamento agregado.");
            limpiarDepartamento();
            await fetchCatalogos();
        } catch (error) {
            toast.error(`No se pudo guardar el departamento: ${error.message}`);
        } finally {
            setGuardando(false);
        }
    };

    const guardarPuesto = async (event) => {
        event.preventDefault();
        if (!empresaId || !nombrePuesto.trim()) return;
        setGuardando(true);
        try {
            if (puestoEditando && puestoEditando.rol_acceso !== (rolAcceso || null)) {
                const { count, error: countError } = await supabase
                    .from("empleados")
                    .select("id_empleado", { count: "exact", head: true })
                    .eq("id_empresa", empresaId)
                    .eq("id_puesto", puestoEditando.id_puesto)
                    .not("id_perfil", "is", null);
                if (countError) throw countError;
                if (count && !rolAcceso) {
                    throw new Error("Desvincula las cuentas asociadas antes de cambiar este puesto a “Sin acceso”.");
                }
                if (count) {
                    const confirmacion = await Swal.fire({
                        title: "¿Cambiar el rol de acceso?",
                        text: `El cambio actualizará el rol de ${count} cuenta(s) vinculada(s) a este puesto.`,
                        icon: "warning",
                        showCancelButton: true,
                        confirmButtonText: "Cambiar rol",
                        cancelButtonText: "Cancelar",
                        background: "#1e1e1e",
                        color: "#fff",
                    });
                    if (!confirmacion.isConfirmed) return;
                }
            }
            const datos = {
                nombre: nombrePuesto.trim(),
                id_departamento: idDepartamentoPuesto ? Number(idDepartamentoPuesto) : null,
                rol_acceso: rolAcceso || null,
            };
            const query = puestoEditando
                ? supabase.from("puestos_empresa")
                    .update(datos)
                    .eq("id_empresa", empresaId)
                    .eq("id_puesto", puestoEditando.id_puesto)
                : supabase.from("puestos_empresa")
                    .insert({ ...datos, id_empresa: empresaId });
            const { data, error } = puestoEditando
                ? await query.select("id_puesto").maybeSingle()
                : await query.select("id_puesto").single();
            if (error) throw error;
            if (!data) throw new Error("No se encontró el puesto o no tienes permiso para editarlo.");
            toast.success(puestoEditando ? "Puesto actualizado." : "Puesto agregado.");
            limpiarPuesto();
            await fetchCatalogos();
        } catch (error) {
            toast.error(`No se pudo guardar el puesto: ${error.message}`);
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstado = async (tabla, fila, etiqueta) => {
        const activo = fila.activo;
        const confirmacion = await Swal.fire({
            title: activo ? `¿Desactivar ${etiqueta}?` : `¿Reactivar ${etiqueta}?`,
            text: activo
                ? "No se podrá seleccionar en nuevas asignaciones. Los registros existentes se conservan."
                : "Volverá a aparecer en los formularios de Recursos Humanos.",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: activo ? "Desactivar" : "Reactivar",
            cancelButtonText: "Cancelar",
            background: "#1e1e1e",
            color: "#fff",
        });
        if (!confirmacion.isConfirmed) return;
        try {
            const { data, error } = await supabase
                .from(tabla)
                .update({ activo: !activo })
                .eq("id_empresa", empresaId)
                .eq(tabla === "puestos_empresa" ? "id_puesto" : "id_departamento",
                    tabla === "puestos_empresa" ? fila.id_puesto : fila.id_departamento)
                .select(tabla === "puestos_empresa" ? "id_puesto" : "id_departamento")
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("No se encontró el registro o no tienes permiso para editarlo.");
        } catch (error) {
            toast.error(`No se pudo cambiar el estado: ${error.message}`);
            return;
        }
        toast.success(`${etiqueta} ${activo ? "desactivado" : "reactivado"}.`);
        await fetchCatalogos();
    };

    const eliminarSinUso = async (tabla, fila, etiqueta) => {
        const confirmacion = await Swal.fire({
            title: `¿Eliminar ${etiqueta}?`,
            text: "Solo se eliminará si ningún empleado o puesto lo utiliza. Si tiene historial, desactívelo.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Eliminar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#dc2626",
            background: "#1e1e1e",
            color: "#fff",
        });
        if (!confirmacion.isConfirmed) return;
        try {
            const { data, error } = await supabase
                .from(tabla)
                .delete()
                .eq("id_empresa", empresaId)
                .eq(tabla === "puestos_empresa" ? "id_puesto" : "id_departamento",
                    tabla === "puestos_empresa" ? fila.id_puesto : fila.id_departamento)
                .select(tabla === "puestos_empresa" ? "id_puesto" : "id_departamento")
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("No se encontró el registro o no tienes permiso para eliminarlo.");
        } catch (error) {
            toast.error(`No se puede eliminar porque está en uso o no tienes permiso. ${error.message}`);
            return;
        }
        toast.success(`${etiqueta} eliminado.`);
        await fetchCatalogos();
    };

    const editarDepartamento = (departamento) => {
        setDepartamentoEditando(departamento);
        setNombreDepartamento(departamento.nombre);
    };

    const editarPuesto = (puesto) => {
        setPuestoEditando(puesto);
        setNombrePuesto(puesto.nombre);
        setIdDepartamentoPuesto(puesto.id_departamento ? String(puesto.id_departamento) : "");
        setRolAcceso(puesto.rol_acceso || "");
    };

    const rolesDisponibles = rol === "superadmin"
        ? [{ value: "admin", label: "Administrador" }, ...ROLES]
        : ROLES;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section className="border border-secondary rounded-2xl p-5">
                <h3 className="text-title text-xl font-bold">Departamentos</h3>
                <p className="text-subtitle text-sm mt-1">Catálogo editable. Desactiva los que ya no uses; elimina solo los que estén sin asignaciones.</p>
                <form onSubmit={guardarDepartamento} className="flex gap-2 mt-4">
                    <input
                        value={nombreDepartamento}
                        onChange={(event) => setNombreDepartamento(event.target.value)}
                        maxLength={100}
                        required
                        placeholder="Ej. Ventas"
                        className="bg-input border border-secondary rounded-lg p-2.5 flex-1"
                    />
                    {departamentoEditando && (
                        <button type="button" onClick={limpiarDepartamento} className="p-2 text-subtitle" title="Cancelar edición">
                            <X size={18} />
                        </button>
                    )}
                    <button type="submit" disabled={guardando} className="bg-button text-button px-3 rounded-lg flex gap-2 items-center disabled:opacity-60">
                        {departamentoEditando ? <Save size={16} /> : <Plus size={16} />}
                        {departamentoEditando ? "Guardar" : "Agregar"}
                    </button>
                </form>
                {isLoading ? <p className="p-4 text-subtitle">Cargando...</p> : (
                    <div className="mt-4 divide-y divide-secondary/50">
                        {departamentos.map((departamento) => (
                            <div key={departamento.id_departamento} className="flex items-center justify-between gap-3 py-3">
                                <span className={departamento.activo ? "text-title" : "text-subtitle"}>
                                    {departamento.nombre}{!departamento.activo && " · Inactivo"}
                                </span>
                                <div className="flex gap-3">
                                    <button onClick={() => editarDepartamento(departamento)} title="Editar" className="text-blue-400"><Pencil size={16} /></button>
                                    <button onClick={() => cambiarEstado("departamentos_empresa", departamento, "departamento")} title={departamento.activo ? "Desactivar" : "Reactivar"} className="text-amber-400"><Power size={16} /></button>
                                    <button onClick={() => eliminarSinUso("departamentos_empresa", departamento, "departamento")} title="Eliminar si no está en uso" className="text-red-400"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                        {!departamentos.length && <p className="py-4 text-subtitle">Aún no hay departamentos.</p>}
                    </div>
                )}
            </section>

            <section className="border border-secondary rounded-2xl p-5">
                <h3 className="text-title text-xl font-bold">Puestos y acceso al sistema</h3>
                <p className="text-subtitle text-sm mt-1">Al vincular una cuenta a un empleado, se le aplicará el rol del puesto. “Sin acceso” es para puestos de apoyo.</p>
                <form onSubmit={guardarPuesto} className="grid grid-cols-1 gap-3 mt-4">
                    <input
                        value={nombrePuesto}
                        onChange={(event) => setNombrePuesto(event.target.value)}
                        maxLength={100}
                        required
                        placeholder="Ej. Cajero"
                        className="bg-input border border-secondary rounded-lg p-2.5"
                    />
                    <select
                        value={idDepartamentoPuesto}
                        onChange={(event) => setIdDepartamentoPuesto(event.target.value)}
                        className="bg-input border border-secondary rounded-lg p-2.5"
                    >
                        <option value="">Sin departamento</option>
                        {departamentos.map((departamento) => (
                            <option key={departamento.id_departamento} value={departamento.id_departamento}>
                                {departamento.nombre}{!departamento.activo ? " · Inactivo" : ""}
                            </option>
                        ))}
                    </select>
                    <select
                        value={rolAcceso}
                        onChange={(event) => setRolAcceso(event.target.value)}
                        className="bg-input border border-secondary rounded-lg p-2.5"
                    >
                        <option value="">Sin acceso al sistema</option>
                        {rolesDisponibles.map((opcion) => (
                            <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                        ))}
                    </select>
                    <div className="flex justify-end gap-2">
                        {puestoEditando && <button type="button" onClick={limpiarPuesto} className="px-3 py-2 text-subtitle">Cancelar</button>}
                        <button type="submit" disabled={guardando} className="bg-button text-button px-3 py-2 rounded-lg flex gap-2 items-center disabled:opacity-60">
                            {puestoEditando ? <Save size={16} /> : <Plus size={16} />}
                            {puestoEditando ? "Guardar cambios" : "Agregar puesto"}
                        </button>
                    </div>
                </form>
                {isLoading ? <p className="p-4 text-subtitle">Cargando...</p> : (
                    <div className="mt-4 divide-y divide-secondary/50">
                        {puestos.map((puesto) => (
                            <div key={puesto.id_puesto} className="flex items-center justify-between gap-3 py-3">
                                <div>
                                    <p className={puesto.activo ? "text-title" : "text-subtitle"}>
                                        {puesto.nombre}{!puesto.activo && " · Inactivo"}
                                    </p>
                                    <p className="text-xs text-subtitle">
                                        {departamentosPorId.get(Number(puesto.id_departamento)) || "Sin departamento"}
                                        {" · "}
                                        {puesto.rol_acceso || "Sin acceso al sistema"}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => editarPuesto(puesto)} title="Editar" className="text-blue-400"><Pencil size={16} /></button>
                                    <button onClick={() => cambiarEstado("puestos_empresa", puesto, "puesto")} title={puesto.activo ? "Desactivar" : "Reactivar"} className="text-amber-400"><Power size={16} /></button>
                                    <button onClick={() => eliminarSinUso("puestos_empresa", puesto, "puesto")} title="Eliminar si no está en uso" className="text-red-400"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                        {!puestos.length && <p className="py-4 text-subtitle">Aún no hay puestos.</p>}
                    </div>
                )}
            </section>
        </div>
    );
}
