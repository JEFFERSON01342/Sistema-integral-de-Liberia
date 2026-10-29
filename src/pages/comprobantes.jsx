import { useState, useEffect, useCallback } from "react";
import { ScrollText, Plus, Eye, CheckCircle2, RotateCcw, Trash2, X, Filter } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const fmt = (n) => `C$ ${Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO_BADGE = {
    BORRADOR: "bg-amber-500/15 text-amber-400",
    CONTABILIZADO: "bg-emerald-500/15 text-emerald-400",
    CANCELADO: "bg-red-500/15 text-red-400",
};

const TIPOS = ["APERTURA", "VENTA", "COMPRA", "AJUSTE", "DEVOLUCION", "GASTO", "PAGO", "REVERSION", "MANUAL", "CIERRE"];
const ORIGENES_PRESTAMO = ["PRESTAMO", "PAGO_PRESTAMO"];

export default function Comprobantes() {
    const { empresaId } = useEmpresa();
    const { rol, perfil } = useAuth();
    const puedeGestionar = ["superadmin", "admin", "gerente"].includes(rol);

    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fTipo, setFTipo] = useState("");
    const [fEstado, setFEstado] = useState("");
    const hoy = new Date().toISOString().slice(0, 10);
    const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
    const [hasta, setHasta] = useState(hoy);

    const [detalle, setDetalle] = useState(null); // comprobante seleccionado
    const [lineasDet, setLineasDet] = useState([]);
    const [cuentasPorId, setCuentasPorId] = useState({});
    const [modalNuevo, setModalNuevo] = useState(false);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        let q = supabase.from("comprobantes_contables").select("*")
            .eq("id_empresa", empresaId)
            .gte("fecha", desde).lte("fecha", hasta)
            .order("fecha", { ascending: false }).order("id_comprobante", { ascending: false });
        if (fTipo) q = q.eq("tipo", fTipo);
        if (fEstado) q = q.eq("estado", fEstado);
        const { data, error } = await q;
        if (error) {
            console.error("Error cargando comprobantes:", error);
            toast.error(`No se pudieron cargar los comprobantes: ${error.message}`);
        }
        setLista(data || []);
        setLoading(false);
    }, [empresaId, fTipo, fEstado, desde, hasta]);

    useEffect(() => { cargar(); }, [cargar]);

    const verDetalle = async (c) => {
        setDetalle(c);
        setLineasDet([]);
        const { data, error } = await supabase.from("lineas_comprobante_contable")
            .select("id_linea, id_cuenta, numero_linea, descripcion, debe, haber")
            .eq("id_empresa", empresaId)
            .eq("id_comprobante", c.id_comprobante)
            .order("numero_linea");
        if (error) {
            toast.error(`No se pudieron cargar las líneas: ${error.message}`);
            return;
        }
        const idsCuenta = [...new Set((data || []).map((linea) => linea.id_cuenta))];
        if (idsCuenta.length) {
            const { data: cuentas, error: cuentasError } = await supabase.from("cuentas_contables")
                .select("id_cuenta, codigo, nombre")
                .eq("id_empresa", empresaId)
                .in("id_cuenta", idsCuenta);
            if (cuentasError) {
                toast.error(`No se pudieron cargar las cuentas: ${cuentasError.message}`);
                return;
            }
            setCuentasPorId(Object.fromEntries((cuentas || []).map((cuenta) => [cuenta.id_cuenta, cuenta])));
        } else {
            setCuentasPorId({});
        }
        setLineasDet(data || []);
    };

    const contabilizar = async (c) => {
        if (!puedeGestionar) return;
        const r = await Swal.fire({ title: `Contabilizar ${c.numero}`, text: "El comprobante pasará a CONTABILIZADO.", icon: "question", background: "#152235", color: "#fff", showCancelButton: true, confirmButtonText: "Contabilizar", cancelButtonText: "Cancelar", confirmButtonColor: "#2563eb" });
        if (!r.isConfirmed) return;
        const { error } = await supabase.rpc("contabilizar_comprobante", { p_id_comprobante: c.id_comprobante });
        if (error) { Swal.fire({ icon: "error", title: "Error", text: error.message, background: "#152235", color: "#fff" }); return; }
        toast.success("Comprobante contabilizado");
        cargar();
    };

    const cancelarBorrador = async (c) => {
        if (!puedeGestionar) return;
        const { value: motivo } = await Swal.fire({
            title: `Cancelar ${c.numero}`,
            input: "textarea",
            inputLabel: "Motivo de cancelación (obligatorio)",
            background: "#152235",
            color: "#fff",
            showCancelButton: true,
            confirmButtonText: "Cancelar comprobante",
            cancelButtonText: "Volver",
            confirmButtonColor: "#ef4444",
            inputValidator: (value) => (!value || value.trim().length < 3) && "El motivo debe tener al menos tres caracteres.",
        });
        if (!motivo) return;
        const { error } = await supabase.rpc("cancelar_comprobante_borrador", {
            p_id_comprobante: c.id_comprobante,
            p_motivo: motivo.trim(),
        });
        if (error) {
            Swal.fire({ icon: "error", title: "No se pudo cancelar", text: error.message, background: "#152235", color: "#fff" });
            return;
        }
        toast.success("Comprobante cancelado.");
        cargar();
    };

    const revertir = async (c) => {
        if (!puedeGestionar) return;
        if (ORIGENES_PRESTAMO.includes(c.origen_tipo)) {
            toast.error("Los asientos de préstamos no se revierten desde el diario general.");
            return;
        }
        if (c.tipo === "REVERSION" || c.reverso_de_id || c.revertido_por_id) {
            toast.error("Este comprobante ya fue revertido o es una reversión.");
            return;
        }
        const { value: fecha } = await Swal.fire({
            title: `Fecha de reversión de ${c.numero}`,
            input: "date",
            inputValue: new Date().toISOString().slice(0, 10),
            background: "#152235",
            color: "#fff",
            showCancelButton: true,
            confirmButtonText: "Continuar",
            cancelButtonText: "Cancelar",
            inputValidator: (value) => !value && "Seleccione la fecha de reversión.",
        });
        if (!fecha) return;
        const { value: motivo } = await Swal.fire({ title: `Motivo de reversión de ${c.numero}`, input: "textarea", inputLabel: "Motivo (obligatorio)", background: "#152235", color: "#fff", showCancelButton: true, confirmButtonText: "Revertir", cancelButtonText: "Cancelar", confirmButtonColor: "#ef4444", inputValidator: (v) => (!v || v.trim().length < 3) && "El motivo es obligatorio" });
        if (!motivo) return;
        const { error } = await supabase.rpc("revertir_comprobante_contable", {
            p_id_comprobante: c.id_comprobante,
            p_fecha_reversion: fecha,
            p_motivo: motivo.trim(),
        });
        if (error) { Swal.fire({ icon: "error", title: "Error", text: error.message, background: "#152235", color: "#fff" }); return; }
        toast.success("Comprobante revertido");
        cargar();
    };

    const totalDebeDet = lineasDet.reduce((s, l) => s + Number(l.debe || 0), 0);
    const totalHaberDet = lineasDet.reduce((s, l) => s + Number(l.haber || 0), 0);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <ScrollText className="text-title" size={26} />
                    <div>
                        <h1 className="text-title text-2xl font-bold">Comprobantes / Libro Diario</h1>
                        <p className="text-subtitle text-sm">Asientos contables de la empresa.</p>
                    </div>
                </div>
                {puedeGestionar && (
                    <button onClick={() => setModalNuevo(true)} className="btn-primary"><Plus size={16} /> Comprobante manual</button>
                )}
            </div>

            <div className="erp-card p-4 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Tipo</label>
                    <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2">
                        <option value="">Todos</option>
                        {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Estado</label>
                    <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2">
                        <option value="">Todos</option>
                        <option value="BORRADOR">BORRADOR</option>
                        <option value="CONTABILIZADO">CONTABILIZADO</option>
                        <option value="CANCELADO">CANCELADO</option>
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
                <button onClick={cargar} className="btn-secondary"><Filter size={16} /> Filtrar</button>
            </div>

            <div className="erp-card p-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-subtitle text-left border-b border-secondary">
                            <th className="py-2 pr-4">Número</th>
                            <th className="py-2 pr-4">Fecha</th>
                            <th className="py-2 pr-4">Tipo</th>
                            <th className="py-2 pr-4">Descripción</th>
                            <th className="py-2 pr-4">Estado</th>
                            <th className="py-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={6} className="py-4 text-subtitle">Cargando…</td></tr>}
                        {lista.map((c) => (
                            <tr key={c.id_comprobante} className="border-b border-secondary/50">
                                <td className="py-2.5 pr-4 text-title font-medium">{c.numero}</td>
                                <td className="py-2.5 pr-4 text-subtitle whitespace-nowrap">{c.fecha}</td>
                                <td className="py-2.5 pr-4 text-subtitle">{c.tipo}</td>
                                <td className="py-2.5 pr-4 text-subtitle max-w-[260px] truncate">{c.descripcion || "—"}</td>
                                <td className="py-2.5 pr-4"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_BADGE[c.estado] || ""}`}>{c.estado}</span></td>
                                <td className="py-2.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button onClick={() => verDetalle(c)} className="btn-secondary text-xs"><Eye size={14} /> Ver</button>
                                        {c.estado === "BORRADOR" && puedeGestionar && (
                                            <>
                                                <button onClick={() => contabilizar(c)} className="btn-secondary text-xs"><CheckCircle2 size={14} /> Contabilizar</button>
                                                <button onClick={() => cancelarBorrador(c)} className="btn-secondary text-xs text-red-400"><X size={14} /> Cancelar</button>
                                            </>
                                        )}
                                        {c.estado === "CONTABILIZADO" && puedeGestionar
                                            && c.tipo !== "REVERSION" && !c.reverso_de_id && !c.revertido_por_id && (
                                            !ORIGENES_PRESTAMO.includes(c.origen_tipo)
                                                ? <button onClick={() => revertir(c)} className="btn-secondary text-xs"><RotateCcw size={14} /> Revertir</button>
                                                : <span className="text-xs text-subtitle">Reversión no disponible aquí</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && lista.length === 0 && <tr><td colSpan={6} className="py-4 text-subtitle">No hay comprobantes en el rango.</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Modal detalle */}
            {detalle && (
                <ModalBase onClose={() => setDetalle(null)} title={`Comprobante ${detalle.numero}`}>
                    <div className="flex flex-col gap-1 mb-3 text-sm">
                        <p className="text-subtitle">Tipo: <span className="text-title">{detalle.tipo}</span> · Estado: <span className="text-title">{detalle.estado}</span></p>
                        <p className="text-subtitle">Fecha contable: <span className="text-title">{detalle.fecha}</span></p>
                        {detalle.descripcion && <p className="text-subtitle">{detalle.descripcion}</p>}
                        {detalle.motivo_cancelacion && <p className="text-red-400">Motivo de cancelación: {detalle.motivo_cancelacion}</p>}
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
                                {lineasDet.map((l) => (
                                    <tr key={l.id_linea} className="border-b border-secondary/50">
                                        <td className="py-2 pr-4 text-title">
                                            {cuentasPorId[l.id_cuenta]?.codigo} · {cuentasPorId[l.id_cuenta]?.nombre || `Cuenta #${l.id_cuenta}`}
                                        </td>
                                        <td className="py-2 pr-4 text-subtitle">{l.descripcion || "—"}</td>
                                        <td className="py-2 pr-4 text-right text-emerald-400">{Number(l.debe) ? fmt(l.debe) : ""}</td>
                                        <td className="py-2 text-right text-red-400">{Number(l.haber) ? fmt(l.haber) : ""}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-secondary font-bold text-title">
                                    <td className="py-2 pr-4" colSpan={2}>Totales</td>
                                    <td className="py-2 pr-4 text-right text-emerald-400">{fmt(totalDebeDet)}</td>
                                    <td className="py-2 text-right text-red-400">{fmt(totalHaberDet)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </ModalBase>
            )}

            {modalNuevo && (
                <NuevoComprobante empresaId={empresaId} perfil={perfil} onClose={() => setModalNuevo(false)} onSaved={() => { setModalNuevo(false); cargar(); }} />
            )}
        </div>
    );
}

function ModalBase({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="erp-card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-title text-xl font-bold">{title}</h2>
                    <button onClick={onClose} className="text-subtitle hover:text-title"><X size={22} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

function NuevoComprobante({ empresaId, perfil, onClose, onSaved }) {
    const [cuentas, setCuentas] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [idSucursal, setIdSucursal] = useState(perfil?.id_sucursal ? String(perfil.id_sucursal) : "");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [descripcion, setDescripcion] = useState("");
    const [referencia, setReferencia] = useState("");
    const [lineas, setLineas] = useState([
        { id_cuenta: "", tipo: "DEBE", monto: "", descripcion: "" },
        { id_cuenta: "", tipo: "HABER", monto: "", descripcion: "" },
    ]);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        let mounted = true;
        const cargarOpciones = async () => {
            const [cuentasResult, sucursalesResult] = await Promise.all([
                supabase.from("cuentas_contables")
                    .select("id_cuenta, nombre, codigo")
                    .eq("id_empresa", empresaId)
                    .eq("activa", true)
                    .eq("es_grupo", false)
                    .eq("permite_movimientos", true)
                    .order("codigo"),
                supabase.from("sucursales")
                    .select("id_sucursal, nombre")
                    .eq("id_empresa", empresaId)
                    .eq("activa", true)
                    .order("nombre"),
            ]);
            if (!mounted) return;
            if (cuentasResult.error || sucursalesResult.error) {
                const error = cuentasResult.error || sucursalesResult.error;
                toast.error(`No se pudieron cargar las opciones del comprobante: ${error.message}`);
                return;
            }
            setCuentas(cuentasResult.data || []);
            setSucursales(sucursalesResult.data || []);
        };
        cargarOpciones();
        return () => { mounted = false; };
    }, [empresaId]);

    const setLinea = (i, campo, val) => setLineas((prev) => prev.map((l, idx) => idx === i ? { ...l, [campo]: val } : l));
    const addLinea = () => setLineas((prev) => [...prev, { id_cuenta: "", tipo: "DEBE", monto: "", descripcion: "" }]);
    const delLinea = (i) => setLineas((prev) => prev.filter((_, idx) => idx !== i));

    const totalDebe = lineas.filter((l) => l.tipo === "DEBE").reduce((s, l) => s + (Number(l.monto) || 0), 0);
    const totalHaber = lineas.filter((l) => l.tipo === "HABER").reduce((s, l) => s + (Number(l.monto) || 0), 0);
    const cuadra = Math.abs(totalDebe - totalHaber) < 0.005 && totalDebe > 0;

    const validar = () => {
        if (!idSucursal) { toast.error("Seleccione la sucursal del comprobante."); return false; }
        if (!fecha) { toast.error("Seleccione la fecha del comprobante."); return false; }
        if (descripcion.trim().length === 0) { toast.error("La descripción es obligatoria."); return false; }
        if (!cuadra) { toast.error("El comprobante no cuadra (Debe = Haber)"); return false; }
        if (lineas.some((l) => !l.id_cuenta || !(Number(l.monto) > 0) || Number(l.monto) !== Number(Number(l.monto).toFixed(2)))) {
            toast.error("Cada línea requiere cuenta y monto positivo de hasta dos decimales.");
            return false;
        }
        return true;
    };

    const guardar = async (contabilizarAhora) => {
        if (!validar()) return;
        setGuardando(true);
        try {
            const p_lineas = lineas.map((linea) => ({
                id_cuenta: Number(linea.id_cuenta),
                debe: linea.tipo === "DEBE" ? Number(linea.monto) : 0,
                haber: linea.tipo === "HABER" ? Number(linea.monto) : 0,
                descripcion: linea.descripcion.trim() || null,
            }));
            const descripcionCompleta = [
                descripcion.trim(),
                referencia.trim() ? `Referencia: ${referencia.trim()}` : "",
            ].filter(Boolean).join(" · ");
            const { data: idComprobante, error } = await supabase.rpc("crear_comprobante_borrador", {
                p_id_empresa: empresaId,
                p_id_sucursal: Number(idSucursal),
                p_fecha: fecha,
                p_tipo: "MANUAL",
                p_descripcion: descripcionCompleta,
                p_lineas,
                p_idempotencia_key: globalThis.crypto.randomUUID(),
            });
            if (error) throw error;

            if (contabilizarAhora) {
                const { error: contabilizarError } = await supabase.rpc("contabilizar_comprobante", {
                    p_id_comprobante: idComprobante,
                });
                if (contabilizarError) {
                    await Swal.fire({
                        icon: "warning",
                        title: "Borrador guardado",
                        text: `El comprobante ${idComprobante} se guardó, pero no se pudo contabilizar: ${contabilizarError.message}`,
                        background: "#152235",
                        color: "#fff",
                    });
                    onSaved();
                    return;
                }
            }
            toast.success(contabilizarAhora ? "Comprobante contabilizado" : "Borrador guardado");
            onSaved();
        } catch (error) {
            Swal.fire({ icon: "error", title: "Error", text: error.message, background: "#152235", color: "#fff" });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <ModalBase title="Nuevo comprobante manual" onClose={onClose}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Sucursal</label>
                    <select
                        value={idSucursal}
                        onChange={(e) => setIdSucursal(e.target.value)}
                        disabled={Boolean(perfil?.id_sucursal)}
                        className="bg-input text-title border border-secondary rounded-lg px-3 py-2"
                    >
                        <option value="">Seleccione sucursal</option>
                        {sucursales.map((sucursal) => (
                            <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Fecha</label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-subtitle text-xs">Descripción</label>
                    <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-3 py-2" placeholder="Descripción del asiento" />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-subtitle text-left border-b border-secondary">
                            <th className="py-2 pr-2">Cuenta</th>
                            <th className="py-2 pr-2">Tipo</th>
                            <th className="py-2 pr-2">Monto</th>
                            <th className="py-2 pr-2">Descripción</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineas.map((l, i) => (
                            <tr key={i} className="border-b border-secondary/50">
                                <td className="py-1.5 pr-2">
                                    <select value={l.id_cuenta} onChange={(e) => setLinea(i, "id_cuenta", e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-2 py-1.5 min-w-[180px]">
                                        <option value="">— Cuenta —</option>
                                        {cuentas.map((c) => <option key={c.id_cuenta} value={c.id_cuenta}>{c.codigo} · {c.nombre}</option>)}
                                    </select>
                                </td>
                                <td className="py-1.5 pr-2">
                                    <select value={l.tipo} onChange={(e) => setLinea(i, "tipo", e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-2 py-1.5">
                                        <option value="DEBE">DEBE</option>
                                        <option value="HABER">HABER</option>
                                    </select>
                                </td>
                                <td className="py-1.5 pr-2">
                                    <input type="number" step="0.01" value={l.monto} onChange={(e) => setLinea(i, "monto", e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-2 py-1.5 w-28" />
                                </td>
                                <td className="py-1.5 pr-2">
                                    <input value={l.descripcion} onChange={(e) => setLinea(i, "descripcion", e.target.value)} className="bg-input text-title border border-secondary rounded-lg px-2 py-1.5 w-full" />
                                </td>
                                <td className="py-1.5">
                                    {lineas.length > 2 && <button onClick={() => delLinea(i)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={addLinea} className="btn-secondary text-xs mt-3"><Plus size={14} /> Agregar línea</button>

            <div className={`mt-4 p-3 rounded-lg flex items-center justify-between text-sm font-semibold ${cuadra ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                <span>Debe: {fmt(totalDebe)} · Haber: {fmt(totalHaber)}</span>
                <span>{cuadra ? "✓ Cuadra" : `Diferencia: ${fmt(totalDebe - totalHaber)}`}</span>
            </div>

            <div className="flex items-center gap-2 mt-4">
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" className="bg-input text-title border border-secondary rounded-lg px-3 py-2 flex-1" />
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
                <button disabled={guardando} onClick={() => guardar(false)} className="btn-secondary">Guardar borrador</button>
                <button disabled={guardando || !cuadra} onClick={() => guardar(true)} className="btn-primary">
                    {guardando ? "Guardando…" : "Guardar y contabilizar"}
                </button>
            </div>
        </ModalBase>
    );
}
