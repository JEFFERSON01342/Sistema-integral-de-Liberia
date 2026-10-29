import { useState } from "react";
import {Save} from "lucide-react"

export default function NuevaCategoria({ isOpen, onClose, onSave }) {
    const [nombre, setNombre] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [mensaje, setMensaje] = useState(null);

    const handleModalSubmit = async (e) => {
        e.preventDefault();

        const result = await onSave({ nombre, descripcion }); 

    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-opacity-80 flex items-center justify-center p-4 bg-black/70 z-50 backdrop-blur-xs">
            <div className="bg-primary text-title p-6 rounded-xl w-full max-w-lg shadow-2xl border border-secondary">
                <h4 className="text-xl font-semibold mb-4">Añadir Nueva Categoría</h4>

                <form onSubmit={handleModalSubmit} className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="cat-nombre" className="text-sm font-medium text-title">
                            Nombre de la Categoría
                        </label>
                        <input
                            id="cat-nombre"
                            type="text"
                            required
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="ej: Bebidas Carbonatadas"
                            className="bg-input border border-secondary rounded-xl p-3 focus:ring-blue-500 focus:border-blue-500 transition w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label htmlFor="cat-descripcion" className="text-sm font-medium text-title">
                            Descripción (Opcional)
                        </label>
                        <textarea
                            id="cat-descripcion"
                            rows="3"
                            value={descripcion}
                            onChange={(e) => setDescripcion(e.target.value)}
                            placeholder="Descripción breve de la categoría"
                            className="bg-input border border-secondary rounded-xl p-3 focus:ring-blue-500 focus:border-blue-500 transition resize-none w-full"
                        ></textarea>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-secondary text-button-text font-semibold py-2 px-4 rounded-xl hover:bg-secondary transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn-new bg-button text-button p-3 rounded-lg flex justify-center gap-2 items-center hover:opacity-95 transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer"
                        >
                            <span className="icon"><Save size={18} /></span>
                            Guardar Categoría
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}