import { createContext, useContext, useEffect, useState } from "react";

// ============================================================
// Preferencias de apariencia e idioma del panel (por navegador).
// Se guardan en localStorage y se aplican como variables CSS.
// ============================================================

export const ACCENTS = {
    azul:     { nombre: "Azul corporativo", base: "#2563EB", hover: "#1D4ED8", activo: "#1E40AF", borde: "#60A5FA" },
    indigo:   { nombre: "Índigo",           base: "#4F46E5", hover: "#4338CA", activo: "#3730A3", borde: "#A5B4FC" },
    violeta:  { nombre: "Violeta",          base: "#7C3AED", hover: "#6D28D9", activo: "#5B21B6", borde: "#C4B5FD" },
    esmeralda:{ nombre: "Esmeralda",        base: "#059669", hover: "#047857", activo: "#065F46", borde: "#6EE7B7" },
    turquesa: { nombre: "Turquesa",         base: "#0891B2", hover: "#0E7490", activo: "#155E75", borde: "#67E8F9" },
    naranja:  { nombre: "Naranja",          base: "#EA580C", hover: "#C2410C", activo: "#9A3412", borde: "#FDBA74" },
    rosa:     { nombre: "Rosa",             base: "#DB2777", hover: "#BE185D", activo: "#9D174D", borde: "#F9A8D4" },
    rojo:     { nombre: "Carmesí",          base: "#DC2626", hover: "#B91C1C", activo: "#991B1B", borde: "#FCA5A5" },
};

export const SIDEBARS = {
    marino:  { nombre: "Azul marino", bg: "#0D1B2A", border: "#1A2E42", hover: "#1A2E42" },
    grafito: { nombre: "Grafito",     bg: "#111827", border: "#1F2937", hover: "#1F2937" },
    negro:   { nombre: "Negro puro",  bg: "#000000", border: "#1A1A1A", hover: "#171717" },
    pizarra: { nombre: "Pizarra",     bg: "#1E293B", border: "#334155", hover: "#334155" },
    vino:    { nombre: "Vino",        bg: "#2A0E1A", border: "#3F1828", hover: "#3F1828" },
    bosque:  { nombre: "Bosque",      bg: "#0B2018", border: "#163327", hover: "#163327" },
};

export const FONT_SIZES = { pequeno: "14px", normal: "16px", grande: "17.5px" };

