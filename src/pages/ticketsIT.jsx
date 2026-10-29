import { useState, useEffect, useCallback } from "react";
import { LifeBuoy, Plus, X, Send, Filter, MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const MODULOS = [
  "Ventas", "Pedidos Web", "Inventario", "Caja", "Clientes",
  "Proveedores", "Reportes", "Contabilidad", "Recursos Humanos",
  "Usuarios y Permisos", "Tienda en línea", "Otros",
];
const PRIORIDADES = ["Baja", "Media", "Alta", "Crítica"];
const ESTADOS = ["Abierto", "En proceso", "Resuelto", "Cerrado"];

const BADGE_ESTADO = {
  "Abierto": "badge-warning",
  "En proceso": "badge-info",
  "Resuelto": "badge-success",
  "Cerrado": "badge-neutral",
};
const BADGE_PRIORIDAD = {
  "Baja": "badge-neutral",
  "Media": "badge-info",
  "Alta": "badge-warning",
  "Crítica": "badge-danger",
};

export default function TicketsIT() {
  const { user, perfil, rol } = useAuth();
  const esSuperadmin = rol === "superadmin";

  const [tickets, setTickets] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Crear
  const [modalCrear, setModalCrear] = useState(false);
  const [form, setForm] = useState({ titulo: "", modulo: "Ventas", prioridad: "Media", descripcion: "" });
  const [guardando, setGuardando] = useState(false);

  // Detalle / responder
  const [detalle, setDetalle] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);

  // Filtros (superadmin)
  const [filtros, setFiltros] = useState({ estado: "", prioridad: "", id_sucursal: "" });

  const cargar = useCallback(async () => {
    setIsLoading(true);
    // RLS ya limita: el staff ve sólo sus tickets; el superadmin ve todos.
    const { data, error } = await supabase
      .from("tickets_it")
      .select("*, sucursal:sucursales(nombre)")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("No se pudieron cargar los tickets.");
      setTickets([]);
      setIsLoading(false);
      return;
    }
    let lista = data || [];
    // Resolver nombres de autor (la FK de tickets_it apunta a auth.users, no a perfiles)
    const ids = [...new Set(lista.map((t) => t.id_usuario).filter(Boolean))];
    if (ids.length) {
      const { data: perfiles } = await supabase.from("perfiles").select("id, nombre_completo").in("id", ids);
      const mapa = {};
      (perfiles || []).forEach((p) => { mapa[p.id] = p.nombre_completo; });
      lista = lista.map((t) => ({ ...t, autor: { nombre_completo: mapa[t.id_usuario] || "—" } }));
    }
    setTickets(lista);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    supabase.from("sucursales").select("id, nombre").eq("estado", true).then(({ data }) => setSucursales(data || []));
  }, [cargar]);

  const crearTicket = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) return toast.error("El título es obligatorio.");
    if (!form.descripcion.trim()) return toast.error("La descripción es obligatoria.");
    setGuardando(true);
    const { error } = await supabase.from("tickets_it").insert([{
      id_usuario: user.id,
      titulo: form.titulo.trim(),
      modulo: form.modulo,
      prioridad: form.prioridad,
      descripcion: form.descripcion.trim(),
    }]);
    setGuardando(false);
    if (error) {
      Swal.fire({ icon: "error", title: "No se pudo crear el ticket", text: error.message, background: "#152235", color: "#fff" });
      return;
    }
    toast.success("Ticket enviado a soporte.");
    setModalCrear(false);
    setForm({ titulo: "", modulo: "Ventas", prioridad: "Media", descripcion: "" });
    cargar();
  };

  const abrirDetalle = (t) => {
    setDetalle(t);
    setRespuesta(t.respuesta || "");
    setNuevoEstado(t.estado || "Abierto");
  };

  const responderTicket = async () => {
    if (!detalle) return;
    setRespondiendo(true);
    const payload = { estado: nuevoEstado };
    if (esSuperadmin) {
      payload.respuesta = respuesta || null;
      payload.respondido_por = user.id;
      payload.fecha_respuesta = new Date().toISOString();
    }
    const { error } = await supabase.from("tickets_it").update(payload).eq("id", detalle.id);
    setRespondiendo(false);
    if (error) {
      Swal.fire({ icon: "error", title: "No se pudo actualizar", text: error.message, background: "#152235", color: "#fff" });
      return;
    }
    toast.success("Ticket actualizado.");
    setDetalle(null);
    cargar();
  };

  const ticketsFiltrados = tickets.filter((t) => {
    if (filtros.estado && t.estado !== filtros.estado) return false;
    if (filtros.prioridad && t.prioridad !== filtros.prioridad) return false;
    if (filtros.id_sucursal && String(t.id_sucursal) !== String(filtros.id_sucursal)) return false;
    return true;
  });

  const abiertos = tickets.filter((t) => t.estado === "Abierto").length;
  const enProceso = tickets.filter((t) => t.estado === "En proceso").length;
  const resueltos = tickets.filter((t) => ["Resuelto", "Cerrado"].includes(t.estado)).length;

  const fmtFecha = (f) => (f ? new Date(f).toLocaleString("es-NI") : "—");

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
        <StatsCards title="Tickets abiertos" icon={<Clock className="text-title" />} value={abiertos} color="orange" />
        <StatsCards title="En proceso" icon={<MessageSquare className="text-title" />} value={enProceso} color="blue" />
        <StatsCards title="Resueltos / cerrados" icon={<CheckCircle2 className="text-title" />} value={resueltos} color="green" />
      </div>

      <div className="erp-card mt-6 p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-3">
            <LifeBuoy className="text-title" />
            <div>
              <h3 className="text-title text-xl font-bold">Tickets de Soporte / IT</h3>
              <p className="text-subtitle text-sm">
                {esSuperadmin ? "Gestiona todos los tickets de soporte del sistema." : "Reporta problemas o solicitudes al equipo de soporte."}
              </p>
            </div>
          </div>
          <button onClick={() => setModalCrear(true)} className="btn-primary">
            <Plus size={18} /> Nuevo ticket
          </button>
        </div>

        {/* Filtros del superadmin */}
        {esSuperadmin && (
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <span className="text-subtitle text-sm flex items-center gap-1"><Filter size={15} /> Filtros:</span>
            <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5 text-sm">
              <option value="">Todos los estados</option>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filtros.prioridad} onChange={(e) => setFiltros({ ...filtros, prioridad: e.target.value })} className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5 text-sm">
              <option value="">Todas las prioridades</option>
              {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filtros.id_sucursal} onChange={(e) => setFiltros({ ...filtros, id_sucursal: e.target.value })} className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5 text-sm">
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="overflow-x-auto mt-5">
          <table className="erp-table w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-secondary/50">
                <th className="p-3 text-title font-semibold text-sm">Título</th>
                <th className="p-3 text-title font-semibold text-sm">Módulo</th>
                <th className="p-3 text-title font-semibold text-sm">Prioridad</th>
                {esSuperadmin && <th className="p-3 text-title font-semibold text-sm">Autor</th>}
                {esSuperadmin && <th className="p-3 text-title font-semibold text-sm">Sucursal</th>}
                <th className="p-3 text-title font-semibold text-sm">Estado</th>
                <th className="p-3 text-title font-semibold text-sm">Fecha</th>
                <th className="p-3 text-title font-semibold text-sm text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={esSuperadmin ? 8 : 6} className="p-4 text-center text-subtitle">Cargando tickets...</td></tr>
              )}
              {!isLoading && ticketsFiltrados.length === 0 && (
                <tr><td colSpan={esSuperadmin ? 8 : 6} className="p-4 text-center text-subtitle">No hay tickets para mostrar.</td></tr>
              )}
              {!isLoading && ticketsFiltrados.map((t) => (
                <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-3 text-title font-medium">{t.titulo}</td>
                  <td className="p-3 text-subtitle">{t.modulo}</td>
                  <td className="p-3"><span className={`badge ${BADGE_PRIORIDAD[t.prioridad] || "badge-neutral"}`}>{t.prioridad}</span></td>
                  {esSuperadmin && <td className="p-3 text-subtitle">{t.autor?.nombre_completo || "—"}</td>}
                  {esSuperadmin && <td className="p-3 text-subtitle">{t.sucursal?.nombre || "—"}</td>}
                  <td className="p-3"><span className={`badge ${BADGE_ESTADO[t.estado] || "badge-neutral"}`}>{t.estado}</span></td>
                  <td className="p-3 text-subtitle text-sm">{fmtFecha(t.created_at)}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => abrirDetalle(t)} className="btn-secondary text-sm">
                      {esSuperadmin ? "Gestionar" : "Ver"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear */}
      {modalCrear && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setModalCrear(false)}></div>
          <div className="relative z-10 bg-card text-title p-7 rounded-2xl w-full max-w-lg shadow-lg border border-secondary">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold">Nuevo ticket de soporte</h3>
              <button onClick={() => setModalCrear(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <form onSubmit={crearTicket} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Título *</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Resumen del problema" className="bg-input border border-secondary rounded-lg p-3" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Módulo *</label>
                  <select value={form.modulo} onChange={(e) => setForm({ ...form, modulo: e.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                    {MODULOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Prioridad *</label>
                  <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                    {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Descripción *</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={4} placeholder="Describe el problema o solicitud con detalle…" className="bg-input border border-secondary rounded-lg p-3 resize-none" />
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setModalCrear(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary disabled:opacity-50"><Send size={16} /> {guardando ? "Enviando..." : "Enviar ticket"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal detalle / gestión */}
      {detalle && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setDetalle(null)}></div>
          <div className="relative z-10 bg-card text-title p-7 rounded-2xl w-full max-w-lg shadow-lg border border-secondary max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{detalle.titulo}</h3>
              <button onClick={() => setDetalle(null)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`badge ${BADGE_PRIORIDAD[detalle.prioridad] || "badge-neutral"}`}>{detalle.prioridad}</span>
              <span className={`badge ${BADGE_ESTADO[detalle.estado] || "badge-neutral"}`}>{detalle.estado}</span>
              <span className="badge badge-neutral">{detalle.modulo}</span>
            </div>
            <div className="bg-input/60 border border-secondary rounded-lg p-3 mb-4">
              <p className="text-subtitle text-xs mb-1">Descripción</p>
              <p className="text-title text-sm whitespace-pre-wrap">{detalle.descripcion}</p>
            </div>
            <p className="text-subtitle text-xs mb-4">Creado: {fmtFecha(detalle.created_at)}</p>

            {/* Respuesta de soporte */}
            {esSuperadmin ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Estado</label>
                  <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                    {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Respuesta de soporte</label>
                  <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} placeholder="Escribe una respuesta…" className="bg-input border border-secondary rounded-lg p-3 resize-none" />
                </div>
                <div className="flex justify-end gap-3 mt-1">
                  <button onClick={() => setDetalle(null)} className="btn-secondary">Cerrar</button>
                  <button onClick={responderTicket} disabled={respondiendo} className="btn-primary disabled:opacity-50"><Send size={16} /> {respondiendo ? "Guardando..." : "Guardar"}</button>
                </div>
              </div>
            ) : (
              <div className="bg-input/60 border border-secondary rounded-lg p-3">
                <p className="text-subtitle text-xs mb-1">Respuesta de soporte</p>
                <p className="text-title text-sm whitespace-pre-wrap">{detalle.respuesta || "Aún sin respuesta. El equipo de soporte lo atenderá pronto."}</p>
                {detalle.fecha_respuesta && <p className="text-subtitle text-xs mt-2">Respondido: {fmtFecha(detalle.fecha_respuesta)}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
