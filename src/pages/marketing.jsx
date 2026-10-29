import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Megaphone, Plus, Save, Tag, Percent, Calendar, TrendingUp,
    Sparkles, Trash2, ToggleLeft, ToggleRight, Gift, Sun, Baby, Flag, Snowflake
} from "lucide-react";
import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import { registrarAuditoria } from "../utils/auditoria";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

// Temporadas comerciales de Nicaragua
const TEMPORADAS = [
    { key: "regreso_clases", nombre: "Regreso a Clases", meses: "Enero – Febrero", icon: <Baby size={18} />, color: "bg-blue-600/20 text-blue-400 border-blue-600/40", desc: "Temporada más alta del año para librerías. Útiles, mochilas y textos escolares." },
    { key: "dia_madre", nombre: "Día de la Madre", meses: "30 de Mayo", icon: <Gift size={18} />, color: "bg-pink-600/20 text-pink-400 border-pink-600/40", desc: "Tarjetas, manualidades y regalos. Pico de ventas a finales de mayo." },
    { key: "fiestas_patrias", nombre: "Fiestas Patrias", meses: "Septiembre", icon: <Flag size={18} />, color: "bg-sky-500/20 text-sky-300 border-sky-500/40", desc: "Material cívico, banderas, cartulinas y decoración patria." },
    { key: "navidad", nombre: "Navidad", meses: "Diciembre", icon: <Snowflake size={18} />, color: "bg-red-600/20 text-red-400 border-red-600/40", desc: "Tarjetas, envoltura, agendas y regalos de fin de año." },
    { key: "ano_nuevo", nombre: "Año Nuevo", meses: "Enero", icon: <Sun size={18} />, color: "bg-amber-500/20 text-amber-300 border-amber-500/40", desc: "Agendas, planificadores y artículos de oficina para el nuevo año." },
];

const fmt = (v) => `C$ ${Number(v || 0).toFixed(2)}`;

