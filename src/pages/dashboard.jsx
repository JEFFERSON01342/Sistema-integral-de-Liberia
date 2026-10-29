import {
    LogOut, HardHat, ShoppingCart, UserCheck, Package,
    Users, Wallet, Wrench, FileSpreadsheetIcon, ChartColumn, TrendingUp,
    Sun, Moon, Lightbulb, Menu, X, ShoppingBag, Printer,
    Building2, Monitor, DoorOpen, RotateCcw, ScrollText, ArrowLeftRight,
    Megaphone, BarChart3, Settings, LifeBuoy, Globe,
    ListTree, BookText, BookOpen, Clock, Scale, CalendarClock, SlidersHorizontal
} from "lucide-react";
import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/authcontext";
import { useTheme } from "../contexts/themecontext";
import Swal from "sweetalert2";
import { useSettings } from "../contexts/settingscontext";
import Avatar from "../components/avatar";

// Navegación agrupada por secciones. Cada enlace declara qué roles pueden verlo.
// Roles del sistema: superadmin (ve TODO), admin, gerente, cajero, despacho.
// (Se mantiene "vendedor" por compatibilidad con datos existentes → equiparado a admin.)
const navGroups = [
    {
        section: "Ventas y Atención",
        links: [
            { to: "ventas",         label: 'Ventas',               icon: ShoppingCart, roles: ["admin", "vendedor", "gerente", "cajero"] },
            { to: "pedidosWeb",     label: 'Pedidos Web',           icon: ShoppingBag,  roles: ["admin", "vendedor", "gerente", "despacho"] },
            { to: "impresiones",    label: 'Impresiones',           icon: Printer,      roles: ["admin", "vendedor", "gerente"] },
            { to: "clientes",       label: 'Clientes',              icon: UserCheck,    roles: ["admin", "vendedor", "gerente"] },
            { to: "devoluciones",   label: 'Devoluciones',          icon: RotateCcw,    roles: ["admin", "vendedor", "gerente"] },
            { to: "aperturaCierre", label: 'Apertura/Cierre Caja',  icon: DoorOpen,     roles: ["cajero", "admin", "gerente"] },
            { to: "asignacionCajas", label: 'Asignación de Cajas',  icon: Monitor,      roles: ["admin", "gerente"] },
        ],
    },
    {
        section: "Inventario",
        links: [
            { to: "inventario",     label: 'Inventario',     icon: Package,        roles: ["admin", "vendedor", "gerente"] },
            { to: "proveedores",    label: 'Proveedores',    icon: Users,          roles: ["admin", "vendedor", "gerente"] },
            { to: "transferencias", label: 'Transferencias', icon: ArrowLeftRight, roles: ["admin", "vendedor", "gerente"] },
            { to: "sucursales",     label: 'Sucursales',     icon: Building2,      roles: [] }, // solo superadmin (no se crean sucursales desde admin)
        ],
    },
    {
        section: "Finanzas",
        links: [
            { to: "cajabancos",         label: 'Cajas/Bancos',       icon: Wallet,              roles: ["admin", "vendedor", "gerente"] },
            { to: "activosFijos",       label: 'Activos Fijos',      icon: Wrench,              roles: ["admin", "vendedor", "gerente"] },
            { to: "gastosFijos",        label: 'Gastos Fijos',       icon: Lightbulb,           roles: ["admin", "vendedor", "gerente"] },
            { to: "estadosFinancieros", label: 'Estados Financieros', icon: FileSpreadsheetIcon, roles: ["admin", "vendedor", "gerente"] },
            { to: "analisis",           label: 'Análisis',           icon: ChartColumn,         roles: ["admin", "vendedor", "gerente"] },
            { to: "proyecciones",       label: 'Proyecciones',       icon: TrendingUp,          roles: ["admin", "vendedor", "gerente"] },
        ],
    },
    {
        section: "Contabilidad",
        links: [
            { to: "planCuentas",          label: 'Plan de Cuentas',       icon: ListTree,          roles: ["admin", "gerente", "vendedor"] },
            { to: "comprobantes",         label: 'Libro Diario',          icon: BookText,          roles: ["admin", "gerente", "vendedor"] },
            { to: "libroMayor",           label: 'Libro Mayor',           icon: BookOpen,          roles: ["admin", "gerente", "vendedor"] },
            { to: "antiguedadSaldos",     label: 'Antigüedad de Saldos',  icon: Clock,             roles: ["admin", "gerente", "vendedor"] },
            { to: "conciliacionBancaria", label: 'Conciliación Bancaria', icon: Scale,             roles: ["admin", "gerente"] },
            { to: "periodosContables",    label: 'Períodos Contables',    icon: CalendarClock,     roles: ["admin", "gerente"] },
            { to: "configContable",       label: 'Config. Contable',      icon: SlidersHorizontal, roles: ["admin", "gerente"] },
        ],
    },
    {
        section: "Recursos Humanos",
        links: [
            { to: "recursosHumanos", label: 'Recursos Humanos', icon: HardHat, roles: ["admin", "vendedor", "gerente"] },
        ],
    },
    {
        section: "Marketing",
        links: [
            { to: "marketing", label: 'Marketing', icon: Megaphone, roles: ["admin", "vendedor", "gerente"] },
        ],
    },
    {
        section: "Reportes",
        links: [
            { to: "reportes", label: 'Reportes y Análisis', icon: BarChart3, roles: ["admin", "vendedor", "gerente"] },
        ],
    },
    {
        section: "Sistema",
        links: [
            { to: "vistaSucursales", label: 'Vista de Sucursales', icon: Globe,      roles: [] }, // solo superadmin
            { to: "terminalesPOS",   label: 'Terminales POS',      icon: Monitor,    roles: [] }, // solo superadmin
            { to: "usuarios",        label: 'Usuarios y Permisos', icon: Users,      roles: [] }, // solo superadmin
            { to: "auditoria",       label: 'Auditoría',           icon: ScrollText, roles: [] }, // solo superadmin
        ],
    },
    {
        section: "Soporte",
        links: [
            { to: "ticketsIT", label: 'Tickets IT', icon: LifeBuoy, roles: ["admin", "vendedor", "gerente", "cajero", "despacho"] },
        ],
    },
    {
        section: "Cuenta",
        links: [
            { to: "configuracion", label: 'Configuración', icon: Settings, roles: ["admin", "vendedor", "gerente", "cajero", "despacho"] },
        ],
    },
];

