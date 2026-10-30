BEGIN;

REVOKE ALL ON FUNCTION public.puede_transferir_inventario(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
