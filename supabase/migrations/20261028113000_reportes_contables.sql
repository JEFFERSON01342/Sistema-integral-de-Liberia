-- Fase 15: reportes contables calculados desde comprobantes contabilizados.
-- Los estados financieros son consultas sobre el libro, no tablas duplicadas.

BEGIN;

CREATE TABLE public.clasificaciones_flujo_efectivo (
  id_empresa integer NOT NULL,
  id_cuenta bigint NOT NULL,
  clasificacion text NOT NULL CHECK (clasificacion IN (
    'EFECTIVO',
    'ACTIVO_CORRIENTE_OPERATIVO',
    'PASIVO_CORRIENTE_OPERATIVO',
    'ACTIVO_FIJO_BRUTO',
    'PASIVO_FINANCIERO',
    'CAPITAL_APORTADO',
    'AJUSTE_NO_EFECTIVO',
    'DEPRECIACION_ACUMULADA',
    'IGNORAR'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_empresa, id_cuenta),
  FOREIGN KEY (id_empresa, id_cuenta)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta)
);

COMMENT ON TABLE public.clasificaciones_flujo_efectivo IS
  'Mapeo configurable de cuentas contables a categorías del estado indirecto de flujo de efectivo.';

ALTER TABLE public.clasificaciones_flujo_efectivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clasificaciones_flujo_efectivo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.clasificaciones_flujo_efectivo TO authenticated;

CREATE POLICY clasificaciones_flujo_select_empresa
  ON public.clasificaciones_flujo_efectivo
  FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_empresa(id_empresa)));
CREATE POLICY clasificaciones_flujo_admin_empresa
  ON public.clasificaciones_flujo_efectivo
  FOR ALL TO authenticated
  USING ((SELECT public.puede_administrar_empresa(id_empresa)))
  WITH CHECK ((SELECT public.puede_administrar_empresa(id_empresa)));

INSERT INTO public.clasificaciones_flujo_efectivo
  (id_empresa, id_cuenta, clasificacion)
SELECT id_empresa, id_cuenta,
       CASE
         WHEN codigo IN ('1.1.01', '1.1.02', '1.1.03', '1.1.04')
           THEN 'EFECTIVO'
         WHEN codigo IN ('1.1.05', '1.1.06', '1.1.07')
           THEN 'ACTIVO_CORRIENTE_OPERATIVO'
         WHEN codigo IN ('1.2.01', '1.2.02', '1.2.03')
           THEN 'ACTIVO_FIJO_BRUTO'
         WHEN codigo IN ('1.3.01', '1.3.02')
           THEN 'DEPRECIACION_ACUMULADA'
         WHEN codigo IN ('2.1.01', '2.1.02', '2.1.03', '2.1.04', '2.1.05')
           THEN 'PASIVO_CORRIENTE_OPERATIVO'
         WHEN codigo = '3.1.01'
           THEN 'CAPITAL_APORTADO'
         WHEN codigo IN ('3.2.01', '3.2.02')
           THEN 'IGNORAR'
         WHEN codigo = '6.5.01'
           THEN 'AJUSTE_NO_EFECTIVO'
       END
FROM public.cuentas_contables
WHERE codigo IN (
  '1.1.01', '1.1.02', '1.1.03', '1.1.04',
  '1.1.05', '1.1.06', '1.1.07',
  '1.2.01', '1.2.02', '1.2.03',
  '1.3.01', '1.3.02',
  '2.1.01', '2.1.02', '2.1.03', '2.1.04', '2.1.05',
  '3.1.01', '3.2.01', '3.2.02', '6.5.01'
)
ON CONFLICT (id_empresa, id_cuenta) DO UPDATE
SET clasificacion = EXCLUDED.clasificacion;

