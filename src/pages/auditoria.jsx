import { useState, useEffect, useCallback, useMemo } from "react";
import { ScrollText, Filter, RefreshCw } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import StatsCards from "../components/statscards";
import { format } from "date-fns/format";

export default function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filtros, setFiltros] = useState({ desde: "", hasta: "", modulo: "", usuario: "" });

  const cargar = useCallback(async () => {
    setIsLoading(true);
    let query = supabase.from("auditoria").select("*").order("created_at", { ascending: false }).limit(500);
    if (filtros.desde) query = query.gte("created_at", `${filtros.desde}T00:00:00`);
    if (filtros.hasta) query = query.lte("created_at", `${filtros.hasta}T23:59:59`);
    if (filtros.modulo) query = query.eq("modulo", filtros.modulo);
    if (filtros.usuario) query = query.ilike("nombre_usuario", `%${filtros.usuario}%`);
    const { data, error } = await query;
    if (error) console.error("Error cargando auditoría:", error.message);
    setRegistros(data || []);
    setIsLoading(false);
  }, [filtros]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const modulos = useMemo(() => {
    const set = new Set(registros.map((r) => r.modulo).filter(Boolean));
    return Array.from(set).sort();
  }, [registros]);

  const limpiar = () => setFiltros({ desde: "", hasta: "", modulo: "", usuario: "" });

  const badgeColor = (op) => {
    if (!op) return "bg-secondary text-title";
    const o = op.toUpperCase();
    if (o.includes("CREAR") || o.includes("ABRIR") || o.includes("ACTIVAR")) return "bg-green-600/20 text-green-400";
    if (o.includes("EDITAR")) return "bg-blue-600/20 text-blue-400";
    if (o.includes("ELIMINAR") || o.includes("DESACTIVAR") || o.includes("CERRAR")) return "bg-red-600/20 text-red-400";
    return "bg-yellow-600/20 text-yellow-400";
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <StatsCards title={"Registros"} icon={<ScrollText className="text-title" />} value={registros.length} />
        <StatsCards title={"Módulos Auditados"} icon={<ScrollText className="text-blue-400" />} value={modulos.length} />
        <StatsCards title={"Registros Hoy"} icon={<ScrollText className="text-green-400" />} value={registros.filter((r) => format(new Date(r.created_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")).length} />
      </div>

      <div className="mt-8 border border-secondary rounded-2xl p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title text-xl font-bold">Registro de Auditoría</h3>
            <p className="text-subtitle text-s">Historial de operaciones del sistema (solo lectura)</p>
          </div>
          <button onClick={cargar} className="bg-button text-button flex flex-row h-10 gap-2 p-2 rounded-xl items-center cursor-pointer hover:scale-110 transition">
            <RefreshCw size={18} /> Actualizar
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end bg-secondary/30 rounded-xl p-4 mb-6 border border-secondary">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-subtitle flex items-center gap-1"><Filter size={12} /> Desde</label>
            <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className="bg-input border border-secondary rounded-lg p-2 text-title" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-subtitle">Hasta</label>
            <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className="bg-input border border-secondary rounded-lg p-2 text-title" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-subtitle">Módulo</label>
            <select value={filtros.modulo} onChange={(e) => setFiltros({ ...filtros, modulo: e.target.value })} className="bg-input border border-secondary rounded-lg p-2 text-title">
              <option value="">Todos</option>
              {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-subtitle">Usuario</label>
            <input type="text" value={filtros.usuario} onChange={(e) => setFiltros({ ...filtros, usuario: e.target.value })} placeholder="Nombre..." className="bg-input border border-secondary rounded-lg p-2 text-title" />
          </div>
          <button onClick={limpiar} className="bg-secondary border border-secondary text-title font-semibold py-2 px-4 rounded-lg hover:scale-105 transition">Limpiar</button>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="text-title p-4 text-center">Cargando registros...</p>
          ) : registros.length === 0 ? (
            <p className="text-title p-4 text-center">No hay registros de auditoría.</p>
          ) : (
            <table className="text-title w-full border-collapse">
              <thead>
                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                  <th className="py-3 px-2 text-left">Fecha/Hora</th>
                  <th className="py-3 px-2 text-left">Usuario</th>
                  <th className="py-3 px-2 text-center">Operación</th>
                  <th className="py-3 px-2 text-left">Módulo</th>
                  <th className="py-3 px-2 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-t border-secondary text-sm hover:bg-secondary transition-colors">
                    <td className="py-3 px-2 whitespace-nowrap">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</td>
                    <td className="py-3 px-2 font-medium">{r.nombre_usuario || "—"}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeColor(r.operacion)}`}>{r.operacion}</span>
                    </td>
                    <td className="py-3 px-2">{r.modulo}</td>
                    <td className="py-3 px-2 text-subtitle">{r.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
