import { useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";

export default function CambiarContrasena() {
  const navigate = useNavigate();
  const [contrasena, setContrasena] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (event) => {
    event.preventDefault();
    if (contrasena.length < 12) {
      return toast.error("La contraseña debe tener al menos 12 caracteres.");
    }
    if (contrasena !== confirmacion) {
      return toast.error("Las contraseñas no coinciden.");
    }

    setGuardando(true);
    const { error } = await supabase.auth.updateUser({
      password: contrasena,
      data: { must_change_password: false },
    });
    setGuardando(false);
    if (error) return toast.error(`No se pudo cambiar la contraseña: ${error.message}`);

    toast.success("Contraseña actualizada.");
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary p-4">
      <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-secondary bg-card p-7">
        <div>
          <div className="mb-3 inline-flex rounded-xl bg-button/20 p-3 text-title">
            <KeyRound size={23} />
          </div>
          <h1 className="text-title text-2xl font-bold">Cambia tu contraseña</h1>
          <p className="mt-2 text-sm text-subtitle">
            Por seguridad, debes reemplazar la contraseña temporal antes de continuar.
          </p>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium text-title">
          Nueva contraseña
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={contrasena}
            onChange={(event) => setContrasena(event.target.value)}
            className="rounded-lg border border-secondary bg-input p-3"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-title">
          Confirmar contraseña
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={confirmacion}
            onChange={(event) => setConfirmacion(event.target.value)}
            className="rounded-lg border border-secondary bg-input p-3"
          />
        </label>
        <button
          type="submit"
          disabled={guardando}
          className="flex items-center justify-center gap-2 rounded-lg bg-button px-4 py-3 font-semibold text-button disabled:opacity-60"
        >
          <Save size={17} /> {guardando ? "Actualizando..." : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}
