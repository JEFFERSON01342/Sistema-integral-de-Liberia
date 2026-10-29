import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/authcontext";
import { toast } from "react-hot-toast";
import { Check, ShieldCheck, BarChart3, Package } from "lucide-react";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState({});
    const [loading, setLoading] = useState(false);

    const { loginUser } = useAuth();
    const navigate = useNavigate();

    // --- Lógica de Login (sin cambios) ---
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError({});
        try {
            const result = await loginUser(email, password);
            if (result.success) {
                const nombre = result.perfil?.nombre_completo || "";
                toast.success(`¡Bienvenido ${nombre} al panel de Librería Lisjuashde! 🎉`, {
                    style: {
                        backgroundColor: "rgb(34, 197, 94, 0.9)",
                        color: "#fff",
                        borderRadius: "12px",
                        padding: "12px 16px",
                    }
                });
                navigate("/dashboard");
            } else {
                if (result.error?.includes("Invalid login credentials")) {
                    setError({ field: "password", message: "Correo o contraseña incorrectos" });
                } else {
                    setError({ field: "general", message: result.error });
                }
            }
        } catch (err) {
            setError({ field: "general", message: err.message });
        } finally {
            setLoading(false);
        }
    };

    const features = [
        { icon: Package, text: "Inventario y ventas en tiempo real" },
        { icon: BarChart3, text: "Reportes y estados financieros" },
        { icon: ShieldCheck, text: "Control de accesos por rol" },
    ];

    return (
        <div className="min-h-screen flex">

            {/* --- PANEL IZQUIERDO DECORATIVO (solo escritorio) --- */}
            <div
                className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
                style={{ backgroundColor: "#0D1B2A" }}
            >
                {/* Acentos decorativos */}
                <div
                    className="absolute -top-24 -right-24 h-72 w-72 rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(37,99,235,.25), transparent 70%)" }}
                />
                <div
                    className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(37,99,235,.18), transparent 70%)" }}
                />

                {/* Logo + nombre */}
                <div className="relative z-10 flex items-center gap-3">
                    <img src="/logo-libreria.png" alt="Logo Librería Lisjuashde" className="h-14 w-14 object-contain" />
                    <span className="text-white text-xl font-bold tracking-tight">Librería Lisjuashde</span>
                </div>

                {/* Mensaje central + features */}
                <div className="relative z-10 flex flex-col gap-8 max-w-md">
                    <div className="flex flex-col gap-3">
                        <h2 className="text-white text-4xl font-extrabold leading-tight">
                            Sistema de Gestión Empresarial
                        </h2>
                        <p className="text-slate-400 text-base">
                            Administra ventas, inventario, finanzas y personal de tu librería desde una
                            sola plataforma corporativa.
                        </p>
                    </div>

                    <ul className="flex flex-col gap-4">
                        {features.map((f) => (
                            <li key={f.text} className="flex items-center gap-3">
                                <span
                                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: "rgba(37,99,235,.18)", color: "#60A5FA" }}
                                >
                                    <f.icon size={18} />
                                </span>
                                <span className="text-slate-200 text-sm font-medium">{f.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Pie */}
                <div className="relative z-10 flex items-center gap-2 text-slate-500 text-xs">
                    <Check size={14} className="text-green-400" />
                    <span>© {new Date().getFullYear()} Librería Lisjuashde · Todos los derechos reservados</span>
                </div>
            </div>

            {/* --- PANEL DERECHO: FORMULARIO --- */}
            <div
                className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-12"
                style={{ backgroundColor: "var(--color-primary)" }}
            >
                <div className="w-full max-w-md flex flex-col gap-8 animate-fade-in-down">

                    {/* Logo (visible solo en móvil / tablet) */}
                    <div className="flex lg:hidden flex-col items-center text-center gap-2">
                        <img src="/logo-libreria.png" alt="Logo Librería Lisjuashde" className="h-20 w-auto object-contain" />
                        <h1 className="text-title text-2xl font-bold tracking-tight">Librería Lisjuashde</h1>
                    </div>

                    {/* Encabezado */}
                    <div className="flex flex-col gap-1.5">
                        <h2 className="text-title text-3xl font-bold">¡Hola de nuevo!</h2>
                        <p className="text-subtitle text-sm">
                            Ingresa tus credenciales para acceder al panel administrativo.
                        </p>
                    </div>

                    {/* Formulario */}
                    <form className="flex flex-col gap-5" onSubmit={handleLogin}>

                        <div className="space-y-1.5">
                            <label className="text-title text-sm font-semibold ml-1">Correo Electrónico</label>
                            <input
                                type="email"
                                required
                                placeholder="usuario@libreria.com"
                                className={`w-full bg-input text-title border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-subtitle/50 ${
                                    error?.field === "email" ? "border-red-500 ring-1 ring-red-500" : "border-secondary"
                                }`}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                            {error?.field === "email" && <span className="text-red-500 text-xs ml-1">{error.message}</span>}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-title text-sm font-semibold ml-1">Contraseña</label>
                            <input
                                type="password"
                                required
                                placeholder="••••••••"
                                className={`w-full bg-input text-title border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-subtitle/50 ${
                                    error?.field === "password" ? "border-red-500 ring-1 ring-red-500" : "border-secondary"
                                }`}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            {error?.field === "password" && <span className="text-red-500 text-xs ml-1">{error.message}</span>}
                        </div>

                        {error?.field === "general" && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-sm text-center">
                                {error.message}
                            </div>
                        )}

                        <button
                            disabled={loading}
                            className="w-full cursor-pointer bg-button text-button font-bold py-3.5 rounded-xl shadow-lg hover:opacity-90 active:scale-[0.98] transition-all mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Procesando...
                                </span>
                            ) : "Iniciar Sesión"}
                        </button>
                    </form>

                    <p className="text-subtitle text-xs text-center opacity-60 lg:hidden">
                        © {new Date().getFullYear()} Librería Lisjuashde. Todos los derechos reservados.
                    </p>
                </div>
            </div>
        </div>
    );
}