// --- Diccionario de traducción (navegación, topbar y configuración) ---
const DICT = {
    es: {
        "Ventas y Atención": "Ventas y Atención", "Inventario": "Inventario", "Finanzas": "Finanzas",
        "Recursos Humanos": "Recursos Humanos", "Marketing": "Marketing", "Reportes": "Reportes", "Sistema": "Sistema",
        "Cuenta": "Cuenta",
    },
    en: {
        // Secciones
        "Ventas y Atención": "Sales & Service", "Inventario": "Inventory", "Finanzas": "Finance",
        "Recursos Humanos": "Human Resources", "Marketing": "Marketing", "Reportes": "Reports", "Sistema": "System",
        "Cuenta": "Account",
        // Enlaces
        "Ventas": "Sales", "Pedidos Web": "Web Orders", "Impresiones": "Printing", "Clientes": "Customers",
        "Devoluciones": "Returns", "Apertura/Cierre Caja": "Cash Open/Close", "Proveedores": "Suppliers",
        "Transferencias": "Transfers", "Sucursales": "Branches", "Cajas/Bancos": "Cash/Banks",
        "Activos Fijos": "Fixed Assets", "Gastos Fijos": "Fixed Expenses", "Estados Financieros": "Financial Statements",
        "Análisis": "Analysis", "Proyecciones": "Projections", "Reportes y Análisis": "Reports & Analytics",
        "Terminales POS": "POS Terminals", "Usuarios y Permisos": "Users & Permissions", "Auditoría": "Audit Log",
        "Configuración": "Settings",
        // Sidebar / topbar
        "Panel Administrativo": "Admin Panel", "Tema Claro": "Light Theme", "Tema Oscuro": "Dark Theme",
        "Salir": "Log out", "Cerrar sesión": "Log out",
        // Configuración
        "Personaliza tu experiencia en el sistema": "Customize your experience in the system",
        "Mi Perfil": "My Profile", "Apariencia": "Appearance", "Idioma y Región": "Language & Region",
        "Preferencias": "Preferences",
        "Foto de perfil": "Profile picture", "Elige un avatar o sube tu propia foto": "Pick an avatar or upload your own photo",
        "Subir foto": "Upload photo", "Restablecer": "Reset", "Avatares disponibles": "Available avatars",
        "Información personal": "Personal information", "Nombre completo": "Full name", "Teléfono": "Phone",
        "Correo electrónico": "Email", "Rol": "Role", "Guardar cambios": "Save changes", "Guardando...": "Saving...",
        "Modo de tema": "Theme mode", "Oscuro": "Dark", "Claro": "Light", "Sistema (automático)": "System (auto)",
        "Color de acento": "Accent color", "Se usa en botones, enlaces activos e indicadores": "Used in buttons, active links and indicators",
        "Estilo de la barra lateral": "Sidebar style", "Tamaño de texto": "Text size",
        "Pequeño": "Small", "Normal": "Normal", "Grande": "Large",
        "Vista previa": "Preview", "Botón principal": "Primary button", "Botón secundario": "Secondary button",
        "Idioma del sistema": "System language", "Formato de fecha": "Date format", "Moneda": "Currency",
        "Densidad compacta": "Compact density", "Reduce el espaciado para ver más información": "Reduces spacing to show more information",
        "Animaciones": "Animations", "Transiciones suaves en la interfaz": "Smooth transitions in the interface",
        "Mostrar reloj en la barra superior": "Show clock in top bar", "Fecha y hora en vivo": "Live date and time",
        "Restablecer configuración": "Reset settings", "Vuelve a los valores por defecto del sistema": "Restore system defaults",
        "Las preferencias de apariencia se guardan en este navegador.": "Appearance preferences are saved in this browser.",
        "Foto de perfil actualizada": "Profile picture updated", "El archivo debe ser una imagen": "The file must be an image",
        "La imagen no debe superar 2 MB": "Image must not exceed 2 MB", "No se pudo subir la foto": "Could not upload photo",
        "El nombre es obligatorio": "Name is required", "Perfil actualizado": "Profile updated", "Subiendo...": "Uploading...",
        "Super Administrador": "Super Administrator", "Administrador": "Administrator", "Gerente": "Manager",
        "Cajero": "Cashier", "Despacho": "Dispatch", "Vendedor": "Seller",
        "El idioma se aplica al menú, la barra superior y la configuración.": "Language applies to the menu, top bar and settings.",
        "Córdoba nicaragüense": "Nicaraguan córdoba", "Configuración restablecida": "Settings restored",
        "Mi cuenta": "My account",
    },
};

const DEFAULTS = {
    accent: "azul",
    sidebar: "marino",
    fontSize: "normal",
    idioma: "es",
    formatoFecha: "largo",
    compacto: false,
    animaciones: true,
    mostrarReloj: true,
};

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem("erp-settings") || "{}");
            return { ...DEFAULTS, ...saved };
        } catch {
            return DEFAULTS;
        }
    });

    useEffect(() => {
        const root = document.documentElement;
        const a = ACCENTS[settings.accent] || ACCENTS.azul;
        const s = SIDEBARS[settings.sidebar] || SIDEBARS.marino;

        root.style.setProperty("--accent", a.base);
        root.style.setProperty("--accent-hover", a.hover);
        root.style.setProperty("--color-button", a.base);
        root.style.setProperty("--color-tab-indicator", a.base);
        root.style.setProperty("--sidebar-active-bg", a.activo);
        root.style.setProperty("--sidebar-active-border", a.borde);
        root.style.setProperty("--sidebar-bg", s.bg);
        root.style.setProperty("--sidebar-border", s.border);
        root.style.setProperty("--sidebar-hover-bg", s.hover);
        root.style.setProperty("--sidebar-user-bg", s.hover);
        root.style.fontSize = FONT_SIZES[settings.fontSize] || FONT_SIZES.normal;
        root.setAttribute("lang", settings.idioma);
        root.classList.toggle("erp-compact", !!settings.compacto);
        root.classList.toggle("erp-no-anim", !settings.animaciones);

        try { localStorage.setItem("erp-settings", JSON.stringify(settings)); } catch { /* ignore */ }
    }, [settings]);

    const updateSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));
    const resetSettings = () => setSettings(DEFAULTS);

    // Traducción: devuelve el texto en el idioma activo (o el original si no hay traducción).
    const t = (texto) => DICT[settings.idioma]?.[texto] ?? texto;
    const locale = settings.idioma === "en" ? "en-US" : "es-NI";

    return (
        <SettingsContext.Provider value={{ settings, updateSetting, resetSettings, t, locale }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => useContext(SettingsContext);

export default SettingsContext;