export default function Marketing() {
    const { empresaId } = useEmpresa();
    const { perfil } = useAuth();

    const tabs = [
        { key: "activas", label: "Promociones Activas", icon: <Tag size={16} /> },
        { key: "crear", label: "Crear Campaña", icon: <Plus size={16} /> },
        { key: "temporadas", label: "Temporadas", icon: <Calendar size={16} /> },
        { key: "stats", label: "Estadísticas", icon: <TrendingUp size={16} /> },
    ];
    const [activeTab, setActiveTab] = useState("activas");

    const [descuentos, setDescuentos] = useState([]);
    const [loading, setLoading] = useState(false);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from("descuentos")
            .select("*")
            .eq("id_empresa", empresaId)
            .order("created_at", { ascending: false });
        if (error) {
            console.error("Error cargando descuentos:", error.message);
            setDescuentos([]);
        } else {
            setDescuentos(data || []);
        }
        setLoading(false);
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    const hoyStr = new Date().toISOString().slice(0, 10);
    const activos = descuentos.filter((d) => d.activo && (!d.fecha_fin || d.fecha_fin >= hoyStr));

    // ---------- FORM CREAR ----------
    const formVacio = {
        nombre: "", descripcion: "", tipo: "porcentaje", valor: "",
        codigo_descuento: "", fecha_inicio: hoyStr, fecha_fin: "",
        aplica_a: "todos", temporada: "", banner_texto: "", usos_maximos: "",
    };
    const [form, setForm] = useState(formVacio);
    const [guardando, setGuardando] = useState(false);

    const setF = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

    const crearCampana = async (e) => {
        e.preventDefault();
        if (!form.nombre.trim()) return toast.error("Ingrese un nombre para la campaña.");
        if (!form.valor || Number(form.valor) <= 0) return toast.error("Ingrese un valor de descuento válido.");
        setGuardando(true);
        try {
            const { error } = await supabase.from("descuentos").insert({
                id_empresa: empresaId,
                nombre: form.nombre.trim(),
                descripcion: form.descripcion.trim() || null,
                tipo: form.tipo,
                valor: Number(form.valor),
                codigo_descuento: form.codigo_descuento.trim().toUpperCase() || null,
                fecha_inicio: form.fecha_inicio || null,
                fecha_fin: form.fecha_fin || null,
                aplica_a: form.aplica_a,
                temporada: form.temporada || null,
                banner_texto: form.banner_texto.trim() || null,
                usos_maximos: form.usos_maximos ? Number(form.usos_maximos) : null,
                activo: true,
            });
            if (error) throw error;
            await registrarAuditoria(supabase, perfil, "CREAR_CAMPANA", "Marketing", `Campaña: ${form.nombre}`);
            toast.success("✅ Campaña creada correctamente.");
            setForm(formVacio);
            cargar();
            setActiveTab("activas");
        } catch (err) {
            console.error("Error creando campaña:", err.message);
            toast.error("⚠️ Error al crear campaña: " + err.message);
        } finally {
            setGuardando(false);
        }
    };

    const toggleActivo = async (d) => {
        const { error } = await supabase.from("descuentos").update({ activo: !d.activo }).eq("id", d.id);
        if (error) return toast.error("Error al actualizar estado.");
        toast.success(d.activo ? "Promoción desactivada." : "Promoción activada.");
        cargar();
    };

    const eliminar = async (d) => {
        const confirm = await Swal.fire({
            title: "¿Eliminar promoción?",
            text: `Se eliminará "${d.nombre}".`,
            icon: "warning",
            background: "#1e1e1e",
            color: "#fff",
            showCancelButton: true,
            confirmButtonColor: "#ef4444",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar",
        });
        if (!confirm.isConfirmed) return;
        const { error } = await supabase.from("descuentos").delete().eq("id", d.id);
        if (error) return toast.error("Error al eliminar.");
        await registrarAuditoria(supabase, perfil, "ELIMINAR_CAMPANA", "Marketing", `Campaña: ${d.nombre}`);
        toast.success("Promoción eliminada.");
        cargar();
    };

    const crearDesdeTemporada = (t) => {
        setForm({
            ...formVacio,
            nombre: `Promo ${t.nombre}`,
            descripcion: t.desc,
            temporada: t.key,
            banner_texto: `¡${t.nombre}! Aprovecha nuestras ofertas`,
            tipo: "porcentaje",
            valor: "15",
        });
        setActiveTab("crear");
    };

    const valorBadge = (d) => d.tipo === "porcentaje" ? `${d.valor}%` : fmt(d.valor);

    // ---------- ESTADÍSTICAS ----------
    const stats = useMemo(() => {
        const totalUsos = descuentos.reduce((s, d) => s + (Number(d.usos_actuales) || 0), 0);
        const porTemporada = {};
        descuentos.forEach((d) => {
            const k = d.temporada || "sin_temporada";
            porTemporada[k] = (porTemporada[k] || 0) + 1;
        });
        return { totalUsos, porTemporada };
    }, [descuentos]);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Promociones Activas"} icon={<Sparkles className="text-title" />} value={activos.length} />
                <StatsCards title={"Total Campañas"} icon={<Megaphone className="text-title" />} value={descuentos.length} />
                <StatsCards title={"Usos Registrados"} icon={<Percent className="text-title" />} value={stats.totalUsos} />
                <StatsCards title={"Temporadas Nicaragua"} icon={<Calendar className="text-title" />} value={TEMPORADAS.length} />
            </div>

            <div className="mt-6">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    {/* ------- PROMOCIONES ACTIVAS ------- */}
                    {activeTab === "activas" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Promociones y Descuentos</h3>
                                    <p className="text-subtitle text-s">Administra tus campañas de marketing</p>
                                </div>
                                <button onClick={() => setActiveTab("crear")} className="bg-button text-button flex h-10 gap-2 px-4 rounded-xl items-center cursor-pointer hover:scale-105 transition">
                                    <Plus size={18} /> Nueva Campaña
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                {loading ? (
                                    <p className="p-4 text-center text-subtitle">Cargando...</p>
                                ) : descuentos.length === 0 ? (
                                    <p className="p-4 text-center text-subtitle">No hay campañas. Crea la primera.</p>
                                ) : (
                                    <table className="min-w-[800px] w-full text-title text-sm">
                                        <thead className="bg-secondary/10">
                                            <tr className="border-b border-secondary/50 text-xs font-semibold text-subtitle">
                                                <th className="py-3 px-3 text-left">Campaña</th>
                                                <th className="py-3 px-3 text-center">Tipo</th>
                                                <th className="py-3 px-3 text-center">Valor</th>
                                                <th className="py-3 px-3 text-center">Código</th>
                                                <th className="py-3 px-3 text-center">Vigencia</th>
                                                <th className="py-3 px-3 text-center">Temporada</th>
                                                <th className="py-3 px-3 text-center">Estado</th>
                                                <th className="py-3 px-3 text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {descuentos.map((d) => {
                                                const temp = TEMPORADAS.find((t) => t.key === d.temporada);
                                                return (
                                                    <tr key={d.id} className="border-t border-secondary hover:bg-secondary/10 transition-colors">
                                                        <td className="py-3 px-3 text-left">
                                                            <div className="flex flex-col">
                                                                <span className="font-medium">{d.nombre}</span>
                                                                {d.descripcion && <span className="text-xs text-subtitle truncate max-w-[220px]">{d.descripcion}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-3 text-center capitalize">{d.tipo}</td>
                                                        <td className="py-3 px-3 text-center font-semibold">{valorBadge(d)}</td>
                                                        <td className="py-3 px-3 text-center font-mono text-xs">{d.codigo_descuento || "—"}</td>
                                                        <td className="py-3 px-3 text-center text-xs text-subtitle">
                                                            {d.fecha_inicio ? new Date(d.fecha_inicio).toLocaleDateString("es-NI", { timeZone: "UTC" }) : "—"}
                                                            {d.fecha_fin ? ` → ${new Date(d.fecha_fin).toLocaleDateString("es-NI", { timeZone: "UTC" })}` : ""}
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                            {temp ? <span className={`px-2 py-1 rounded-full text-xs font-medium border ${temp.color}`}>{temp.nombre}</span> : <span className="text-subtitle text-xs">—</span>}
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${d.activo ? "bg-green-600/20 text-green-400" : "bg-gray-600/20 text-gray-300"}`}>
                                                                {d.activo ? "Activa" : "Inactiva"}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-3">
                                                            <div className="flex justify-center gap-3">
                                                                <button title={d.activo ? "Desactivar" : "Activar"} onClick={() => toggleActivo(d)} className="text-blue-400 hover:scale-110 transition cursor-pointer">
                                                                    {d.activo ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                                </button>
                                                                <button title="Eliminar" onClick={() => eliminar(d)} className="text-red-500 hover:scale-110 transition cursor-pointer">
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    )}

                    {/* ------- CREAR CAMPAÑA ------- */}
                    {activeTab === "crear" && (
                        <>
                            <div className="flex flex-col gap-1 mb-4">
                                <h3 className="text-title text-xl font-bold">Crear Campaña</h3>
                                <p className="text-subtitle text-s">Configura una nueva promoción o descuento</p>
                            </div>
                            <form onSubmit={crearCampana} className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Nombre de la campaña *</label>
                                    <input type="text" value={form.nombre} onChange={(e) => setF("nombre", e.target.value)} required className="bg-input border border-secondary rounded-lg p-3" placeholder="Ej. Regreso a Clases 2026" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Tipo de descuento *</label>
                                    <select value={form.tipo} onChange={(e) => setF("tipo", e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                        <option value="porcentaje">Porcentaje (%)</option>
                                        <option value="monto">Monto fijo (C$)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Valor *</label>
                                    <input type="number" step="0.01" value={form.valor} onChange={(e) => setF("valor", e.target.value)} required className="bg-input border border-secondary rounded-lg p-3" placeholder={form.tipo === "porcentaje" ? "15" : "100.00"} />
                                </div>
                                <div className="md:col-span-3 flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Descripción</label>
                                    <input type="text" value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} className="bg-input border border-secondary rounded-lg p-3" placeholder="Detalle de la promoción" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Código promocional</label>
                                    <input type="text" value={form.codigo_descuento} onChange={(e) => setF("codigo_descuento", e.target.value)} className="bg-input border border-secondary rounded-lg p-3 uppercase" placeholder="Ej. CLASES15" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Fecha inicio</label>
                                    <input type="date" value={form.fecha_inicio} onChange={(e) => setF("fecha_inicio", e.target.value)} className="bg-input border border-secondary rounded-lg p-3 [&::-webkit-calendar-picker-indicator]:invert" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Fecha fin</label>
                                    <input type="date" value={form.fecha_fin} onChange={(e) => setF("fecha_fin", e.target.value)} className="bg-input border border-secondary rounded-lg p-3 [&::-webkit-calendar-picker-indicator]:invert" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Aplica a</label>
                                    <select value={form.aplica_a} onChange={(e) => setF("aplica_a", e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                        <option value="todos">Todos los productos</option>
                                        <option value="categorias">Categorías específicas</option>
                                        <option value="productos">Productos específicos</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Temporada</label>
                                    <select value={form.temporada} onChange={(e) => setF("temporada", e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                        <option value="">Ninguna</option>
                                        {TEMPORADAS.map((t) => <option key={t.key} value={t.key}>{t.nombre}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Usos máximos</label>
                                    <input type="number" value={form.usos_maximos} onChange={(e) => setF("usos_maximos", e.target.value)} className="bg-input border border-secondary rounded-lg p-3" placeholder="Ilimitado si se deja vacío" />
                                </div>
                                <div className="md:col-span-3 flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Texto del banner (tienda web)</label>
                                    <input type="text" value={form.banner_texto} onChange={(e) => setF("banner_texto", e.target.value)} className="bg-input border border-secondary rounded-lg p-3" placeholder="¡Aprovecha nuestras ofertas!" />
                                </div>
                                <div className="md:col-span-3 flex justify-end gap-4 mt-2">
                                    <button type="button" onClick={() => { setForm(formVacio); setActiveTab("activas"); }} className="bg-secondary border border-secondary py-2 px-6 rounded-lg cursor-pointer hover:scale-105 transition">Cancelar</button>
                                    <button type="submit" disabled={guardando} className="bg-button text-button py-2 px-4 rounded-lg cursor-pointer hover:scale-105 transition flex items-center gap-2 disabled:opacity-60">
                                        <Save size={18} /> {guardando ? "Guardando..." : "Crear Campaña"}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}

                    {/* ------- TEMPORADAS ------- */}
                    {activeTab === "temporadas" && (
                        <>
                            <div className="flex flex-col gap-1 mb-4">
                                <h3 className="text-title text-xl font-bold">Temporadas Comerciales de Nicaragua</h3>
                                <p className="text-subtitle text-s">Planifica tus campañas según las fechas clave del año escolar y festivo</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {TEMPORADAS.map((t) => (
                                    <div key={t.key} className={`border rounded-2xl p-5 flex flex-col gap-3 ${t.color}`}>
                                        <div className="flex items-center gap-2">
                                            {t.icon}
                                            <h4 className="font-bold text-title">{t.nombre}</h4>
                                        </div>
                                        <span className="text-xs font-semibold flex items-center gap-1"><Calendar size={12} /> {t.meses}</span>
                                        <p className="text-sm text-subtitle">{t.desc}</p>
                                        <button onClick={() => crearDesdeTemporada(t)} className="mt-auto bg-button text-button py-2 px-3 rounded-lg cursor-pointer hover:scale-105 transition flex items-center justify-center gap-2 text-sm font-medium">
                                            <Plus size={16} /> Crear campaña
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ------- ESTADÍSTICAS ------- */}
                    {activeTab === "stats" && (
                        <>
                            <div className="flex flex-col gap-1 mb-4">
                                <h3 className="text-title text-xl font-bold">Estadísticas de Marketing</h3>
                                <p className="text-subtitle text-s">Resumen del desempeño de tus campañas</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <StatsCards title={"Campañas Activas"} icon={<Sparkles className="text-green-400" />} value={activos.length} />
                                <StatsCards title={"Campañas Inactivas"} icon={<Megaphone className="text-gray-400" />} value={descuentos.length - activos.length} />
                                <StatsCards title={"Usos Totales"} icon={<Percent className="text-blue-400" />} value={stats.totalUsos} />
                            </div>
                            <h4 className="text-title font-semibold mb-3">Campañas por temporada</h4>
                            <div className="flex flex-col gap-2">
                                {TEMPORADAS.map((t) => {
                                    const cantidad = stats.porTemporada[t.key] || 0;
                                    const max = Math.max(1, ...Object.values(stats.porTemporada));
                                    return (
                                        <div key={t.key} className="flex items-center gap-3">
                                            <span className="text-sm text-title w-40 shrink-0 flex items-center gap-2">{t.icon} {t.nombre}</span>
                                            <div className="flex-1 bg-secondary/40 rounded-full h-5 overflow-hidden">
                                                <div className="bg-button h-full rounded-full transition-all" style={{ width: `${(cantidad / max) * 100}%` }} />
                                            </div>
                                            <span className="text-sm text-subtitle w-8 text-right">{cantidad}</span>
                                        </div>
                                    );
                                })}
                                {(stats.porTemporada["sin_temporada"] || 0) > 0 && (
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-title w-40 shrink-0">Sin temporada</span>
                                        <div className="flex-1 bg-secondary/40 rounded-full h-5 overflow-hidden">
                                            <div className="bg-gray-500 h-full rounded-full" style={{ width: `${((stats.porTemporada["sin_temporada"] || 0) / Math.max(1, ...Object.values(stats.porTemporada))) * 100}%` }} />
                                        </div>
                                        <span className="text-sm text-subtitle w-8 text-right">{stats.porTemporada["sin_temporada"]}</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
