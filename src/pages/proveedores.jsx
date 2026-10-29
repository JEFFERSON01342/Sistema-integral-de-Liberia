import StatsCards from "../components/statscards"
import Tabs from "../components/tabs"
import NuevoProveedor from "../components/nuevoProveedor"
import { useState } from "react"
import { DollarSign, ShoppingCart, UsersRound, Plus, ShoppingBasket, CreditCard, PackageCheck, Send } from "lucide-react"
import { toast } from "react-hot-toast";
import { useProveedores } from "../hooks/useProveedores"
import { useCompras } from "../hooks/useCompras";
import NuevaCompra from "../components/nuevaCompra";
import RegistrarPagoProveedor from "../components/registrarPagoProveedor";
import RecibirOrdenCompra from "../components/recibirOrdenCompra";

export default function Proveedores() {
    const tabs = [
        { key: "proveedores", label: "Proveedores", icon: <UsersRound size={16} /> },
        { key: "compras", label: "Compras", icon: <ShoppingBasket size={16} /> }
    ];
    const [activeTab, setActiveTab] = useState("proveedores");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCompraModalOpen, setIsCompraModalOpen] = useState(false);
    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
    const [isRecepcionModalOpen, setIsRecepcionModalOpen] = useState(false);
    const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
    const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
    const { proveedores, isLoading, fetchProveedores } = useProveedores();
    const {
        ordenes,
        cuentasPorPagar,
        isLoading: isLoadingCompras,
        isSaving: isSavingCompra,
        cambiarEstadoOrdenCompra,
        fetchCompras,
    } = useCompras();

    const handleAbrirPago = (cuentaPorPagar) => {
        setCuentaSeleccionada(cuentaPorPagar);
        setIsPagoModalOpen(true);
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency: 'NIO',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value).replace('C$', 'C$ ');
    };

    const totalCuentasPorPagar = cuentasPorPagar.reduce((sum, account) => sum + Number(account.saldo_pendiente || 0), 0);

    const enviarOrden = async (idOrden) => {
        const resultado = await cambiarEstadoOrdenCompra(idOrden, "ENVIADA");
        if (resultado.success) toast.success("Orden enviada al proveedor.");
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Total Proveedores"} icon={<span className="icon"><UsersRound className="text-title" /></span>} value={proveedores.length} />
                <StatsCards title={"Proveedores Activos"} icon={<span className="icon text-green-400"><UsersRound className="text-title" /></span>} value={proveedores.filter(p => p.estado === 1).length} />
                <StatsCards title={"Cuentas por Pagar"} icon={<span className="icon text-red-400"><DollarSign className="text-title" /></span>} value={formatCurrency(totalCuentasPorPagar)} />
                <StatsCards title={"Órdenes de compra"} icon={<span className="icon"><ShoppingCart className="text-title" /></span>} value={ordenes.length} />
            </div>

            <div className="mt-6">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
                <div className="mt-8 border-1 border-secondary rounded-2xl p-5">
                    {activeTab === "proveedores" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Gestión de Proveedores</h3>
                                    <p className="text-subtitle text-s">Administra tu cartera de proveedores</p>
                                </div>
                                <button
                                    className="bg-button text-button flex flex-row h-10 text-s gap-3 p-2 rounded-xl items-center hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer"
                                    onClick={() => setIsModalOpen(true)}
                                >
                                    <Plus />
                                    Nuevo Proveedor
                                </button>
                            </div>

                            <div className="mt-8 overflow-x-auto mb-8">
                                {isLoading ? (
                                    <p className="text-title p-4">Cargando proveedores...</p>
                                ) : proveedores.length === 0 ? (
                                    <p className="text-title p-4">No hay proveedores registrados.</p>
                                ) : (
                                    <table className="text-title min-w-[1000px] border-collapse">
                                        <thead>
                                            <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                                                <th className="py-3 px-2 w-12 text-center">Código</th>
                                                <th className="py-3 px-2 w-40 text-center">Nombre</th>
                                                <th className="py-3 px-2 w-60 text-center">Razón social</th>
                                                <th className="py-3 px-2 w-40 text-center">Identificación fiscal</th>
                                                <th className="py-3 px-2 w-48 text-center">Email</th>
                                                <th className="py-3 px-2 w-36 text-center">Teléfono</th>
                                                <th className="py-3 px-2 w-60 text-center">Dirección</th>
                                                <th className="py-3 px-2 w-32 text-center">Plazo crédito</th>
                                                <th className="py-3 px-2 w-32 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {proveedores.map((p) => (
                                                <tr key={p.id} className="border-t border-secondary text-sm hover:bg-secondary transition-colors">
                                                    <td className="py-3 px-2 font-mono text-center">{p.codigo}</td>
                                                    <td className="py-3 px-2 font-medium text-center">{p.nombre_comercial}</td>
                                                    <td className="py-3 px-2 text-subtitle text-center">{p.razon_social}</td>
                                                    <td className="py-3 px-2 text-center">{p.identificacion_fiscal || "—"}</td>
                                                    <td className="py-3 px-2 text-blue-400 truncate text-center">{p.email}</td>
                                                    <td className="py-3 px-2 text-center">{p.telefono}</td>
                                                    <td className="py-3 px-2 text-subtitle/80 text-center">{p.direccion}</td>
                                                    <td className="py-3 px-2 text-center">{p.plazo_credito_dias} días</td>
                                                    <td className="py-3 px-2 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${p.estado === 1 ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                                                            {p.estado === 1 ? "Activo" : "Inactivo"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    )}

                    {activeTab === "compras" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Registro de Compras</h3>
                                    <p className="text-subtitle text-s">Órdenes, recepciones de inventario y cuentas por pagar</p>
                                </div>
                                <button className="bg-button text-button flex flex-row h-10 text-s gap-3 p-2 rounded-xl items-center hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer" onClick={() => setIsCompraModalOpen(true)}>
                                    <Plus />
                                    Nueva Compra
                                </button>
                            </div>
                            <div className="mt-8 overflow-x-auto">
                                {isLoadingCompras ? (
                                    <p className="p-4 text-center text-gray-400">Cargando compras...</p>
                                ) : ordenes.length === 0 ? (
                                    <p className="p-4 text-center text-gray-400">No hay órdenes de compra registradas.</p>
                                ) : (
                                    <table className="text-title w-full min-w-[900px] border-collapse">
                                        <thead>
                                            <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                                                <th className="py-3 px-2 text-center">Orden</th>
                                                <th className="py-3 px-2 text-center">Proveedor</th>
                                                <th className="py-3 px-2 text-center">Sucursal</th>
                                                <th className="py-3 px-2 text-center">Fecha</th>
                                                <th className="py-3 px-2 text-center">Líneas</th>
                                                <th className="py-3 px-2 w-32 text-center">Estado</th>
                                                <th className="py-3 px-2 text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ordenes.map((order) => (
                                                <tr key={order.id_orden_compra} className="border-t border-secondary text-sm hover:bg-secondary/10">
                                                    <td className="py-3 px-2 text-center font-mono">{order.numero}</td>
                                                    <td className="py-3 px-2 text-center">{order.nombre_proveedor}</td>
                                                    <td className="py-3 px-2 text-center">Sucursal {order.id_sucursal}</td>
                                                    <td className="py-3 px-2 text-center">{new Date(order.creada_en).toLocaleDateString()}</td>
                                                    <td className="py-3 px-2 text-center">{order.lineas.length}</td>
                                                    <td className="py-3 px-2 text-center">
                                                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-600/20 text-blue-400">{order.estado}</span>
                                                    </td>
                                                    <td className="py-3 px-2 text-center">
                                                        <div className="flex justify-center gap-3">
                                                            {order.estado === "BORRADOR" && (
                                                                <button onClick={() => enviarOrden(order.id_orden_compra)} disabled={isSavingCompra} title="Enviar orden al proveedor" className="text-blue-400 disabled:opacity-50">
                                                                    <Send size={18} />
                                                                </button>
                                                            )}
                                                            {["ENVIADA", "PARCIAL"].includes(order.estado) && (
                                                                <button onClick={() => { setOrdenSeleccionada(order); setIsRecepcionModalOpen(true); }} title="Registrar recepción" className="text-green-400">
                                                                    <PackageCheck size={18} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <h3 className="text-title text-lg font-semibold mt-10 mb-3">Cuentas por pagar pendientes</h3>
                            <div className="overflow-x-auto">
                                {cuentasPorPagar.length === 0 ? (
                                    <p className="p-4 text-center text-gray-400">No hay saldos pendientes. Las cuentas por pagar se crean al recibir inventario.</p>
                                ) : (
                                    <table className="text-title w-full min-w-[800px] border-collapse">
                                        <thead>
                                            <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                                                <th className="py-3 px-2 text-center">CxP</th>
                                                <th className="py-3 px-2 text-center">Proveedor</th>
                                                <th className="py-3 px-2 text-center">Recepción</th>
                                                <th className="py-3 px-2 text-center">Vence</th>
                                                <th className="py-3 px-2 text-center">Total</th>
                                                <th className="py-3 px-2 text-center">Saldo pendiente</th>
                                                <th className="py-3 px-2 text-center">Estado</th>
                                                <th className="py-3 px-2 text-center">Pago</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cuentasPorPagar.map((account) => (
                                                <tr key={account.id_cuenta_por_pagar} className="border-t border-secondary text-sm">
                                                    <td className="py-3 px-2 text-center">{account.id_cuenta_por_pagar}</td>
                                                    <td className="py-3 px-2 text-center">{account.nombre_proveedor}</td>
                                                    <td className="py-3 px-2 text-center">{account.id_recepcion}</td>
                                                    <td className="py-3 px-2 text-center">{account.fecha_vencimiento}</td>
                                                    <td className="py-3 px-2 text-center">{formatCurrency(account.total)}</td>
                                                    <td className="py-3 px-2 text-center font-semibold">{formatCurrency(account.saldo_pendiente)}</td>
                                                    <td className="py-3 px-2 text-center">{account.estado}{account.dias_vencidos > 0 ? ` (${account.dias_vencidos} días vencida)` : ""}</td>
                                                    <td className="py-3 px-2 text-center">
                                                        <button className="text-green-500 hover:text-green-400 disabled:opacity-30" title="Registrar pago" onClick={() => handleAbrirPago(account)} disabled={isSavingCompra}>
                                                            <CreditCard size={18} />
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
                        <NuevoProveedor onClose={() => { setIsModalOpen(false); fetchProveedores(); }} />
                    </div>
                </div>
            )}

            {isCompraModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsCompraModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <NuevaCompra onClose={() => { setIsCompraModalOpen(false); fetchCompras(); }} />
                    </div>
                </div>
            )}

            {isPagoModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsPagoModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <RegistrarPagoProveedor
                            cuentaPorPagar={cuentaSeleccionada}
                            onClose={() => { setIsPagoModalOpen(false); fetchCompras(); }}
                        />
                    </div>
                </div>
            )}
            {isRecepcionModalOpen && ordenSeleccionada && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsRecepcionModalOpen(false)}></div>
                    <div className="relative z-10 mx-4 w-full">
                        <RecibirOrdenCompra
                            orden={ordenSeleccionada}
                            onClose={() => { setIsRecepcionModalOpen(false); fetchCompras(); }}
                        />
                    </div>
                </div>
            )}
        </div >
    )
}