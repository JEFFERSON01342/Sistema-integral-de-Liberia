import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, KeyRound, RefreshCw, UserCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";

const horaVisible = (hora) => hora?.slice(0, 5) || "—";

export default function KioscoAsistencia() {
  const { perfil, rol } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [idSucursal, setIdSucursal] = useState("");
  const [idEmpleado, setIdEmpleado] = useState("");
  const [pin, setPin] = useState("");
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const esSuperadmin = rol === "superadmin";

  const cargarEmpleados = useCallback(async () => {
    if (!idSucursal) {
      setEmpleados([]);
      setIdEmpleado("");
      setCargando(false);
      return;
    }

    setCargando(true);
    const { data, error } = await supabase.rpc("listar_empleados_kiosco_asistencia", {
      p_id_sucursal: Number(idSucursal),
    });
    if (error) {
      toast.error(`No se pudo cargar el personal de la sucursal: ${error.message}`);
      setEmpleados([]);
      setCargando(false);
      return;
    }

    setEmpleados(data || []);
    setIdEmpleado("");
    setCargando(false);
  }, [idSucursal]);

  useEffect(() => {
    if (!perfil?.id_empresa) return;

    if (!esSuperadmin) {
      setIdSucursal(perfil.id_sucursal ? String(perfil.id_sucursal) : "");
      return;
    }

    const cargarSucursales = async () => {
      const { data, error } = await supabase
        .from("sucursales")
        .select("id_sucursal, nombre")
        .eq("id_empresa", perfil.id_empresa)
        .eq("activa", true)
        .order("nombre");
      if (error) {
        toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
        return;
      }
      setSucursales(data || []);
      setIdSucursal("");
    };

    cargarSucursales();
  }, [esSuperadmin, perfil?.id_empresa, perfil?.id_sucursal]);

  useEffect(() => {
    cargarEmpleados();
  }, [cargarEmpleados]);

  const empleadoSeleccionado = useMemo(
    () => empleados.find((empleado) => String(empleado.id_empleado) === idEmpleado),
    [empleados, idEmpleado]
  );
  const asistenciaCompleta = Boolean(
    empleadoSeleccionado?.hora_entrada && empleadoSeleccionado?.hora_salida
  );
  const tipoMarcacion = empleadoSeleccionado?.hora_entrada ? "salida" : "entrada";

  const registrar = async (event) => {
    event.preventDefault();
    if (!empleadoSeleccionado) return toast.error("Selecciona tu nombre.");

    setRegistrando(true);
    const { data, error } = await supabase.rpc("registrar_marcacion_kiosco_asistencia", {
      p_id_empleado: empleadoSeleccionado.id_empleado,
      p_pin: pin,
      p_id_sucursal: Number(idSucursal),
    });
    setRegistrando(false);

    if (error) return toast.error(`No se pudo registrar la asistencia: ${error.message}`);
    if (!data?.success) return toast.error(data?.message || "No se pudo validar el PIN.");

    toast.success(`${data.message} Hora: ${horaVisible(data.hora)}`);
    setPin("");
    await cargarEmpleados();
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-button/20 p-3 text-title"><Clock size={24} /></span>
          <div>
            <h1 className="text-title text-2xl font-bold">Kiosco de asistencia</h1>
            <p className="text-subtitle text-sm">
              {esSuperadmin ? "Selecciona la sucursal que vas a consultar" : "Acceso limitado a tu sucursal"}
            </p>
          </div>
        </div>
        <p className="text-subtitle">
          Selecciona tu nombre e introduce tu PIN personal para registrar la entrada o salida.
        </p>
      </header>

      <form onSubmit={registrar} className="flex flex-col gap-5 rounded-2xl border border-secondary bg-card p-5 sm:p-7">
        {esSuperadmin ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="sucursal-asistencia" className="text-title text-sm font-semibold">
              Sucursal
            </label>
            <select
              id="sucursal-asistencia"
              value={idSucursal}
              onChange={(event) => {
                setIdSucursal(event.target.value);
                setIdEmpleado("");
                setPin("");
              }}
              required
              className="rounded-lg border border-secondary bg-input p-3 text-title"
            >
              <option value="">Selecciona una sucursal</option>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-subtitle">
            {perfil?.id_sucursal
              ? `Sucursal asignada (#${perfil.id_sucursal})`
              : "Sucursal asignada a tu cuenta"}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="empleado-asistencia" className="text-title text-sm font-semibold">
            Empleado
          </label>
          <select
            id="empleado-asistencia"
            value={idEmpleado}
            onChange={(event) => setIdEmpleado(event.target.value)}
            disabled={cargando || !idSucursal}
            required
            className="rounded-lg border border-secondary bg-input p-3 text-title"
          >
            <option value="">
              {cargando ? "Cargando personal..." : "Selecciona tu nombre"}
            </option>
            {empleados.map((empleado) => (
              <option key={empleado.id_empleado} value={empleado.id_empleado}>
                {empleado.nombre_completo}
                {empleado.hora_entrada
                  ? ` · Entrada ${horaVisible(empleado.hora_entrada)}`
                  : ""}
                {empleado.hora_salida
                  ? ` · Salida ${horaVisible(empleado.hora_salida)}`
                  : ""}
              </option>
            ))}
          </select>
          {!cargando && empleados.length === 0 && (
            <p className="text-sm text-subtitle">No hay empleados activos en esta sucursal.</p>
          )}
        </div>

        {empleadoSeleccionado && (
          <div className="rounded-xl border border-secondary p-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-semibold text-title">
              <UserCheck size={17} /> Registro de hoy
            </p>
            <p className="text-subtitle">Entrada: {horaVisible(empleadoSeleccionado.hora_entrada)}</p>
            <p className="text-subtitle">Salida: {horaVisible(empleadoSeleccionado.hora_salida)}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="pin-asistencia" className="text-title text-sm font-semibold">
            PIN personal de 6 dígitos
          </label>
          <div className="relative">
            <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtitle" />
            <input
              id="pin-asistencia"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{6}"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              className="w-full rounded-lg border border-secondary bg-input p-3 pl-10 text-title tracking-[0.3em]"
              placeholder="••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={cargando || registrando || !empleadoSeleccionado || asistenciaCompleta || pin.length !== 6}
          className="flex items-center justify-center gap-2 rounded-lg bg-button px-4 py-3 font-semibold text-button disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clock size={18} />
          {registrando
            ? "Registrando..."
            : asistenciaCompleta
              ? "Entrada y salida completas"
              : `Registrar ${tipoMarcacion}`}
        </button>
      </form>

      <button
        type="button"
        onClick={cargarEmpleados}
        disabled={cargando}
        className="mt-4 flex items-center gap-2 text-sm text-subtitle hover:text-title disabled:opacity-50"
      >
        <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />
        Actualizar lista
      </button>
    </div>
  );
}