// Componente de enlace reutilizable (estilo sidebar corporativo).
const AppLink = ({ to, icon: Icon, label, onClick, t = (x) => x }) => (
    <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) => `erp-navlink ${isActive ? "active" : ""}`}
    >
        <Icon size={18} className="shrink-0" />
        <span className="truncate">{t(label)}</span>
    </NavLink>
);

const ROL_LABEL = {
    superadmin: "Super Administrador",
    admin: "Administrador",
    gerente: "Gerente",
    cajero: "Cajero",
    despacho: "Despacho",
    vendedor: "Vendedor",
};

// Filtra un grupo de enlaces según el rol.
const filtrarGrupos = (rol) =>
    navGroups
        .map((grupo) => ({
            ...grupo,
            links: rol === "superadmin"
                ? grupo.links
                : grupo.links.filter((link) => !!rol && link.roles.includes(rol)),
        }))
        .filter((grupo) => grupo.links.length > 0);

// Renderiza la navegación agrupada con encabezados de sección.
const NavSecciones = ({ grupos, onLinkClick, t }) => (
    <nav className="flex-1 flex flex-col gap-0.5">
        {grupos.map((grupo) => (
            <div key={grupo.section} className="flex flex-col gap-0.5">
                <p className="erp-sidebar-section text-[0.68rem] font-semibold uppercase tracking-wider px-3 mt-5 mb-1.5">
                    {t(grupo.section)}
                </p>
                {grupo.links.map((link) => (
                    <AppLink key={link.to} {...link} onClick={onLinkClick} t={t} />
                ))}
            </div>
        ))}
    </nav>
);

