BEGIN;

GRANT SELECT, UPDATE ON public.empleados TO service_role;

COMMIT;
