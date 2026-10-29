import StatsCards from "../components/statscards";
import NuevaVenta from "../components/nuevaVenta";
import { useState, useEffect } from "react";
import { FileSpreadsheet, DollarSign, AlertTriangle, CheckCircle, Clock, Plus, DoorOpen, FileText, Eye, Ban, X } from "lucide-react";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { useClientes } from "../hooks/useClientes";
import { useVenta } from "../hooks/useVenta";
import { useAuth } from "../contexts/authcontext";
import { supabase } from "../supabase/supabaseclient";
import { generarFacturaPDF } from "../utils/generarFacturaPDF";
import { toast } from "react-hot-toast";

const EMPRESA_ID = 1;

export default function Ventas() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const { ventas, isLoading: isLoadingVentas, fetchVentas } = useVenta();
    const { clientes, isLoading: isLoadingClientes } = useClientes();
    const { user, rol } = useAuth();
    const navigate = useNavigate();

    // Filtro por estado contable y modal "Ver asiento"
    const [filtroContable, setFiltroContable] = useState("");
    const [asiento, setAsiento] = useState(null); // { venta, lineas }
    const puedeAnular = ["superadmin", "admin", "gerente"].includes(rol);

    const ESTADO_CONTABLE_BADGE = {
        CONTABILIZADO: "bg-emerald-500/15 text-emerald-400",
        PENDIENTE: "bg-amber-500/15 text-amber-400",
        ANULADO: "bg-red-500/15 text-red-400",
    };

    const handleVerAsiento = async (venta) => {
        if (!venta.comprobante_id) {
            toast.error("Esta venta no tiene un comprobante contable asociado.");
            return;
        }
        const { data, error } = await supabase
            .from("lineas_comprobante")
            .select("id, codigo, cuenta, debe, haber, descripcion")
            .eq("comprobante_id", venta.comprobante_id)
            .order("id");
        if (error) { toast.error("No se pudo cargar el asiento."); return; }
        setAsiento({ venta, lineas: data || [] });
    };

    const handleAnular = async (venta) => {
        if (!puedeAnular) return;
        if (venta.estado_contable === "ANULADO") { toast.error("La venta ya está anulada."); return; }
        const { value: motivo } = await Swal.fire({
            title: `Anular venta ${venta.numero_factura || "#" + venta.id_venta}`,
            input: "textarea", inputLabel: "Motivo de la anulación (obligatorio)",
            inputPlaceholder: "Describe el motivo…",
            background: "#152235", color: "#fff", showCancelButton: true,
            confirmButtonText: "Anular venta", cancelButtonText: "Cancelar", confirmButtonColor: "#ef4444",
            inputValidator: (v) => (!v || v.trim().length < 3) && "El motivo es obligatorio",
        });
        if (!motivo) return;
        const { error } = await supabase.rpc("sp_anular_venta", { p_id_venta: venta.id_venta, p_motivo: motivo });
        if (error) { Swal.fire({ icon: "error", title: "No se pudo anular", text: error.message, background: "#152235", color: "#fff" }); return; }
        toast.success("Venta anulada correctamente.");
        fetchVentas();
    };

    // --- Validación de caja abierta (RF-12) ---
    // Sólo el rol "cajero" está obligado a tener la caja abierta para registrar ventas.
    // Los demás roles (superadmin, admin, gerente, despacho) pueden vender siempre.
    const esCajero = rol === "cajero";
    const esSupervisor = ["superadmin", "admin", "gerente"].includes(rol);
    // null = aún verificando; true/false = resultado
    const [cajaAbierta, setCajaAbierta] = useState(esCajero ? null : true);
    const [miAperturaId, setMiAperturaId] = useState(null);

    useEffect(() => {
        let activo = true;
        const verificarCaja = async () => {
            // Si no es cajero, no se aplica la restricción.
            if (!esCajero) {
                setCajaAbierta(true);
                return;
            }
            if (!user?.id) return;
            const { data, error } = await supabase
                .from("apertura_caja")
                .select("id")
                .eq("id_cajero", user.id)
                .eq("estado", "abierta")
                .eq("id_empresa", EMPRESA_ID)
                .limit(1);
            if (!activo) return;
            if (error) {
                console.error("Error verificando caja abierta:", error.message);
                setCajaAbierta(false);
                return;
            }
            const tiene = Array.isArray(data) && data.length > 0;
            setCajaAbierta(tiene);
            setMiAperturaId(tiene ? data[0].id : null);
        };
        verificarCaja();
        return () => { activo = false; };
    }, [esCajero, user]);

    // El botón de venta se bloquea sólo cuando es cajero y ya se verificó que NO tiene caja abierta.
    const ventaBloqueada = esCajero && cajaAbierta === false;

    // --- Alcance de ventas por rol (RF-13) ---
    // El cajero sólo ve SUS ventas del turno actual (caja abierta) o del día de hoy.
    // Los supervisores ven todas las ventas que su RLS les permita (su sucursal / todas).
    const hoyStr = new Date().toISOString().slice(0, 10);
    const ventasVisibles = (ventas || []).filter((v) => {
        if (!esCajero) return true;
        if (v.usuario_registra && user?.id && v.usuario_registra !== user.id) return false;
        if (miAperturaId) return v.id_apertura_caja === miAperturaId;
        // Sin caja abierta: mostrar sólo las de hoy
        return (v.fecha_venta || "").slice(0, 10) === hoyStr;
    });

    const totalVentas = ventasVisibles.reduce((acc, v) => acc + Number(v.monto_total), 0);

    const facturasEmitidas = ventasVisibles.length;

    const porCobrar = ventasVisibles
        .filter(v => v.estado === 'Pendiente')
        .reduce((acc, v) => acc + Number(v.monto_total), 0);

    const ventasFiltradas = filtroContable
        ? ventasVisibles.filter(v => (v.estado_contable || "PENDIENTE") === filtroContable)
        : ventasVisibles;

    const formatCurrency = (amount) => `C$${Number(amount || 0).toFixed(2)}`;

    const getClientName = (clientId) => {
        if (isLoadingClientes || !clientes) return '...';
        const client = clientes.find(c => c.id_cliente === clientId);
        return client ? client.nombre : 'Cliente General';
    };

    const getStatusBadge = (estado) => {
        switch (estado) {
            case 'Pagada':
                return <span className="justify-center items-center text-center flex gap-5 font-semibold"><CheckCircle size={15} color="green" />Cancelado</span>;
            case 'Pendiente':
                return <span className="bg-yellow-600/20 text-yellow-300 px-2 py-1 rounded text-xs font-medium flex items-center gap-1"><Clock size={12} />Pendiente</span>;
            default:
                return <span className="bg-gray-600/20 text-gray-300 px-2 py-1 rounded text-xs font-medium flex items-center gap-1"><AlertTriangle size={12} /> {estado}</span>;
        }

    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleVerFactura = async (venta) => {
        try {
            // 1. Intentar recuperar la factura ya guardada
            const { data: factura } = await supabase
                .from("facturas")
                .select("contenido_json")
                .eq("numero_factura", venta.numero_factura)
                .maybeSingle();

            if (factura?.contenido_json) {
                generarFacturaPDF(factura.contenido_json, "open");
                return;
            }

            // 2. Reconstruir desde el detalle de la venta
            const { data: detalles, error } = await supabase
                .from("detalle_ventas")
                .select("cantidad, precio_unitario, descuento, id_producto, productos(nombre)")
                .eq("id_venta", venta.id_venta);

            if (error) throw error;

            const clienteObj = clientes?.find(c => c.id_cliente === venta.id_cliente);
            const datosFactura = {
                numeroFactura: venta.numero_factura,
                fecha: venta.fecha_venta
                    ? new Date(venta.fecha_venta).toLocaleDateString("es-NI", { timeZone: "UTC" })
                    : new Date().toLocaleDateString("es-NI"),
                cliente: clienteObj?.nombre || getClientName(venta.id_cliente),
                identificacion: clienteObj?.identificacion || "",
                tipoPago: venta.tipo_pago || "",
                items: (detalles || []).map(d => ({
                    nombre: d.productos?.nombre || `Producto #${d.id_producto}`,
                    cantidad: d.cantidad,
                    precio: d.precio_unitario,
                    descuento: d.descuento || 0,
                })),
                plazoDias: venta.plazo_dias || 0,
            };

            generarFacturaPDF(datosFactura, "open");
        } catch (err) {
            console.error("Error al generar la factura:", err.message);
            toast.error("No se pudo generar la factura.");
        }
    };


    return (
        <div>
            {ventaBloqueada && (
                <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-yellow-900/30 border border-yellow-600/50 text-yellow-300 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="shrink-0 mt-0.5" size={22} />
                        <div>
                            <p className="font-semibold">No tienes una caja abierta.</p>
                            <p className="text-sm text-yellow-300/80">Debes abrir la caja antes de registrar ventas.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate("/dashboard/aperturaCierre")}
                        className="shrink-0 bg-yellow-600 text-white flex flex-row h-10 gap-2 px-4 rounded-xl items-center justify-center cursor-pointer hover:scale-105 transition"
                    >
                        <DoorOpen size={18} /> Ir a Apertura de Caja
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={esCajero ? "Ventas de mi turno" : "Total Ventas"} icon={<DollarSign className="text-title" />} value={formatCurrency(totalVentas)} />
                <StatsCards title={esCajero ? "Mis facturas" : "Facturas Emitidas"} icon={<FileSpreadsheet className="text-title" />} value={facturasEmitidas} />
                <StatsCards title={"Por Cobrar"} icon={<AlertTriangle className="text-title" />} value={formatCurrency(porCobrar)} />
                <StatsCards title={"Borradores"} value={"0"} />
            </div>

            <div className="mt-6">
                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-title text-xl font-bold">Gestión de Ventas</h3>
                            <p className="text-subtitle text-s">Registra y administra tus ventas</p>
                        </div>
                        <button
                            className={`btn-new bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center transition ${
                                ventaBloqueada
                                    ? "opacity-50 cursor-not-allowed"
                                    : "cursor-pointer hover:opacity-95 hover:scale-110"
                            }`}
                            onClick={() => setIsModalOpen(true)}
                            disabled={ventaBloqueada}
                            title={ventaBloqueada ? "Debes abrir la caja antes de registrar ventas" : undefined}
                        >
                            <span className="icon"><Plus /></span> Nueva Venta
                        </button>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                        <span className="text-subtitle text-sm">Estado contable:</span>
                        <select
                            value={filtroContable}
                            onChange={(e) => setFiltroContable(e.target.value)}
                            className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5 text-sm"
                        >
                            <option value="">Todos</option>
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="CONTABILIZADO">Contabilizado</option>
                            <option value="ANULADO">Anulado</option>
                        </select>
                    </div>

                    <div className="overflow-x-auto mt-6">
                        <table className="w-full min-w-[700px] text-left">
                            <thead>
                                <tr className="border-b border-secondary/50">
                                    <th className="p-4 text-center text-title font-semibold text-sm">Factura</th>
                                    <th className="p-4 text-center text-title font-semibold text-sm">Cliente</th>
                                    <th className="p-4 text-center text-title font-semibold text-sm">Fecha</th>
                                    <th className="p-4 text-center text-title font-semibold text-sm">Plazo de Dias</th>
                                    <th className="p-4 text-center text-title font-semibold text-sm">Total</th>
                                    {esSupervisor && <th className="p-4 text-center text-title font-semibold text-sm">Sucursal</th>}
                                    {esSupervisor && <th className="p-4 text-center text-title font-semibold text-sm">Canal</th>}
                                    <th className="p-4 text-center text-title font-semibold text-sm">Estado</th>
                                    <th className="p-4 text-center text-title font-semibold text-sm">Estado contable</th>
                                    <th className="p-4 text-center text-title font-semibold text-sm">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingVentas && (
                                    <tr>
                                        <td colSpan={esSupervisor ? 10 : 8} className="p-4 text-center text-subtitle">
                                            Cargando ventas...
                                        </td>
                                    </tr>
                                )}

                                {!isLoadingVentas && ventasFiltradas.length === 0 && (
                                    <tr>
                                        <td colSpan={esSupervisor ? 10 : 8} className="p-4 text-center text-subtitle">
                                            No hay ventas registradas. Comienza creando una nueva.
                                        </td>
                                    </tr>
                                )}

                                {!isLoadingVentas && ventasFiltradas.map(venta => (
                                    <tr key={venta.id_venta} className="hover:bg-secondary/20 transition-colors">
                                        <td className="p-4 text-center text-title font-medium">{venta.numero_factura}</td>
                                        <td className="p-4 text-center text-subtitle">{getClientName(venta.id_cliente)}</td>
                                        <td className="p-4 text-center text-subtitle">{new Date(venta.fecha_venta).toLocaleDateString('es-NI', { timeZone: 'UTC' })}</td>
                                        <td className="p-4 text-center text-subtitle">{venta.plazo_dias ? `${venta.plazo_dias} días` : "N/A"}</td>
                                        <td className="p-4 text-center text-title">{formatCurrency(venta.monto_total)}</td>
                                        {esSupervisor && <td className="p-4 text-center text-subtitle">{venta.sucursal?.nombre || "—"}</td>}
                                        {esSupervisor && (
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${venta.canal === "web" ? "bg-purple-500/15 text-purple-300" : "bg-slate-500/15 text-slate-300"}`}>
                                                    {venta.canal === "web" ? "Web" : "Sucursal"}
                                                </span>
                                            </td>
                                        )}
                                        <td className="p-4 text-center">{getStatusBadge(venta.estado)}</td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_CONTABLE_BADGE[venta.estado_contable || "PENDIENTE"] || "bg-slate-500/20 text-slate-300"}`}>
                                                {venta.estado_contable || "PENDIENTE"}
                                            </span>
                                        </td>
                                        <td className="p-4 flex gap-4 text-center justify-center">
                                            <button onClick={() => handleVerFactura(venta)} className="text-green-400 cursor-pointer hover:text-green-300 transition-colors" aria-label="Ver Factura" title="Ver Factura">
                                                <FileText size={16} />
                                            </button>
                                            <button onClick={() => handleVerAsiento(venta)} className="text-blue-400 cursor-pointer hover:text-blue-300 transition-colors" aria-label="Ver asiento" title="Ver asiento contable">
                                                <Eye size={16} />
                                            </button>
                                            {puedeAnular && venta.estado_contable !== "ANULADO" && (
                                                <button onClick={() => handleAnular(venta)} className="text-red-500 cursor-pointer hover:text-red-400 transition-colors" aria-label="Anular" title="Anular venta">
                                                    <Ban size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={handleCloseModal}></div>
                    <div className="relative z-10 mx-4">
                        <NuevaVenta onClose={handleCloseModal} />
                    </div>
                </div>
            )}

            {asiento && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm p-4" onClick={() => setAsiento(null)}>
                    <div className="relative z-10 w-full max-w-2xl bg-primary border border-secondary rounded-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-title text-lg font-bold">Asiento contable · {asiento.venta.numero_factura || "#" + asiento.venta.id_venta}</h3>
                            <button onClick={() => setAsiento(null)} className="text-subtitle hover:text-title"><X size={20} /></button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-subtitle text-left border-b border-secondary">
                                        <th className="py-2 pr-4">Cuenta</th>
                                        <th className="py-2 pr-4">Descripción</th>
                                        <th className="py-2 pr-4 text-right">Debe</th>
                                        <th className="py-2 text-right">Haber</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {asiento.lineas.map((l) => (
                                        <tr key={l.id} className="border-b border-secondary/50">
                                            <td className="py-2 pr-4 text-title">{l.codigo} · {l.cuenta}</td>
                                            <td className="py-2 pr-4 text-subtitle">{l.descripcion || "—"}</td>
                                            <td className="py-2 pr-4 text-right text-emerald-400">{Number(l.debe) ? formatCurrency(l.debe) : ""}</td>
                                            <td className="py-2 text-right text-red-400">{Number(l.haber) ? formatCurrency(l.haber) : ""}</td>
                                        </tr>
                                    ))}
                                    {asiento.lineas.length === 0 && (
                                        <tr><td colSpan="4" className="py-3 text-center text-subtitle">Sin líneas contables.</td></tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-secondary font-bold text-title">
                                        <td className="py-2 pr-4" colSpan="2">Totales</td>
                                        <td className="py-2 pr-4 text-right text-emerald-400">{formatCurrency(asiento.lineas.reduce((s, l) => s + Number(l.debe || 0), 0))}</td>
                                        <td className="py-2 text-right text-red-400">{formatCurrency(asiento.lineas.reduce((s, l) => s + Number(l.haber || 0), 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}