// /pages/GastosFijos.jsx
import { useState, useMemo } from "react";
import { CreditCard, Plus, Zap } from "lucide-react";
import { useGastosFijos } from "../hooks/useGastosFijos";
import { format } from "date-fns/format";
import NuevoGastoFijo from "../components/nuevoGastoFijo"; // Crearemos este
import RegistrarPagoGastoFijo from "../components/registrarPagoGastoFijo"; // Crearemos este
import StatsCards from "../components/statscards";
import { Box, DollarSign, TrendingDown, CircleAlert } from "lucide-react";

export default function GastosFijos() {
    const [isNuevoModalOpen, setIsNuevoModalOpen] = useState(false);
    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
    const [gastoSeleccionado, setGastoSeleccionado] = useState(null);

    const { gastosFijos, isLoading, isSaving } = useGastosFijos();

    const { totalGastos, montoTotal } = useMemo(() => {
        const monto = gastosFijos.reduce((sum, g) => sum + (g.monto_estimado || 0), 0);
        return {
            totalGastos: gastosFijos.length,
            montoTotal: monto
        }
    }, [gastosFijos]);

    const handleAbrirPago = (gasto) => {
        setGastoSeleccionado(gasto);
        setIsPagoModalOpen(true);
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Total Gastos Fijos"} icon={<Box className="text-title" />} value={totalGastos} />
                <StatsCards title={"Monto Mensual Estimado"} icon={<DollarSign className="text-title" />} value={`C$ ${montoTotal.toFixed(2)}`} />
                <StatsCards title={"Total Gastos Pagados"} icon={<CircleAlert color="red" />} value={'0'} />
                <StatsCards title={"Pagos Pendientes"} icon={<TrendingDown className="text-title" />} value={"0"} />
            </div>

            <div className="mt-8 border-1 border-secondary rounded-2xl p-5">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-title text-xl font-bold">Gastos Fijos y Recurrentes</h3>
                        <p className="text-subtitle text-s">Define plantillas para gastos como alquiler, luz, agua, etc.</p>
                    </div>
                    <button
                        className="bg-button text-button flex flex-row h-10 text-s gap-3 p-2 rounded-xl items-center hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer"
                        onClick={() => setIsNuevoModalOpen(true)}
                    >
                        <Plus />
                        Nuevo Gasto Fijo
                    </button>
                </div>

                <div className="mt-8 overflow-x-auto mb-8">
                    {isLoading ? (
                        <p className="text-title text-center p-4">Cargando plantillas de gastos...</p>
                    ) : gastosFijos.length === 0 ? (
                        <p className="text-title text-center p-4">No hay gastos fijos definidos.</p>
                    ) : (
                        <table className="text-title min-w-full border-collapse">
                            <thead>
                                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                                    <th className="py-3 px-2 text-center">Descripción del Gasto</th>
                                    <th className="py-3 px-2 text-center">Monto Estimado</th>
                                    <th className="py-3 px-2 text-center">Cuenta de Gasto</th>
                                    <th className="py-3 px-2 text-center">Último Registro</th>
                                    <th className="py-3 px-2 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gastosFijos.map((g) => (
                                    <tr key={g.id_gasto_fijo} className="border-t border-secondary text-sm hover:bg-secondary/10">
                                        <td className="py-3 px-2 text-center font-medium">{g.descripcion}</td>
                                        <td className="py-3 px-2 text-center">C$ {g.monto_estimado.toFixed(2)}</td>
                                        <td className="py-3 px-2 text-center text-subtitle">{g.cuentas_empresa.nombre}</td>
                                        <td className="py-3 px-2 text-center text-subtitle">
                                            {g.fecha_ultimo_registro ? format(new Date(g.fecha_ultimo_registro), 'dd/MM/yyyy') : 'Nunca'}
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            <button
                                                className="text-green-500 hover:text-green-400"
                                                title="Registrar Pago"
                                                onClick={() => handleAbrirPago(g)}
                                                disabled={isSaving}
                                            >
                                                <CreditCard size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {isNuevoModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="relative z-10 mx-4">
                        <NuevoGastoFijo onClose={() => setIsNuevoModalOpen(false)} />
                    </div>
                </div>
            )}

            {isPagoModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="relative z-10 mx-4">
                        <RegistrarPagoGastoFijo
                            gasto={gastoSeleccionado}
                            onClose={() => setIsPagoModalOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}