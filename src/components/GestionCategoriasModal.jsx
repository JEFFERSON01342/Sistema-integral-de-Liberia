import { useState } from "react";
import { Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { useCategorias } from "../hooks/useCategorias";

export default function GestionCategoriasModal({ onClose }) {
    const {
        categorias,
        error,
        agregarCategoria,
        actualizarCategoria,
        cambiarEstadoCategoria,
        eliminarCategoria,
    } = useCategorias({ incluirInactivas: true });
    const [editando, setEditando] = useState(null);
    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [guardando, setGuardando] = useState(false);

    const prepararEdicion = (categoria) => {
        setEditando(categoria);
        setNombre(categoria.nombre);
        setDescripcion(categoria.descripcion || "");
    };

    const limpiar = () => {
        setEditando(null);
        setNombre("");
        setDescripcion("");
    };

    const guardar = async (event) => {
        event.preventDefault();
        setGuardando(true);
        const resultado = editando
            ? await actualizarCategoria({ ...editando, nombre, descripcion })
            : await agregarCategoria(nombre, descripcion);
        setGuardando(false);
        if (!resultado.success) {
            toast.error(`No se pudo guardar la categoría: ${resultado.message}`);
            return;
        }
        toast.success(editando ? "Categoría actualizada." : "Categoría agregada.");
        limpiar();
    };

    const cambiarEstado = async (categoria) => {
        const confirmacion = await Swal.fire({
            title: categoria.activa ? "¿Desactivar categoría?" : "¿Reactivar categoría?",
            text: categoria.activa
                ? "No aparecerá en nuevos productos. Los productos existentes conservarán su categoría."
                : "Volverá a aparecer al crear o editar productos.",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: categoria.activa ? "Desactivar" : "Reactivar",
            cancelButtonText: "Cancelar",
            background: "#1e1e1e",
            color: "#fff",
        });
        if (!confirmacion.isConfirmed) return;
        const resultado = await cambiarEstadoCategoria(categoria);
        if (!resultado.success) return toast.error(`No se pudo actualizar: ${resultado.message}`);
        toast.success(categoria.activa ? "Categoría desactivada." : "Categoría reactivada.");
    };

    const eliminar = async (categoria) => {
        const confirmacion = await Swal.fire({
            title: "¿Eliminar categoría?",
            text: "Solo se eliminará si ningún producto o descuento la utiliza. Si está en uso, desactívela para conservar sus relaciones.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Eliminar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#dc2626",
            background: "#1e1e1e",
            color: "#fff",
        });
        if (!confirmacion.isConfirmed) return;
        const resultado = await eliminarCategoria(categoria);
        if (!resultado.success) return toast.error(`No se puede eliminar la categoría: ${resultado.message}`);
        toast.success("Categoría eliminada.");
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
            <section className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-secondary bg-primary p-6 text-title shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold">Gestionar categorías</h3>
                        <p className="text-sm text-subtitle">Edita, desactiva o elimina categorías sin productos ni descuentos asociados.</p>
                    </div>
                    <button onClick={onClose} className="text-subtitle" title="Cerrar"><X /></button>
                </div>

                <form onSubmit={guardar} className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                        value={nombre}
                        onChange={(event) => setNombre(event.target.value)}
                        maxLength={100}
                        required
                        placeholder="Nombre de categoría"
                        className="rounded-lg border border-secondary bg-input p-2.5"
                    />
                    <input
                        value={descripcion}
                        onChange={(event) => setDescripcion(event.target.value)}
                        maxLength={300}
                        placeholder="Descripción opcional"
                        className="rounded-lg border border-secondary bg-input p-2.5"
                    />
                    <div className="flex gap-2">
                        {editando && <button type="button" onClick={limpiar} className="rounded-lg border border-secondary px-3 text-subtitle"><X size={16} /></button>}
                        <button disabled={guardando} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-button px-3 py-2 text-button disabled:opacity-60">
                            {editando ? <Save size={16} /> : <Plus size={16} />}
                            {editando ? "Guardar cambios" : "Agregar"}
                        </button>
                    </div>
                </form>

                {error && <p className="mt-3 text-sm text-red-400">No se pudieron cargar categorías: {error}</p>}
                <div className="mt-5 divide-y divide-secondary/50">
                    {categorias.map((categoria) => (
                        <div key={categoria.id_categoria} className="flex items-center justify-between gap-3 py-3">
                            <div>
                                <p className={categoria.activa ? "text-title" : "text-subtitle"}>
                                    {categoria.nombre}{!categoria.activa && " · Inactiva"}
                                </p>
                                {categoria.descripcion && <p className="text-xs text-subtitle">{categoria.descripcion}</p>}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => prepararEdicion(categoria)} title="Editar categoría" className="text-blue-400"><Pencil size={16} /></button>
                                <button onClick={() => cambiarEstado(categoria)} title={categoria.activa ? "Desactivar" : "Reactivar"} className="text-amber-400"><Power size={16} /></button>
                                <button onClick={() => eliminar(categoria)} title="Eliminar si no tiene productos" className="text-red-400"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
                    {!categorias.length && <p className="py-4 text-sm text-subtitle">No hay categorías registradas.</p>}
                </div>
            </section>
        </div>
    );
}