// Contenido reutilizable del sidebar (escritorio + drawer móvil).
const SidebarContent = ({
    grupos, avatarUrl, nombreUsuario, rolLabel,
    theme, toggleTheme, onLogout, onLinkClick, onPerfil, t,
}) => (
    <div className="flex flex-col h-full">
        {/* Logo + empresa */}
        <div className="flex items-center gap-3 px-4 py-5 erp-sidebar-border border-b">
            <img src="/logo-libreria.png" alt="Logo" className="h-10 w-10 object-contain shrink-0" />
            <div className="flex flex-col leading-tight overflow-hidden">
                <h3 className="erp-sidebar-text text-[0.95rem] font-bold" style={{ color: "var(--sidebar-text-active)" }}>
                    Librería Lisjuashde
                </h3>
                <span className="erp-sidebar-section text-xs">{t("Panel Administrativo")}</span>
            </div>
        </div>

        {/* Navegación (scrollable) */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
            <NavSecciones grupos={grupos} onLinkClick={onLinkClick} t={t} />
        </div>

        {/* Pie del sidebar: tema + usuario + salir */}
        <div className="erp-sidebar-border border-t p-3 flex flex-col gap-2">
            <button
                onClick={toggleTheme}
                className="erp-navlink w-full justify-start"
                style={{ borderLeftColor: "transparent" }}
            >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span>{theme === 'dark' ? t('Tema Claro') : t('Tema Oscuro')}</span>
            </button>

            <div className="erp-sidebar-user flex items-center gap-3 rounded-lg p-2.5">
                <button onClick={onPerfil} title={t("Configuración")} className="shrink-0 rounded-full">
                    <Avatar src={avatarUrl} nombre={nombreUsuario} size={38} />
                </button>
                <div className="flex flex-col leading-tight overflow-hidden flex-1 cursor-pointer" onClick={onPerfil}>
                    <span className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-text-active)" }}>
                        {nombreUsuario}
                    </span>
                    {rolLabel && <span className="erp-sidebar-section text-[0.68rem]">{t(rolLabel)}</span>}
                </div>
                <button
                    onClick={onLogout}
                    title={t("Cerrar sesión")}
                    className="erp-sidebar-text p-1.5 rounded-md hover:text-white shrink-0"
                    style={{ transition: "color .15s ease" }}
                >
                    <LogOut size={18} />
                </button>
            </div>
        </div>
    </div>
);

