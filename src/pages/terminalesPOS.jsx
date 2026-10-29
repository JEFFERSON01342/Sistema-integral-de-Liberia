import { useState, useEffect, useCallback } from "react";
import { Monitor, Plus, Pencil, Power, Save, X } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import { registrarAuditoria } from "../utils/auditoria";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const EMPRESA_ID = 1;

export default function TerminalesPOS() {
  const { perfil } = useAuth();
  const [terminales, setTerminales] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", numero_serie: "", id_sucursal: "" });

  const cargar = useCallback(async () => {
    setIsLoading(true);
    const [{ data: term }, { data: suc }] = await Promise.all([
      supabase
        .from("terminales_pos")
        .select("*, sucursal:sucursales(nombre)")
        .eq("id_empresa", EMPRESA_ID)
        .order("id", { ascending: true }),
      supabase.from("sucursales").select("id, nombre, estado").eq("id_empresa", EMPRESA_ID).eq("estado", true),
    ]);
    setTerminales(term || []);
    setSucursales(suc || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirNueva = () => {
    setEditando(null);
    setForm({ nombre: "", numero_serie: "", id_sucursal: "" });
    setIsModalOpen(true);
  };

  const abrirEditar = (t) => {
    setEditando(t);
    setForm({ nombre: t.nombre || "", numero_serie: t.numero_serie || "", id_sucursal: t.id_sucursal || "" });
    setIsModalOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return toast.error("El nombre es obligatorio.");
    if (!form.id_sucursal) return toast.error("Seleccione una sucursal.");
    const payload = {
      nombre: form.nombre,
      numero_serie: form.numero_serie,
      id_sucursal: Number(form.id_sucursal),
    };
    if (editando) {
      const { error } = await supabase.from("terminales_pos").update(payload).eq("id", editando.id);
      if (error) return toast.error("Error al actualizar: " + error.message);
      await registrarAuditoria(supabase, perfil, "EDITAR", "Terminales POS", `Editó terminal ${form.nombre}`);
      toast.success("Terminal actualizada.");
    } else {
      const { error } = await supabase.from("terminales_pos").insert([{ ...payload, estado: true, id_empresa: EMPRESA_ID }]);
      if (error) return toast.error("Error al crear: " + error.message);
      await registrarAuditoria(supabase, perfil, "CREAR", "Terminales POS", `Creó terminal ${form.nombre}`);
      toast.success("Terminal creada.");
    }
    setIsModalOpen(false);
    cargar();
  };

  const toggleEstado = async (t) => {
    const nuevo = !t.estado;
    const res = await Swal.fire({
      title: nuevo ? "¿Activar terminal?" : "¿Desactivar terminal?",
      text: t.nombre,
      icon: "question",
      background: "#1e1e1e",
      color: "#fff",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#ef4444",
      confirmButtonText: "Sí, confirmar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;
    const { error } = await supabase.from("terminales_pos").update({ estado: nuevo }).eq("id", t.id);
    if (error) return toast.error("Error: " + error.message);
    await registrarAuditoria(supabase, perfil, nuevo ? "ACTIVAR" : "DESACTIVAR", "Terminales POS", `${nuevo ? "Activó" : "Desactivó"} terminal ${t.nombre}`);
    cargar();
  };

  const activas = terminales.filter((t) => t.estado).length;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <StatsCards title={"Total Terminales"} icon={<Monitor className="text-title" />} value={terminales.length} />
        <StatsCards title={"Terminales Activas"} icon={<Monitor className="text-green-400" />} value={activas} />
        <StatsCards title={"Sucursales Activas"} icon={<Monitor className="text-blue-400" />} value={sucursales.length} />
      </div>

      <div className="mt-8 border border-secondary rounded-2xl p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title text-xl font-bold">Terminales POS</h3>
            <p className="text-subtitle text-s">Administra los puntos de venta por sucursal</p>
          </div>
          <button className="bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:scale-110 transition" onClick={abrirNueva}>
            <Plus /> Nueva Terminal
          </button>
        </div>

        <div className="mt-8 overflow-x-auto">
          {isLoading ? (
            <p className="text-title p-4 text-center">Cargando terminales...</p>
          ) : terminales.length === 0 ? (
            <p className="text-title p-4 text-center">No hay terminales registradas.</p>
          ) : (
            <table className="text-title w-full border-collapse">
              <thead>
                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                  <th className="py-3 px-2 text-center">#</th>
                  <th className="py-3 px-2 text-left">Terminal</th>
                  <th className="py-3 px-2 text-left">N° Serie</th>
                  <th className="py-3 px-2 text-left">Sucursal</th>
                  <th className="py-3 px-2 text-center">Estado</th>
                  <th className="py-3 px-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {terminales.map((t) => (
                  <tr key={t.id} className="border-t border-secondary text-sm hover:bg-secondary transition-colors">
                    <td className="py-3 px-2 text-center font-mono">{t.id}</td>
                    <td className="py-3 px-2 font-medium">{t.nombre}</td>
                    <td className="py-3 px-2 text-subtitle font-mono">{t.numero_serie || "—"}</td>
                    <td className="py-3 px-2 text-subtitle">{t.sucursal?.nombre || "—"}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.estado ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                        {t.estado ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="flex gap-3 justify-center">
                        <button onClick={() => abrirEditar(t)} className="text-blue-400 hover:text-blue-300" title="Editar"><Pencil size={18} /></button>
                        <button onClick={() => toggleEstado(t)} className={t.estado ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"} title={t.estado ? "Desactivar" : "Activar"}><Power size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-lg shadow-lg border border-secondary">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold">{editando ? "Editar Terminal" : "Nueva Terminal"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <form onSubmit={guardar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Caja 1" className="bg-input border border-secondary rounded-lg p-3" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Número de Serie</label>
                <input type="text" value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} placeholder="Ej: SN-00123" className="bg-input border border-secondary rounded-lg p-3" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Sucursal *</label>
                <select value={form.id_sucursal} onChange={(e) => setForm({ ...form, id_sucursal: e.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                  <option value="">Seleccione una sucursal</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-4 mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="cursor-pointer bg-secondary border border-secondary font-semibold py-2 px-6 rounded-lg hover:scale-105 transition">Cancelar</button>
                <button type="submit" className="cursor-pointer bg-button text-button font-semibold py-2 px-4 rounded-lg hover:scale-105 transition flex gap-2 items-center"><Save size={18} /> Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
