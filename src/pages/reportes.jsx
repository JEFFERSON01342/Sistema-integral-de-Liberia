import { useState, useEffect, useMemo, useCallback } from "react";
import {
    BarChart3, TrendingUp, Package, LineChart as LineIcon, Download,
    DollarSign, ShoppingCart, Users, AlertTriangle, FileSpreadsheet, FileText
} from "lucide-react";
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area
} from "recharts";
import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useProductos } from "../hooks/useProductos";
import { useClientes } from "../hooks/useClientes";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "react-hot-toast";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Índice de estacionalidad por mes para librerías en Nicaragua (1.0 = promedio).
// Picos: Ene-Feb (regreso a clases), May (día de la madre), Sep (patrias), Dic (navidad).
const ESTACIONALIDAD = [1.8, 1.6, 1.0, 0.9, 1.3, 0.8, 0.7, 0.9, 1.2, 0.9, 1.0, 1.5];

const fmt = (v) => `C$ ${Number(v || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (v) => {
    const n = Number(v || 0);
    return n >= 1000 ? `C$${(n / 1000).toFixed(1)}k` : `C$${n.toFixed(0)}`;
};

export default function Reportes() {
    const { empresaId } = useEmpresa();
    const { productos = [] } = useProductos();
    const { clientes = [] } = useClientes();

    const tabs = [
        { key: "ejecutivo", label: "Dashboard Ejecutivo", icon: <BarChart3 size={16} /> },
        { key: "ventas", label: "Ventas", icon: <ShoppingCart size={16} /> },
        { key: "inventario", label: "Inventario", icon: <Package size={16} /> },
        { key: "pronosticos", label: "Pronósticos", icon: <LineIcon size={16} /> },
        { key: "exportar", label: "Exportar", icon: <Download size={16} /> },
    ];
    const [activeTab, setActiveTab] = useState("ejecutivo");

    const [ventas, setVentas] = useState([]);
    const [detalles, setDetalles] = useState([]);
    const [devoluciones, setDevoluciones] = useState([]);
    const [detallesDevolucion, setDetallesDevolucion] = useState([]);
    const [porCobrar, setPorCobrar] = useState(0);
    const [loading, setLoading] = useState(false);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        try {
            const cargarPaginas = async (crearConsulta) => {
                const filas = [];
                for (let desdeFila = 0; ; desdeFila += 1000) {
                    const { data, error } = await crearConsulta().range(desdeFila, desdeFila + 999);
                    if (error) throw error;
                    filas.push(...(data || []));
                    if (!data || data.length < 1000) break;
                }
                return filas;
            };
            const [v, dev, cxc] = await Promise.all([
                cargarPaginas(() => supabase.from("ventas")
                    .select("id_venta, numero, fecha_operativa, metodo_pago, total, costo_total_fifo")
                    .eq("id_empresa", empresaId)
                    .order("fecha_operativa")
                    .order("id_venta")),
                cargarPaginas(() => supabase.from("devoluciones_venta")
                    .select("id_devolucion, numero, id_venta, fecha_operativa, metodo_reembolso, total")
                    .eq("id_empresa", empresaId)
                    .order("fecha_operativa")
                    .order("id_devolucion")),
                cargarPaginas(() => supabase.from("saldos_cuentas_por_cobrar")
                    .select("saldo_pendiente")
                    .eq("id_empresa", empresaId)
                    .gt("saldo_pendiente", 0)),
            ]);
            const idsVenta = v.map((venta) => venta.id_venta);
            const idsDevolucion = dev.map((devolucion) => devolucion.id_devolucion);
            const consultarPorLotes = async (tabla, campos, campoId, ids) => {
                const filas = [];
                for (let i = 0; i < ids.length; i += 500) {
                    const { data, error } = await supabase.from(tabla)
                        .select(campos)
                        .eq("id_empresa", empresaId)
                        .in(campoId, ids.slice(i, i + 500));
                    if (error) throw error;
                    filas.push(...(data || []));
                }
                return filas;
            };
            const [d, dd] = await Promise.all([
                consultarPorLotes("detalle_ventas", "id_venta, id_producto, cantidad, precio_unitario, subtotal_linea", "id_venta", idsVenta),
                consultarPorLotes("detalles_devolucion_venta", "id_devolucion, id_producto, cantidad, subtotal", "id_devolucion", idsDevolucion),
            ]);
            setVentas(v);
            setDetalles(d);
            setDevoluciones(dev);
            setDetallesDevolucion(dd);
            setPorCobrar(cxc.reduce((total, factura) => total + Number(factura.saldo_pendiente || 0), 0));
        } catch (err) {
            console.error("Error cargando reportes:", err);
            toast.error(`No se pudieron cargar los reportes: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    // ---------- KPIs ----------
    const totalVentas = useMemo(() =>
        ventas.reduce((s, v) => s + Number(v.total || 0), 0)
        - devoluciones.reduce((s, devolucion) => s + Number(devolucion.total || 0), 0),
    [ventas, devoluciones]);
    const numVentas = ventas.length;
    const ticketPromedio = numVentas > 0 ? totalVentas / numVentas : 0;
    const valorInventario = useMemo(() => productos.reduce((s, p) => s + Number(p.valor_inventario || 0), 0), [productos]);
    const stockBajo = useMemo(() => productos.filter((p) => p.bajo_stock).length, [productos]);

    // ---------- Ventas por mes (año actual) ----------
    const ventasPorMes = useMemo(() => {
        const anioActual = new Date().getFullYear();
        const acc = Array(12).fill(0);
        ventas.forEach((v) => {
            const f = new Date(v.fecha_operativa);
            if (f.getUTCFullYear() === anioActual) acc[f.getUTCMonth()] += Number(v.total || 0);
        });
        devoluciones.forEach((devolucion) => {
            const f = new Date(devolucion.fecha_operativa);
            if (f.getUTCFullYear() === anioActual) acc[f.getUTCMonth()] -= Number(devolucion.total || 0);
        });
        return MESES.map((m, i) => ({ mes: m, ventas: acc[i] }));
    }, [ventas, devoluciones]);

    // ---------- Ventas por tipo de pago ----------
    const ventasPorTipo = useMemo(() => {
        const acc = {};
        ventas.forEach((v) => {
            const k = v.metodo_pago || "OTRO";
            acc[k] = (acc[k] || 0) + Number(v.total || 0);
        });
        return Object.entries(acc).map(([name, value]) => ({ name, value }));
    }, [ventas]);

    // ---------- Top productos vendidos ----------
    const topProductos = useMemo(() => {
        const acc = {};
        detalles.forEach((d) => {
            if (!acc[d.id_producto]) acc[d.id_producto] = { cantidad: 0, monto: 0 };
            acc[d.id_producto].cantidad += Number(d.cantidad || 0);
            acc[d.id_producto].monto += Number(d.subtotal_linea || 0);
        });
        detallesDevolucion.forEach((d) => {
            if (!acc[d.id_producto]) acc[d.id_producto] = { cantidad: 0, monto: 0 };
            acc[d.id_producto].cantidad -= Number(d.cantidad || 0);
            acc[d.id_producto].monto -= Number(d.subtotal || 0);
        });
        return Object.entries(acc)
            .map(([id, val]) => {
                const prod = productos.find((p) => String(p.id_producto) === String(id));
                return { nombre: prod?.nombre || `#${id}`, cantidad: val.cantidad, monto: val.monto };
            })
            .filter((producto) => producto.cantidad > 0)
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, 8);
    }, [detalles, detallesDevolucion, productos]);

    // ---------- Inventario por categoría ----------
    const inventarioPorCategoria = useMemo(() => {
        const acc = {};
        productos.forEach((p) => {
            const cat = p.categorias_producto?.nombre || "Sin categoría";
            acc[cat] = (acc[cat] || 0) + Number(p.valor_inventario || 0);
        });
        return Object.entries(acc).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [productos]);

    // ---------- Pronóstico de ventas (temporadas Nicaragua) ----------
    const pronostico = useMemo(() => {
        // Promedio mensual histórico (meses con ventas) como base.
        const mesesConVenta = ventasPorMes.filter((m) => m.ventas > 0);
        const promedio = mesesConVenta.length > 0
            ? mesesConVenta.reduce((s, m) => s + m.ventas, 0) / mesesConVenta.length
            : 0;
        const base = promedio > 0 ? promedio : 10000; // base estimada si no hay histórico
        return MESES.map((m, i) => ({
            mes: m,
            real: ventasPorMes[i].ventas,
            proyeccion: Math.round(base * ESTACIONALIDAD[i]),
        }));
    }, [ventasPorMes]);

    const mejorTemporada = useMemo(() => {
        const idx = ESTACIONALIDAD.indexOf(Math.max(...ESTACIONALIDAD));
        return MESES[idx];
    }, []);

    // ---------- EXPORTACIÓN ----------
    const [exportando, setExportando] = useState(false);

    const exportarExcel = async () => {
        setExportando(true);
        try {
            const wb = new ExcelJS.Workbook();
            wb.creator = "Librería Lisjuashde";

            // Hoja Ventas
            const wsV = wb.addWorksheet("Ventas");
            wsV.addRow(["Reporte de Ventas - Librería Lisjuashde"]).font = { size: 14, bold: true };
            wsV.addRow([]);
            const hV = wsV.addRow(["Operación", "Documento", "Fecha", "Método", "Total"]);
            hV.font = { bold: true };
            hV.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
            const operacionesVenta = [
                ...ventas.map((venta) => ({
                    tipo: "VENTA",
                    numero: venta.numero,
                    fecha: venta.fecha_operativa,
                    metodo: venta.metodo_pago,
                    total: Number(venta.total || 0),
                })),
                ...devoluciones.map((devolucion) => ({
                    tipo: "DEVOLUCION",
                    numero: devolucion.numero,
                    fecha: devolucion.fecha_operativa,
                    metodo: devolucion.metodo_reembolso,
                    total: -Number(devolucion.total || 0),
                })),
            ].sort((a, b) => a.fecha.localeCompare(b.fecha));
            operacionesVenta.forEach((operacion) => {
                wsV.addRow([
                    operacion.tipo,
                    operacion.numero,
                    new Date(operacion.fecha).toLocaleDateString("es-NI", { timeZone: "UTC" }),
                    operacion.metodo,
                    operacion.total,
                ]);
            });
            wsV.getColumn(5).numFmt = '"C$" #,##0.00';
            [18, 18, 14, 20, 16].forEach((w, i) => (wsV.getColumn(i + 1).width = w));

            // Hoja Inventario
            const wsI = wb.addWorksheet("Inventario");
            wsI.addRow(["Reporte de Inventario - Librería Lisjuashde"]).font = { size: 14, bold: true };
            wsI.addRow([]);
            const hI = wsI.addRow(["SKU", "Producto", "Categoría", "Stock", "Stock Mín.", "Costo Promedio", "Precio Venta", "Valor Stock"]);
            hI.font = { bold: true };
            hI.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } }; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
            productos.forEach((p) => {
                wsI.addRow([
                    p.codigo_sku, p.nombre, p.categorias_producto?.nombre || "N/A",
                    Number(p.stock || 0), Number(p.stock_minimo || 0),
                    Number(p.stock || 0) > 0 ? Number(p.valor_inventario || 0) / Number(p.stock) : 0,
                    Number(p.precio_venta || 0),
                    Number(p.valor_inventario || 0),
                ]);
            });
            [6, 7, 8].forEach((col) => (wsI.getColumn(col).numFmt = '"C$" #,##0.00'));
            [18, 30, 18, 10, 10, 16, 16, 16].forEach((w, i) => (wsI.getColumn(i + 1).width = w));

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Reportes_Libreria_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success("✅ Excel exportado correctamente.");
        } catch (err) {
            console.error("Error exportando Excel:", err.message);
            toast.error("⚠️ Error al exportar Excel.");
        } finally {
            setExportando(false);
        }
    };

    const exportarPDF = () => {
        try {
            const doc = new jsPDF();
            const pw = doc.internal.pageSize.getWidth();
            doc.setFontSize(16); doc.setFont("helvetica", "bold");
            doc.text("Reporte Ejecutivo - Librería Lisjuashde", pw / 2, 16, { align: "center" });
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            doc.text(`Generado: ${new Date().toLocaleString("es-NI")}`, pw / 2, 23, { align: "center" });

            autoTable(doc, {
                startY: 30,
                head: [["Indicador", "Valor"]],
                body: [
                    ["Ventas menos devoluciones", fmt(totalVentas)],
                    ["N° de ventas", String(numVentas)],
                    ["Ticket promedio", fmt(ticketPromedio)],
                    ["Cuentas por cobrar", fmt(porCobrar)],
                    ["Valor de inventario", fmt(valorInventario)],
                    ["Productos con stock bajo", String(stockBajo)],
                    ["Clientes registrados", String(clientes.length)],
                ],
                headStyles: { fillColor: [37, 99, 235] },
                margin: { left: 14, right: 14 },
            });

            let y = (doc.lastAutoTable?.finalY || 40) + 8;
            doc.setFont("helvetica", "bold"); doc.text("Top productos vendidos", 14, y);
            autoTable(doc, {
                startY: y + 3,
                head: [["Producto", "Unid.", "Monto"]],
                body: topProductos.map((p) => [p.nombre, String(p.cantidad), fmt(p.monto)]),
                headStyles: { fillColor: [22, 163, 74] },
                margin: { left: 14, right: 14 },
            });

            doc.save(`Reporte_Ejecutivo_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("✅ PDF exportado correctamente.");
        } catch (err) {
            console.error("Error exportando PDF:", err.message);
            toast.error("⚠️ Error al exportar PDF.");
        }
    };

    const tooltipStyle = { backgroundColor: "#1e1e1e", border: "1px solid #333", borderRadius: "8px", color: "#fff" };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Ventas - devoluciones"} icon={<DollarSign className="text-title" />} value={fmt(totalVentas)} />
                <StatsCards title={"Ticket Promedio"} icon={<TrendingUp className="text-title" />} value={fmt(ticketPromedio)} />
                <StatsCards title={"Valor Inventario"} icon={<Package className="text-title" />} value={fmt(valorInventario)} />
                <StatsCards title={"Stock Bajo"} icon={<AlertTriangle color="red" />} value={stockBajo} />
            </div>

            <div className="mt-6">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    {loading && <p className="p-4 text-center text-subtitle">Cargando datos...</p>}

                    {/* ------- DASHBOARD EJECUTIVO ------- */}
                    {!loading && activeTab === "ejecutivo" && (
                        <>
                            <h3 className="text-title text-xl font-bold mb-1">Dashboard Ejecutivo</h3>
                            <p className="text-subtitle text-s mb-6">Visión general del desempeño del negocio</p>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <StatsCards title={"N° Ventas"} icon={<ShoppingCart className="text-title" />} value={numVentas} />
                                <StatsCards title={"Por Cobrar"} icon={<AlertTriangle className="text-yellow-400" />} value={fmt(porCobrar)} />
                                <StatsCards title={"Clientes"} icon={<Users className="text-title" />} value={clientes.length} />
                                <StatsCards title={"Productos"} icon={<Package className="text-title" />} value={productos.length} />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="border border-secondary rounded-xl p-4">
                                    <h4 className="text-title font-semibold mb-4">Ventas por mes ({new Date().getFullYear()})</h4>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <AreaChart data={ventasPorMes}>
                                            <defs>
                                                <linearGradient id="colVentas" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                            <XAxis dataKey="mes" stroke="#888" fontSize={12} />
                                            <YAxis stroke="#888" fontSize={12} tickFormatter={fmtK} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
                                            <Area type="monotone" dataKey="ventas" stroke="#2563eb" fill="url(#colVentas)" strokeWidth={2} name="Ventas" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="border border-secondary rounded-xl p-4">
                                    <h4 className="text-title font-semibold mb-4">Ventas por tipo de pago</h4>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <PieChart>
                                            <Pie data={ventasPorTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                                                {ventasPorTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ------- VENTAS ------- */}
                    {!loading && activeTab === "ventas" && (
                        <>
                            <h3 className="text-title text-xl font-bold mb-1">Análisis de Ventas</h3>
                            <p className="text-subtitle text-s mb-6">Tendencias y productos más vendidos</p>

                            <div className="border border-secondary rounded-xl p-4 mb-6">
                                <h4 className="text-title font-semibold mb-4">Evolución mensual de ventas</h4>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={ventasPorMes}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="mes" stroke="#888" fontSize={12} />
                                        <YAxis stroke="#888" fontSize={12} tickFormatter={fmtK} />
                                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
                                        <Line type="monotone" dataKey="ventas" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="Ventas" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="border border-secondary rounded-xl p-4">
                                <h4 className="text-title font-semibold mb-4">Top productos más vendidos (unidades)</h4>
                                {topProductos.length === 0 ? (
                                    <p className="text-subtitle text-center p-4">Sin datos de ventas aún.</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={topProductos} layout="vertical" margin={{ left: 40 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                            <XAxis type="number" stroke="#888" fontSize={12} />
                                            <YAxis type="category" dataKey="nombre" stroke="#888" fontSize={11} width={120} />
                                            <Tooltip contentStyle={tooltipStyle} />
                                            <Bar dataKey="cantidad" fill="#2563eb" name="Unidades" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </>
                    )}

                    {/* ------- INVENTARIO ------- */}
                    {!loading && activeTab === "inventario" && (
                        <>
                            <h3 className="text-title text-xl font-bold mb-1">Análisis de Inventario</h3>
                            <p className="text-subtitle text-s mb-6">Distribución del valor de inventario</p>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="border border-secondary rounded-xl p-4">
                                    <h4 className="text-title font-semibold mb-4">Valor por categoría</h4>
                                    {inventarioPorCategoria.length === 0 ? (
                                        <p className="text-subtitle text-center p-4">Sin productos registrados.</p>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie data={inventarioPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => e.name}>
                                                    {inventarioPorCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>

                                <div className="border border-secondary rounded-xl p-4">
                                    <h4 className="text-title font-semibold mb-4">Productos con stock bajo</h4>
                                    <div className="overflow-y-auto max-h-[300px]">
                                        <table className="w-full text-title text-sm">
                                            <thead className="bg-secondary/10 sticky top-0">
                                                <tr className="text-xs text-subtitle font-semibold">
                                                    <th className="py-2 px-3 text-left">Producto</th>
                                                    <th className="py-2 px-3 text-center">Stock</th>
                                                    <th className="py-2 px-3 text-center">Mínimo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {productos.filter((p) => p.bajo_stock).map((p) => (
                                                    <tr key={p.id_producto} className="border-t border-secondary">
                                                        <td className="py-2 px-3 text-left">{p.nombre}</td>
                                                        <td className="py-2 px-3 text-center"><span className="bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-semibold">{p.stock}</span></td>
                                                        <td className="py-2 px-3 text-center text-subtitle">{p.stock_minimo}</td>
                                                    </tr>
                                                ))}
                                                {stockBajo === 0 && <tr><td colSpan={3} className="py-4 text-center text-subtitle">Todo el stock está en niveles óptimos ✅</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ------- PRONÓSTICOS ------- */}
                    {!loading && activeTab === "pronosticos" && (
                        <>
                            <h3 className="text-title text-xl font-bold mb-1">Pronósticos de Ventas</h3>
                            <p className="text-subtitle text-s mb-4">Proyección según temporadas comerciales de Nicaragua (regreso a clases, día de la madre, fiestas patrias, navidad)</p>

                            <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-4 mb-6 flex items-start gap-3">
                                <TrendingUp className="text-blue-400 shrink-0 mt-0.5" size={20} />
                                <p className="text-sm text-subtitle">
                                    Según el patrón estacional del mercado nicaragüense, el mes de mayor demanda proyectada es <span className="text-title font-semibold">{mejorTemporada}</span> (regreso a clases). Se recomienda reforzar inventario de útiles escolares en diciembre–enero.
                                </p>
                            </div>

                            <div className="border border-secondary rounded-xl p-4">
                                <h4 className="text-title font-semibold mb-4">Ventas reales vs. proyección</h4>
                                <ResponsiveContainer width="100%" height={340}>
                                    <BarChart data={pronostico}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="mes" stroke="#888" fontSize={12} />
                                        <YAxis stroke="#888" fontSize={12} tickFormatter={fmtK} />
                                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
                                        <Legend />
                                        <Bar dataKey="real" fill="#16a34a" name="Ventas reales" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="proyeccion" fill="#2563eb" name="Proyección" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}

                    {/* ------- EXPORTAR ------- */}
                    {!loading && activeTab === "exportar" && (
                        <>
                            <h3 className="text-title text-xl font-bold mb-1">Exportar Reportes</h3>
                            <p className="text-subtitle text-s mb-6">Descarga la información en distintos formatos</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="border border-secondary rounded-xl p-6 flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <FileSpreadsheet className="text-green-500" size={32} />
                                        <div>
                                            <h4 className="text-title font-semibold">Exportar a Excel</h4>
                                            <p className="text-subtitle text-sm">Ventas e inventario en hojas separadas (.xlsx)</p>
                                        </div>
                                    </div>
                                    <button onClick={exportarExcel} disabled={exportando} className="mt-2 bg-green-600 text-white py-2 px-4 rounded-lg cursor-pointer hover:scale-105 transition flex items-center justify-center gap-2 disabled:opacity-60">
                                        <Download size={18} /> {exportando ? "Generando..." : "Descargar Excel"}
                                    </button>
                                </div>

                                <div className="border border-secondary rounded-xl p-6 flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <FileText className="text-red-500" size={32} />
                                        <div>
                                            <h4 className="text-title font-semibold">Exportar a PDF</h4>
                                            <p className="text-subtitle text-sm">Reporte ejecutivo con KPIs y top productos (.pdf)</p>
                                        </div>
                                    </div>
                                    <button onClick={exportarPDF} className="mt-2 bg-red-600 text-white py-2 px-4 rounded-lg cursor-pointer hover:scale-105 transition flex items-center justify-center gap-2">
                                        <Download size={18} /> Descargar PDF
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
