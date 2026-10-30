import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Zap } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import { toast } from "react-hot-toast";
import Tabs from "../components/tabs";
import usePersistentState from "../hooks/usePersistentState";
import SucursalAlcanceFinanciero from "../components/SucursalAlcanceFinanciero";

const getTodayString = () => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
};

const REPORTS = [
    { key: "balanza", label: "Balanza de comprobación" },
    { key: "balance", label: "Balance general" },
    { key: "resultados", label: "Estado de resultados" },
    { key: "flujo", label: "Flujo de efectivo" },
    { key: "origen", label: "Origen y aplicación" },
];

const COLUMNS = {
    balanza: [
        ["codigo", "Código"], ["nombre", "Cuenta"], ["naturaleza", "Naturaleza"],
        ["saldo_inicial_deudor", "Saldo inicial deudor"], ["saldo_inicial_acreedor", "Saldo inicial acreedor"],
        ["movimiento_debe", "Debe"], ["movimiento_haber", "Haber"],
        ["saldo_final_deudor", "Saldo final deudor"], ["saldo_final_acreedor", "Saldo final acreedor"],
    ],
    balance: [["codigo", "Código"], ["nombre", "Cuenta"], ["naturaleza", "Naturaleza"], ["saldo", "Saldo"]],
    resultados: [["tipo_fila", "Rubro"], ["codigo", "Código"], ["nombre", "Cuenta"], ["naturaleza", "Naturaleza"], ["importe", "Importe"]],
    flujo: [["orden", "Orden"], ["codigo", "Código"], ["concepto", "Concepto"], ["actividad", "Actividad"], ["monto", "Monto"]],
    origen: [["tipo_fila", "Tipo"], ["codigo", "Código"], ["nombre", "Cuenta / concepto"], ["naturaleza", "Naturaleza"], ["cambio_saldo", "Cambio"], ["origen", "Origen"], ["aplicacion", "Aplicación"], ["actividad", "Actividad"]],
};

const MONEY_FIELDS = new Set([
    "saldo_inicial_deudor", "saldo_inicial_acreedor", "movimiento_debe", "movimiento_haber",
    "saldo_final_deudor", "saldo_final_acreedor", "saldo", "importe", "monto",
    "cambio_saldo", "origen", "aplicacion",
]);

const formatMoney = (value) => `C$ ${Number(value || 0).toLocaleString("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})}`;