CREATE OR REPLACE FUNCTION public.reporte_balanza_comprobacion(
  p_id_empresa integer,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE (
  id_cuenta bigint,
  codigo text,
  nombre text,
  naturaleza text,
  saldo_inicial_deudor numeric,
  saldo_inicial_acreedor numeric,
  movimiento_debe numeric,
  movimiento_haber numeric,
  saldo_final_deudor numeric,
  saldo_final_acreedor numeric
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
    RAISE EXCEPTION 'El rango de fechas de la balanza no es válido.';
  END IF;

  RETURN QUERY
  WITH movimientos AS (
    SELECT l.id_cuenta,
           COALESCE(sum(l.debe) FILTER (WHERE c.fecha < p_fecha_desde), 0)::numeric(14,2) AS debe_inicial,
           COALESCE(sum(l.haber) FILTER (WHERE c.fecha < p_fecha_desde), 0)::numeric(14,2) AS haber_inicial,
           COALESCE(sum(l.debe) FILTER (WHERE c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta), 0)::numeric(14,2) AS debe_periodo,
           COALESCE(sum(l.haber) FILTER (WHERE c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta), 0)::numeric(14,2) AS haber_periodo
    FROM public.lineas_comprobante_contable AS l
    JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa
     AND c.id_comprobante = l.id_comprobante
    WHERE l.id_empresa = p_id_empresa
      AND c.estado = 'CONTABILIZADO'
      AND c.fecha <= p_fecha_hasta
    GROUP BY l.id_cuenta
  ),
  filas AS (
    SELECT cc.id_cuenta, cc.codigo, cc.nombre, cc.naturaleza,
           round(COALESCE(m.debe_inicial - m.haber_inicial, 0), 2) AS saldo_inicial,
           COALESCE(m.debe_periodo, 0)::numeric(14,2) AS debe_periodo,
           COALESCE(m.haber_periodo, 0)::numeric(14,2) AS haber_periodo,
           round(COALESCE(m.debe_inicial - m.haber_inicial, 0)
             + COALESCE(m.debe_periodo, 0) - COALESCE(m.haber_periodo, 0), 2) AS saldo_final
    FROM public.cuentas_contables AS cc
    LEFT JOIN movimientos AS m ON m.id_cuenta = cc.id_cuenta
    WHERE cc.id_empresa = p_id_empresa
      AND NOT cc.es_grupo
      AND cc.permite_movimientos
      AND (
        COALESCE(m.debe_inicial, 0) <> 0 OR COALESCE(m.haber_inicial, 0) <> 0
        OR COALESCE(m.debe_periodo, 0) <> 0 OR COALESCE(m.haber_periodo, 0) <> 0
      )
  )
  SELECT f.id_cuenta, f.codigo, f.nombre, f.naturaleza,
         GREATEST(f.saldo_inicial, 0)::numeric(14,2),
         GREATEST(-f.saldo_inicial, 0)::numeric(14,2),
         f.debe_periodo,
         f.haber_periodo,
         GREATEST(f.saldo_final, 0)::numeric(14,2),
         GREATEST(-f.saldo_final, 0)::numeric(14,2)
  FROM filas AS f
  UNION ALL
  SELECT NULL::bigint, 'TOTAL', 'Totales', 'TOTAL',
         COALESCE(sum(GREATEST(f.saldo_inicial, 0)), 0)::numeric(14,2),
         COALESCE(sum(GREATEST(-f.saldo_inicial, 0)), 0)::numeric(14,2),
         COALESCE(sum(f.debe_periodo), 0)::numeric(14,2),
         COALESCE(sum(f.haber_periodo), 0)::numeric(14,2),
         COALESCE(sum(GREATEST(f.saldo_final, 0)), 0)::numeric(14,2),
         COALESCE(sum(GREATEST(-f.saldo_final, 0)), 0)::numeric(14,2)
  FROM filas AS f
  ORDER BY 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.reporte_balance_general(
  p_id_empresa integer,
  p_fecha_corte date
)
RETURNS TABLE (
  id_cuenta bigint,
  codigo text,
  nombre text,
  naturaleza text,
  saldo numeric,
  es_resultado_acumulado boolean
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
  IF p_fecha_corte IS NULL THEN
    RAISE EXCEPTION 'La fecha de corte es obligatoria.';
  END IF;

  RETURN QUERY
  WITH saldos AS (
    SELECT l.id_cuenta, sum(l.debe) AS debe, sum(l.haber) AS haber
    FROM public.lineas_comprobante_contable AS l
    JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa
     AND c.id_comprobante = l.id_comprobante
    WHERE l.id_empresa = p_id_empresa
      AND c.estado = 'CONTABILIZADO'
      AND c.fecha <= p_fecha_corte
    GROUP BY l.id_cuenta
  ),
  resultados AS (
    SELECT COALESCE(sum(l.haber - l.debe), 0)::numeric(14,2) AS saldo
    FROM public.lineas_comprobante_contable AS l
    JOIN public.comprobantes_contables AS c
      ON c.id_empresa = l.id_empresa
     AND c.id_comprobante = l.id_comprobante
    JOIN public.cuentas_contables AS cc
      ON cc.id_empresa = l.id_empresa
     AND cc.id_cuenta = l.id_cuenta
    WHERE l.id_empresa = p_id_empresa
      AND c.estado = 'CONTABILIZADO'
      AND c.fecha <= p_fecha_corte
      AND cc.naturaleza IN ('INGRESO', 'COSTO', 'GASTO')
  )
  SELECT cc.id_cuenta, cc.codigo, cc.nombre, cc.naturaleza,
         round(CASE
           WHEN cc.naturaleza = 'ACTIVO'
             THEN COALESCE(s.debe, 0) - COALESCE(s.haber, 0)
           ELSE COALESCE(s.haber, 0) - COALESCE(s.debe, 0)
         END, 2)::numeric(14,2),
         false
  FROM public.cuentas_contables AS cc
  LEFT JOIN saldos AS s ON s.id_cuenta = cc.id_cuenta
  WHERE cc.id_empresa = p_id_empresa
    AND cc.naturaleza IN ('ACTIVO', 'PASIVO', 'PATRIMONIO')
    AND NOT cc.es_grupo
    AND cc.permite_movimientos
    AND (COALESCE(s.debe, 0) <> 0 OR COALESCE(s.haber, 0) <> 0)
  UNION ALL
  SELECT NULL::bigint, 'RESULTADO-ACUMULADO',
         'Resultado acumulado pendiente de cierre',
         'PATRIMONIO', r.saldo, true
  FROM resultados AS r
  WHERE r.saldo <> 0
  ORDER BY 2;
END;
$$;

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
        ELSE -(l.debe - l.haber)
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
  SELECT COALESCE(sum(importe), 0)::numeric(14,2)
  INTO v_ajustes_no_efectivo
  FROM movimientos;

  WITH saldos AS (
    SELECT cc.id_cuenta, cf.clasificacion, cc.naturaleza,
           COALESCE(sum(l.debe) FILTER (WHERE c.fecha < p_fecha_desde), 0)
             AS debe_inicio,
           COALESCE(sum(l.haber) FILTER (WHERE c.fecha < p_fecha_desde), 0)
             AS haber_inicio,
           COALESCE(sum(l.debe) FILTER (WHERE c.fecha <= p_fecha_hasta), 0)
             AS debe_fin,
           COALESCE(sum(l.haber) FILTER (WHERE c.fecha <= p_fecha_hasta), 0)
             AS haber_fin
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
    COALESCE(sum((debe_fin - haber_fin) - (debe_inicio - haber_inicio))
      FILTER (WHERE clasificacion = 'ACTIVO_CORRIENTE_OPERATIVO'), 0),
    COALESCE(sum((haber_fin - debe_fin) - (haber_inicio - debe_inicio))
      FILTER (WHERE clasificacion = 'PASIVO_CORRIENTE_OPERATIVO'), 0),
    COALESCE(sum((debe_fin - haber_fin) - (debe_inicio - haber_inicio))
      FILTER (WHERE clasificacion = 'ACTIVO_FIJO_BRUTO'), 0),
    COALESCE(sum((haber_fin - debe_fin) - (haber_inicio - debe_inicio))
      FILTER (WHERE clasificacion = 'PASIVO_FINANCIERO'), 0),
    COALESCE(sum((haber_fin - debe_fin) - (haber_inicio - debe_inicio))
      FILTER (WHERE clasificacion = 'CAPITAL_APORTADO'), 0),
    COALESCE(sum((debe_fin - haber_fin))
      FILTER (WHERE clasificacion = 'EFECTIVO'), 0),
    COALESCE(sum((debe_inicio - haber_inicio))
      FILTER (WHERE clasificacion = 'EFECTIVO'), 0)
  INTO v_cambio_activo_corriente, v_cambio_pasivo_corriente,
       v_cambio_activo_fijo, v_cambio_deuda, v_cambio_capital,
       v_efectivo_final, v_efectivo_inicial
  FROM saldos;

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

REVOKE ALL ON FUNCTION public.reporte_balanza_comprobacion(integer, date, date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporte_balance_general(integer, date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporte_estado_resultados(integer, date, date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporte_flujo_efectivo(integer, date, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reporte_balanza_comprobacion(integer, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_balance_general(integer, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_estado_resultados(integer, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_flujo_efectivo(integer, date, date)
  TO authenticated;

COMMIT;
