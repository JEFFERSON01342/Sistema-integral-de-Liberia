-- Mantiene al contador fuera de políticas de lectura operativa por sucursal.
BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_sucursal(
  p_id_empresa integer,
  p_id_sucursal integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_id_empresa IS NOT NULL
     AND p_id_sucursal IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.perfiles AS p
       WHERE p.id = (SELECT auth.uid())
         AND p.activo
         AND p.rol IN ('superadmin', 'admin', 'gerente', 'cajero', 'despacho')
         AND (
           p.rol = 'superadmin'
           OR (
             p.id_empresa = p_id_empresa
             AND p.id_sucursal = p_id_sucursal
             AND EXISTS (
               SELECT 1
               FROM public.sucursales AS s
               WHERE s.id_empresa = p_id_empresa
                 AND s.id_sucursal = p_id_sucursal
                 AND s.activa
             )
           )
         )
     );
$$;

COMMIT;
