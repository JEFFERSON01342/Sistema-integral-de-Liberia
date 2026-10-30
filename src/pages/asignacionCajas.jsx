import { useState, useEffect, useCallback } from "react";
import { Monitor, UserPlus, X, Save, Power, Users, DoorOpen, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import { registrarAuditoria } from "../utils/auditoria";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { useEmpresa } from "../contexts/empresacontext";

const TURNOS = ["Mañana", "Tarde", "Completo"];

export default function AsignacionCajas() {
  const { perfil, rol } = useAuth();
  const { empresaId } = useEmpresa();
  const esSuperadmin = rol === "superadmin";

  const [isLoading, setIsLoading] = useState(true);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalSel, setSucursalSel] = useState(null); // id sucursal seleccionada
  const [terminales, setTerminales] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]); // activas de la sucursal
  const [cajasAbiertas, setCajasAbiertas] = useState([]); // apertura_caja abiertas
  const [empleados, setEmpleados] = useState([]); // cajeros activos de la sucursal

  // Modal de asignación
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ id_caja: "", id_cajero: "", turno: "Completo" });
  const [guardando, setGuardando] = useState(false);

  // Para admin/gerente la sucursal queda fijada a la del perfil.
  useEffect(() => {
    if (!esSuperadmin && perfil?.id_sucursal) setSucursalSel(perfil.id_sucursal);
  }, [esSuperadmin, perfil]);

  const cargarSucursales = useCallback(async () => {
    let q = supabase
      .from("sucursales")
      .select("id_sucursal, nombre")
      .eq("id_empresa", empresaId)
      .eq("activa", true)
      .order("id_sucursal");
    if (!esSuperadmin && perfil?.id_sucursal) q = q.eq("id_sucursal", perfil.id_sucursal);
    const { data, error } = await q;
    if (error) {
      toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
      setSucursales([]);
      return;
    }
    setSucursales(data || []);
    // Si el superadmin aún no ha elegido, tomamos la primera.
    if (esSuperadmin && !sucursalSel && (data || []).length) setSucursalSel(data[0].id_sucursal);
  }, [empresaId, esSuperadmin, perfil, sucursalSel]);

  const cargar = useCallback(async () => {
    if (!sucursalSel) return;
    setIsLoading(true);

    const [terminalesResult, asignacionesResult, sesionesResult, empleadosResult] = await Promise.all([
      supabase.from("cajas").select("id_caja, nombre, codigo, numero_serie, id_sucursal, activa")
        .eq("id_empresa", empresaId).eq("id_sucursal", sucursalSel).eq("activa", true).order("id_caja"),
      supabase.from("asignaciones_caja")
        .select("id, id_caja, id_cajero, turno, activo, id_sucursal")
        .eq("id_sucursal", sucursalSel).eq("activo", true),
      supabase.from("sesiones_caja").select("id_sesion, id_caja, abierta_por, estado")
        .eq("id_empresa", empresaId).eq("id_sucursal", sucursalSel).eq("estado", "ABIERTA"),
      supabase.from("perfiles").select("id, nombre_completo, rol")
        .eq("id_empresa", empresaId).eq("id_sucursal", sucursalSel)
        .eq("rol", "cajero").eq("activo", true).order("nombre_completo"),
    ]);
    const results = [terminalesResult, asignacionesResult, sesionesResult, empleadosResult];
    const errorResult = results.find((result) => result.error);
    if (errorResult) {
      toast.error(`No se pudieron cargar las asignaciones de caja: ${errorResult.error.message}`);
      setTerminales([]);
      setAsignaciones([]);
      setCajasAbiertas([]);
      setEmpleados([]);
      setIsLoading(false);
      return;
    }
    const term = terminalesResult.data;
    const asig = asignacionesResult.data;
    const abiertas = sesionesResult.data;
    const emps = empleadosResult.data;

    // Nombres de empleados (incluye los asignados aunque no estén en la lista filtrada)
    const mapaNombres = {};
    (emps || []).forEach((e) => { mapaNombres[e.id] = e.nombre_completo; });
    const faltantes = (asig || []).map((a) => a.id_cajero).filter((id) => !mapaNombres[id]);
    if (faltantes.length) {
      const { data: extra, error: extraError } = await supabase
        .from("perfiles")
        .select("id, nombre_completo")
        .in("id", faltantes);
      if (extraError) {
        toast.error(`No se pudieron cargar los nombres de cajeros asignados: ${extraError.message}`);
      }
      (extra || []).forEach((e) => { mapaNombres[e.id] = e.nombre_completo; });
    }

    setTerminales(term || []);
    setAsignaciones((asig || []).map((a) => ({ ...a, cajero_nombre: mapaNombres[a.id_cajero] || "—" })));
    setCajasAbiertas(abiertas || []);
    setEmpleados(emps || []);
    setIsLoading(false);
  }, [empresaId, sucursalSel]);

  useEffect(() => { cargarSucursales(); }, [cargarSucursales]);
  useEffect(() => { cargar(); }, [cargar]);

  // Helpers por terminal
  const asignacionDe = (idCaja) => asignaciones.find((a) => a.id_caja === idCaja) || null;
  const estaEnUso = (idCaja) => cajasAbiertas.some((sesion) => sesion.id_caja === idCaja);

  const abrirModal = (idTerminal = "") => {
    setForm({ id_caja: idTerminal ? String(idTerminal) : "", id_cajero: "", turno: "Completo" });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.id_caja) return toast.error("Seleccione una caja (POS).");
    if (!form.id_cajero) return toast.error("Seleccione un empleado.");

    setGuardando(true);
    const { error } = await supabase.rpc("asignar_caja_cajero", {
      p_id_caja: Number(form.id_caja),
      p_id_cajero: form.id_cajero,
      p_turno: form.turno,
    });
    setGuardando(false);
    if (error) return toast.error("Error al asignar: " + error.message);

    const term = terminales.find((t) => t.id_caja === Number(form.id_caja));
    const emp = empleados.find((p) => p.id === form.id_cajero);
    await registrarAuditoria(supabase, perfil, "ASIGNAR_CAJA", "Asignación de Cajas",
      `Asignó ${term?.nombre || "caja"} a ${emp?.nombre_completo || "empleado"} (turno ${form.turno})`);
    toast.success("Caja asignada correctamente.");
    setModal(false);
    cargar();
  };

  const quitarAsignacion = async (asig) => {
    const r = await Swal.fire({
      title: "¿Quitar asignación?",
      html: `Se liberará la caja de <b>${asig.cajero_nombre}</b>. El empleado ya no podrá abrir ese POS.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, quitar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#334155",
      background: "#152235",
      color: "#e5e7eb",
    });
    if (!r.isConfirmed) return;
    const { error } = await supabase.from("asignaciones_caja").update({ activo: false }).eq("id", asig.id);
    if (error) return toast.error("Error al quitar: " + error.message);
    await registrarAuditoria(supabase, perfil, "QUITAR_ASIGNACION_CAJA", "Asignación de Cajas",
      `Quitó la asignación de ${asig.cajero_nombre}`);
    toast.success("Asignación eliminada.");
    cargar();
  };

  return (
    <div>
      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-title text-2xl font-bold">Asignación de Cajas</h2>
          <p className="text-subtitle text-sm">
            Asigná qué empleado estará a cargo de cada caja (POS) y en qué turno.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {esSuperadmin && (
            <select
              value={sucursalSel || ""}
              onChange={(e) => setSucursalSel(e.target.value ? Number(e.target.value) : null)}
              className="bg-input border border-secondary rounded-lg p-2.5 text-title"
            >
              {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>)}
            </select>
          )}
          <button onClick={() => abrirModal()} className="bg-button text-button flex items-center gap-2 h-11 px-4 rounded-xl hover:scale-105 transition font-semibold">
            <UserPlus size={18} /> Asignar Caja
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <StatsCards title={"Cajas (POS)"} icon={<Monitor className="text-blue-400" />} value={terminales.length} />
        <StatsCards title={"Cajas Asignadas"} icon={<CheckCircle2 className="text-green-400" />} value={asignaciones.length} />
        <StatsCards title={"Cajas en Uso"} icon={<DoorOpen className="text-purple-400" />} value={cajasAbiertas.length} />
      </div>

      {/* Tabla de terminales */}
      <div className="mt-8 border border-secondary rounded-2xl p-5">
        <h3 className="text-title text-lg font-bold mb-4 flex items-center gap-2"><Monitor size={18} /> Cajas de la sucursal</h3>
        {isLoading ? (
          <p className="text-subtitle p-4 text-center">Cargando…</p>
        ) : terminales.length === 0 ? (
          <p className="text-subtitle p-4 text-center">No hay cajas (POS) registradas en esta sucursal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-title w-full border-collapse">
              <thead>
                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                  <th className="py-3 px-2 text-left">Caja (POS)</th>
                  <th className="py-3 px-2 text-left">N° Serie</th>
                  <th className="py-3 px-2 text-left">Empleado a cargo</th>
                  <th className="py-3 px-2 text-center">Turno</th>
                  <th className="py-3 px-2 text-center">Estado</th>
                  <th className="py-3 px-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {terminales.map((t) => {
                  const a = asignacionDe(t.id_caja);
                  const enUso = estaEnUso(t.id_caja);
                  return (
                    <tr key={t.id_caja} className="border-t border-secondary text-sm hover:bg-secondary transition-colors">
                      <td className="py-3 px-2 font-medium">{t.nombre}</td>
                      <td className="py-3 px-2 text-subtitle">{t.numero_serie || "—"}</td>
                      <td className="py-3 px-2">{a ? a.cajero_nombre : <span className="text-subtitle italic">Sin asignar</span>}</td>
                      <td className="py-3 px-2 text-center">{a ? a.turno : "—"}</td>
                      <td className="py-3 px-2 text-center">
                        {enUso ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-600/20 text-purple-300">En uso</span>
                        ) : a ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-600/20 text-green-400">Asignada</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-600/20 text-gray-300">Libre</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => abrirModal(t.id_caja)} title={a ? "Reasignar" : "Asignar"} disabled={enUso} className="p-2 rounded-lg bg-secondary hover:bg-button hover:text-button transition disabled:opacity-40 disabled:cursor-not-allowed">
                            <UserPlus size={16} />
                          </button>
                          {a && (
                            <button onClick={() => quitarAsignacion(a)} title="Quitar asignación" disabled={enUso} className="p-2 rounded-lg bg-secondary hover:bg-red-600 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed">
                              <Power size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Asignar */}
      {modal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setModal(false)}></div>
          <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-lg shadow-lg border border-secondary">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold flex items-center gap-2"><UserPlus /> Asignar Caja</h3>
              <button onClick={() => setModal(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <form onSubmit={guardar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Caja (POS) *</label>
                <select value={form.id_caja} onChange={(e) => setForm({ ...form, id_caja: e.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                  <option value="">Seleccione una caja</option>
                  {terminales.map((t) => {
                    const a = asignacionDe(t.id_caja);
                    return <option key={t.id_caja} value={t.id_caja}>{t.nombre}{a ? ` — asignada a ${a.cajero_nombre}` : " — libre"}</option>;
                  })}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium flex items-center gap-2"><Users size={15} /> Empleado *</label>
                <select value={form.id_cajero} onChange={(e) => setForm({ ...form, id_cajero: e.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                  <option value="">Seleccione un empleado</option>
                  {empleados.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo} ({p.rol})</option>)}
                </select>
                {empleados.length === 0 && (
                  <span className="text-xs text-amber-400">No hay cajeros activos en esta sucursal.</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Turno *</label>
                <select value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                  {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-xs text-subtitle">Si la caja ya está asignada en ese turno, se reemplaza por el nuevo empleado.</span>
              </div>
              <div className="flex justify-end gap-4 mt-2">
                <button type="button" onClick={() => setModal(false)} className="cursor-pointer bg-secondary border border-secondary font-semibold py-2 px-6 rounded-lg hover:scale-105 transition">Cancelar</button>
                <button type="submit" disabled={guardando} className="cursor-pointer bg-button text-button font-semibold py-2 px-4 rounded-lg hover:scale-105 transition flex gap-2 items-center disabled:opacity-50">
                  <Save size={18} /> {guardando ? "Guardando…" : "Asignar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
