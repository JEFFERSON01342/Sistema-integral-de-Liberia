import { useState, useEffect } from "react";

export const AVATAR_DEFAULT = "/avatar-boy.png";

// Avatares predefinidos (3D animados locales + estilos ilustrados).
export const AVATARES_PRESET = [
    "/avatar-boy.png",
    "/avatar-girl.png",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Lisjuashde&backgroundColor=b6e3f4",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Valentina&backgroundColor=ffd5dc",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Mateo&backgroundColor=c0aede",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Sofia&backgroundColor=d1d4f9",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Carlos&backgroundColor=b6e3f4",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Lucia&backgroundColor=ffdfbf",
    "https://api.dicebear.com/9.x/big-smile/svg?seed=Andres&backgroundColor=c0aede",
    "https://api.dicebear.com/9.x/big-smile/svg?seed=Camila&backgroundColor=ffd5dc",
    "https://api.dicebear.com/9.x/lorelei/svg?seed=Daniela&backgroundColor=b6e3f4",
    "https://api.dicebear.com/9.x/notionists/svg?seed=Jose&backgroundColor=d1f4d9",
];

const iniciales = (nombre) => {
    if (!nombre) return "?";
    const p = nombre.trim().split(/\s+/).filter(Boolean);
    if (p.length === 0) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
};

// Avatar circular: usa la foto del perfil o el avatar animado por defecto.
export default function Avatar({ src, nombre, size = 36, className = "", ring = false }) {
    const url = src || AVATAR_DEFAULT;
    const [error, setError] = useState(false);
    useEffect(() => setError(false), [url]);

    const style = { width: size, height: size, minWidth: size };
    const ringCls = ring ? "ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-transparent" : "";

    if (error) {
        return (
            <div
                style={{ ...style, fontSize: Math.max(10, size * 0.34) }}
                className={`rounded-full bg-button text-button flex items-center justify-center font-bold ${ringCls} ${className}`}
            >
                {iniciales(nombre)}
            </div>
        );
    }
    return (
        <img
            src={url}
            alt={nombre || "Avatar"}
            style={style}
            onError={() => setError(true)}
            className={`rounded-full object-cover bg-[#3B82F6]/20 ${ringCls} ${className}`}
        />
    );
}