export default function Dashboard() {
    const { session, perfil, rol, logoutUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { settings, t, locale } = useSettings();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [ahora, setAhora] = useState(new Date());

    // Reloj en vivo del header (actualiza cada 30s).
    useEffect(() => {
        const timer = setInterval(() => setAhora(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const gruposVisibles = filtrarGrupos(rol);

    const nombreUsuario = perfil?.nombre_completo || session?.user?.email || "Cargando...";
    const rolLabel = ROL_LABEL[rol] || "";
    const avatarUrl = perfil?.avatar_url || null;
    const irPerfil = () => { setIsMobileMenuOpen(false); navigate("configuracion"); };

    const FORMATOS_FECHA = {
        largo: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
        medio: { day: "numeric", month: "short", year: "numeric" },
        corto: { day: "2-digit", month: "2-digit", year: "numeric" },
    };
    const fechaTexto = ahora.toLocaleDateString(locale, FORMATOS_FECHA[settings.formatoFecha] || FORMATOS_FECHA.largo);
    const horaTexto = ahora.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

    const handleLogout = async () => {
        const result = await Swal.fire({
            title: "¿Seguro que deseas salir?",
            text: "Tu sesión se cerrará y deberás iniciar sesión nuevamente.",
            icon: "warning",
            background: "#152235",
            color: "#fff",
            iconColor: "#facc15",
            showCancelButton: true,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#ef4444",
            confirmButtonText: "Sí, cerrar sesión",
            cancelButtonText: "Cancelar",
            customClass: {
                popup: "rounded-2xl shadow-xl border border-gray-700",
                confirmButton: "rounded-lg px-4 py-2",
                cancelButton: "rounded-lg px-4 py-2",
            },
        });

        if (result.isConfirmed) {
            await logoutUser();

            await Swal.fire({
                title: "Sesión cerrada",
                text: "Has salido del sistema.",
                icon: "success",
                background: "#152235",
                color: "#fff",
                iconColor: "#22c55e",
                showConfirmButton: false,
                timer: 1400,
                customClass: {
                    popup: "rounded-2xl shadow-xl border border-gray-700",
                },
            });

            navigate("/login");
        }
    };

    return (
        <div className="bg-primary min-h-screen flex">

            {/* --- BARRA LATERAL FIJA (ESCRITORIO) --- */}
            <aside className="erp-sidebar hidden md:flex md:flex-col w-64 border-r fixed top-0 left-0 h-screen z-30">
                <SidebarContent
                    grupos={gruposVisibles}
                    avatarUrl={avatarUrl}
                    onPerfil={irPerfil}
                    t={t}
                    nombreUsuario={nombreUsuario}
                    rolLabel={rolLabel}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    onLogout={handleLogout}
                />
            </aside>

            {/* --- CONTENEDOR PRINCIPAL --- */}
            <div className="flex-1 flex flex-col min-w-0 md:ml-64">

                {/* --- TOPBAR STICKY --- */}
                <header className="bg-card border-b border-secondary px-4 md:px-6 py-3 flex justify-between items-center sticky top-0 z-20">

                    {/* Izquierda: menú móvil + fecha/hora */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="text-title p-1 md:hidden"
                            aria-label="Abrir menú"
                        >
                            <Menu size={24} />
                        </button>

                        <div className={`${settings.mostrarReloj ? "hidden md:flex" : "hidden"} flex-col leading-tight`}>
                            <span className="text-title text-sm font-semibold capitalize">{fechaTexto}</span>
                            <span className="text-subtitle text-xs">{horaTexto}</span>
                        </div>

                        <span className="text-title font-bold md:hidden truncate">Librería Lisjuashde</span>
                    </div>

                    {/* Derecha: avatar + tema + salir */}
                    <div className="flex items-center gap-2 md:gap-3">
                        <button onClick={irPerfil} title={t("Mi cuenta")} className="flex items-center gap-2.5 pr-1 rounded-lg hover:bg-secondary p-1 transition-colors">
                            <Avatar src={avatarUrl} nombre={nombreUsuario} size={36} />
                            <div className="hidden md:flex flex-col leading-tight text-left">
                                <span className="text-title text-sm font-semibold">{nombreUsuario}</span>
                                {rolLabel && <span className="text-subtitle text-xs">{t(rolLabel)}</span>}
                            </div>
                        </button>

                        <button
                            onClick={() => navigate("configuracion")}
                            title={t("Configuración")}
                            className="text-title border border-secondary p-2 rounded-lg hidden sm:flex items-center justify-center cursor-pointer hover:bg-secondary transition-colors"
                        >
                            <Settings size={18} />
                        </button>

                        <button
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
                            className="text-title border border-secondary p-2 rounded-lg flex items-center justify-center cursor-pointer hover:bg-secondary transition-colors"
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        <button
                            onClick={handleLogout}
                            className="btn-secondary"
                        >
                            <LogOut size={18} />
                            <span className="hidden md:inline">{t("Salir")}</span>
                        </button>
                    </div>
                </header>

                {/* --- CONTENIDO DE LA PÁGINA --- */}
                <main className="erp-main flex-1 p-4 md:p-6 lg:p-7 flex flex-col gap-5">
                    <Outlet />
                </main>
            </div>

            {/* --- DRAWER MÓVIL --- */}
            {isMobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm animate-fade-in"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <div
                        className="erp-sidebar fixed top-0 left-0 h-full w-64 shadow-2xl z-50 animate-slide-in-left"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="erp-sidebar-text absolute top-4 right-3 p-1 z-10 hover:text-white"
                            aria-label="Cerrar menú"
                        >
                            <X size={22} />
                        </button>
                        <SidebarContent
                            grupos={gruposVisibles}
                            avatarUrl={avatarUrl}
                    onPerfil={irPerfil}
                    t={t}
                            nombreUsuario={nombreUsuario}
                            rolLabel={rolLabel}
                            theme={theme}
                            toggleTheme={toggleTheme}
                            onLogout={handleLogout}
                            onLinkClick={() => setIsMobileMenuOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
