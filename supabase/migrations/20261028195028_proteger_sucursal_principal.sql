-- La sucursal principal no se puede desactivar ni cambiar de categoría.

BEGIN;

REVOKE UPDATE (es_principal) ON public.sucursales FROM authenticated;

CREATE OR REPLACE FUNCTION public.proteger_desactivacion_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.es_principal IS DISTINCT FROM OLD.es_principal THEN
    RAISE EXCEPTION 'La sucursal principal no se puede cambiar desde el panel.';
  END IF;

  IF OLD.es_principal AND OLD.activa AND NOT NEW.activa THEN
    RAISE EXCEPTION 'La sucursal principal no se puede desactivar.';
  END IF;

  IF OLD.activa AND NOT NEW.activa AND EXISTS (
    SELECT 1
    FROM public.sesiones_caja AS sc
    WHERE sc.id_empresa = OLD.id_empresa
      AND sc.id_sucursal = OLD.id_sucursal
      AND sc.estado = 'ABIERTA'
  ) THEN
    RAISE EXCEPTION 'Cierre las sesiones de caja abiertas antes de desactivar la sucursal.';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
