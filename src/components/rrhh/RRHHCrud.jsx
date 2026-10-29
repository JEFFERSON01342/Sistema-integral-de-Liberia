import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil, Trash2, Save, X, Search } from "lucide-react";
import { supabase } from "../../supabase/supabaseclient";
import { registrarAuditoria } from "../../utils/auditoria";
import { fmtCordoba } from "../../utils/nominaNicaragua";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

// ============================================================
// Componente CRUD genérico para las secciones operativas de RRHH
// (Contratos, Vacaciones/Permisos, Seguridad e Higiene, Marco Legal,
//  Cumplimiento). Se configura mediante props: tabla, campos y columnas.
// ============================================================

const BADGE_COLORS = {
  // estados positivos
  vigente: "bg-green-600/20 text-green-400",
  aprobado: "bg-green-600/20 text-green-400",
  gozado: "bg-blue-600/20 text-blue-400",
  presentado: "bg-green-600/20 text-green-400",
  cerrado: "bg-green-600/20 text-green-400",
  // en proceso
  solicitado: "bg-amber-600/20 text-amber-400",
  en_proceso: "bg-amber-600/20 text-amber-400",
  pendiente: "bg-amber-600/20 text-amber-400",
  por_renovar: "bg-amber-600/20 text-amber-400",
  abierto: "bg-amber-600/20 text-amber-400",
  suspendido: "bg-amber-600/20 text-amber-400",
  // negativos
  rechazado: "bg-red-600/20 text-red-400",
  vencido: "bg-red-600/20 text-red-400",
  finalizado: "bg-slate-500/20 text-slate-300",
  rescindido: "bg-red-600/20 text-red-400",
  // severidad
  baja: "bg-green-600/20 text-green-400",
  media: "bg-amber-600/20 text-amber-400",
  alta: "bg-red-600/20 text-red-400",
};

const pretty = (v) => (v == null ? "—" : String(v).replace(/_/g, " "));

