import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Pencil, Power, MapPin, Phone, Save, X } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const EMPTY_FORM = { codigo: "", nombre: "", direccion: "", telefono: "" };

export default function Sucursales() {
  const { perfil, rol } = useAuth();
  const esSuperadmin = rol === "superadmin";
  const [sucursales, setSucursales] = useState([]);
  const [conteoPersonal, setConteoPersonal] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    if (!perfil?.id_empresa) {
      toast.error("El perfil no tiene una empresa asignada.");
      return;
    }

    setIsLoading(true);
    const [{ data, error }, { data: perfiles, error: perfilesError }] = await Promise.all([
      supabase
        .from("sucursales")
        .select("id_sucursal, codigo, nombre, direccion, telefono, es_principal, activa")
        .eq("id_empresa", perfil.id_empresa)
        .order("id_sucursal", { ascending: true }),
      supabase
        .from("perfiles")
        .select("id_sucursal")
        .eq("id_empresa", perfil.id_empresa)
        .neq("rol", "cliente"),
    ]);

    if (error) {
      toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
      setIsLoading(false);
      return;
    }
    if (perfilesError) {
      toast.error(`No se pudo cargar el personal: ${perfilesError.message}`);
      setIsLoading(false);
      return;
    }

    const conteos = {};
    for (const usuario of perfiles || []) {
      if (usuario.id_sucursal != null) {
        conteos[usuario.id_sucursal] = (conteos[usuario.id_sucursal] || 0) + 1;
      }
    }
    setSucursales(data || []);
    setConteoPersonal(conteos);
    setIsLoading(false);
  }, [perfil?.id_empresa]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirNueva = () => {
    setEditando(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const abrirEditar = (sucursal) => {
    setEditando(sucursal);
    setForm({
      codigo: sucursal.codigo || "",
      nombre: sucursal.nombre || "",
      direccion: sucursal.direccion || "",
      telefono: sucursal.telefono || "",
    });
    setIsModalOpen(true);
  };

  const guardar = async (event) => {
    event.preventDefault();
    const codigo = form.codigo.trim().toUpperCase();
    const nombre = form.nombre.trim();
    if (!nombre) return toast.error("El nombre es obligatorio.");
    if (!editando && !/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(codigo)) {
      return toast.error("El código debe tener de 2 a 20 caracteres: letras, números, guion o guion bajo.");
    }

    if (editando) {
      const { error } = await supabase
        .from("sucursales")
        .update({
          nombre,
          direccion: form.direccion.trim() || null,
          telefono: form.telefono.trim() || null,
        })
        .eq("id_sucursal", editando.id_sucursal);
      if (error) return toast.error(`No se pudo actualizar la sucursal: ${error.message}`);
      toast.success("Sucursal actualizada.");
    } else {
      const { error } = await supabase.rpc("provisionar_sucursal_completa", {
        p_id_empresa: perfil?.id_empresa,
        p_codigo: codigo,
        p_nombre: nombre,
        p_direccion: form.direccion.trim() || null,
        p_telefono: form.telefono.trim() || null,
      });
      if (error) return toast.error(`No se pudo crear la sucursal: ${error.message}`);
      toast.success("Sucursal creada con bodega, ubicaciones y caja iniciales.");
    }

    setIsModalOpen(false);
    await cargar();
  };

  const toggleEstado = async (sucursal) => {
    const nuevoEstado = !sucursal.activa;
    const resultado = await Swal.fire({
      title: nuevoEstado ? "¿Activar sucursal?" : "¿Desactivar sucursal?",
      text: sucursal.nombre,
      icon: "question",
      background: "#1e1e1e",
      color: "#fff",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#ef4444",
      confirmButtonText: "Sí, confirmar",
      cancelButtonText: "Cancelar",
    });
    if (!resultado.isConfirmed) return;

    const { error } = await supabase
      .from("sucursales")
      .update({ activa: nuevoEstado })
      .eq("id_sucursal", sucursal.id_sucursal);
    if (error) return toast.error(`No se pudo cambiar el estado: ${error.message}`);
    toast.success(nuevoEstado ? "Sucursal activada." : "Sucursal desactivada.");
    await cargar();
  };

  const activas = sucursales.filter((sucursal) => sucursal.activa).length;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <StatsCards title="Total Sucursales" icon={<Building2 className="text-title" />} value={sucursales.length} />
        <StatsCards title="Sucursales Activas" icon={<Building2 className="text-green-400" />} value={activas} />
        <StatsCards title="Sucursales Inactivas" icon={<Building2 className="text-red-400" />} value={sucursales.length - activas} />
      </div>

      <div className="mt-8 border border-secondary rounded-2xl p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title text-xl font-bold">Gestión de Sucursales</h3>
            <p className="text-subtitle text-sm">Cada sucursal nueva recibe su configuración operativa inicial.</p>
          </div>
          {esSuperadmin && (
            <button
              className="bg-button text-button flex h-10 gap-3 p-2 rounded-xl items-center cursor-pointer"
              onClick={abrirNueva}
            >
              <Plus /> Nueva Sucursal
            </button>
          )}
        </div>

        <div className="mt-8 overflow-x-auto">
          {isLoading ? (
            <p className="text-title p-4 text-center">Cargando sucursales...</p>
          ) : sucursales.length === 0 ? (
            <p className="text-title p-4 text-center">No hay sucursales registradas.</p>
          ) : (
            <table className="text-title w-full border-collapse">
              <thead>
                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                  <th className="py-3 px-2 text-center">Código</th>
                  <th className="py-3 px-2 text-left">Nombre</th>
                  <th className="py-3 px-2 text-left">Dirección</th>
                  <th className="py-3 px-2 text-left">Teléfono</th>
                  <th className="py-3 px-2 text-center">Personal</th>
                  <th className="py-3 px-2 text-center">Estado</th>
                  {esSuperadmin && <th className="py-3 px-2 text-center">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {sucursales.map((sucursal) => (
                  <tr key={sucursal.id_sucursal} className="border-t border-secondary text-sm hover:bg-secondary transition-colors">
                    <td className="py-3 px-2 text-center font-mono">{sucursal.codigo}</td>
                    <td className="py-3 px-2 font-medium">
                      {sucursal.nombre}{sucursal.es_principal ? " (Principal)" : ""}
                    </td>
                    <td className="py-3 px-2 text-subtitle">{sucursal.direccion || "—"}</td>
                    <td className="py-3 px-2 text-subtitle">{sucursal.telefono || "—"}</td>
                    <td className="py-3 px-2 text-center text-subtitle">{conteoPersonal[sucursal.id_sucursal] || 0}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${sucursal.activa ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                        {sucursal.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    {esSuperadmin && (
                      <td className="py-3 px-2 text-center">
                        <div className="flex gap-3 justify-center">
                          <button onClick={() => abrirEditar(sucursal)} className="text-blue-400 hover:text-blue-300" title="Editar">
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => toggleEstado(sucursal)}
                            className={sucursal.activa ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"}
                            title={sucursal.activa ? "Desactivar" : "Activar"}
                            disabled={sucursal.es_principal}
                          >
                            <Power size={18} />
                          </button>
                        </div>
                      </td>
                    )}
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
              <h3 className="text-2xl font-semibold">{editando ? "Editar Sucursal" : "Nueva Sucursal"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <form onSubmit={guardar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Código *</label>
                <input
                  type="text"
                  value={form.codigo}
                  onChange={(event) => setForm({ ...form, codigo: event.target.value })}
                  placeholder="Ej: SUC-02"
                  className="bg-input border border-secondary rounded-lg p-3"
                  disabled={Boolean(editando)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                  placeholder="Ej: Sucursal Centro"
                  className="bg-input border border-secondary rounded-lg p-3"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium flex items-center gap-2"><MapPin size={16} /> Dirección</label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(event) => setForm({ ...form, direccion: event.target.value })}
                  placeholder="Dirección"
                  className="bg-input border border-secondary rounded-lg p-3"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium flex items-center gap-2"><Phone size={16} /> Teléfono</label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(event) => setForm({ ...form, telefono: event.target.value })}
                  placeholder="8585-8585"
                  className="bg-input border border-secondary rounded-lg p-3"
                />
              </div>
              {!editando && (
                <p className="text-xs text-subtitle">
                  Se crearán una bodega, cuatro ubicaciones y una caja inicial. No se abrirá la caja ni se asignará personal automáticamente.
                </p>
              )}
              <div className="flex justify-end gap-4 mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-secondary border border-secondary font-semibold py-2 px-6 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="bg-button text-button font-semibold py-2 px-4 rounded-lg flex gap-2 items-center">
                  <Save size={18} /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
