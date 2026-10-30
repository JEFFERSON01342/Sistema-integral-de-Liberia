BEGIN;

CREATE OR REPLACE FUNCTION public.puede_consultar_sucursal_financiera(
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
       FROM public.perfiles p
       JOIN public.sucursales s
         ON s.id_empresa = p_id_empresa
        AND s.id_sucursal = p_id_sucursal
        AND s.activa
       WHERE p.id = (SELECT auth.uid())
         AND p.activo
         AND (
           p.rol = 'superadmin'
           OR (
             p.id_empresa = p_id_empresa
             AND (
               (p.rol IN ('admin', 'gerente') AND p.id_sucursal = p_id_sucursal)
               OR (p.rol = 'contador'
                     AND p.id_sucursal = p_id_sucursal
                     AND public.puede_ver_contabilidad_empresa(p_id_empresa))
             )
           )
         )
     );
$$;

REVOKE ALL ON FUNCTION public.puede_consultar_sucursal_financiera(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_consultar_sucursal_financiera(integer, integer)
  TO authenticated;

DO $$
DECLARE
  v_spec record;
  v_definition text;
  v_updated text;
  v_join text;
  v_new_join text;
  v_position integer;
  v_matches integer;
  v_permission_checks integer;
BEGIN
  FOR v_spec IN
    SELECT * FROM (VALUES
      (
        'public.reporte_balanza_comprobacion(integer,date,date)', 1
      ),
      (
        'public.reporte_balance_general(integer,date)', 2
      ),
      (
        'public.reporte_estado_resultados(integer,date,date)', 1
      ),
      (
        'public.reporte_flujo_efectivo(integer,date,date)', 3
      ),
      (
        'public.reporte_origen_aplicacion(integer,date,date)', 2
      )
    ) AS specs(old_signature, expected_joins)
  LOOP
    EXECUTE 'SELECT pg_catalog.pg_get_functiondef($1::regprocedure)'
      INTO STRICT v_definition
      USING v_spec.old_signature;

    v_position := strpos(v_definition, ')');
    IF v_position = 0 THEN
      RAISE EXCEPTION 'No se reconoce la definición actual de %.', v_spec.old_signature;
    END IF;
    v_updated := substring(v_definition FROM 1 FOR v_position - 1)
      || ', p_id_sucursal integer'
      || substring(v_definition FROM v_position);

    v_matches := (
      length(v_updated) - length(replace(v_updated, 'c.id_comprobante = l.id_comprobante', ''))
    ) / length('c.id_comprobante = l.id_comprobante');
    IF v_matches <> v_spec.expected_joins THEN
      RAISE EXCEPTION 'Número de enlaces con comprobantes inesperado en %: esperado %, se encontró %.',
        v_spec.old_signature, v_spec.expected_joins, v_matches;
    END IF;
    v_join := 'c.id_comprobante = l.id_comprobante';
    v_new_join := v_join ||
      ' AND (p_id_sucursal IS NULL OR c.id_sucursal = p_id_sucursal)';
    v_updated := replace(v_updated, v_join, v_new_join);
    v_permission_checks := (
      length(v_updated)
      - length(replace(v_updated, 'IF auth.uid() IS NULL OR NOT public.puede_ver_empresa(p_id_empresa) THEN', ''))
    ) / length('IF auth.uid() IS NULL OR NOT public.puede_ver_empresa(p_id_empresa) THEN');
    v_permission_checks := v_permission_checks + (
      length(v_updated)
      - length(replace(v_updated, 'IF auth.uid() IS NULL OR NOT public.puede_ver_contabilidad_empresa(p_id_empresa) THEN', ''))
    ) / length('IF auth.uid() IS NULL OR NOT public.puede_ver_contabilidad_empresa(p_id_empresa) THEN');
    IF v_permission_checks <> 1 THEN
      RAISE EXCEPTION 'Validación de acceso inesperada en %.', v_spec.old_signature;
    END IF;
    v_updated := replace(
      v_updated,
      'IF auth.uid() IS NULL OR NOT public.puede_ver_empresa(p_id_empresa) THEN',
      'IF auth.uid() IS NULL OR (p_id_sucursal IS NOT NULL AND NOT public.puede_consultar_sucursal_financiera(p_id_empresa, p_id_sucursal)) OR (p_id_sucursal IS NULL AND NOT public.es_superadmin()) THEN'
    );
    v_updated := replace(
      v_updated,
      'IF auth.uid() IS NULL OR NOT public.puede_ver_contabilidad_empresa(p_id_empresa) THEN',
      'IF auth.uid() IS NULL OR (p_id_sucursal IS NOT NULL AND NOT public.puede_consultar_sucursal_financiera(p_id_empresa, p_id_sucursal)) OR (p_id_sucursal IS NULL AND NOT public.es_superadmin()) THEN'
    );

    EXECUTE v_updated;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reporte_balanza_comprobacion(integer, date, date, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reporte_balance_general(integer, date, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reporte_estado_resultados(integer, date, date, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reporte_flujo_efectivo(integer, date, date, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reporte_origen_aplicacion(integer, date, date, integer)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.reporte_balanza_comprobacion(integer, date, date, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_balance_general(integer, date, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_estado_resultados(integer, date, date, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_flujo_efectivo(integer, date, date, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_origen_aplicacion(integer, date, date, integer)
  TO authenticated;

COMMIT;