export default function RRHHCrud({
  titulo,
  subtitulo,
  tabla,
  pk = "id",
  empresaId,
  idSucursalFiltro,
  empleados = [],
  campos = [],
  columnas = [],
  perfil,
  moduloAuditoria = "Recursos Humanos",
  ordenarPor = "created_at",
  puedeEditar = true,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({});

  const nombreEmpleado = (id) =>
    empleados.find((e) => String(e.id_empleado) === String(id))?.nombre_completo || "—";

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    let query = supabase.from(tabla).select("*").eq("id_empresa", empresaId);
    if (idSucursalFiltro) query = query.eq("id_sucursal", idSucursalFiltro);
    const { data, error } = await query.order(ordenarPor, { ascending: false });
    if (error) {
      console.error(`Error cargando ${tabla}:`, error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [tabla, empresaId, idSucursalFiltro, ordenarPor]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const valoresIniciales = () => {
    const base = {};
    campos.forEach((c) => {
      base[c.name] = c.default !== undefined ? c.default : "";
    });
    return base;
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm(valoresIniciales());
    setModalOpen(true);
  };

  const abrirEditar = (row) => {
    setEditando(row);
    const f = {};
    campos.forEach((c) => {
      let v = row[c.name];
      if (c.type === "date" && v) v = String(v).slice(0, 10);
      f[c.name] = v ?? "";
    });
    setForm(f);
    setModalOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    // Validaciones mínimas
    for (const c of campos) {
      if (c.required && (form[c.name] === "" || form[c.name] == null)) {
        return toast.error(`El campo "${c.label}" es obligatorio.`);
      }
    }
    setGuardando(true);
    try {
      const payload = { id_empresa: empresaId };
      if (idSucursalFiltro) payload.id_sucursal = idSucursalFiltro;
      campos.forEach((c) => {
        let v = form[c.name];
        if (v === "") v = null;
        if ((c.type === "number" || c.type === "money") && v != null) v = Number(v);
        if (c.type === "empleado" && v != null) v = Number(v);
        payload[c.name] = v;
      });

      if (editando) {
        const { error } = await supabase.from(tabla).update(payload).eq(pk, editando[pk]);
        if (error) throw error;
        await registrarAuditoria(supabase, perfil, "EDITAR", moduloAuditoria, `Editó registro en ${titulo} (#${editando[pk]})`);
        toast.success("Registro actualizado.");
      } else {
        const { error } = await supabase.from(tabla).insert(payload);
        if (error) throw error;
        await registrarAuditoria(supabase, perfil, "CREAR", moduloAuditoria, `Creó registro en ${titulo}`);
        toast.success("Registro creado.");
      }
      setModalOpen(false);
      cargar();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (row) => {
    const res = await Swal.fire({
      title: "¿Eliminar registro?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      background: "#1e1e1e",
      color: "#fff",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;
    const { error } = await supabase.from(tabla).delete().eq(pk, row[pk]);
    if (error) return toast.error("Error: " + error.message);
    await registrarAuditoria(supabase, perfil, "ELIMINAR", moduloAuditoria, `Eliminó registro de ${titulo} (#${row[pk]})`);
    toast.success("Registro eliminado.");
    cargar();
  };

  const renderCelda = (row, col) => {
    const val = row[col.name];
    if (col.render) return col.render(row, { nombreEmpleado, fmtCordoba });
    if (col.type === "empleado") return nombreEmpleado(val);
    if (col.type === "money") return fmtCordoba(Number(val) || 0);
    if (col.type === "date") return val ? new Date(val).toLocaleDateString("es-NI", { timeZone: "UTC" }) : "—";
    if (col.type === "badge") {
      const cls = BADGE_COLORS[val] || "bg-secondary text-title";
      return <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${cls}`}>{pretty(val)}</span>;
    }
    return pretty(val);
  };

  const filtradas = rows.filter((r) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return columnas.some((c) => {
      const raw = c.type === "empleado" ? nombreEmpleado(r[c.name]) : r[c.name];
      return String(raw ?? "").toLowerCase().includes(q);
    });
  });

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-title text-xl font-bold">{titulo}</h3>
          {subtitulo && <p className="text-subtitle text-s">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtitle" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" className="bg-input border border-secondary rounded-xl pl-9 pr-3 py-2 text-sm text-title w-44" />
          </div>
          {puedeEditar && (
            <button onClick={abrirNuevo} className="bg-button text-button flex flex-row h-10 gap-2 px-3 rounded-xl items-center cursor-pointer hover:scale-105 transition">
              <Plus size={18} /> Nuevo
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        {loading ? (
          <p className="p-4 text-center text-subtitle">Cargando…</p>
        ) : filtradas.length === 0 ? (
          <p className="p-4 text-center text-subtitle">No hay registros.</p>
        ) : (
          <table className="min-w-[760px] w-full text-title text-sm">
            <thead className="bg-secondary/10">
              <tr className="border-b border-secondary/50 text-xs font-semibold text-subtitle">
                {columnas.map((c) => (
                  <th key={c.name} className={`py-3 px-3 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>{c.label}</th>
                ))}
                {puedeEditar && <th className="py-3 px-3 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((row) => (
                <tr key={row[pk]} className="border-t border-secondary hover:bg-secondary/10 transition-colors">
                  {columnas.map((c) => (
                    <td key={c.name} className={`py-3 px-3 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>{renderCelda(row, c)}</td>
                  ))}
                  {puedeEditar && (
                    <td className="py-3 px-3 text-center">
                      <div className="flex gap-3 justify-center">
                        <button onClick={() => abrirEditar(row)} className="text-blue-400 hover:text-blue-300" title="Editar"><Pencil size={17} /></button>
                        <button onClick={() => eliminar(row)} className="text-red-400 hover:text-red-300" title="Eliminar"><Trash2 size={17} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-[9999] backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setModalOpen(false)}></div>
          <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-lg shadow-lg border border-secondary max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold">{editando ? "Editar" : "Nuevo"} — {titulo}</h3>
              <button onClick={() => setModalOpen(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campos.map((c) => (
                <div key={c.name} className={`flex flex-col gap-2 ${c.full ? "sm:col-span-2" : ""}`}>
                  <label className="text-sm font-medium">{c.label} {c.required && "*"}</label>
                  {c.type === "textarea" ? (
                    <textarea value={form[c.name] ?? ""} onChange={(e) => setForm({ ...form, [c.name]: e.target.value })} rows={2} className="bg-input border border-secondary rounded-lg p-3 text-sm" />
                  ) : c.type === "select" ? (
                    <select value={form[c.name] ?? ""} onChange={(e) => setForm({ ...form, [c.name]: e.target.value })} className="bg-input border border-secondary rounded-lg p-3 text-sm">
                      <option value="">Seleccione…</option>
                      {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : c.type === "empleado" ? (
                    <select value={form[c.name] ?? ""} onChange={(e) => setForm({ ...form, [c.name]: e.target.value })} className="bg-input border border-secondary rounded-lg p-3 text-sm">
                      <option value="">{c.required ? "Seleccione empleado…" : "— (ninguno) —"}</option>
                      {empleados.map((e) => <option key={e.id_empleado} value={e.id_empleado}>{e.nombre_completo}</option>)}
                    </select>
                  ) : (
                    <input
                      type={c.type === "money" ? "number" : c.type}
                      step={c.type === "money" || c.type === "number" ? "any" : undefined}
                      value={form[c.name] ?? ""}
                      onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}
                      className="bg-input border border-secondary rounded-lg p-3 text-sm [&::-webkit-calendar-picker-indicator]:invert"
                    />
                  )}
                </div>
              ))}
              <div className="sm:col-span-2 flex justify-end gap-4 mt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="cursor-pointer bg-secondary border border-secondary font-semibold py-2 px-6 rounded-lg hover:scale-105 transition">Cancelar</button>
                <button type="submit" disabled={guardando} className="cursor-pointer bg-button text-button font-semibold py-2 px-4 rounded-lg hover:scale-105 transition flex gap-2 items-center disabled:opacity-50"><Save size={18} /> {guardando ? "Guardando…" : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
