-- Concede al rol Bodega acceso operativo sin ampliar el acceso financiero o de caja.
BEGIN;

ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_rol_check;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN (
    'superadmin', 'admin', 'gerente', 'contador', 'cajero', 'despacho', 'bodega', 'cliente'
  ));

CREATE OR REPLACE FUNCTION public.puede_ver_bodega_sucursal(
  p_id_empresa integer,
  p_id_sucursal integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT public.puede_ver_sucursal(p_id_empresa, p_id_sucursal))
      OR (
        p_id_empresa IS NOT NULL
        AND p_id_sucursal IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.perfiles AS p
          JOIN public.sucursales AS s
            ON s.id_empresa = p_id_empresa
           AND s.id_sucursal = p_id_sucursal
           AND s.activa
          WHERE p.id = (SELECT auth.uid())
            AND p.activo
            AND p.rol = 'bodega'
            AND p.id_empresa = p_id_empresa
            AND p.id_sucursal = p_id_sucursal
        )
      );
$$;

REVOKE ALL ON FUNCTION public.puede_ver_bodega_sucursal(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_ver_bodega_sucursal(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.puede_administrar_ubicacion(
  p_id_empresa integer,
  p_id_sucursal integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT public.puede_administrar_sucursal(p_id_empresa, p_id_sucursal))
      OR EXISTS (
        SELECT 1
        FROM public.perfiles AS p
        WHERE p.id = (SELECT auth.uid())
          AND p.activo
          AND p.rol = 'bodega'
          AND p.id_empresa = p_id_empresa
          AND p.id_sucursal = p_id_sucursal
          AND EXISTS (
            SELECT 1
            FROM public.sucursales AS s
            WHERE s.id_empresa = p_id_empresa
              AND s.id_sucursal = p_id_sucursal
              AND s.activa
          )
      );
$$;

REVOKE ALL ON FUNCTION public.puede_administrar_ubicacion(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_administrar_ubicacion(integer, integer) TO authenticated;

DROP POLICY IF EXISTS capas_fifo_select_empresa ON public.capas_inventario_fifo;
CREATE POLICY capas_fifo_select_empresa
ON public.capas_inventario_fifo
FOR SELECT TO authenticated
USING ((SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal)));

DROP POLICY IF EXISTS movimientos_inventario_select_empresa ON public.movimientos_inventario;
CREATE POLICY movimientos_inventario_select_empresa
ON public.movimientos_inventario
FOR SELECT TO authenticated
USING ((SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal)));

DROP POLICY IF EXISTS ordenes_compra_select_sucursal ON public.ordenes_compra;
CREATE POLICY ordenes_compra_select_sucursal
ON public.ordenes_compra
FOR SELECT TO authenticated
USING ((SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal)));

DROP POLICY IF EXISTS recepciones_compra_select_sucursal ON public.recepciones_compra;
CREATE POLICY recepciones_compra_select_sucursal
ON public.recepciones_compra
FOR SELECT TO authenticated
USING ((SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal)));

CREATE POLICY sucursales_select_bodega
ON public.sucursales
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p.rol = 'bodega'
      AND p.id_empresa = sucursales.id_empresa
      AND p.id_sucursal = sucursales.id_sucursal
      AND sucursales.activa
  )
);

CREATE POLICY bodegas_select_bodega
ON public.bodegas
FOR SELECT TO authenticated
USING (
  (SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal))
);

CREATE POLICY ubicaciones_select_bodega
ON public.ubicaciones_bodega
FOR SELECT TO authenticated
USING (
  (SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal))
);

DROP POLICY IF EXISTS detalles_orden_compra_select_empresa ON public.detalles_orden_compra;
CREATE POLICY detalles_orden_compra_select_empresa
ON public.detalles_orden_compra
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ordenes_compra AS o
    WHERE o.id_empresa = detalles_orden_compra.id_empresa
      AND o.id_orden_compra = detalles_orden_compra.id_orden_compra
      AND (SELECT public.puede_ver_bodega_sucursal(o.id_empresa, o.id_sucursal))
  )
);

DROP POLICY IF EXISTS detalles_recepcion_compra_select_empresa ON public.detalles_recepcion_compra;
CREATE POLICY detalles_recepcion_compra_select_empresa
ON public.detalles_recepcion_compra
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.recepciones_compra AS r
    WHERE r.id_empresa = detalles_recepcion_compra.id_empresa
      AND r.id_recepcion = detalles_recepcion_compra.id_recepcion
      AND (SELECT public.puede_ver_bodega_sucursal(r.id_empresa, r.id_sucursal))
  )
);

CREATE POLICY productos_select_bodega
ON public.productos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p.rol = 'bodega'
      AND p.id_empresa = productos.id_empresa
      AND (SELECT public.puede_ver_bodega_sucursal(p.id_empresa, p.id_sucursal))
  )
);

CREATE POLICY proveedores_select_bodega
ON public.proveedores
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    JOIN public.ordenes_compra AS o
      ON o.id_empresa = p.id_empresa
     AND o.id_sucursal = p.id_sucursal
     AND o.id_proveedor = proveedores.id_proveedor
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p.rol = 'bodega'
      AND proveedores.id_empresa = p.id_empresa
      AND (SELECT public.puede_ver_bodega_sucursal(o.id_empresa, o.id_sucursal))
  )
);

DROP POLICY IF EXISTS ubicaciones_bodega_insert_por_admin_sucursal ON public.ubicaciones_bodega;
CREATE POLICY ubicaciones_bodega_insert_por_admin_sucursal
ON public.ubicaciones_bodega
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.puede_administrar_ubicacion(id_empresa, id_sucursal))
);

CREATE OR REPLACE FUNCTION public.puede_recibir_compra_sucursal(
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
       JOIN public.sucursales AS s
         ON s.id_empresa = p_id_empresa
        AND s.id_sucursal = p_id_sucursal
        AND s.activa
       WHERE p.id = (SELECT auth.uid())
         AND p.activo
         AND (
           p.rol = 'superadmin'
           OR (
             p.id_empresa = p_id_empresa
             AND p.id_sucursal = p_id_sucursal
             AND p.rol IN ('admin', 'gerente', 'bodega')
           )
         )
     );
$$;

REVOKE ALL ON FUNCTION public.puede_recibir_compra_sucursal(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_recibir_compra_sucursal(integer, integer) TO authenticated;

DO $$
DECLARE
  v_definition text;
  v_old_check text := 'p_rol NOT IN (''admin'', ''gerente'', ''contador'', ''cajero'', ''despacho'')';
BEGIN
  SELECT pg_get_functiondef(
    'public.asignar_usuario_sucursal(text,integer,integer,text)'::regprocedure
  )
  INTO v_definition;

  IF position(v_old_check IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró la validación esperada de roles en asignar_usuario_sucursal.';
  END IF;

  v_definition := replace(
    v_definition,
    v_old_check,
    'p_rol NOT IN (''admin'', ''gerente'', ''contador'', ''cajero'', ''despacho'', ''bodega'')'
  );
  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_old_check text := 'public.puede_operar_caja(v_empresa, v_sucursal, true)';
BEGIN
  SELECT pg_get_functiondef(
    'public.recibir_orden_compra(bigint,bigint,jsonb,text,text,text)'::regprocedure
  )
  INTO v_definition;

  IF position(v_old_check IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró la validación esperada en recibir_orden_compra.';
  END IF;

  v_definition := replace(
    v_definition,
    v_old_check,
    'public.puede_recibir_compra_sucursal(v_empresa, v_sucursal)'
  );
  EXECUTE v_definition;
END;
$$;

COMMIT;
