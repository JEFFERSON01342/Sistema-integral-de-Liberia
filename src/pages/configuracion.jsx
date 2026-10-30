import { useState, useRef, useEffect } from "react";
import {
    Settings, User, Palette, Globe, SlidersHorizontal, Upload, RotateCcw,
    Save, Sun, Moon, Check, Mail, Shield, Phone, Type, Info, Clock, Sparkles, Rows3,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/authcontext";
import { useTheme } from "../contexts/themecontext";
import { useSettings, ACCENTS, SIDEBARS } from "../contexts/settingscontext";
import { supabase } from "../supabase/supabaseclient";
import Avatar, { AVATARES_PRESET, AVATAR_DEFAULT } from "../components/avatar";

const ROL_LABEL = {
    superadmin: "Super Administrador", admin: "Administrador", gerente: "Gerente",
    contador: "Contador", cajero: "Cajero", despacho: "Despacho",
};

const Switch = ({ on, onChange }) => (
    <button type="button" onClick={() => onChange(!on)} className={`erp-switch ${on ? "on" : ""}`} aria-pressed={on} />
);

const Fila = ({ icon: Icon, titulo, desc, children }) => (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-secondary last:border-b-0">
        <div className="flex items-start gap-3 min-w-0">
            {Icon && <div className="p-2 rounded-lg bg-secondary text-title shrink-0"><Icon size={18} /></div>}
            <div className="min-w-0">
                <p className="text-title text-sm font-semibold">{titulo}</p>
                {desc && <p className="text-subtitle text-xs mt-0.5">{desc}</p>}
            </div>
        </div>
        <div className="shrink-0">{children}</div>
    </div>
);

const Seccion = ({ titulo, desc, children }) => (
    <div className="erp-card p-5 md:p-6">
        <h3 className="text-title text-base font-bold">{titulo}</h3>
        {desc && <p className="text-subtitle text-xs mt-1 mb-4">{desc}</p>}
        {!desc && <div className="mb-4" />}
        {children}
    </div>
);

// ---------------- MI PERFIL ----------------
function TabPerfil({ t }) {
    const { session, perfil, rol, actualizarPerfil } = useAuth();
    const fileRef = useRef(null);
    const [nombre, setNombre] = useState(perfil?.nombre_completo || "");
    const [telefono, setTelefono] = useState(perfil?.telefono || "");
    const [guardando, setGuardando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);

    useEffect(() => {
        setNombre(perfil?.nombre_completo || "");
        setTelefono(perfil?.telefono || "");
    }, [perfil?.nombre_completo, perfil?.telefono]);

    const actual = perfil?.avatar_url || AVATAR_DEFAULT;

    const elegirAvatar = async (url) => {
        const res = await actualizarPerfil({ avatar_url: url === AVATAR_DEFAULT ? null : url });
        res.success ? toast.success(t("Foto de perfil actualizada")) : toast.error(res.error);
    };

    const subirFoto = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast.error(t("El archivo debe ser una imagen"));
        if (file.size > 2 * 1024 * 1024) return toast.error(t("La imagen no debe superar 2 MB"));
        setSubiendo(true);
        try {
            const ext = (file.name.split(".").pop() || "png").toLowerCase();
            const path = `avatars/${session.user.id}-${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true, contentType: file.type });
            if (error) throw error;
            const { data } = supabase.storage.from("product-images").getPublicUrl(path);
            const res = await actualizarPerfil({ avatar_url: data.publicUrl });
            if (!res.success) throw new Error(res.error);
            toast.success(t("Foto de perfil actualizada"));
        } catch (err) {
            toast.error(`${t("No se pudo subir la foto")}: ${err.message}`);
        } finally {
            setSubiendo(false);
        }
    };

    const guardar = async (e) => {
        e.preventDefault();
        if (!nombre.trim()) return toast.error(t("El nombre es obligatorio"));
        setGuardando(true);
        const res = await actualizarPerfil({ nombre_completo: nombre.trim(), telefono: telefono.trim() || null });
        setGuardando(false);
        res.success ? toast.success(t("Perfil actualizado")) : toast.error(res.error);
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-3 flex flex-col gap-5">
                <Seccion titulo={t("Foto de perfil")} desc={t("Elige un avatar o sube tu propia foto")}>
                    <div className="flex flex-col sm:flex-row items-center gap-5 mb-6">
                        <div className="relative">
                            <Avatar src={perfil?.avatar_url} nombre={perfil?.nombre_completo} size={112} className="shadow-lg" />
                            <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-white" />
                        </div>
                        <div className="flex flex-col items-center sm:items-start gap-2">
                            <p className="text-title font-bold text-lg">{perfil?.nombre_completo || session?.user?.email}</p>
                            <p className="text-subtitle text-sm">{t(ROL_LABEL[rol] || "")}</p>
                            <div className="flex gap-2 mt-1 flex-wrap justify-center">
                                <button className="btn-primary" disabled={subiendo} onClick={() => fileRef.current?.click()}>
                                    <Upload size={16} /> {subiendo ? t("Subiendo...") : t("Subir foto")}
                                </button>
                                <button className="btn-secondary" onClick={() => elegirAvatar(AVATAR_DEFAULT)}>
                                    <RotateCcw size={16} /> {t("Restablecer")}
                                </button>
                                <input ref={fileRef} type="file" accept="image/*" hidden onChange={subirFoto} />
                            </div>
                            <p className="text-subtitle text-[0.7rem]">JPG, PNG, WEBP · máx. 2 MB</p>
                        </div>
                    </div>
                    <p className="text-title text-sm font-semibold mb-3">{t("Avatares disponibles")}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                        {AVATARES_PRESET.map((url) => (
                            <button
                                key={url}
                                onClick={() => elegirAvatar(url)}
                                className={`erp-option relative p-1 rounded-full aspect-square ${actual === url ? "selected" : ""}`}
                                style={{ borderRadius: "9999px" }}
                            >
                                <img src={url} alt="avatar" className="w-full h-full rounded-full object-cover" loading="lazy" />
                                {actual === url && (
                                    <span className="absolute -top-1 -right-1 bg-button text-white rounded-full p-0.5"><Check size={12} /></span>
                                )}
                            </button>
                        ))}
                    </div>
                </Seccion>
            </div>

            <div className="xl:col-span-2">
                <Seccion titulo={t("Información personal")}>
                    <form onSubmit={guardar} className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1.5">
                            <span className="text-subtitle text-xs font-semibold flex items-center gap-1.5"><User size={14} />{t("Nombre completo")}</span>
                            <input className="bg-primary text-title border border-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                                value={nombre} onChange={(e) => setNombre(e.target.value)} />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-subtitle text-xs font-semibold flex items-center gap-1.5"><Phone size={14} />{t("Teléfono")}</span>
                            <input className="bg-primary text-title border border-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                                value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+505 0000 0000" />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-subtitle text-xs font-semibold flex items-center gap-1.5"><Mail size={14} />{t("Correo electrónico")}</span>
                            <input disabled className="bg-secondary text-subtitle border border-secondary rounded-lg px-3 py-2.5 text-sm cursor-not-allowed"
                                value={perfil?.email || session?.user?.email || ""} />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-subtitle text-xs font-semibold flex items-center gap-1.5"><Shield size={14} />{t("Rol")}</span>
                            <input disabled className="bg-secondary text-subtitle border border-secondary rounded-lg px-3 py-2.5 text-sm cursor-not-allowed"
                                value={t(ROL_LABEL[rol] || rol || "")} />
                        </label>
                        <button type="submit" className="btn-primary justify-center mt-1" disabled={guardando}>
                            <Save size={16} /> {guardando ? t("Guardando...") : t("Guardar cambios")}
                        </button>
                    </form>
                </Seccion>
            </div>
        </div>
    );
}

// ---------------- APARIENCIA ----------------
function TabApariencia({ t }) {
    const { theme, setTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const acc = ACCENTS[settings.accent] || ACCENTS.azul;
    const sb = SIDEBARS[settings.sidebar] || SIDEBARS.marino;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-3 flex flex-col gap-5">
                <Seccion titulo={t("Modo de tema")}>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: "dark", label: "Oscuro", icon: Moon, bg: "#0B1622", card: "#152235", line: "#223349" },
                            { id: "light", label: "Claro", icon: Sun, bg: "#F1F5F9", card: "#FFFFFF", line: "#E2E8F0" },
                        ].map((m) => (
                            <button key={m.id} onClick={() => setTheme(m.id)} className={`erp-option p-3 text-left ${theme === m.id ? "selected" : ""}`}>
                                <div className="rounded-lg h-20 flex overflow-hidden mb-3" style={{ background: m.bg }}>
                                    <div className="w-1/4 h-full" style={{ background: sb.bg }} />
                                    <div className="flex-1 p-2 flex flex-col gap-1.5">
                                        <div className="h-2.5 rounded" style={{ background: m.card, border: `1px solid ${m.line}` }} />
                                        <div className="flex-1 rounded" style={{ background: m.card, border: `1px solid ${m.line}` }} />
                                    </div>
                                </div>
                                <span className="text-title text-sm font-semibold flex items-center gap-2"><m.icon size={16} />{t(m.label)}</span>
                            </button>
                        ))}
                    </div>
                </Seccion>

                <Seccion titulo={t("Color de acento")} desc={t("Se usa en botones, enlaces activos e indicadores")}>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                        {Object.entries(ACCENTS).map(([id, a]) => (
                            <button key={id} title={a.nombre} onClick={() => updateSetting("accent", id)} className="flex flex-col items-center gap-1.5">
                                <span className="h-11 w-11 rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-110"
                                    style={{ background: `linear-gradient(135deg, ${a.base}, ${a.activo})`, outline: settings.accent === id ? `3px solid ${a.borde}` : "none", outlineOffset: 2 }}>
                                    {settings.accent === id && <Check size={18} color="#fff" />}
                                </span>
                                <span className="text-subtitle text-[0.68rem] text-center leading-tight">{a.nombre}</span>
                            </button>
                        ))}
                    </div>
                </Seccion>

                <Seccion titulo={t("Estilo de la barra lateral")}>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {Object.entries(SIDEBARS).map(([id, s]) => (
                            <button key={id} onClick={() => updateSetting("sidebar", id)} className={`erp-option p-1.5 ${settings.sidebar === id ? "selected" : ""}`}>
                                <div className="h-16 rounded-md p-1.5 flex flex-col gap-1" style={{ background: s.bg }}>
                                    <div className="h-1.5 w-3/4 rounded" style={{ background: s.border }} />
                                    <div className="h-1.5 w-full rounded" style={{ background: acc.activo }} />
                                    <div className="h-1.5 w-2/3 rounded" style={{ background: s.border }} />
                                    <div className="h-1.5 w-1/2 rounded" style={{ background: s.border }} />
                                </div>
                                <p className="text-subtitle text-[0.68rem] mt-1 text-center">{s.nombre}</p>
                            </button>
                        ))}
                    </div>
                </Seccion>

                <Seccion titulo={t("Tamaño de texto")}>
                    <div className="grid grid-cols-3 gap-3">
                        {[["pequeno", "Pequeño", "text-xs"], ["normal", "Normal", "text-sm"], ["grande", "Grande", "text-base"]].map(([id, label, cls]) => (
                            <button key={id} onClick={() => updateSetting("fontSize", id)} className={`erp-option p-3 flex flex-col items-center gap-1 ${settings.fontSize === id ? "selected" : ""}`}>
                                <Type size={id === "pequeno" ? 14 : id === "normal" ? 18 : 22} className="text-title" />
                                <span className={`text-title font-semibold ${cls}`}>{t(label)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="mt-2">
                        <Fila icon={Rows3} titulo={t("Densidad compacta")} desc={t("Reduce el espaciado para ver más información")}>
                            <Switch on={settings.compacto} onChange={(v) => updateSetting("compacto", v)} />
                        </Fila>
                        <Fila icon={Sparkles} titulo={t("Animaciones")} desc={t("Transiciones suaves en la interfaz")}>
                            <Switch on={settings.animaciones} onChange={(v) => updateSetting("animaciones", v)} />
                        </Fila>
                    </div>
                </Seccion>
            </div>

            {/* Vista previa en vivo */}
            <div className="xl:col-span-2">
                <div className="xl:sticky xl:top-20">
                    <Seccion titulo={t("Vista previa")}>
                        <div className="rounded-xl overflow-hidden border border-secondary flex h-72">
                            <div className="w-2/5 p-3 flex flex-col gap-1.5" style={{ background: sb.bg }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <img src="/brand-mark.svg" alt="" className="h-6 w-6 object-contain" />
                                    <span className="text-[0.65rem] font-bold text-white truncate">Lisjuashde</span>
                                </div>
                                {["Ventas", "Inventario", "Finanzas", "Reportes"].map((x, i) => (
                                    <div key={x} className="text-[0.65rem] px-2 py-1.5 rounded text-white/80"
                                        style={i === 0 ? { background: acc.activo, borderLeft: `3px solid ${acc.borde}`, color: "#fff" } : {}}>
                                        {t(x)}
                                    </div>
                                ))}
                            </div>
                            <div className="flex-1 bg-primary p-3 flex flex-col gap-2">
                                <div className="bg-card rounded-lg p-3 border border-secondary">
                                    <p className="text-subtitle text-[0.65rem]">{t("Ventas")}</p>
                                    <p className="text-title font-bold">C$ 12,480</p>
                                    <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
                                        <div className="h-full w-2/3 rounded-full" style={{ background: acc.base }} />
                                    </div>
                                </div>
                                <button className="btn-primary justify-center text-xs">{t("Botón principal")}</button>
                                <button className="btn-secondary justify-center text-xs">{t("Botón secundario")}</button>
                            </div>
                        </div>
                        <p className="text-subtitle text-xs mt-3 flex items-center gap-1.5"><Info size={14} />{t("Las preferencias de apariencia se guardan en este navegador.")}</p>
                    </Seccion>
                </div>
            </div>
        </div>
    );
}

// ---------------- IDIOMA Y REGIÓN ----------------
function TabIdioma({ t }) {
    const { settings, updateSetting, locale } = useSettings();
    const hoy = new Date();
    const formatos = {
        largo: hoy.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        corto: hoy.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
        medio: hoy.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
    };
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Seccion titulo={t("Idioma del sistema")}>
                <div className="grid grid-cols-2 gap-3">
                    {[["es", "Español", "🇳🇮", "Nicaragua"], ["en", "English", "🇺🇸", "United States"]].map(([id, label, flag, region]) => (
                        <button key={id} onClick={() => updateSetting("idioma", id)} className={`erp-option p-4 flex items-center gap-3 text-left ${settings.idioma === id ? "selected" : ""}`}>
                            <span className="text-3xl">{flag}</span>
                            <div>
                                <p className="text-title font-semibold text-sm">{label}</p>
                                <p className="text-subtitle text-xs">{region}</p>
                            </div>
                        </button>
                    ))}
                </div>
                <p className="text-subtitle text-xs mt-3 flex items-center gap-1.5"><Info size={14} />{t("El idioma se aplica al menú, la barra superior y la configuración.")}</p>
            </Seccion>
            <Seccion titulo={t("Formato de fecha")}>
                <div className="flex flex-col gap-2">
                    {Object.entries(formatos).map(([id, ejemplo]) => (
                        <button key={id} onClick={() => updateSetting("formatoFecha", id)} className={`erp-option p-3 flex items-center justify-between text-left ${settings.formatoFecha === id ? "selected" : ""}`}>
                            <span className="text-title text-sm capitalize">{ejemplo}</span>
                            {settings.formatoFecha === id && <Check size={16} className="text-title" />}
                        </button>
                    ))}
                </div>
                <div className="mt-4">
                    <Fila icon={Globe} titulo={t("Moneda")} desc={t("Córdoba nicaragüense")}>
                        <span className="badge-info px-3 py-1 rounded-full text-xs font-semibold">C$ NIO</span>
                    </Fila>
                </div>
            </Seccion>
        </div>
    );
}

// ---------------- PREFERENCIAS ----------------
function TabPreferencias({ t }) {
    const { settings, updateSetting, resetSettings } = useSettings();
    const { setTheme } = useTheme();
    return (
        <div className="max-w-3xl">
            <Seccion titulo={t("Preferencias")}>
                <Fila icon={Clock} titulo={t("Mostrar reloj en la barra superior")} desc={t("Fecha y hora en vivo")}>
                    <Switch on={settings.mostrarReloj} onChange={(v) => updateSetting("mostrarReloj", v)} />
                </Fila>
                <Fila icon={Sparkles} titulo={t("Animaciones")} desc={t("Transiciones suaves en la interfaz")}>
                    <Switch on={settings.animaciones} onChange={(v) => updateSetting("animaciones", v)} />
                </Fila>
                <Fila icon={Rows3} titulo={t("Densidad compacta")} desc={t("Reduce el espaciado para ver más información")}>
                    <Switch on={settings.compacto} onChange={(v) => updateSetting("compacto", v)} />
                </Fila>
                <Fila icon={RotateCcw} titulo={t("Restablecer configuración")} desc={t("Vuelve a los valores por defecto del sistema")}>
                    <button className="btn-danger" onClick={() => { resetSettings(); setTheme("dark"); toast.success(t("Configuración restablecida")); }}>
                        {t("Restablecer")}
                    </button>
                </Fila>
            </Seccion>
        </div>
    );
}

export default function Configuracion() {
    const { t } = useSettings();
    const [tab, setTab] = useState("perfil");
    const tabs = [
        { id: "perfil", label: "Mi Perfil", icon: User },
        { id: "apariencia", label: "Apariencia", icon: Palette },
        { id: "idioma", label: "Idioma y Región", icon: Globe },
        { id: "preferencias", label: "Preferencias", icon: SlidersHorizontal },
    ];

    return (
        <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-button text-white"><Settings size={22} /></div>
                <div>
                    <h1 className="text-title text-2xl font-bold">{t("Configuración")}</h1>
                    <p className="text-subtitle text-sm">{t("Personaliza tu experiencia en el sistema")}</p>
                </div>
            </div>

            <div className="erp-card p-1.5 flex gap-1 overflow-x-auto">
                {tabs.map((x) => (
                    <button key={x.id} onClick={() => setTab(x.id)} className={`erp-tab ${tab === x.id ? "active" : ""}`}>
                        <x.icon size={16} /> {t(x.label)}
                    </button>
                ))}
            </div>

            {tab === "perfil" && <TabPerfil t={t} />}
            {tab === "apariencia" && <TabApariencia t={t} />}
            {tab === "idioma" && <TabIdioma t={t} />}
            {tab === "preferencias" && <TabPreferencias t={t} />}
        </div>
    );
}
