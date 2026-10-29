import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, RefreshCw, Scale } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";

const fmt = (n) => `C$ ${Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ConciliacionBancaria() {
    const { empresaId } = useEmpresa();
    const { perfil } = useAuth();
    const [cuentas, setCuentas] = useState([]);
    const [cuentaId, setCuentaId] = useState("");
    const hoy = new Date().toISOString().slice(0, 10);
    const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`);
    const [hasta, setHasta] = useState(hoy);
    const [movs, setMovs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saldoExtracto, setSaldoExtracto] = useState("");

    useEffect(() => {
        const cargarCuentas = async () => {
            if (!empresaId) {
                setCuentas([]);
                setCuentaId("");
                return;
            }
            const { data, error } = await supabase
                .from("cuentas_contables")
                .select("id_cuenta, nombre, codigo")
                .eq("id_empresa", empresaId)
                .eq("es_banco", true)
                .eq("activa", true)
                .order("codigo");
            if (error) {
                toast.error(`No se pudieron cargar las cuentas bancarias: ${error.message}`);
                setCuentas([]);
                setCuentaId("");
                return;
            }
            setCuentas(data || []);
            setCuentaId((actual) => (
                data?.some((cuenta) => String(cuenta.id_cuenta) === actual)
                    ? actual
                    : String(data?.[0]?.id_cuenta || "")
            ));
        };
        cargarCuentas();
    }, [empresaId]);

    const cargar = useCallback(async () => {
        if (!perfil?.id) return;
        if (!empresaId || !cuentaId) {
            setMovs([]);
            return;
        }
        if (perfil.rol !== "superadmin" && !perfil.id_sucursal) {
            setMovs([]);
            toast.error("El perfil no tiene una sucursal asignada.");
            return;
        }
        if (desde > hasta) {
            setMovs([]);
            toast.error("La fecha inicial no puede ser posterior a la fecha final.");
            return;
        }

        setLoading(true);
        try {
            const filas = [];
            const pageSize = 1000;
            let offset = 0;
            while (true) {
                let query = supabase
                    .from("lineas_comprobante_contable")
                    .select(`
                        id_linea, debe, haber, conciliado, fecha_conciliacion, descripcion,
                        comprobantes_contables!inner ( id_comprobante, id_sucursal, fecha, numero, descripcion, estado )
                    `)
                    .eq("id_empresa", empresaId)
                    .eq("id_cuenta", Number(cuentaId))
                    .eq("comprobantes_contables.estado", "CONTABILIZADO")
                    .lte("comprobantes_contables.fecha", hasta)
                    .order("id_linea", { ascending: true })
                    .range(offset, offset + pageSize - 1);

                if (perfil?.id_sucursal && perfil.rol !== "superadmin") {
                    query = query.eq("comprobantes_contables.id_sucursal", perfil.id_sucursal);
                }

                const { data, error } = await query;
                if (error) throw error;
                filas.push(...(data || []));
                if (!data || data.length < pageSize) break;
                offset += pageSize;
            }

            setMovs(filas.map((linea) => ({
                id_linea: linea.id_linea,
                fecha: linea.comprobantes_contables.fecha,
                descripcion: linea.descripcion || linea.comprobantes_contables.descripcion,
                numero: linea.comprobantes_contables.numero,
                debe: Number(linea.debe),
                haber: Number(linea.haber),
                conciliado: linea.conciliado,
                fecha_conciliacion: linea.fecha_conciliacion,
            })));
        } catch (error) {
            toast.error(`No se pudieron cargar los movimientos: ${error.message}`);
            setMovs([]);
        } finally {
            setLoading(false);
        }
    }, [empresaId, cuentaId, desde, hasta, perfil?.id, perfil?.id_sucursal, perfil?.rol]);

    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => { setSaldoExtracto(""); }, [cuentaId, hasta]);

    const toggle = async (movimiento) => {
        const conciliado = !movimiento.conciliado;
        const { error } = await supabase.rpc("marcar_linea_conciliada", {
            p_id_linea: movimiento.id_linea,
            p_conciliado: conciliado,
            p_fecha_conciliacion: conciliado ? hasta : null,
        });
        if (error) {
            toast.error(`No se pudo actualizar la conciliación: ${error.message}`);
            return;
        }
        setMovs((prev) => prev.map((item) => item.id_linea === movimiento.id_linea
            ? { ...item, conciliado, fecha_conciliacion: conciliado ? hasta : null }
            : item));
    };

    const movimientosRango = useMemo(
        () => movs.filter((movimiento) => movimiento.fecha >= desde && movimiento.fecha <= hasta),
        [movs, desde, hasta]
    );
    const saldoLibros = useMemo(
        () => movs.reduce((saldo, movimiento) => saldo + movimiento.debe - movimiento.haber, 0),
        [movs]
    );
    const saldoConciliado = useMemo(
        () => movs
            .filter((movimiento) => movimiento.conciliado && movimiento.fecha_conciliacion <= hasta)
            .reduce((saldo, movimiento) => saldo + movimiento.debe - movimiento.haber, 0),
        [movs, hasta]
    );
    const diferencia = (Number(saldoExtracto) || 0) - saldoConciliado;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Scale className="text-title" size={26} />
                    <div>
                        <h1 className="text-title text-2xl font-bold">Conciliación Bancaria</h1>
                        <p className="text-subtitle text-sm">Marca las líneas contables que aparecen en el extracto bancario.</p>
                    </div>
                </div>
                <button onClick={cargar} className="btn-secondary" disabled={loading}><RefreshCw size={16} /> Actualizar</button>
            </div>

            <div className="erp-card p-4 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Cuenta bancaria</label>
                    <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2 min-w-[240px]">
                        <option value="">Seleccione…</option>
                        {cuentas.map((cuenta) => <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>{cuenta.codigo} · {cuenta.nombre}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Desde</label>
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Hasta</label>
                    <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Saldo del extracto al {hasta}</label>
                    <input type="number" step="0.01" value={saldoExtracto} onChange={(e) => setSaldoExtracto(e.target.value)} placeholder="0.00" className="bg-input text-title border border-secondary rounded-lg px-3 py-2 w-36" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatsCards title="Saldo en libros" value={fmt(saldoLibros)} icon={<Banknote size={20} />} color="blue" />
                <StatsCards title="Saldo conciliado" value={fmt(saldoConciliado)} icon={<CheckCircle2 size={20} />} color="green" />
                <StatsCards title="Diferencia vs extracto" value={fmt(diferencia)} icon={<Scale size={20} />} color={Math.abs(diferencia) < 0.005 ? "green" : "red"} />
            </div>

            <div className="erp-card p-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-subtitle text-left border-b border-secondary">
                            <th className="py-2 pr-4">Conciliado</th>
                            <th className="py-2 pr-4">Fecha</th>
                            <th className="py-2 pr-4">Comprobante</th>
                            <th className="py-2 pr-4">Descripción</th>
                            <th className="py-2 pr-4 text-right">Monto</th>
                            <th className="py-2">Fecha concil.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={6} className="py-4 text-subtitle">Cargando…</td></tr>}
                        {movimientosRango.map((movimiento) => {
                            const monto = movimiento.debe || movimiento.haber;
                            return (
                                <tr key={movimiento.id_linea} className="border-b border-secondary/50">
                                    <td className="py-2 pr-4">
                                        <input type="checkbox" checked={!!movimiento.conciliado} onChange={() => toggle(movimiento)} className="w-4 h-4 cursor-pointer" />
                                    </td>
                                    <td className="py-2 pr-4 text-subtitle whitespace-nowrap">{movimiento.fecha}</td>
                                    <td className="py-2 pr-4 text-subtitle">{movimiento.numero}</td>
                                    <td className="py-2 pr-4 text-title">{movimiento.descripcion || "—"}</td>
                                    <td className={`py-2 pr-4 text-right ${movimiento.debe > 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(monto)}</td>
                                    <td className="py-2 text-subtitle">{movimiento.fecha_conciliacion || "—"}</td>
                                </tr>
                            );
                        })}
                        {!loading && movimientosRango.length === 0 && <tr><td colSpan={6} className="py-4 text-subtitle">Sin movimientos para esta cuenta en el rango.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
