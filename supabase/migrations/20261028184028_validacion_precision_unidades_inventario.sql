-- Impide registrar cantidades con una precision mayor a la unidad del producto.

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_precision_cantidad_producto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id_producto bigint;
  v_cantidad numeric;
  v_decimales smallint;
BEGIN
  v_id_producto := (to_jsonb(NEW) ->> 'id_producto')::bigint;
  v_cantidad := (to_jsonb(NEW) ->> TG_ARGV[0])::numeric;

  IF v_id_producto IS NULL OR v_cantidad IS NULL THEN
    RAISE EXCEPTION 'El producto y la cantidad son obligatorios.';
  END IF;

  SELECT COALESCE(u.decimales_cantidad, 3)
  INTO v_decimales
  FROM public.productos p
  LEFT JOIN public.unidades_medidas u
    ON u.id_empresa = p.id_empresa
   AND u.id_unidad_medida = p.id_unidad_medida
  WHERE p.id_empresa = NEW.id_empresa
    AND p.id_producto = v_id_producto;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no pertenece a la empresa del movimiento.';
  END IF;

  IF v_cantidad <> round(v_cantidad, v_decimales) THEN
    RAISE EXCEPTION
      'La cantidad del producto % excede los % decimales permitidos por su unidad de medida.',
      v_id_producto, v_decimales;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_precision_cantidad_producto()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE UPDATE ON TABLE public.unidades_medidas FROM authenticated;
GRANT UPDATE (codigo, nombre, abreviatura, activa)
  ON TABLE public.unidades_medidas TO authenticated;

CREATE TRIGGER detalles_orden_compra_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad_solicitada ON public.detalles_orden_compra
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad_solicitada');

CREATE TRIGGER detalles_recepcion_compra_aceptada_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad_aceptada ON public.detalles_recepcion_compra
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad_aceptada');
CREATE TRIGGER detalles_recepcion_compra_rechazada_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad_rechazada ON public.detalles_recepcion_compra
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad_rechazada');

CREATE TRIGGER detalle_ventas_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad ON public.detalle_ventas
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad');

CREATE TRIGGER capas_inventario_fifo_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad_inicial ON public.capas_inventario_fifo
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad_inicial');

CREATE TRIGGER movimientos_inventario_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad_delta ON public.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad_delta');

CREATE TRIGGER detalles_transferencia_inventario_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad ON public.detalles_transferencia_inventario
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad');

CREATE TRIGGER detalles_ajuste_inventario_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad_delta ON public.detalles_ajuste_inventario
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad_delta');

CREATE TRIGGER detalles_devolucion_venta_precision_unidad
BEFORE INSERT OR UPDATE OF cantidad ON public.detalles_devolucion_venta
FOR EACH ROW EXECUTE FUNCTION public.validar_precision_cantidad_producto('cantidad');

COMMIT;
