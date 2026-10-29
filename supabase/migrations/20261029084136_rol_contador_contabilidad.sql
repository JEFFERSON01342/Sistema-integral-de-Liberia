-- Incorpora al contador con acceso a operaciones y consultas contables específicas.
BEGIN;

ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_rol_check;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN (
    'superadmin', 'admin', 'gerente', 'contador', 'cajero', 'despacho', 'cliente'
  ));

CREATE OR REPLACE FUNCTION public.puede_ver_contabilidad_empresa(p_id_empresa integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_id_empresa IS NOT NULL
     AND (
       EXISTS (
         SELECT 1
         FROM public.perfiles AS p
         WHERE p.id = (SELECT auth.uid())
           AND p.activo
           AND p.id_empresa = p_id_empresa
           AND p.rol IN ('admin', 'contador')
       )
       OR (SELECT public.es_superadmin())
     );
$$;

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
         AND p.rol IN ('superadmin', 'admin', 'gerente', 'contador', 'cajero', 'despacho')
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

CREATE OR REPLACE FUNCTION public.puede_crear_comprobante_contable(
  p_id_empresa integer,
  p_id_sucursal integer,
  p_tipo text,
  p_origen_tipo text,
  p_origen_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT public.puede_administrar_empresa(p_id_empresa))
      OR (
        p_tipo = 'MANUAL'
        AND p_origen_tipo IS NULL
        AND p_origen_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.perfiles AS p
          JOIN public.sucursales AS s
            ON s.id_empresa = p.id_empresa
           AND s.id_sucursal = p.id_sucursal
           AND s.activa
          WHERE p.id = (SELECT auth.uid())
            AND p.activo
            AND p.rol = 'contador'
            AND p.id_empresa = p_id_empresa
            AND p.id_sucursal = p_id_sucursal
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.puede_gestionar_comprobante_contable(
  p_id_comprobante bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.comprobantes_contables AS c
    WHERE c.id_comprobante = p_id_comprobante
      AND (
        (SELECT public.puede_administrar_empresa(c.id_empresa))
        OR (
          c.tipo = 'MANUAL'
          AND c.origen_tipo IS NULL
          AND c.origen_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.perfiles AS p
            JOIN public.sucursales AS s
              ON s.id_empresa = p.id_empresa
             AND s.id_sucursal = p.id_sucursal
             AND s.activa
            WHERE p.id = (SELECT auth.uid())
              AND p.activo
              AND p.rol = 'contador'
              AND p.id_empresa = c.id_empresa
              AND p.id_sucursal = c.id_sucursal
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.puede_ver_contabilidad_empresa(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_crear_comprobante_contable(integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_gestionar_comprobante_contable(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_ver_contabilidad_empresa(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_crear_comprobante_contable(integer, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_comprobante_contable(bigint) TO authenticated;

DROP POLICY IF EXISTS cuentas_contables_select_empresa ON public.cuentas_contables;
CREATE POLICY cuentas_contables_select_empresa
  ON public.cuentas_contables FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_empresa(id_empresa))
    OR (SELECT public.puede_ver_contabilidad_empresa(id_empresa))
  );

DROP POLICY IF EXISTS cuentas_contables_insert_admin ON public.cuentas_contables;
CREATE POLICY cuentas_contables_insert_admin
  ON public.cuentas_contables FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.puede_ver_contabilidad_empresa(id_empresa)));

DROP POLICY IF EXISTS cuentas_contables_update_admin ON public.cuentas_contables;
CREATE POLICY cuentas_contables_update_admin
  ON public.cuentas_contables FOR UPDATE TO authenticated
  USING ((SELECT public.puede_ver_contabilidad_empresa(id_empresa)))
  WITH CHECK ((SELECT public.puede_ver_contabilidad_empresa(id_empresa)));

DROP POLICY IF EXISTS periodos_contables_select_empresa ON public.periodos_contables;
CREATE POLICY periodos_contables_select_empresa
  ON public.periodos_contables FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_empresa(id_empresa))
    OR (SELECT public.puede_ver_contabilidad_empresa(id_empresa))
  );

DROP POLICY IF EXISTS comprobantes_contables_select_sucursal ON public.comprobantes_contables;
CREATE POLICY comprobantes_contables_select_sucursal
  ON public.comprobantes_contables FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_sucursal(id_empresa, id_sucursal))
    OR (SELECT public.puede_ver_contabilidad_empresa(id_empresa))
  );

DROP POLICY IF EXISTS lineas_comprobante_select_empresa ON public.lineas_comprobante_contable;
CREATE POLICY lineas_comprobante_select_empresa
  ON public.lineas_comprobante_contable FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_empresa(id_empresa))
    OR (SELECT public.puede_ver_contabilidad_empresa(id_empresa))
  );

