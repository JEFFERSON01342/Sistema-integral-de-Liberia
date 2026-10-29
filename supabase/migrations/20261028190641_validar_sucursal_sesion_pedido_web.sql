-- Impide aceptar un pedido web desde una caja de otra sucursal.

BEGIN;

CREATE OR REPLACE FUNCTION public.aceptar_pedido_web(
  p_id_pedido bigint,
  p_id_sesion bigint,
  p_metodo_pago_real text,
  p_efectivo_recibido numeric DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido public.pedidos_web%ROWTYPE;
  v_items jsonb;
  v_pagos jsonb;
  v_venta bigint;
  v_total_actual numeric(14,2);
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.es_staff()) THEN
    RAISE EXCEPTION 'Solo el personal autorizado puede aceptar pedidos web.';
  END IF;
  SELECT p.* INTO v_pedido
  FROM public.pedidos_web p
  WHERE p.id_pedido = p_id_pedido
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido web no existe.';
  END IF;
  IF NOT (SELECT public.puede_ver_caja(v_pedido.id_empresa, v_pedido.id_sucursal)) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal del pedido.';
  END IF;
  IF v_pedido.id_venta IS NOT NULL THEN
    RETURN v_pedido.id_venta;
  END IF;
  IF v_pedido.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden aceptar pedidos pendientes.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.sesiones_caja s
    WHERE s.id_sesion = p_id_sesion
      AND s.id_empresa = v_pedido.id_empresa
      AND s.id_sucursal = v_pedido.id_sucursal
      AND s.estado = 'ABIERTA'
  ) THEN
    RAISE EXCEPTION 'La sesión de caja debe estar abierta en la sucursal del pedido.';
  END IF;
  IF COALESCE(upper(trim(p_metodo_pago_real)), '')
     NOT IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'Confirma el método de pago real recibido.';
  END IF;
  IF upper(trim(p_metodo_pago_real)) = 'EFECTIVO'
     AND COALESCE(p_efectivo_recibido, 0) < v_pedido.total THEN
    RAISE EXCEPTION 'El efectivo recibido no cubre el total del pedido.';
  END IF;
  IF upper(trim(p_metodo_pago_real)) <> 'EFECTIVO' AND p_efectivo_recibido IS NOT NULL THEN
    RAISE EXCEPTION 'El efectivo recibido solo aplica para pagos en efectivo.';
  END IF;

  SELECT COALESCE(sum(round(d.cantidad * p.precio_venta, 2)), 0)
  INTO v_total_actual
  FROM public.detalles_pedido_web d
  JOIN public.productos p
    ON p.id_empresa = d.id_empresa AND p.id_producto = d.id_producto
  WHERE d.id_empresa = v_pedido.id_empresa AND d.id_pedido = p_id_pedido AND p.activo;
  IF v_total_actual <> v_pedido.total OR EXISTS (
    SELECT 1
    FROM public.detalles_pedido_web d
    LEFT JOIN public.productos p
      ON p.id_empresa = d.id_empresa AND p.id_producto = d.id_producto AND p.activo
    WHERE d.id_empresa = v_pedido.id_empresa
      AND d.id_pedido = p_id_pedido
      AND (p.id_producto IS NULL OR p.precio_venta <> d.precio_unitario)
  ) THEN
    RAISE EXCEPTION 'El precio o catálogo cambió; actualiza el pedido antes de aceptar el pago.';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id_producto', d.id_producto, 'cantidad', d.cantidad
  ) ORDER BY d.numero_linea)
  INTO v_items
  FROM public.detalles_pedido_web d
  WHERE d.id_empresa = v_pedido.id_empresa AND d.id_pedido = p_id_pedido;
  v_pagos := jsonb_build_array(jsonb_build_object(
    'metodo_pago', upper(trim(p_metodo_pago_real)),
    'monto', v_pedido.total
  ));
  IF upper(trim(p_metodo_pago_real)) = 'EFECTIVO' THEN
    v_pagos := jsonb_build_array(jsonb_build_object(
      'metodo_pago', 'EFECTIVO',
      'monto', v_pedido.total,
      'efectivo_recibido', p_efectivo_recibido
    ));
  END IF;

  v_venta := public.registrar_venta_pos(
    p_id_sesion,
    v_items,
    v_pagos,
    'PEDIDO_WEB:' || v_pedido.id_pedido::text,
    NULL
  );
  UPDATE public.pedidos_web
  SET estado = 'LISTO',
      estado_pago = 'CONFIRMADO',
      metodo_pago_real = upper(trim(p_metodo_pago_real)),
      id_venta = v_venta,
      aceptado_por = (SELECT auth.uid()),
      aceptado_en = clock_timestamp(),
      actualizado_en = clock_timestamp()
  WHERE id_empresa = v_pedido.id_empresa AND id_pedido = p_id_pedido;
  RETURN v_venta;
END;
$$;

REVOKE ALL ON FUNCTION public.aceptar_pedido_web(bigint, bigint, text, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aceptar_pedido_web(bigint, bigint, text, numeric)
  TO authenticated;

COMMIT;
