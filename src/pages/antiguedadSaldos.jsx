import { useState, useEffect, useCallback } from "react";
import { Clock, Users, Truck, RefreshCw } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import Tabs from "../components/tabs";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";

const fmt = (n) => `C$ ${Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const tramoAntiguedad = (dias) => {
    if (dias <= 0) return "Corriente";
    if (dias <= 30) return "1-30 días";
    if (dias <= 60) return "31-60 días";
    if (dias <= 90) return "61-90 días";
    return "Más de 90 días";
};

const tramoColor = (tramo) => {
    if (tramo === "Corriente") return "bg-emerald-500/15 text-emerald-400";
    if (tramo === "1-30 días") return "bg-amber-500/15 text-amber-400";
    if (tramo === "31-60 días") return "bg-orange-500/15 text-orange-400";
    return "bg-red-500/15 text-red-400";
};

export default function AntiguedadSaldos() {
    const { empresaId } = useEmpresa();
    const tabs = [
        { key: "cxc", label: "Cuentas por Cobrar", icon: <Users size={16} /> },
        { key: "cxp", label: "Cuentas por Pagar", icon: <Truck size={16} /> },
    ];
    const [tab, setTab] = useState("cxc");
    const [cxc, setCxc] = useState([]);
    const [cxp, setCxp] = useState([]);
    const [loading, setLoading] = useState(false);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        try {
            const [cxcResult, cuotasResult, cuentasPorPagarResult, clientesResult, proveedoresResult] = await Promise.all([
                supabase.from("saldos_cuentas_por_cobrar")
                    .select("id_factura, numero, id_cliente, fecha_emision, fecha_vencimiento, total, saldo_pendiente, dias_vencidos, estado")
                    .eq("id_empresa", empresaId)
                    .gt("saldo_pendiente", 0)
                    .order("fecha_vencimiento"),
                supabase.from("calendario_saldos_cuentas_por_pagar")
                    .select("id_cuenta_por_pagar, id_cuota, numero_cuota, fecha_vencimiento, monto, saldo_pendiente, dias_vencidos, estado")
                    .eq("id_empresa", empresaId)
                    .gt("saldo_pendiente", 0)
                    .order("fecha_vencimiento"),
                supabase.from("cuentas_por_pagar")
                    .select("id_cuenta_por_pagar, id_proveedor, documento_referencia, fecha_emision")
                    .eq("id_empresa", empresaId),
                supabase.from("clientes")
                    .select("id_cliente, nombre")
                    .eq("id_empresa", empresaId),
                supabase.from("proveedores")
                    .select("id_proveedor, nombre")
                    .eq("id_empresa", empresaId),
            ]);
            const error = cxcResult.error || cuotasResult.error || cuentasPorPagarResult.error
                || clientesResult.error || proveedoresResult.error;
            if (error) throw error;

            const nombresClientes = new Map((clientesResult.data || []).map((cliente) => [cliente.id_cliente, cliente.nombre]));
            const nombresProveedores = new Map((proveedoresResult.data || []).map((proveedor) => [proveedor.id_proveedor, proveedor.nombre]));
            const cuentasPagar = new Map((cuentasPorPagarResult.data || []).map((cuenta) => [cuenta.id_cuenta_por_pagar, cuenta]));

            setCxc((cxcResult.data || []).map((factura) => ({
                ...factura,
                cliente: nombresClientes.get(factura.id_cliente) || `Cliente #${factura.id_cliente}`,
                dias_vencido: Number(factura.dias_vencidos || 0),
                tramo: tramoAntiguedad(Number(factura.dias_vencidos || 0)),
            })));
            setCxp((cuotasResult.data || []).map((cuota) => {
                const cuenta = cuentasPagar.get(cuota.id_cuenta_por_pagar);
                return {
                    ...cuota,
                    id_fila: cuota.id_cuota,
                    id_compra: cuenta?.id_cuenta_por_pagar,
                    documento: cuenta?.documento_referencia || `CxP-${cuota.id_cuenta_por_pagar}`,
                    proveedor: nombresProveedores.get(cuenta?.id_proveedor) || `Proveedor #${cuenta?.id_proveedor || "—"}`,
                    total: cuota.monto,
                    fecha_emision: cuenta?.fecha_emision || null,
                    dias_vencido: Number(cuota.dias_vencidos || 0),
                    tramo: tramoAntiguedad(Number(cuota.dias_vencidos || 0)),
                };
            }));
        } catch (error) {
            console.error("Error cargando antigüedad de saldos:", error);
            toast.error(`No se pudo cargar la antigüedad de saldos: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    const datos = tab === "cxc" ? cxc : cxp;
    const totalPendiente = datos.reduce((s, r) => s + Number(r.saldo_pendiente || 0), 0);
    const totalVencido = datos.filter((r) => Number(r.dias_vencido) > 0)
        .reduce((s, r) => s + Number(r.saldo_pendiente || 0), 0);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Clock className="text-title" size={26} />
                    <div>
                        <h1 className="text-title text-2xl font-bold">Antigüedad de Saldos</h1>
                        <p className="text-subtitle text-sm">Cuentas por cobrar y por pagar por tramos de vencimiento.</p>
                    </div>
                </div>
                <button onClick={cargar} className="btn-secondary"><RefreshCw size={16} /> Actualizar</button>
            </div>

            <Tabs tabs={tabs} activeKey={tab} onChange={setTab} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatsCards title="Documentos / cuotas" value={datos.length} icon={<Clock size={20} />} color="blue" />
                <StatsCards title="Saldo pendiente total" value={fmt(totalPendiente)} icon={<Users size={20} />} color="purple" />
                <StatsCards title="Saldo vencido" value={fmt(totalVencido)} icon={<Truck size={20} />} color="red" />
            </div>

            <div className="erp-card p-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-subtitle text-left border-b border-secondary">
                            {tab === "cxc" ? (
                                <><th className="py-2 pr-4">Factura</th><th className="py-2 pr-4">Cliente</th></>
                            ) : (
                                <><th className="py-2 pr-4">Cuenta / cuota</th><th className="py-2 pr-4">Proveedor</th></>
                            )}
                            <th className="py-2 pr-4">Fecha</th>
                            <th className="py-2 pr-4">Vence</th>
                            <th className="py-2 pr-4 text-right">Total</th>
                            <th className="py-2 pr-4 text-right">Pendiente</th>
                            <th className="py-2 pr-4 text-right">Días</th>
                            <th className="py-2">Tramo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={8} className="py-4 text-subtitle">Cargando…</td></tr>}
                        {datos.map((r) => (
                            <tr key={tab === "cxc" ? r.id_factura : r.id_fila} className="border-b border-secondary/50">
                                {tab === "cxc" ? (
                                    <>
                                        <td className="py-2 pr-4 text-title font-medium">{r.numero}</td>
                                        <td className="py-2 pr-4 text-subtitle">{r.cliente}</td>
                                    </>
                                ) : (
                                    <>
                                        <td className="py-2 pr-4 text-title font-medium">{r.documento} · Cuota {r.numero_cuota}</td>
                                        <td className="py-2 pr-4 text-subtitle">{r.proveedor}</td>
                                    </>
                                )}
                                <td className="py-2 pr-4 text-subtitle whitespace-nowrap">{r.fecha_emision || "—"}</td>
                                <td className="py-2 pr-4 text-subtitle whitespace-nowrap">{r.fecha_vencimiento || "—"}</td>
                                <td className="py-2 pr-4 text-right text-subtitle">{fmt(r.total)}</td>
                                <td className="py-2 pr-4 text-right text-title font-medium">{fmt(r.saldo_pendiente)}</td>
                                <td className="py-2 pr-4 text-right text-subtitle">{r.dias_vencido}</td>
                                <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tramoColor(r.tramo)}`}>{r.tramo}</span></td>
                            </tr>
                        ))}
                        {!loading && datos.length === 0 && <tr><td colSpan={8} className="py-4 text-subtitle">Sin saldos pendientes.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