function ReportTable({ reportKey, rows, isLoading }) {
    const columns = COLUMNS[reportKey];
    if (isLoading) return <p className="p-8 text-center text-subtitle">Cargando reporte...</p>;
    if (rows.length === 0) return <p className="p-8 text-center text-subtitle">No hay movimientos para el período seleccionado.</p>;

    return (
        <div className="overflow-x-auto rounded-xl border border-secondary">
            <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-secondary/30 text-subtitle">
                    <tr>
                        {columns.map(([field, label]) => (
                            <th key={field} className={`px-3 py-3 font-semibold ${MONEY_FIELDS.has(field) || field === "orden" ? "text-right" : "text-left"}`}>
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const isTotal = row.tipo_fila === "TOTAL" || row.tipo_fila === "UTILIDAD_NETA";
                        return (
                            <tr key={row.id_cuenta || row.codigo || `${row.tipo_fila}-${index}`} className={`border-t border-secondary ${isTotal ? "bg-secondary/20 font-bold" : "hover:bg-secondary/5"}`}>
                                {columns.map(([field]) => (
                                    <td key={field} className={`px-3 py-3 ${MONEY_FIELDS.has(field) || field === "orden" ? "text-right tabular-nums" : "text-left"} ${field === "monto" && row.actividad === "ALERTA" && Number(row.monto) > 0 ? "text-amber-500 font-bold" : ""}`}>
                                        {MONEY_FIELDS.has(field) ? formatMoney(row[field]) : row[field] ?? "—"}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function csvCell(value, isNumeric = false) {
    if (value == null) return "";
    if (isNumeric) {
        const number = Number(value);
        return Number.isFinite(number) ? String(number) : "";
    }
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
}

export default function EstadosFinancieros() {
    const { empresaId, alcanceSucursalId, alcanceSucursalNombre } = useEmpresa();
    const { perfil, rol } = useAuth();
    const [activeTab, setActiveTab] = useState("balance");
    const [fechaInicio, setFechaInicio] = usePersistentState("finance_erp_fecha_inicio", getTodayString());
    const [fechaCierre, setFechaCierre] = usePersistentState("finance_erp_fecha_cierre", getTodayString());
    const [empresaNombre, setEmpresaNombre] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [reports, setReports] = useState({
        balanza: [], balance: [], resultados: [], flujo: [], origen: [],
    });

    const handleGenerarReporte = useCallback(async (showSuccess = false) => {
        if (!empresaId) return;
        if (!fechaInicio || !fechaCierre || fechaInicio > fechaCierre) {
            toast.error("Seleccione un rango de fechas válido.");
            return;
        }

        setIsLoading(true);
        setReports({ balanza: [], balance: [], resultados: [], flujo: [], origen: [] });
        const common = {
            p_id_empresa: empresaId,
            p_fecha_desde: fechaInicio,
            p_fecha_hasta: fechaCierre,
            p_id_sucursal: alcanceSucursalId,
        };
        try {
            const results = await Promise.all([
                supabase.rpc("reporte_balanza_comprobacion", common),
                supabase.rpc("reporte_balance_general", {
                    p_id_empresa: empresaId,
                    p_fecha_corte: fechaCierre,
                    p_id_sucursal: alcanceSucursalId,
                }),
                supabase.rpc("reporte_estado_resultados", common),
                supabase.rpc("reporte_flujo_efectivo", common),
                supabase.rpc("reporte_origen_aplicacion", common),
            ]);
            const failed = results.find((result) => result.error);
            if (failed?.error) throw failed.error;
            setReports({
                balanza: results[0].data || [],
                balance: results[1].data || [],
                resultados: results[2].data || [],
                flujo: results[3].data || [],
                origen: results[4].data || [],
            });
            if (showSuccess) toast.success("Reportes contables actualizados.");
        } catch (error) {
            console.error("Error generando reportes contables:", error);
            toast.error(`No se pudieron generar los reportes: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId, fechaInicio, fechaCierre, alcanceSucursalId]);

    useEffect(() => {
        handleGenerarReporte();
    }, [handleGenerarReporte]);

    useEffect(() => {
        let mounted = true;
        const cargarEmpresa = async () => {
            if (!empresaId) return;
            const { data, error } = await supabase
                .from("empresa")
                .select("nombre")
                .eq("id_empresa", empresaId)
                .maybeSingle();
            if (error) {
                console.error("Error cargando empresa para reportes:", error);
                return;
            }
            if (mounted) setEmpresaNombre(data?.nombre || "");
        };
        cargarEmpresa();
        return () => { mounted = false; };
    }, [empresaId]);

    const validacion = useMemo(() => {
        const totalDebe = reports.balanza.reduce((sum, row) => sum + Number(row.movimiento_debe || 0), 0);
        const totalHaber = reports.balanza.reduce((sum, row) => sum + Number(row.movimiento_haber || 0), 0);
        const activos = reports.balance
            .filter((row) => row.naturaleza === "ACTIVO")
            .reduce((sum, row) => sum + Number(row.saldo || 0), 0);
        const pasivoPatrimonio = reports.balance
            .filter((row) => row.naturaleza === "PASIVO" || row.naturaleza === "PATRIMONIO")
            .reduce((sum, row) => sum + Number(row.saldo || 0), 0);
        return {
            totalDebe,
            totalHaber,
            balanceaDebeHaber: Math.abs(totalDebe - totalHaber) < 0.01,
            activos,
            pasivoPatrimonio,
            balanceaEcuacion: Math.abs(activos - pasivoPatrimonio) < 0.01,
        };
    }, [reports]);

    const exportarReporte = () => {
        const columns = COLUMNS[activeTab];
        const rows = reports[activeTab];
        if (!rows.length) {
            toast.error("No hay datos para exportar.");
            return;
        }
        const content = [
            columns.map(([, label]) => csvCell(label)).join(","),
            ...rows.map((row) => columns.map(([field]) =>
                csvCell(row[field], MONEY_FIELDS.has(field) || field === "orden")
            ).join(",")),
        ].join("\r\n");
        const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `reporte-${activeTab}-${fechaCierre}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleRegistrarDepreciacion = async () => {
        if (!fechaCierre) {
            toast.error("Seleccione la fecha de cierre del período.");
            return;
        }
        setIsProcessing(true);
        try {
            let idSucursal = alcanceSucursalId || perfil?.id_sucursal;
            if (rol === "superadmin" && !idSucursal) {
                throw new Error("Seleccione una sucursal específica antes de registrar la depreciación.");
            }
            if (!idSucursal) {
                const { data, error } = await supabase
                    .from("sucursales")
                    .select("id_sucursal")
                    .eq("id_empresa", empresaId)
                    .eq("activa", true)
                    .eq("es_principal", true)
                    .maybeSingle();
                if (error) throw error;
                idSucursal = data?.id_sucursal;
            }
            if (!idSucursal) throw new Error("No hay una sucursal activa asignada para registrar la depreciación.");
            const [year, month] = fechaCierre.split("-").map(Number);
            const { error } = await supabase.rpc("registrar_depreciacion_activos_fijos", {
                p_id_sucursal: idSucursal,
                p_anio: year,
                p_mes: month,
                p_clave_idempotencia: `depreciacion-${idSucursal}-${year}-${String(month).padStart(2, "0")}`,
            });
            if (error) throw error;
            toast.success("Depreciación mensual contabilizada.");
            await handleGenerarReporte();
        } catch (error) {
            console.error("Error registrando depreciación:", error);
            toast.error(`No se pudo registrar la depreciación: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const currentRows = reports[activeTab];
    const currentLabel = REPORTS.find((report) => report.key === activeTab)?.label;
    const debeHaberOk = validacion.balanceaDebeHaber;
    const ecuacionOk = validacion.balanceaEcuacion;

    return (
        <div className="mt-4 p-1">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-title text-xl font-semibold">Estados financieros</h1>
                    <p className="text-subtitle text-sm">
                        {empresaNombre ? `Empresa: ${empresaNombre} · ` : ""}Reportes desde comprobantes contabilizados
                    </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-subtitle">
                        Desde
                        <input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} className="rounded-lg border border-secondary bg-input p-2 text-title" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-subtitle">
                        Hasta
                        <input type="date" value={fechaCierre} onChange={(event) => setFechaCierre(event.target.value)} className="rounded-lg border border-secondary bg-input p-2 text-title" />
                    </label>
                    <button onClick={() => handleGenerarReporte(true)} disabled={isLoading} className="rounded-lg bg-button px-4 py-2 text-sm font-semibold text-button disabled:opacity-50">
                        {isLoading ? "Generando..." : "Generar"}
                    </button>
                    <button onClick={exportarReporte} disabled={isLoading} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        <Download size={16} /> Exportar
                    </button>
                    {["superadmin", "admin"].includes(rol) && (
                        <button onClick={handleRegistrarDepreciacion} disabled={isProcessing || isLoading || (rol === "superadmin" && !alcanceSucursalId)} className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                            <Zap size={16} /> {isProcessing ? "Procesando..." : "Registrar depreciación"}
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-secondary bg-card p-4">
                <SucursalAlcanceFinanciero />
                <p className="text-xs text-subtitle">Reportes correspondientes a: <span className="font-semibold text-title">{alcanceSucursalNombre}</span></p>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className={`rounded-xl border p-3 ${debeHaberOk ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
                    <p className="font-semibold text-title">Partida doble (Debe = Haber)</p>
                    <p className={debeHaberOk ? "font-bold text-green-500" : "font-bold text-red-500"}>
                        {debeHaberOk ? "Cuadra" : "No cuadra"} · Debe {formatMoney(validacion.totalDebe)} · Haber {formatMoney(validacion.totalHaber)}
                    </p>
                </div>
                <div className={`rounded-xl border p-3 ${ecuacionOk ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
                    <p className="font-semibold text-title">Ecuación contable al {fechaCierre}</p>
                    <p className={ecuacionOk ? "font-bold text-green-500" : "font-bold text-red-500"}>
                        {ecuacionOk ? "Activo = Pasivo + Patrimonio" : "Descuadre"} · Activo {formatMoney(validacion.activos)} · Pasivo + patrimonio {formatMoney(validacion.pasivoPatrimonio)}
                    </p>
                </div>
            </div>

            <Tabs tabs={REPORTS.map(({ key, label }) => ({ key, label }))} activeKey={activeTab} onChange={setActiveTab} />
            <div className="mt-4">
                <div className="mb-3">
                    <h2 className="font-semibold text-title">{currentLabel}</h2>
                    <p className="text-xs text-subtitle">
                        {activeTab === "balance"
                            ? `Saldos acumulados al ${fechaCierre}`
                            : `Período ${fechaInicio} al ${fechaCierre}`}
                    </p>
                </div>
                {activeTab === "flujo" && reports.flujo.some((row) => row.codigo === "CUENTAS_NO_CLASIFICADAS" && Number(row.monto) > 0) && (
                    <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
                        Hay cuentas de balance sin clasificar para el flujo de efectivo. El reporte requiere completar su clasificación antes de interpretarse como definitivo.
                    </div>
                )}
                <ReportTable reportKey={activeTab} rows={currentRows} isLoading={isLoading} />
            </div>
        </div>
    );
}
