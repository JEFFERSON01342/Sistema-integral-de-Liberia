import StatsCards from "../components/statscards";
import { useState } from "react";
import { Wrench, TrendingDown, Plus } from "lucide-react";
import NuevoActivoFijo from "../components/nuevoactivofijo";
import ActivosFijosCards from "../components/activosfijosCards";
import { useActivosFijos } from "../hooks/useActivosFijos";

export default function ActivosFijos() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { activosFijos } = useActivosFijos();

    const totalActivos = activosFijos.length;
    const valorTotalActivos = activosFijos.reduce((sum, item) => sum + (item.valor_compra || 0), 0);
    const depreciacionAcumulada = 0;
    const enMantenimiento = 0;
    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Total Activos"} icon={<Wrench className="text-title" />} value={totalActivos} />
                <StatsCards title={"Valor (Costo)"} icon={<TrendingDown className="text-title" />} value={`C$${valorTotalActivos.toFixed(2)}`} />
                <StatsCards title={"Depreciación Acum."} icon={<TrendingDown color="red" />} value={`C$${depreciacionAcumulada.toFixed(2)}`} />
                <StatsCards title={"En Mantenimiento"} icon={<Wrench color="orange" className="text-title" />} value={enMantenimiento} />
            </div>

            <div className="mt-6">
                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-title text-xl font-bold">Gestión de Activos Fijos</h3>
                            <p className="text-subtitle text-s">Administra los activos fijos y su depreciación</p>
                        </div>
                        <button className="btn-new bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:opacity-95 hover:scale-110 transition" onClick={() => setIsModalOpen(true)}>
                            <span className="icon"><Plus /></span> Nuevo Activo
                        </button>
                    </div>

                    {activosFijos.length === 0 ? (
                        <p className="text-center text-subtitle">No hay activos registrados</p>
                    ) : (
                        <div className="mt-8 flex flex-col gap-4">
                            {activosFijos.map(activosFijos => (
                                <ActivosFijosCards key={activosFijos.id_activo_fijo} {...activosFijos} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <NuevoActivoFijo onClose={() => setIsModalOpen(false)} totalActivos={activosFijos.length} />
                    </div>
                </div>
            )}
        </div>
    );
}
