import { useState, useEffect, useCallback, useMemo } from "react";
import { Users, Plus, Pencil, Save, X, Mail, ShieldCheck, Filter } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";

const SUPERADMIN_ROLES = [
  { value: "admin", label: "Administrador de sucursal" },
  { value: "gerente", label: "Gerente" },
  { value: "contador", label: "Contador" },
  { value: "bodega", label: "Supervisor de Bodega" },
  { value: "cajero", label: "Cajero" },
  { value: "despacho", label: "Despacho" },
  { value: "asistencia", label: "Kiosco de asistencia" },
];

const ADMIN_ROLES = SUPERADMIN_ROLES.filter(({ value }) => (
  value !== "admin" && value !== "asistencia"
));

const ROL_LABEL = {
  superadmin: "Super Administrador",
  admin: "Administrador de sucursal",
  gerente: "Gerente",
  contador: "Contador",
  bodega: "Supervisor de Bodega",
  cajero: "Cajero",
  despacho: "Despacho",
  asistencia: "Kiosco de asistencia",
};

const EMPTY_FORM = { email: "", rol: "cajero", id_sucursal: "" };

export default function Usuarios() {
  const { perfil, rol } = useAuth();
  const esSuperadmin = rol === "superadmin";
  const rolesDisponibles = esSuperadmin ? SUPERADMIN_ROLES : ADMIN_ROLES;
  const [usuarios, setUsuarios] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    if (!perfil?.id_empresa) {
      toast.error("El perfil no tiene una empresa asignada.");
      return;
    }

    setIsLoading(true);
    const [{ data: perfiles, error: perfilesError }, { data: branches, error: branchesError }] = await Promise.all([
      supabase
        .from("perfiles")
        .select("id, nombre_completo, email, rol, id_sucursal, activo, created_at")
        .eq("id_empresa", perfil.id_empresa)
        .neq("rol", "cliente")
        .order("created_at", { ascending: false }),
      supabase
        .from("sucursales")
        .select("id_sucursal, nombre")
        .eq("id_empresa", perfil.id_empresa)
        .order("nombre"),
    ]);

    if (perfilesError || branchesError) {
      const error = perfilesError || branchesError;
      toast.error(`No se pudo cargar la configuración de personal: ${error.message}`);
      setIsLoading(false);
      return;
    }
    setUsuarios(perfiles || []);
    setSucursales(branches || []);
    setIsLoading(false);
  }, [perfil?.id_empresa]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const usuariosFiltrados = useMemo(() => usuarios.filter((usuario) => (
    (!filtroRol || usuario.rol === filtroRol)
    && (!filtroSucursal || String(usuario.id_sucursal) === filtroSucursal)
  )), [usuarios, filtroRol, filtroSucursal]);

  const nombreSucursal = (idSucursal) => (
    sucursales.find((sucursal) => sucursal.id_sucursal === idSucursal)?.nombre || "—"
  );

  const abrirNuevo = () => {
    setEditando(null);
    setForm({
      ...EMPTY_FORM,
      id_sucursal: esSuperadmin ? "" : String(perfil?.id_sucursal || ""),
    });
    setIsModalOpen(true);
  };

  const abrirEditar = (usuario) => {
    setEditando(usuario);
    setForm({
      email: usuario.email || "",
      rol: usuario.rol,
      id_sucursal: String(usuario.id_sucursal || ""),
    });
    setIsModalOpen(true);
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (!perfil?.id_empresa) return toast.error("El perfil no tiene una empresa asignada.");

    const email = form.email.trim().toLowerCase();
    const idSucursal = esSuperadmin ? Number(form.id_sucursal) : Number(perfil?.id_sucursal);
    if (!email) return toast.error("El correo de la cuenta registrada es obligatorio.");
    if (!idSucursal) return toast.error("Seleccione una sucursal.");
    if (!rolesDisponibles.some((opcion) => opcion.value === form.rol)) {
      return toast.error("No tienes permiso para asignar ese rol.");
    }

    setGuardando(true);
    const { error } = await supabase.rpc("asignar_usuario_sucursal", {
      p_email: email,
      p_id_empresa: perfil.id_empresa,
      p_id_sucursal: idSucursal,
      p_rol: form.rol,
    });
    setGuardando(false);
    if (error) return toast.error(`No se pudo asignar el acceso: ${error.message}`);

    toast.success("Acceso de sucursal actualizado.");
    setIsModalOpen(false);
    await cargar();
  };

  const usuariosActivos = usuarios.filter((usuario) => usuario.activo !== false).length;
  const personalSucursal = usuarios.filter((usuario) => (
    !perfil?.id_sucursal || usuario.id_sucursal === perfil.id_sucursal
  )).length;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCards title="Personal asignado" color="blue" icon={<Users size={22} />} value={usuarios.length} />
        <StatsCards title="Personal activo" color="green" icon={<Users size={22} />} value={usuariosActivos} />
        <StatsCards title="Personal de mi sucursal" color="purple" icon={<ShieldCheck size={22} />} value={personalSucursal} />
      </div>

      <div className="erp-card mt-6 p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title text-xl font-bold">Accesos del personal</h3>
            <p className="text-subtitle text-sm">
              Asigna roles a cuentas registradas y con correo confirmado. Las contraseñas se gestionan desde Supabase Auth.
            </p>
          </div>
          <button className="btn-primary" onClick={abrirNuevo}>
            <Plus size={18} /> Asignar acceso
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <div className="flex items-center gap-2 text-subtitle text-sm">
            <Filter size={16} /> Filtrar:
          </div>
          <select value={filtroRol} onChange={(event) => setFiltroRol(event.target.value)} className="bg-input border border-secondary rounded-lg px-3 py-2 text-sm">
            <option value="">Todos los roles</option>
            {Object.entries(ROL_LABEL).filter(([value]) => value !== "superadmin").map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={filtroSucursal} onChange={(event) => setFiltroSucursal(event.target.value)} className="bg-input border border-secondary rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las sucursales</option>
            {sucursales.map((sucursal) => (
              <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
            ))}
          </select>
        </div>

        <div className="mt-5 overflow-x-auto">
          {isLoading ? (
            <p className="text-title p-4 text-center">Cargando personal...</p>
          ) : usuariosFiltrados.length === 0 ? (
            <p className="text-subtitle p-4 text-center">No hay personal que coincida con los filtros.</p>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th className="text-center">Rol</th>
                  <th>Sucursal</th>
                  <th className="text-center">Estado de acceso</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id}>
                    <td className="font-medium">{usuario.nombre_completo || "—"}</td>
                    <td className="text-blue-400">{usuario.email || "—"}</td>
                    <td className="text-center">
                      <span className="badge badge-neutral">{ROL_LABEL[usuario.rol] || usuario.rol}</span>
                    </td>
                    <td className="text-subtitle">{nombreSucursal(usuario.id_sucursal)}</td>
                    <td className="text-center">
                      <span className={`badge ${usuario.activo ? "badge-success" : "badge-danger"}`}>
                        {usuario.activo ? "Activo" : "Desactivado"}
                      </span>
                    </td>
                    <td className="text-center">
                      {usuario.rol !== "superadmin" && (
                        <button onClick={() => abrirEditar(usuario)} className="text-blue-400 hover:text-blue-300" title="Cambiar rol o sucursal">
                          <Pencil size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative z-10 bg-card text-title p-7 rounded-2xl w-full max-w-lg shadow-2xl border border-secondary">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">{editando ? "Actualizar acceso" : "Asignar acceso a personal"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>
            <form onSubmit={guardar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold flex items-center gap-2"><Mail size={16} /> Correo registrado *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="persona@correo.com"
                  className="bg-input border border-secondary rounded-lg p-3"
                  disabled={Boolean(editando)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold">Rol *</label>
                <select value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value })} className="bg-input border border-secondary rounded-lg p-3">
                  {rolesDisponibles.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                  ))}
                </select>
              </div>
              {esSuperadmin ? (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">Sucursal *</label>
                  <select value={form.id_sucursal} onChange={(event) => setForm({ ...form, id_sucursal: event.target.value })} className="bg-input border border-secondary rounded-lg p-3" required>
                    <option value="">Seleccione una sucursal</option>
                    {sucursales.map((sucursal) => (
                      <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-subtitle">El acceso quedará limitado a tu sucursal: {nombreSucursal(perfil?.id_sucursal)}.</p>
              )}
              <p className="text-xs text-subtitle">
                La persona debe crear su cuenta y confirmar su correo antes de esta asignación. Este panel nunca recibe ni almacena su contraseña.
              </p>
              <div className="flex justify-end gap-3 mt-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary disabled:opacity-50">
                  <Save size={18} /> {guardando ? "Guardando..." : "Guardar acceso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
