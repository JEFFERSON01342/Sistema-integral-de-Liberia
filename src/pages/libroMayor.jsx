import { useState, useEffect, useCallback } from "react";
import { BookOpen, Filter } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { toast } from "react-hot-toast";

const fmt = (n) => `C$ ${Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAGE_SIZE = 1000;

export default function LibroMayor() {
    const { empresaId } = useEmpresa();
    const [cuentas, setCuentas] = useState([]);
    const [cuentaId, setCuentaId] = useState("");
    const hoy = new Date().toISOString().slice(0, 10);
    const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`);
    const [hasta, setHasta] = useState(hoy);
    const [filas, setFilas] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!empresaId) {
            setCuentas([]);
            return;
        }
        let mounted = true;
        const cargarCuentas = async () => {
            const { data, error } = await supabase.from("cuentas_contables")
                .select("id_cuenta, nombre, codigo")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .eq("es_grupo", false)
                .eq("permite_movimientos", true)
                .order("codigo");
            if (!mounted) return;
            if (error) {
                toast.error(`No se pudieron cargar las cuentas: ${error.message}`);
                return;
            }
            setCuentas(data || []);
        };
        cargarCuentas();
        return () => { mounted = false; };
    }, [empresaId]);

    const consultar = useCallback(async () => {
        if (!empresaId) return;
        if (!desde || !hasta || desde > hasta) {
            toast.error("El rango de fechas no es válido.");
            return;
        }
        setLoading(true);
        try {
            const [{ data: balanza, error: balanzaError }] = await Promise.all([
                supabase.rpc("reporte_balanza_comprobacion", {
                    p_id_empresa: empresaId,
                    p_fecha_desde: desde,
                    p_fecha_hasta: hasta,
                }),
            ]);
            if (balanzaError) throw balanzaError;

            const lineas = [];
            for (let offset = 0; ; offset += PAGE_SIZE) {
                let query = supabase.from("lineas_comprobante_contable")
                    .select(`
                        id_linea, id_comprobante, id_cuenta, numero_linea, descripcion, debe, haber,
                        comprobantes_contables!inner(numero, fecha, descripcion, estado),
                        cuentas_contables!inner(codigo, nombre)
                    `)
                    .eq("id_empresa", empresaId)
                    .eq("comprobantes_contables.estado", "CONTABILIZADO")
                    .gte("comprobantes_contables.fecha", desde)
                    .lte("comprobantes_contables.fecha", hasta)
                    .order("id_comprobante")
                    .order("numero_linea")
                    .range(offset, offset + PAGE_SIZE - 1);
                if (cuentaId) query = query.eq("id_cuenta", Number(cuentaId));
                const { data, error } = await query;
                if (error) throw error;
                lineas.push(...(data || []));
                if (!data || data.length < PAGE_SIZE) break;
            }

            const saldosIniciales = new Map(
                (balanza || [])
                    .filter((cuenta) => cuenta.id_cuenta !== null)
                    .map((cuenta) => [
                        String(cuenta.id_cuenta),
                        Number(cuenta.saldo_inicial_deudor || 0) - Number(cuenta.saldo_inicial_acreedor || 0),
                    ])
            );
            const ordenadas = lineas.sort((a, b) => {
                const fechaA = a.comprobantes_contables.fecha;
                const fechaB = b.comprobantes_contables.fecha;
                return fechaA.localeCompare(fechaB)
                    || Number(a.id_comprobante) - Number(b.id_comprobante)
                    || Number(a.numero_linea) - Number(b.numero_linea);
            });
            const saldos = new Map();
            const filasConSaldo = ordenadas.map((linea) => {
                const id = String(linea.id_cuenta);
                const saldoAnterior = saldos.has(id)
                    ? saldos.get(id)
                    : saldosIniciales.get(id) || 0;
                const saldoAcumulado = saldoAnterior + Number(linea.debe || 0) - Number(linea.haber || 0);
                saldos.set(id, saldoAcumulado);
                return {
                    ...linea,
                    saldo_acumulado: saldoAcumulado,
                };
            });
            setFilas(filasConSaldo);
        } catch (error) {
            console.error("Error cargando libro mayor:", error);
            toast.error(`No se pudo cargar el libro mayor: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [empresaId, cuentaId, desde, hasta]);

    useEffect(() => { consultar(); }, [consultar]);

    const totalDebe = filas.reduce((s, f) => s + Number(f.debe || 0), 0);
    const totalHaber = filas.reduce((s, f) => s + Number(f.haber || 0), 0);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <BookOpen className="text-title" size={26} />
                <div>
                    <h1 className="text-title text-2xl font-bold">Libro Mayor</h1>
                    <p className="text-subtitle text-sm">Movimientos por cuenta con saldo acumulado.</p>
                </div>
            </div>

            <div className="erp-card p-4 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Cuenta</label>
                    <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}
                        className="bg-input text-title border border-secondary rounded-lg px-3 py-2 min-w-[240px]">
                        <option value="">Todas las cuentas</option>
                        {cuentas.map((c) => <option key={c.id_cuenta} value={c.id_cuenta}>{c.codigo} · {c.nombre}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Desde</label>
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                        className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Hasta</label>
                    <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                        className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                </div>
                <button onClick={consultar} className="btn-primary"><Filter size={16} /> Filtrar</button>
            </div>

            <div className="erp-card p-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-subtitle text-left border-b border-secondary">
                            <th className="py-2 pr-4">Fecha</th>
                            <th className="py-2 pr-4">Cuenta</th>
                            <th className="py-2 pr-4">Comprobante</th>
                            <th className="py-2 pr-4">Descripción</th>
                            <th className="py-2 pr-4 text-right">Debe</th>
                            <th className="py-2 pr-4 text-right">Haber</th>
                            <th className="py-2 text-right">Saldo acum.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={7} className="py-4 text-subtitle">Cargando…</td></tr>}
                        {filas.map((f) => (
                            <tr key={f.id_linea} className="border-b border-secondary/50">
                                <td className="py-2 pr-4 text-subtitle whitespace-nowrap">{f.comprobantes_contables.fecha}</td>
                                <td className="py-2 pr-4 text-title">
                                    {f.cuentas_contables.codigo} · {f.cuentas_contables.nombre}
                                </td>
                                <td className="py-2 pr-4 text-subtitle">{f.comprobantes_contables.numero}</td>
                                <td className="py-2 pr-4 text-subtitle">{f.descripcion || f.comprobantes_contables.descripcion}</td>
                                <td className="py-2 pr-4 text-right text-emerald-400">{Number(f.debe) ? fmt(f.debe) : ""}</td>
                                <td className="py-2 pr-4 text-right text-red-400">{Number(f.haber) ? fmt(f.haber) : ""}</td>
                                <td className="py-2 text-right text-title font-medium">{fmt(f.saldo_acumulado)}</td>
                            </tr>
                        ))}
                        {!loading && filas.length === 0 && <tr><td colSpan={7} className="py-4 text-subtitle">Sin movimientos en el rango seleccionado.</td></tr>}
                    </tbody>
                    {filas.length > 0 && (
                        <tfoot>
                            <tr className="border-t-2 border-secondary font-bold text-title">
                                <td className="py-2 pr-4" colSpan={4}>Totales del rango</td>
                                <td className="py-2 pr-4 text-right text-emerald-400">{fmt(totalDebe)}</td>
                                <td className="py-2 pr-4 text-right text-red-400">{fmt(totalHaber)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}
