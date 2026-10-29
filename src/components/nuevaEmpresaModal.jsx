import { useState } from "react";
import { X, Save, Building2 } from "lucide-react";
import { useEmpresas } from "../hooks/useEmpresas";
import { useSectoresMonedas } from "../hooks/useSectoresMonedas"; // El hook que acabamos de crear

export default function NuevaEmpresaModal({ onClose }) {
    const { crearEmpresa } = useEmpresas(); // Tu hook existente
    const { sectores, monedas, loading: loadingCatalogos } = useSectoresMonedas();

    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [idSector, setIdSector] = useState("");
    const [idMoneda, setIdMoneda] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const nuevaEmpresa = {
            nombre,
            descripcion,
            id_sector: idSector,
            id_moneda: idMoneda
        };

        // Llamamos a la función de tu hook que ejecuta el SP
        const result = await crearEmpresa(nuevaEmpresa);

        if (result.success) {
            onClose(); // Cerrar modal si todo salió bien
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-primary border border-secondary rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in m-4">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-secondary">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-button rounded-lg text-button">
                            <Building2 size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-title">Nueva Empresa</h2>
                            <p className="text-xs text-subtitle">Configuración inicial y contabilidad automática</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-subtitle hover:text-title transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">

                    {/* Nombre */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Nombre de la Empresa</label>
                        <input
                            type="text"
                            placeholder="Ej. Distribuidora El Éxito"
                            className="bg-input border border-secondary rounded-lg p-3 text-title focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            required
                        />
                    </div>

                    {/* Sector y Moneda (Grid) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Sector Económico</label>
                            <select
                                className="bg-input border border-secondary rounded-lg p-3 text-title outline-none"
                                value={idSector}
                                onChange={(e) => setIdSector(e.target.value)}
                                required
                                disabled={loadingCatalogos}
                            >
                                <option value="">Seleccione...</option>
                                {sectores.map(s => (
                                    <option key={s.id_sector} value={s.id_sector}>{s.nombre_sector}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Moneda Base</label>
                            <select
                                className="bg-input border border-secondary rounded-lg p-3 text-title outline-none"
                                value={idMoneda}
                                onChange={(e) => setIdMoneda(e.target.value)}
                                required
                                disabled={loadingCatalogos}
                            >
                                <option value="">Seleccione...</option>
                                {monedas.map(m => (
                                    <option key={m.id_moneda} value={m.id_moneda}>{m.nombre} ({m.simbolo})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Descripción */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Descripción (Opcional)</label>
                        <textarea
                            rows="3"
                            placeholder="Breve descripción de la actividad comercial..."
                            className="bg-input border border-secondary rounded-lg p-3 text-title outline-none resize-none"
                            value={descripcion}
                            onChange={(e) => setDescripcion(e.target.value)}
                        />
                    </div>

                    {/* Footer / Botones */}
                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-secondary">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-subtitle hover:bg-secondary hover:text-title transition-colors font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-button text-button px-6 py-2 rounded-lg font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                "Creando..."
                            ) : (
                                <>
                                    <Save size={18} />
                                    Crear Empresa
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}