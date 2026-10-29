import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import NuevoCliente from "../components/nuevoCliente";
import { useState, useMemo } from "react";
import { Box, DollarSign, TrendingDown, CircleAlert, ArrowLeftRight, Plus, ShoppingBasket } from "lucide-react";
import { useClientes } from "../hooks/useClientes";
import ClientesCards from "../components/clientesCards";
import { useCuentasPorCobrar } from "../hooks/useCuentasPorCobrar";
import RegistrarPagoCliente from "../components/registrarPagoCliente";
import { format } from "date-fns/format";

export default function Clientes() {
    const tabs = [
        { key: "clientes", label: "Clientes", icon: <ShoppingBasket size={16} /> },
        { key: "cuentasporcobrar", label: "Cuentas por Cobrar", icon: <ArrowLeftRight size={16} /> }
    ];

    const [activeTab, setActiveTab] = useState("clientes");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
    const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
    const { clientes } = useClientes();
    const valorTotalInventario = 0;

    const {
        facturasPendientes,
        isLoading: isLoadingCxC,
        fetchFacturasPendientes
    } = useCuentasPorCobrar();

    const { totalPorCobrar, clientesMorosos } = useMemo(() => {
        const total = facturasPendientes.reduce((sum, f) => sum + f.saldo_pendiente, 0);
        const clientesUnicos = new Set(facturasPendientes.map(f => f.id_cliente));
        return { totalPorCobrar: total, clientesMorosos: clientesUnicos.size };
    }, [facturasPendientes]);

    // --- 5. HANDLER PARA ABRIR EL MODAL DE PAGO ---
    const handleAbrirPago = (factura) => {
        setFacturaSeleccionada(factura);
        setIsPagoModalOpen(true);
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Total Clientes"} icon={<Box className="text-title" />} value={<span>{clientes.length}</span>} />
                <StatsCards title={"Cuentas por Cobrar"} icon={<DollarSign className="text-title" />} value={`C$${totalPorCobrar.toFixed(2)}`} />
                <StatsCards title={"Clientes Morosos"} icon={<CircleAlert color="red" />} value={clientesMorosos} />
                <StatsCards title={"Pagos Pendientes"} icon={<TrendingDown className="text-title" />} value={"0"} />
            </div>

            <div className="mt-6">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    {activeTab === "clientes" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Gestión de Clientes</h3>
                                    <p className="text-subtitle text-s">Administra el catálogo de clientes</p>
                                </div>
                                <button className="btn-new bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:opacity-95 hover:scale-110 transition" onClick={() => setIsModalOpen(true)}>
                                    <span className="icon"><Plus /></span> Nuevo Cliente
                                </button>
                            </div>

                            {clientes.length === 0 ? (
                                <p className="text-center text-subtitle">No hay clientes registrados</p>
                            ) : (
                                <div className="mt-8 flex flex-col gap-4">
                                    {clientes.map(cliente => (
                                        <ClientesCards key={cliente.id_cliente} {...cliente} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === "cuentasporcobrar" && (
                        <>
                            <div className="flex flex-col gap-1 mb-6">
                                <h3 className="text-title text-xl font-bold">Cuentas por Cobrar</h3>
                                <p className="text-subtitle text-s">Facturas de clientes pendientes de pago.</p>
                            </div>
                            <div className="overflow-x-auto">
                                {isLoadingCxC ? (
                                    <p className="p-4 text-center text-gray-400">Cargando facturas...</p>
                                ) : facturasPendientes.length === 0 ? (
                                    <p className="p-4 text-center text-gray-400">¡Felicidades! No hay cuentas por cobrar.</p>
                                ) : (
                                    <table className="min-w-full text-title">
                                        <thead className="bg-secondary/10">
                                            <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                                                <th className="py-3 px-4 text-left">Cliente</th>
                                                <th className="py-3 px-4 text-center">Factura</th>
                                                <th className="py-3 px-4 text-center">Fecha Venta</th>
                                                <th className="py-3 px-4 text-center">Fecha Vencimiento</th>
                                                <th className="py-3 px-4 text-center">Total Factura</th>
                                                <th className="py-3 px-4 text-center">Saldo Pendiente</th>
                                                <th className="py-3 px-4 text-center">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {facturasPendientes.map((f) => (
                                                <tr key={f.id_venta} className="border-t border-secondary text-sm hover:bg-secondary/10">
                                                    <td className="py-3 px-4 text-left">{f.nombre_cliente}</td>
                                                    <td className="py-3 px-4 text-center">{f.numero_factura}</td>
                                                    <td className="py-3 px-4 text-center">{format(new Date(f.fecha_venta), 'dd/MM/yyyy')}</td>
                                                    <td className="py-3 px-4 text-center">{format(new Date(f.fecha_vencimiento), 'dd/MM/yyyy')}</td>
                                                    <td className="py-3 px-4 text-center">C$ {f.monto_total ? f.monto_total.toFixed(2) : null}</td>
                                                    <td className="py-3 px-4 text-center font-bold">C$ {f.saldo_pendiente.toFixed(2)}</td>
                                                    <td className="py-3 px-4 text-center">
                                                        <button
                                                            className="bg-green-600/20 text-white-400 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-green-500/30"
                                                            onClick={() => handleAbrirPago(f)}
                                                        >
                                                            Registrar Pago
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <NuevoCliente onClose={() => setIsModalOpen(false)} />
                    </div>
                </div>
            )}

            {isPagoModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsPagoModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <RegistrarPagoCliente
                            factura={facturaSeleccionada}
                            onClose={() => setIsPagoModalOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
