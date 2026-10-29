// =====================================================================
// Helper de Auditoría (RF-22)
// Registra operaciones de los usuarios en la tabla `auditoria`.
// Uso:
//   import { registrarAuditoria } from "../utils/auditoria";
//   await registrarAuditoria(supabase, usuario, "CREAR", "Sucursales", "Creó sucursal X");
//
// `usuario` puede ser el objeto `perfil` del authcontext o el `user` de auth.
// Nunca lanza excepción: si falla, sólo registra en consola para no romper el flujo.
// =====================================================================

export async function registrarAuditoria(supabase, usuario, operacion, modulo, detalle = "") {
  try {
    const id_usuario = usuario?.id || null;
    const nombre_usuario =
      usuario?.nombre_completo || usuario?.email || "Desconocido";

    const { error } = await supabase.from("auditoria").insert([
      {
        id_usuario,
        nombre_usuario,
        operacion,
        modulo,
        detalle,
        ip: null, // La IP del cliente no está disponible de forma fiable en el navegador
      },
    ]);

    if (error) {
      console.error("Error registrando auditoría:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("Excepción en registrarAuditoria:", err);
    return { success: false, error: err.message };
  }
}
