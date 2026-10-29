import { useState, useEffect, useCallback } from "react";
import { CalendarClock, CheckCircle2, XCircle, Lock, ClipboardCheck, RefreshCw } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const ESTADO_BADGE = {
    ABIERTO: "bg-emerald-500/15 text-emerald-400",
    EN_CIERRE: "bg-amber-500/15 text-amber-400",
    CERRADO: "bg-slate-500/20 text-slate-300",
};

const CHECK_LABELS = {
    sesiones_caja: "Sesiones de caja abiertas visibles hasta la fecha final",
    comprobantes_borrador: "Comprobantes en borrador",
    comprobantes_fuera_rango: "Comprobantes fuera de las fechas del período",
};

export default function PeriodosContables() {
    const { empresaId } = useEmpresa();
    const { rol } = useAuth();
    const puedeCerrar = ["superadmin", "admin", "gerente"].includes(rol);

    const [periodos, setPeriodos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [checklist, setChecklist] = useState(null);
    const [periodoSel, setPeriodoSel] = useState(null);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        const { data, error } = await supabase.from("periodos_contables")
            .select("*").eq("id_empresa", empresaId)
            .order("anio", { ascending: false }).order("mes", { ascending: false });
        if (error) toast.error("No se pudieron cargar los períodos");
        setPeriodos(data || []);
        setLoading(false);
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    const verChecklist = async (p) => {
        setPeriodoSel(p);
        setChecklist(null);
        const [comprobantesResult, sesionesResult] = await Promise.all([
            supabase.from("comprobantes_contables")
                .select("fecha, estado")
                .eq("id_empresa", empresaId)
                .eq("id_periodo", p.id_periodo),
            supabase.from("sesiones_caja")
                .select("id_sesion", { count: "exact", head: true })
                .eq("id_empresa", empresaId)
                .eq("estado", "ABIERTA")
                .lte("fecha_operativa", p.fecha_fin),
        ]);
        if (comprobantesResult.error || sesionesResult.error) {
            const error = comprobantesResult.error || sesionesResult.error;
            toast.error(`No se pudo revisar el período: ${error.message}`);
            return;
        }
        const comprobantes = comprobantesResult.data || [];
        const borradores = comprobantes.filter((item) => item.estado === "BORRADOR").length;
        const fueraRango = comprobantes.filter((item) =>
            item.fecha < p.fecha_inicio || item.fecha > p.fecha_fin
        ).length;
        const datosChecklist = {
            sesiones_caja: sesionesResult.count || 0,
            comprobantes_borrador: borradores,
            comprobantes_fuera_rango: fueraRango,
        };
        datosChecklist.sin_bloqueos_visibles = Object.values(datosChecklist).every((count) => count === 0);
        setChecklist(datosChecklist);
    };

    const cerrarPeriodo = async (p) => {
        if (!puedeCerrar) return;
        const r = await Swal.fire({
            title: `¿Cerrar ${MESES[p.mes]} ${p.anio}?`,
            text: "No podrás registrar movimientos en este período una vez cerrado.",
            icon: "warning", background: "#152235", color: "#fff", iconColor: "#facc15",
            showCancelButton: true, confirmButtonText: "Sí, cerrar período", cancelButtonText: "Cancelar",
            confirmButtonColor: "#2563eb", cancelButtonColor: "#ef4444",
        });
        if (!r.isConfirmed) return;
        const { error } = await supabase.rpc("cerrar_periodo_contable", { p_id_periodo: p.id_periodo });
        if (error) {
            Swal.fire({ icon: "error", title: "No se pudo cerrar", text: error.message, background: "#152235", color: "#fff" });
            return;
        }
        toast.success("Período cerrado correctamente");
        cargar();
    };

    const renderCheckItem = (key, val) => {
        const ok = Number(val) === 0;
        return (
            <li key={key} className="flex items-center justify-between py-2 border-b border-secondary/50">
                <span className="text-subtitle text-sm">{CHECK_LABELS[key] || key}</span>
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
                    {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    {val}
                </span>
            </li>
        );
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <CalendarClock className="text-title" size={26} />
                    <div>
                        <h1 className="text-title text-2xl font-bold">Períodos Contables</h1>
                        <p className="text-subtitle text-sm">Control de apertura y cierre de períodos mensuales.</p>
                    </div>
                </div>
                <button onClick={cargar} className="btn-secondary"><RefreshCw size={16} /> Actualizar</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 erp-card p-4 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-subtitle text-left border-b border-secondary">
                                <th className="py-2 pr-4">Período</th>
                                <th className="py-2 pr-4">Rango</th>
                                <th className="py-2 pr-4">Estado</th>
                                <th className="py-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={4} className="py-4 text-subtitle">Cargando…</td></tr>}
                            {periodos.map((p) => (
                                <tr key={p.id} className="border-b border-secondary/50">
                                    <td className="py-2.5 pr-4 text-title font-medium">{MESES[p.mes]} {p.anio}</td>
                                    <td className="py-2.5 pr-4 text-subtitle">{p.fecha_inicio} → {p.fecha_fin}</td>
                                    <td className="py-2.5 pr-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_BADGE[p.estado] || "bg-slate-500/20 text-slate-300"}`}>{p.estado}</span>
                                    </td>
                                    <td className="py-2.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button onClick={() => verChecklist(p)} className="btn-secondary text-xs"><ClipboardCheck size={14} /> Checklist</button>
                                            {p.estado !== "CERRADO" && puedeCerrar && (
                                                <button onClick={() => cerrarPeriodo(p)} className="btn-secondary text-xs"><Lock size={14} /> Cerrar</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && periodos.length === 0 && <tr><td colSpan={4} className="py-4 text-subtitle">No hay períodos registrados.</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="erp-card p-4">
                    <h3 className="text-title font-bold mb-3 flex items-center gap-2"><ClipboardCheck size={18} /> Checklist de cierre</h3>
                    {!periodoSel && <p className="text-subtitle text-sm">Selecciona un período para ver su checklist.</p>}
                    {periodoSel && !checklist && <p className="text-subtitle text-sm">Cargando checklist…</p>}
                    {periodoSel && checklist && (
                        <>
                            <p className="text-subtitle text-sm mb-2">{MESES[periodoSel.mes]} {periodoSel.anio}</p>
                            <p className="text-subtitle text-xs mb-2">
                                Revisión preliminar según los datos visibles para tu rol; el cierre vuelve a validar todas las sucursales.
                            </p>
                            <ul className="flex flex-col">
                                {Object.entries(checklist).filter(([k]) => k !== "sin_bloqueos_visibles").map(([k, v]) => renderCheckItem(k, v))}
                            </ul>
                            <div className={`mt-4 p-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${checklist.sin_bloqueos_visibles ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                {checklist.sin_bloqueos_visibles ? <><CheckCircle2 size={16} /> Sin bloqueos visibles</> : <><XCircle size={16} /> Se detectaron bloqueos</>}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
