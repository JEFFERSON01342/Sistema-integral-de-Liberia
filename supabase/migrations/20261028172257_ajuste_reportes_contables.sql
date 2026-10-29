-- Fase 16: corrige referencias ambiguas de columnas en funciones PL/pgSQL.

BEGIN;

CREATE OR REPLACE FUNCTION public.reporte_estado_resultados(
  p_id_empresa integer,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE (
  tipo_fila text,
  codigo text,
  nombre text,
  naturaleza text,
  debe numeric,
  haber numeric,
  importe numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.puede_ver_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar esta empresa.';
  END IF;
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL
     OR p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'El rango de fechas del estado de resultados no es válido.';
  END IF;

  RETURN QUERY
  WITH movimientos AS (
    SELECT cc.id_cuenta, cc.codigo, cc.nombre, cc.naturaleza,
           COALESCE(sum(l.debe), 0)::numeric(14,2) AS debe,
           COALESCE(sum(l.haber), 0)::numeric(14,2) AS haber,
           round(CASE
             WHEN cc.naturaleza = 'INGRESO' THEN sum(l.haber - l.debe)
             ELSE sum(l.debe - l.haber)
           END, 2)::numeric(14,2) AS importe
    FROM public.lineas_comprobante_contable AS l
    JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa
     AND c.id_comprobante = l.id_comprobante
    JOIN public.cuentas_contables AS cc
      ON cc.id_empresa = l.id_empresa
     AND cc.id_cuenta = l.id_cuenta
    WHERE l.id_empresa = p_id_empresa
      AND c.estado = 'CONTABILIZADO'
      AND c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
      AND cc.naturaleza IN ('INGRESO', 'COSTO', 'GASTO')
      AND NOT cc.es_grupo
      AND cc.permite_movimientos
    GROUP BY cc.id_cuenta, cc.codigo, cc.nombre, cc.naturaleza
  ),
  totales AS (
    SELECT COALESCE(sum(m.importe) FILTER (WHERE m.naturaleza = 'INGRESO'), 0)::numeric(14,2) AS ingresos,
           COALESCE(sum(m.importe) FILTER (WHERE m.naturaleza = 'COSTO'), 0)::numeric(14,2) AS costos,
           COALESCE(sum(m.importe) FILTER (WHERE m.naturaleza = 'GASTO'), 0)::numeric(14,2) AS gastos
    FROM movimientos AS m
  )
  SELECT 'CUENTA'::text AS tipo_fila, m.codigo, m.nombre, m.naturaleza,
         m.debe, m.haber, m.importe
  FROM movimientos AS m
  UNION ALL
  SELECT 'TOTAL_INGRESOS', NULL::text, 'Ingresos netos', 'INGRESO',
         NULL::numeric, NULL::numeric, t.ingresos
  FROM totales AS t
  UNION ALL
  SELECT 'TOTAL_COSTOS', NULL::text, 'Costos', 'COSTO',
         NULL::numeric, NULL::numeric, t.costos
  FROM totales AS t
  UNION ALL
  SELECT 'TOTAL_GASTOS', NULL::text, 'Gastos', 'GASTO',
         NULL::numeric, NULL::numeric, t.gastos
  FROM totales AS t
  UNION ALL
  SELECT 'UTILIDAD_NETA', NULL::text, 'Utilidad o pérdida neta', 'RESULTADO',
         NULL::numeric, NULL::numeric, t.ingresos - t.costos - t.gastos
  FROM totales AS t
  ORDER BY 1, 2 NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.reporte_flujo_efectivo(
  p_id_empresa integer,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE (
  orden integer,
  codigo text,
  concepto text,
  actividad text,
  monto numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resultado numeric(14,2);
  v_ajustes_no_efectivo numeric(14,2);
  v_cambio_activo_corriente numeric(14,2);
  v_cambio_pasivo_corriente numeric(14,2);
  v_flujo_operacion numeric(14,2);
  v_cambio_activo_fijo numeric(14,2);
  v_flujo_inversion numeric(14,2);
  v_cambio_deuda numeric(14,2);
  v_cambio_capital numeric(14,2);
  v_flujo_financiacion numeric(14,2);
  v_cambio_neto numeric(14,2);
  v_efectivo_inicial numeric(14,2);
  v_efectivo_final numeric(14,2);
  v_diferencia numeric(14,2);
  v_cuentas_sin_clasificar bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.puede_ver_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar esta empresa.';
  END IF;
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL
     OR p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'El rango de fechas del flujo de efectivo no es válido.';
  END IF;

  WITH resultado AS (
    SELECT COALESCE(sum(
      CASE
        WHEN cc.naturaleza = 'INGRESO' THEN l.haber - l.debe
        ELSE l.debe - l.haber
      END
    ), 0)::numeric(14,2) AS monto
    FROM public.lineas_comprobante_contable AS l
    JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa AND c.id_comprobante = l.id_comprobante
    JOIN public.cuentas_contables AS cc
      ON cc.id_empresa = l.id_empresa AND cc.id_cuenta = l.id_cuenta
    WHERE l.id_empresa = p_id_empresa AND c.estado = 'CONTABILIZADO'
      AND c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
      AND cc.naturaleza IN ('INGRESO', 'COSTO', 'GASTO')
  )
  SELECT resultado.monto INTO v_resultado FROM resultado;

  WITH movimientos AS (
    SELECT cf.clasificacion,
           cc.naturaleza,
           CASE WHEN cc.naturaleza IN ('ACTIVO', 'COSTO', 'GASTO')
             THEN l.debe - l.haber ELSE l.haber - l.debe END AS importe
    FROM public.lineas_comprobante_contable AS l
    JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa AND c.id_comprobante = l.id_comprobante
    JOIN public.cuentas_contables AS cc
      ON cc.id_empresa = l.id_empresa AND cc.id_cuenta = l.id_cuenta
    JOIN public.clasificaciones_flujo_efectivo AS cf
      ON cf.id_empresa = cc.id_empresa AND cf.id_cuenta = cc.id_cuenta
    WHERE l.id_empresa = p_id_empresa AND c.estado = 'CONTABILIZADO'
      AND c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
      AND cf.clasificacion = 'AJUSTE_NO_EFECTIVO'
  )
  SELECT COALESCE(sum(m.importe), 0)::numeric(14,2)
  INTO v_ajustes_no_efectivo
  FROM movimientos AS m;

  WITH saldos AS (
    SELECT cc.id_cuenta, cf.clasificacion, cc.naturaleza,
           COALESCE(sum(l.debe) FILTER (WHERE c.fecha < p_fecha_desde), 0) AS debe_inicio,
           COALESCE(sum(l.haber) FILTER (WHERE c.fecha < p_fecha_desde), 0) AS haber_inicio,
           COALESCE(sum(l.debe) FILTER (WHERE c.fecha <= p_fecha_hasta), 0) AS debe_fin,
           COALESCE(sum(l.haber) FILTER (WHERE c.fecha <= p_fecha_hasta), 0) AS haber_fin
    FROM public.cuentas_contables AS cc
    LEFT JOIN public.clasificaciones_flujo_efectivo AS cf
      ON cf.id_empresa = cc.id_empresa AND cf.id_cuenta = cc.id_cuenta
    LEFT JOIN public.lineas_comprobante_contable AS l
      ON l.id_empresa = cc.id_empresa AND l.id_cuenta = cc.id_cuenta
    LEFT JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa AND c.id_comprobante = l.id_comprobante
     AND c.estado = 'CONTABILIZADO'
     AND c.fecha <= p_fecha_hasta
    WHERE cc.id_empresa = p_id_empresa
      AND NOT cc.es_grupo AND cc.permite_movimientos
      AND cc.naturaleza IN ('ACTIVO', 'PASIVO', 'PATRIMONIO')
    GROUP BY cc.id_cuenta, cf.clasificacion, cc.naturaleza
  )
  SELECT
    COALESCE(sum((s.debe_fin - s.haber_fin) - (s.debe_inicio - s.haber_inicio))
      FILTER (WHERE s.clasificacion = 'ACTIVO_CORRIENTE_OPERATIVO'), 0),
    COALESCE(sum((s.haber_fin - s.debe_fin) - (s.haber_inicio - s.debe_inicio))
      FILTER (WHERE s.clasificacion = 'PASIVO_CORRIENTE_OPERATIVO'), 0),
    COALESCE(sum((s.debe_fin - s.haber_fin) - (s.debe_inicio - s.haber_inicio))
      FILTER (WHERE s.clasificacion = 'ACTIVO_FIJO_BRUTO'), 0),
    COALESCE(sum((s.haber_fin - s.debe_fin) - (s.haber_inicio - s.debe_inicio))
      FILTER (WHERE s.clasificacion = 'PASIVO_FINANCIERO'), 0),
    COALESCE(sum((s.haber_fin - s.debe_fin) - (s.haber_inicio - s.debe_inicio))
      FILTER (WHERE s.clasificacion = 'CAPITAL_APORTADO'), 0),
    COALESCE(sum(s.debe_fin - s.haber_fin)
      FILTER (WHERE s.clasificacion = 'EFECTIVO'), 0),
    COALESCE(sum(s.debe_inicio - s.haber_inicio)
      FILTER (WHERE s.clasificacion = 'EFECTIVO'), 0)
  INTO v_cambio_activo_corriente, v_cambio_pasivo_corriente,
       v_cambio_activo_fijo, v_cambio_deuda, v_cambio_capital,
       v_efectivo_final, v_efectivo_inicial
  FROM saldos AS s;

  SELECT count(*) INTO v_cuentas_sin_clasificar
  FROM public.cuentas_contables AS cc
  LEFT JOIN public.clasificaciones_flujo_efectivo AS cf
    ON cf.id_empresa = cc.id_empresa AND cf.id_cuenta = cc.id_cuenta
  WHERE cc.id_empresa = p_id_empresa
    AND cc.naturaleza IN ('ACTIVO', 'PASIVO', 'PATRIMONIO')
    AND NOT cc.es_grupo AND cc.permite_movimientos
    AND cf.id_cuenta IS NULL;

  v_flujo_operacion := v_resultado + v_ajustes_no_efectivo
    - v_cambio_activo_corriente + v_cambio_pasivo_corriente;
  v_flujo_inversion := -v_cambio_activo_fijo;
  v_flujo_financiacion := v_cambio_deuda + v_cambio_capital;
  v_cambio_neto := v_flujo_operacion + v_flujo_inversion + v_flujo_financiacion;
  v_diferencia := (v_efectivo_final - v_efectivo_inicial) - v_cambio_neto;

  RETURN QUERY
  SELECT x.orden, x.codigo, x.concepto, x.actividad, x.monto
  FROM (VALUES
    (10, 'UTILIDAD_NETA'::text, 'Utilidad o pérdida neta'::text, 'OPERACION'::text, v_resultado),
    (20, 'AJUSTES_NO_EFECTIVO', 'Gastos no monetarios configurados', 'OPERACION', v_ajustes_no_efectivo),
    (30, 'CAMBIO_ACTIVO_CORRIENTE', 'Cambio en activos corrientes operativos', 'OPERACION', -v_cambio_activo_corriente),
    (40, 'CAMBIO_PASIVO_CORRIENTE', 'Cambio en pasivos corrientes operativos', 'OPERACION', v_cambio_pasivo_corriente),
    (50, 'FLUJO_OPERACION', 'Flujo neto de actividades de operación', 'TOTAL', v_flujo_operacion),
    (60, 'CAMBIO_ACTIVO_FIJO', 'Adquisición o disminución de activos fijos brutos', 'INVERSION', -v_cambio_activo_fijo),
    (70, 'FLUJO_INVERSION', 'Flujo neto de actividades de inversión', 'TOTAL', v_flujo_inversion),
    (80, 'CAMBIO_DEUDA', 'Cambio en deuda financiera clasificada', 'FINANCIACION', v_cambio_deuda),
    (90, 'CAMBIO_CAPITAL', 'Cambio en capital aportado', 'FINANCIACION', v_cambio_capital),
    (100, 'FLUJO_FINANCIACION', 'Flujo neto de actividades de financiación', 'TOTAL', v_flujo_financiacion),
    (110, 'CAMBIO_NETO', 'Cambio neto de efectivo calculado', 'TOTAL', v_cambio_neto),
    (120, 'EFECTIVO_INICIAL', 'Efectivo al inicio del período', 'SALDO', v_efectivo_inicial),
    (130, 'EFECTIVO_FINAL', 'Efectivo al cierre del período', 'SALDO', v_efectivo_final),
    (140, 'DIFERENCIA_RECONCILIACION', 'Diferencia entre cambio calculado y efectivo contable', 'CONTROL', v_diferencia),
    (150, 'CUENTAS_NO_CLASIFICADAS', 'Cuentas de balance sin clasificación de flujo', 'ALERTA', v_cuentas_sin_clasificar::numeric)
  ) AS x(orden, codigo, concepto, actividad, monto)
  ORDER BY x.orden;
END;
$$;

COMMIT;
