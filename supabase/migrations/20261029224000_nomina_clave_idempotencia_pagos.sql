BEGIN;

ALTER TABLE public.nomina_detalle
  ADD CONSTRAINT nomina_detalle_neto_positivo_check
    CHECK (salario_neto > 0);

CREATE OR REPLACE FUNCTION public.contabilizar_pagos_nomina(p_id_periodo bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_periodo record;
  v_config record;
  v_grupo record;
  v_id_comprobante bigint;
  v_contabilizados integer := 0;
BEGIN
  SELECT n.id_empresa, n.id_sucursal, n.estado, n.id_comprobante_nomina
  INTO v_periodo
  FROM public.nomina_periodos AS n
  WHERE n.id = p_id_periodo
  FOR UPDATE;
  IF v_periodo.id_empresa IS NULL THEN
    RAISE EXCEPTION 'El período de nómina no existe.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_periodo.id_empresa, v_periodo.id_sucursal))
     OR NOT (SELECT public.puede_crear_comprobante_contable(
       v_periodo.id_empresa, v_periodo.id_sucursal, 'MANUAL', 'NOMINA_PAGO', p_id_periodo::text
     )) THEN
    RAISE EXCEPTION 'No tienes permiso para contabilizar pagos de esta nómina.';
  END IF;
  IF v_periodo.estado NOT IN ('procesada', 'pagada') THEN
    RAISE EXCEPTION 'La nómina debe estar procesada antes de contabilizar sus pagos.';
  END IF;
  IF v_periodo.id_comprobante_nomina IS NULL THEN
    RAISE EXCEPTION 'Contabilice primero el devengo de la nómina antes de contabilizar los desembolsos.';
  END IF;
  SELECT * INTO v_config
  FROM public.configuracion_nomina_contable AS c
  WHERE c.id_empresa = v_periodo.id_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configura las cuentas contables de nómina antes de contabilizar pagos.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pagos_salarios AS p
    JOIN public.nomina_detalle AS d
      ON d.id_empresa = p.id_empresa
     AND d.id = p.id_detalle_nomina
    WHERE p.id_empresa = v_periodo.id_empresa
      AND d.id_periodo = p_id_periodo
      AND p.id_comprobante_pago IS NULL
      AND p.id_cuenta_pago IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay pagos anteriores sin cuenta de salida; asígneles cuenta antes de contabilizarlos.';
  END IF;

  FOR v_grupo IN
    SELECT p.id_cuenta_pago, p.fecha_pago, max(p.id_pago_salario) AS ultimo_pago_id,
      round(sum(p.monto), 2) AS monto
    FROM public.pagos_salarios AS p
    WHERE p.id_empresa = v_periodo.id_empresa
      AND p.id_detalle_nomina IN (
        SELECT d.id FROM public.nomina_detalle AS d
        WHERE d.id_empresa = v_periodo.id_empresa
          AND d.id_periodo = p_id_periodo
      )
      AND p.id_comprobante_pago IS NULL
      AND p.id_cuenta_pago IS NOT NULL
    GROUP BY p.id_cuenta_pago, p.fecha_pago
    ORDER BY p.fecha_pago, p.id_cuenta_pago
  LOOP
    v_id_comprobante := public._registrar_asiento_operativo(
      v_periodo.id_empresa, v_periodo.id_sucursal, v_grupo.fecha_pago, 'MANUAL',
      'Pago de salarios de nómina #' || p_id_periodo, 'NOMINA_PAGO',
      p_id_periodo::text || ':' || v_grupo.fecha_pago::text || ':'
        || v_grupo.id_cuenta_pago::text || ':' || v_grupo.ultimo_pago_id::text,
      jsonb_build_array(
        jsonb_build_object(
          'id_cuenta', v_config.cuenta_pasivo_salarios,
          'debe', v_grupo.monto, 'haber', 0, 'descripcion', 'Cancelación de salario por pagar'
        ),
        jsonb_build_object(
          'id_cuenta', v_grupo.id_cuenta_pago,
          'debe', 0, 'haber', v_grupo.monto, 'descripcion', 'Desembolso de nómina'
        )
      )
    );

    UPDATE public.pagos_salarios AS p
    SET id_comprobante_pago = v_id_comprobante
    WHERE p.id_empresa = v_periodo.id_empresa
      AND p.id_cuenta_pago = v_grupo.id_cuenta_pago
      AND p.fecha_pago = v_grupo.fecha_pago
      AND p.id_comprobante_pago IS NULL
      AND p.id_detalle_nomina IN (
        SELECT d.id FROM public.nomina_detalle AS d
        WHERE d.id_empresa = v_periodo.id_empresa
          AND d.id_periodo = p_id_periodo
      );
    v_contabilizados := v_contabilizados + 1;
  END LOOP;

  IF v_contabilizados = 0 THEN
    RETURN 0;
  END IF;
  RETURN v_contabilizados;
END;
$$;

REVOKE ALL ON FUNCTION public.contabilizar_pagos_nomina(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contabilizar_pagos_nomina(bigint)
  TO authenticated;

COMMIT;
