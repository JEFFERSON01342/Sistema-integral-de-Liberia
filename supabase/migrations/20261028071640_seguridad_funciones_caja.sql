-- Refuerza los permisos de las funciones de caja para retirar los grants
-- predeterminados de Supabase a anon, authenticated y service_role.

BEGIN;

REVOKE ALL ON FUNCTION public.puede_ver_caja(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.puede_operar_caja(integer, integer, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_ver_caja(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_operar_caja(integer, integer, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.proteger_caja_con_sesiones()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.proteger_movimiento_caja_inmutable()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.abrir_sesion_caja(bigint, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_movimiento_caja(bigint, text, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cerrar_sesion_caja_interno(bigint, numeric, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cerrar_sesion_caja(bigint, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cerrar_sesion_caja_excepcional(bigint, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.abrir_sesion_caja(bigint, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_caja(bigint, text, numeric, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_caja(bigint, numeric, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_caja_excepcional(bigint, numeric, text)
  TO authenticated;

COMMIT;
