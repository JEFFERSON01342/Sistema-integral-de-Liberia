BEGIN;

CREATE OR REPLACE FUNCTION public.contabilizar_pagos_liquidacion(p_id_liquidacion bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liquidacion record;
  v_grupo record;
  v_id_comprobante bigint;
  v_cantidad integer := 0;
BEGIN
  SELECT l.id_empresa, l.id_sucursal, l.estado, l.id_comprobante_liquidacion
  INTO v_liquidacion
  FROM public.liquidaciones_laborales AS l
  WHERE l.id = p_id_liquidacion
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la liquidación.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_liquidacion.id_empresa, v_liquidacion.id_sucursal))
     OR NOT (SELECT public.puede_crear_comprobante_contable(
       v_liquidacion.id_empresa, v_liquidacion.id_sucursal,
       'MANUAL', 'FINIQUITO_PAGO', p_id_liquidacion::text
     )) THEN
    RAISE EXCEPTION 'No tienes permiso para contabilizar el pago de esta liquidación.';
  END IF;
  IF v_liquidacion.estado NOT IN ('aprobada', 'pagada')
     OR v_liquidacion.id_comprobante_liquidacion IS NULL THEN
    RAISE EXCEPTION 'Apruebe y contabilice primero el devengo de la liquidación.';
  END IF;
  FOR v_grupo IN
    SELECT p.id_cuenta_pago, p.fecha_pago, max(p.id) AS ultimo_pago_id,
           round(sum(p.monto), 2) AS monto
    FROM public.pagos_liquidacion AS p
    WHERE p.id_empresa = v_liquidacion.id_empresa
      AND p.id_liquidacion = p_id_liquidacion
      AND p.id_comprobante_pago IS NULL
    GROUP BY p.id_cuenta_pago, p.fecha_pago
    ORDER BY p.fecha_pago, p.id_cuenta_pago
  LOOP
    v_id_comprobante := public._registrar_asiento_operativo(
      v_liquidacion.id_empresa, v_liquidacion.id_sucursal,
      v_grupo.fecha_pago, 'MANUAL',
      'Pago de liquidación #' || p_id_liquidacion,
      'FINIQUITO_PAGO',
      p_id_liquidacion::text || ':' || v_grupo.fecha_pago::text || ':'
        || v_grupo.id_cuenta_pago::text || ':' || v_grupo.ultimo_pago_id::text,
      jsonb_build_array(
        jsonb_build_object(
          'id_cuenta', (SELECT c.cuenta_pasivo_salarios
            FROM public.configuracion_nomina_contable AS c
            WHERE c.id_empresa = v_liquidacion.id_empresa),
          'debe', v_grupo.monto, 'haber', 0, 'descripcion', 'Pago de liquidación'
        ),
        jsonb_build_object(
          'id_cuenta', v_grupo.id_cuenta_pago,
          'debe', 0, 'haber', v_grupo.monto, 'descripcion', 'Salida de banco/caja'
        )
      )
    );
    UPDATE public.pagos_liquidacion AS p
    SET id_comprobante_pago = v_id_comprobante
    WHERE p.id_empresa = v_liquidacion.id_empresa
      AND p.id_liquidacion = p_id_liquidacion
      AND p.id_cuenta_pago = v_grupo.id_cuenta_pago
      AND p.fecha_pago = v_grupo.fecha_pago
      AND p.id_comprobante_pago IS NULL;
    v_cantidad := v_cantidad + 1;
  END LOOP;
  RETURN v_cantidad;
END;
$$;

COMMIT;
