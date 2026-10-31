// Mapa central de acceso por ruta según rol.
// El superadmin siempre tiene acceso a todo (no hace falta listarlo).
// Los roles se autorizan también en Supabase; este mapa solo controla la navegación.
// Si una ruta no está en el mapa, se asume solo-superadmin por seguridad.
export const ROUTE_ROLES = {
  // Ventas y atención
  ventas:            ["admin", "gerente", "cajero"],
  pedidosWeb:        ["admin", "gerente", "despacho"],
  impresiones:       ["admin", "gerente"],
  clientes:          ["admin", "gerente"],
  devoluciones:      ["admin", "gerente"],
  aperturaCierre:    ["admin", "gerente", "cajero"],
  asignacionCajas:   ["admin", "gerente"],

  // Inventario
  inventario:        ["admin", "gerente"],
  bodega:            ["admin", "gerente", "bodega"],
  proveedores:       ["admin", "gerente"],
  transferencias:    ["admin", "gerente", "bodega"],

  // Finanzas: administración de sucursal
  cajabancos:        ["admin"],
  activosFijos:      ["admin"],
  gastosFijos:       ["admin"],
  estadosFinancieros:["admin", "contador"],
  analisis:          ["admin"],
  proyecciones:      ["admin"],

  // Contabilidad: administración de sucursal
  planCuentas:       ["admin", "contador"],
  comprobantes:      ["admin", "contador"],
  libroMayor:        ["admin", "contador"],
  antiguedadSaldos:  ["admin"],
  conciliacionBancaria: ["admin"],
  periodosContables: ["admin"],
  configContable:    ["admin"],

  // Administración y reportes operativos
  personal:          ["admin"],
  recursosHumanos:   ["admin"],
  marketing:         ["admin"],
  reportes:          ["admin", "gerente"],

  // Soporte / cuenta
  kioscoAsistencia:  ["admin", "asistencia"],
  ticketsIT:         ["admin", "gerente", "cajero"],
  configuracion:     ["admin", "gerente", "cajero", "despacho"],

  // Solo superadmin (lista vacía → solo superadmin)
  empresas:          [],
  sucursales:        [],
  terminalesPOS:     [],
  usuarios:          ["admin"],
  auditoria:         [],
  vistaSucursales:   [],
};

export const puedeAcceder = (rol, path) => {
  if (rol === "superadmin") return true;
  const permitidos = ROUTE_ROLES[path];
  if (!permitidos) return false; // ruta desconocida → solo superadmin
  return !!rol && permitidos.includes(rol);
};

// Ruta de inicio según rol (a dónde redirigir tras login o acceso denegado).
export const rutaInicio = (rol) => {
  if (rol === "cajero") return "/dashboard/ventas";
  if (rol === "despacho") return "/dashboard/pedidosWeb";
  if (rol === "gerente") return "/dashboard/reportes";
  if (rol === "contador") return "/dashboard/comprobantes";
  if (rol === "bodega") return "/dashboard/bodega";
  if (rol === "asistencia") return "/dashboard/kioscoAsistencia";
  return "/dashboard/ventas";
};
