// Mapa central de acceso por ruta según rol.
// El superadmin siempre tiene acceso a todo (no hace falta listarlo).
// Los roles se autorizan también en Supabase; este mapa solo controla la navegación.
// Si una ruta no está en el mapa, se asume solo-superadmin por seguridad.
export const ROUTE_ROLES = {
  // Ventas y atención
  ventas:            ["admin", "gerente", "cajero", "vendedor"],
  pedidosWeb:        ["admin", "gerente", "despacho", "vendedor"],
  impresiones:       ["admin", "gerente", "vendedor"],
  clientes:          ["admin", "gerente", "vendedor"],
  devoluciones:      ["admin", "gerente", "vendedor"],
  aperturaCierre:    ["admin", "gerente", "cajero"],
  asignacionCajas:   ["admin", "gerente"],

  // Inventario
  inventario:        ["admin", "gerente", "vendedor"],
  proveedores:       ["admin", "gerente", "vendedor"],
  transferencias:    ["admin", "gerente"],

  // Finanzas
  cajabancos:        ["admin", "gerente", "vendedor"],
  activosFijos:      ["admin", "gerente", "vendedor"],
  gastosFijos:       ["admin", "gerente", "vendedor"],
  estadosFinancieros:["admin", "gerente", "vendedor"],
  analisis:          ["admin", "gerente", "vendedor"],
  proyecciones:      ["admin", "gerente", "vendedor"],

  // Contabilidad
  planCuentas:       ["admin", "gerente", "vendedor"],
  comprobantes:      ["admin", "gerente", "vendedor"],
  libroMayor:        ["admin", "gerente", "vendedor"],
  antiguedadSaldos:  ["admin", "gerente", "vendedor"],
  conciliacionBancaria: ["admin", "gerente"],
  periodosContables: ["admin", "gerente"],
  configContable:    ["admin", "gerente"],

  // RRHH / Marketing / Reportes
  personal:          ["admin", "gerente", "vendedor"],
  recursosHumanos:   ["admin", "gerente", "vendedor"],
  marketing:         ["admin", "gerente", "vendedor"],
  reportes:          ["admin", "gerente", "vendedor"],

  // Soporte / cuenta (todo el staff)
  ticketsIT:         ["admin", "gerente", "cajero", "despacho", "vendedor"],
  configuracion:     ["admin", "gerente", "cajero", "despacho", "vendedor"],

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
  return "/dashboard/ventas";
};
