-- Completa el mapeo del flujo y expone el estado de origen y aplicación.

BEGIN;

INSERT INTO public.clasificaciones_flujo_efectivo (id_empresa, id_cuenta, clasificacion)
SELECT id_empresa, id_cuenta, 'ACTIVO_CORRIENTE_OPERATIVO'
FROM public.cuentas_contables
WHERE codigo = '1.1.08'
ON CONFLICT (id_empresa, id_cuenta)
DO UPDATE SET clasificacion = EXCLUDED.clasificacion, updated_at = clock_timestamp();

CREATE OR REPLACE FUNCTION public.reporte_origen_aplicacion(
  p_id_empresa integer,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE (
  tipo_fila text,
  codigo text,
  nombre text,
  naturaleza text,
  cambio_saldo numeric,
  origen numeric,
  aplicacion numeric,
  actividad text
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
    RAISE EXCEPTION 'El rango de fechas del estado de origen y aplicación no es válido.';
  END IF;

  RETURN QUERY
  WITH movimientos AS (
    SELECT
      cc.id_cuenta,
      cc.codigo,
      cc.nombre,
      cc.naturaleza,
      cf.clasificacion,
      round(
        COALESCE(sum(l.debe) FILTER (WHERE c.fecha < p_fecha_desde), 0)
        - COALESCE(sum(l.haber) FILTER (WHERE c.fecha < p_fecha_desde), 0),
        2
      ) AS saldo_inicial_deudor,
      round(
        COALESCE(sum(l.debe) FILTER (WHERE c.fecha <= p_fecha_hasta), 0)
        - COALESCE(sum(l.haber) FILTER (WHERE c.fecha <= p_fecha_hasta), 0),
        2
      ) AS saldo_final_deudor
    FROM public.cuentas_contables cc
    LEFT JOIN public.clasificaciones_flujo_efectivo cf
      ON cf.id_empresa = cc.id_empresa AND cf.id_cuenta = cc.id_cuenta
    LEFT JOIN public.lineas_comprobante_contable l
      ON l.id_empresa = cc.id_empresa AND l.id_cuenta = cc.id_cuenta
    LEFT JOIN public.comprobantes_contables c
      ON c.id_empresa = l.id_empresa AND c.id_comprobante = l.id_comprobante
     AND c.estado = 'CONTABILIZADO'
     AND c.fecha <= p_fecha_hasta
    WHERE cc.id_empresa = p_id_empresa
      AND cc.naturaleza IN ('ACTIVO', 'PASIVO', 'PATRIMONIO')
      AND NOT cc.es_grupo
      AND cc.permite_movimientos
    GROUP BY cc.id_cuenta, cc.codigo, cc.nombre, cc.naturaleza, cf.clasificacion
  ),
  saldos AS (
    SELECT m.*,
      round(
        CASE
          WHEN m.naturaleza = 'ACTIVO'
               AND m.clasificacion IS DISTINCT FROM 'DEPRECIACION_ACUMULADA'
            THEN m.saldo_inicial_deudor
          ELSE -m.saldo_inicial_deudor
        END,
        2
      ) AS saldo_inicial,
      round(
        CASE
          WHEN m.naturaleza = 'ACTIVO'
               AND m.clasificacion IS DISTINCT FROM 'DEPRECIACION_ACUMULADA'
            THEN m.saldo_final_deudor
          ELSE -m.saldo_final_deudor
        END,
        2
      ) AS saldo_final
    FROM movimientos m
  ),
  cambios AS (
    SELECT s.*,
      round(s.saldo_final - s.saldo_inicial, 2) AS variacion
    FROM saldos s
    WHERE s.clasificacion IS DISTINCT FROM 'IGNORAR'
      AND (s.saldo_inicial_deudor <> 0 OR s.saldo_final_deudor <> 0)
  ),
  resultado_periodo AS (
    SELECT round(COALESCE(sum(
      CASE
        WHEN cc.naturaleza = 'INGRESO' THEN l.haber - l.debe
        ELSE l.haber - l.debe
      END
    ), 0), 2)::numeric(14,2) AS utilidad
    FROM public.lineas_comprobante_contable l
    JOIN public.comprobantes_contables c
      ON c.id_empresa = l.id_empresa AND c.id_comprobante = l.id_comprobante
    JOIN public.cuentas_contables cc
      ON cc.id_empresa = l.id_empresa AND cc.id_cuenta = l.id_cuenta
    WHERE l.id_empresa = p_id_empresa
      AND c.estado = 'CONTABILIZADO'
      AND c.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
      AND cc.naturaleza IN ('INGRESO', 'COSTO', 'GASTO')
  ),
  filas AS (
    SELECT
      'CUENTA'::text AS tipo_fila,
      c.codigo,
      c.nombre,
      c.naturaleza,
      c.variacion AS cambio_saldo,
      round(CASE
        WHEN c.clasificacion = 'DEPRECIACION_ACUMULADA' THEN greatest(c.variacion, 0)
        WHEN c.naturaleza = 'ACTIVO' THEN greatest(-c.variacion, 0)
        ELSE greatest(c.variacion, 0)
      END, 2)::numeric(14,2) AS origen,
      round(CASE
        WHEN c.clasificacion = 'DEPRECIACION_ACUMULADA' THEN greatest(-c.variacion, 0)
        WHEN c.naturaleza = 'ACTIVO' THEN greatest(c.variacion, 0)
        ELSE greatest(-c.variacion, 0)
      END, 2)::numeric(14,2) AS aplicacion,
      COALESCE(c.clasificacion, 'SIN_CLASIFICAR') AS actividad
    FROM cambios c
    WHERE c.variacion <> 0
  ),
  utilidad AS (
    SELECT
      'RESULTADO_PERIODO'::text AS tipo_fila,
      'RESULTADO-PERIODO'::text AS codigo,
      'Utilidad o pérdida del período'::text AS nombre,
      'PATRIMONIO'::text AS naturaleza,
      r.utilidad AS cambio_saldo,
      greatest(r.utilidad, 0)::numeric(14,2) AS origen,
      greatest(-r.utilidad, 0)::numeric(14,2) AS aplicacion,
      'RESULTADO'::text AS actividad
    FROM resultado_periodo r
    WHERE r.utilidad <> 0
  ),
  detalle AS (
    SELECT * FROM filas
    UNION ALL
    SELECT * FROM utilidad
  )
  SELECT d.tipo_fila, d.codigo, d.nombre, d.naturaleza,
         d.cambio_saldo, d.origen, d.aplicacion, d.actividad
  FROM detalle d
  UNION ALL
  SELECT
    'TOTAL'::text, NULL::text, 'Totales', 'TOTAL'::text,
    round(COALESCE(sum(d.origen), 0) - COALESCE(sum(d.aplicacion), 0), 2)::numeric(14,2),
    COALESCE(sum(d.origen), 0)::numeric(14,2),
    COALESCE(sum(d.aplicacion), 0)::numeric(14,2),
    'TOTAL'::text
  FROM detalle d
  ORDER BY 2 NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.reporte_origen_aplicacion(integer, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporte_origen_aplicacion(integer, date, date)
  TO authenticated;

COMMIT;