DROP POLICY IF EXISTS clasificaciones_flujo_select_empresa ON public.clasificaciones_flujo_efectivo;
CREATE POLICY clasificaciones_flujo_select_empresa
  ON public.clasificaciones_flujo_efectivo FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_empresa(id_empresa))
    OR (SELECT public.puede_ver_contabilidad_empresa(id_empresa))
  );

CREATE POLICY empresa_select_contabilidad
  ON public.empresa FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_contabilidad_empresa(id_empresa)));

DO $$
DECLARE
  v_function record;
  v_definition text;
  v_original text;
  v_replaced_count integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'reporte_balanza_comprobacion',
        'reporte_balance_general',
        'reporte_estado_resultados',
        'reporte_flujo_efectivo',
        'reporte_origen_aplicacion'
      )
  LOOP
    v_original := pg_get_functiondef(v_function.oid);
    v_definition := replace(
      v_original,
      'public.puede_ver_empresa(p_id_empresa)',
      'public.puede_ver_contabilidad_empresa(p_id_empresa)'
    );
    IF v_definition = v_original THEN
      RAISE EXCEPTION 'No se pudo actualizar el permiso de %.', v_function.proname;
    END IF;
    EXECUTE v_definition;
    v_replaced_count := v_replaced_count + 1;
  END LOOP;

  IF v_replaced_count <> 5 THEN
    RAISE EXCEPTION 'Se esperaban 5 funciones de reportes contables; se encontraron %.', v_replaced_count;
  END IF;
END;
$$;

DO $$
DECLARE
  v_function record;
  v_definition text;
  v_original text;
  v_replaced_count integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'crear_comprobante_borrador',
        'contabilizar_comprobante',
        'cancelar_comprobante_borrador',
        'revertir_comprobante_contable'
      )
  LOOP
    v_original := pg_get_functiondef(v_function.oid);
    IF v_function.proname = 'crear_comprobante_borrador' THEN
      v_definition := replace(
        v_original,
        'public.puede_administrar_empresa(p_id_empresa)',
        'public.puede_crear_comprobante_contable(p_id_empresa, p_id_sucursal, p_tipo, p_origen_tipo, p_origen_id)'
      );
    ELSE
      v_definition := replace(
        v_original,
        'public.puede_administrar_empresa(v_empresa)',
        'public.puede_gestionar_comprobante_contable(p_id_comprobante)'
      );
    END IF;
    IF v_definition = v_original THEN
      RAISE EXCEPTION 'No se pudo actualizar el permiso de %.', v_function.proname;
    END IF;
    EXECUTE v_definition;
    v_replaced_count := v_replaced_count + 1;
  END LOOP;

  IF v_replaced_count <> 4 THEN
    RAISE EXCEPTION 'Se esperaban 4 funciones de comprobantes; se encontraron %.', v_replaced_count;
  END IF;
END;
$$;

DO $$
DECLARE
  v_function record;
  v_definition text;
  v_original text;
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid) AS definition
  INTO v_function
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname = 'asignar_usuario_sucursal';

  IF v_function.oid IS NULL THEN
    RAISE EXCEPTION 'No se encontró asignar_usuario_sucursal.';
  END IF;

  v_original := v_function.definition;
  v_definition := replace(
    v_original,
    'p_rol NOT IN (''admin'', ''gerente'', ''cajero'', ''despacho'')',
    'p_rol NOT IN (''admin'', ''gerente'', ''contador'', ''cajero'', ''despacho'')'
  );
  IF v_definition = v_original THEN
    RAISE EXCEPTION 'No se pudo ampliar la lista de roles asignables.';
  END IF;
  EXECUTE v_definition;
END;
$$;

COMMIT;
