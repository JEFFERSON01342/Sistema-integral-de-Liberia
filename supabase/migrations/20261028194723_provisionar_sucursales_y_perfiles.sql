-- Provisionamiento atomico de sucursales y asignacion segura de personal.
-- Aplicar despues de 032 en el proyecto nuevo de Supabase.

BEGIN;

ALTER TABLE public.sucursales
  ADD COLUMN creado_por uuid REFERENCES auth.users (id) ON DELETE RESTRICT;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_staff_requiere_sucursal_check
  CHECK (
    rol IN ('cliente', 'superadmin')
    OR (id_empresa IS NOT NULL AND id_sucursal IS NOT NULL)
  );

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
         AND p.rol IN ('superadmin', 'admin', 'gerente', 'cajero', 'despacho', 'vendedor')
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

CREATE OR REPLACE FUNCTION public.puede_administrar_sucursal(
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
         AND (
           p.rol = 'superadmin'
           OR (
             p.rol = 'admin'
             AND p.id_empresa = p_id_empresa
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

REVOKE ALL ON FUNCTION public.puede_ver_sucursal(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.puede_administrar_sucursal(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_ver_sucursal(integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_administrar_sucursal(integer, integer)
  TO authenticated;

DROP POLICY sucursales_insert_por_admin ON public.sucursales;
DROP POLICY sucursales_update_por_admin ON public.sucursales;
DROP POLICY sucursales_select_por_empresa ON public.sucursales;

CREATE POLICY sucursales_select_por_sucursal
  ON public.sucursales
  FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

CREATE POLICY sucursales_update_superadmin
  ON public.sucursales
  FOR UPDATE TO authenticated
  USING ((SELECT public.es_superadmin()))
  WITH CHECK ((SELECT public.es_superadmin()));

REVOKE INSERT ON TABLE public.sucursales FROM authenticated;

DROP POLICY bodegas_select_por_empresa ON public.bodegas;
DROP POLICY bodegas_insert_por_admin ON public.bodegas;
DROP POLICY bodegas_update_por_admin ON public.bodegas;

CREATE POLICY bodegas_select_por_sucursal
  ON public.bodegas
  FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

CREATE POLICY bodegas_insert_por_admin_sucursal
  ON public.bodegas
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

CREATE POLICY bodegas_update_por_admin_sucursal
  ON public.bodegas
  FOR UPDATE TO authenticated
  USING ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

DROP POLICY ubicaciones_select_por_empresa ON public.ubicaciones_bodega;
DROP POLICY ubicaciones_insert_por_admin ON public.ubicaciones_bodega;
DROP POLICY ubicaciones_update_por_admin ON public.ubicaciones_bodega;

CREATE POLICY ubicaciones_bodega_select_por_sucursal
  ON public.ubicaciones_bodega
  FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

CREATE POLICY ubicaciones_bodega_insert_por_admin_sucursal
  ON public.ubicaciones_bodega
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

CREATE POLICY ubicaciones_bodega_update_por_admin_sucursal
  ON public.ubicaciones_bodega
  FOR UPDATE TO authenticated
  USING ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

DROP POLICY cajas_insert_admin ON public.cajas;
DROP POLICY cajas_update_admin ON public.cajas;

CREATE POLICY cajas_insert_admin_sucursal
  ON public.cajas
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal))
    AND EXISTS (
      SELECT 1
      FROM public.sucursales AS s
      WHERE s.id_empresa = cajas.id_empresa
        AND s.id_sucursal = cajas.id_sucursal
        AND s.activa
    )
  );

CREATE POLICY cajas_update_admin_sucursal
  ON public.cajas
  FOR UPDATE TO authenticated
  USING ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

DROP POLICY perfil_select_propio_o_personal_empresa ON public.perfiles;
CREATE POLICY perfil_select_propio_o_personal_sucursal
  ON public.perfiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT public.puede_ver_sucursal(id_empresa, id_sucursal))
  );

DROP POLICY activos_fijos_select ON public.activos_fijos;
CREATE POLICY activos_fijos_select_sucursal
  ON public.activos_fijos FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY adquisiciones_activos_fijos_select ON public.adquisiciones_activos_fijos;
CREATE POLICY adquisiciones_activos_fijos_select_sucursal
  ON public.adquisiciones_activos_fijos FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY ajustes_inventario_select_empresa ON public.ajustes_inventario;
CREATE POLICY ajustes_inventario_select_sucursal
  ON public.ajustes_inventario FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY comprobantes_contables_select_empresa ON public.comprobantes_contables;
CREATE POLICY comprobantes_contables_select_sucursal
  ON public.comprobantes_contables FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY cuentas_por_pagar_select ON public.cuentas_por_pagar;
CREATE POLICY cuentas_por_pagar_select_sucursal
  ON public.cuentas_por_pagar FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY devoluciones_venta_select_empresa ON public.devoluciones_venta;
CREATE POLICY devoluciones_venta_select_sucursal
  ON public.devoluciones_venta FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY lotes_depreciacion_activos_fijos_select ON public.lotes_depreciacion_activos_fijos;
CREATE POLICY lotes_depreciacion_activos_fijos_select_sucursal
  ON public.lotes_depreciacion_activos_fijos FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY ordenes_compra_select_empresa ON public.ordenes_compra;
CREATE POLICY ordenes_compra_select_sucursal
  ON public.ordenes_compra FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY recepciones_compra_select_empresa ON public.recepciones_compra;
CREATE POLICY recepciones_compra_select_sucursal
  ON public.recepciones_compra FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

DROP POLICY stock_minimo_select_empresa ON public.stock_minimo_producto_sucursal;
DROP POLICY stock_minimo_admin_insert ON public.stock_minimo_producto_sucursal;
DROP POLICY stock_minimo_admin_update ON public.stock_minimo_producto_sucursal;
DROP POLICY stock_minimo_admin_delete ON public.stock_minimo_producto_sucursal;

CREATE POLICY stock_minimo_select_sucursal
  ON public.stock_minimo_producto_sucursal FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

CREATE POLICY stock_minimo_admin_insert_sucursal
  ON public.stock_minimo_producto_sucursal FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

CREATE POLICY stock_minimo_admin_update_sucursal
  ON public.stock_minimo_producto_sucursal FOR UPDATE TO authenticated
  USING ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

CREATE POLICY stock_minimo_admin_delete_sucursal
  ON public.stock_minimo_producto_sucursal FOR DELETE TO authenticated
  USING ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

DROP POLICY transferencias_inventario_select_empresa ON public.transferencias_inventario;
CREATE POLICY transferencias_inventario_select_sucursal
  ON public.transferencias_inventario FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_sucursal(id_empresa, id_sucursal)));

CREATE TABLE public.auditoria_asignaciones_sucursal (
  id_auditoria bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL REFERENCES public.empresa (id_empresa),
  id_sucursal integer NOT NULL,
  id_usuario uuid NOT NULL,
  realizado_por uuid NOT NULL,
  rol_anterior text NOT NULL,
  rol_nuevo text NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT auditoria_asignaciones_sucursal_fkey
    FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal)
);

ALTER TABLE public.auditoria_asignaciones_sucursal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auditoria_asignaciones_sucursal FROM anon, authenticated;
GRANT SELECT ON TABLE public.auditoria_asignaciones_sucursal TO authenticated;
CREATE POLICY auditoria_asignaciones_select_sucursal
  ON public.auditoria_asignaciones_sucursal
  FOR SELECT TO authenticated
  USING ((SELECT public.puede_administrar_sucursal(id_empresa, id_sucursal)));

CREATE OR REPLACE FUNCTION public.provisionar_sucursal_completa(
  p_id_empresa integer,
  p_codigo text,
  p_nombre text,
  p_direccion text DEFAULT NULL,
  p_telefono text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_codigo text := upper(trim(COALESCE(p_codigo, '')));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_id_sucursal integer;
  v_id_bodega bigint;
  v_id_caja bigint;
  v_ubicaciones jsonb;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT public.es_superadmin()) THEN
    RAISE EXCEPTION 'Solo un superadministrador puede crear sucursales.';
  END IF;
  IF p_id_empresa IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.empresa AS e
    WHERE e.id_empresa = p_id_empresa AND e.activa
  ) THEN
    RAISE EXCEPTION 'La empresa no existe o está inactiva.';
  END IF;
  IF v_codigo !~ '^[A-Z0-9][A-Z0-9_-]{1,19}$' THEN
    RAISE EXCEPTION 'El código debe tener de 2 a 20 caracteres: letras, números, guion o guion bajo.';
  END IF;
  IF char_length(v_nombre) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'El nombre de sucursal debe tener entre 2 y 120 caracteres.';
  END IF;

  INSERT INTO public.sucursales (
    id_empresa, codigo, nombre, direccion, telefono, es_principal, activa, creado_por
  )
  VALUES (
    p_id_empresa, v_codigo, v_nombre,
    NULLIF(trim(p_direccion), ''), NULLIF(trim(p_telefono), ''),
    false, true, v_actor
  )
  RETURNING id_sucursal INTO v_id_sucursal;

  INSERT INTO public.bodegas (
    id_empresa, id_sucursal, codigo, nombre, descripcion, activa
  )
  VALUES (
    p_id_empresa, v_id_sucursal, 'BOD-' || v_codigo,
    'Bodega principal ' || v_codigo,
    'Bodega inicial creada al provisionar la sucursal.',
    true
  )
  RETURNING id_bodega INTO v_id_bodega;

  INSERT INTO public.ubicaciones_bodega (
    id_empresa, id_sucursal, id_bodega, codigo, nombre, tipo_area
  )
  VALUES
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'REC-01', 'Recepción de mercancía', 'RECEPCION'),
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'ALM-01', 'Bodega', 'ALMACENAMIENTO'),
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'VTA-01', 'Área de ventas / exhibición', 'PICKING'),
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'DES-01', 'Despacho / Entregas', 'DESPACHO');

  SELECT jsonb_agg(
    jsonb_build_object(
      'id_ubicacion', u.id_ubicacion,
      'codigo', u.codigo,
      'nombre', u.nombre,
      'tipo_area', u.tipo_area
    )
    ORDER BY u.codigo
  )
  INTO v_ubicaciones
  FROM public.ubicaciones_bodega AS u
  WHERE u.id_empresa = p_id_empresa
    AND u.id_sucursal = v_id_sucursal;

  INSERT INTO public.cajas (
    id_empresa, id_sucursal, codigo, nombre, activa
  )
  VALUES (
    p_id_empresa, v_id_sucursal, 'CAJ-01', 'Caja principal ' || v_codigo, true
  )
  RETURNING id_caja INTO v_id_caja;

  RETURN jsonb_build_object(
    'id_empresa', p_id_empresa,
    'id_sucursal', v_id_sucursal,
    'codigo', v_codigo,
    'id_bodega', v_id_bodega,
    'id_caja', v_id_caja,
    'ubicaciones', COALESCE(v_ubicaciones, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provisionar_sucursal_completa(integer, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisionar_sucursal_completa(integer, text, text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.asignar_usuario_sucursal(
  p_email text,
  p_id_empresa integer,
  p_id_sucursal integer,
  p_rol text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_actor_rol text;
  v_actor_empresa integer;
  v_actor_sucursal integer;
  v_id_usuario uuid;
  v_rol_anterior text;
  v_empresa_anterior integer;
  v_sucursal_anterior integer;
  v_usuario_activo boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para asignar personal.';
  END IF;
  IF v_email IS NULL
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR position('@' IN v_email) < 2 THEN
    RAISE EXCEPTION 'Escribe un correo electrónico válido.';
  END IF;
  IF p_rol IS NULL
     OR p_rol NOT IN ('admin', 'gerente', 'cajero', 'despacho', 'vendedor') THEN
    RAISE EXCEPTION 'El rol solicitado no se puede asignar desde este flujo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.empresa AS e
    WHERE e.id_empresa = p_id_empresa AND e.activa
  ) OR NOT EXISTS (
    SELECT 1 FROM public.sucursales AS s
    WHERE s.id_empresa = p_id_empresa
      AND s.id_sucursal = p_id_sucursal
      AND s.activa
  ) THEN
    RAISE EXCEPTION 'La empresa o sucursal no existe o está inactiva.';
  END IF;

  SELECT p.rol, p.id_empresa, p.id_sucursal
  INTO v_actor_rol, v_actor_empresa, v_actor_sucursal
  FROM public.perfiles AS p
  WHERE p.id = v_actor AND p.activo;
  IF v_actor_rol IS NULL THEN
    RAISE EXCEPTION 'El perfil del administrador no está activo.';
  END IF;

  IF v_actor_rol = 'admin' THEN
    IF p_rol = 'admin'
       OR v_actor_empresa IS DISTINCT FROM p_id_empresa
       OR v_actor_sucursal IS DISTINCT FROM p_id_sucursal THEN
      RAISE EXCEPTION 'Un administrador solo puede asignar personal no administrativo a su propia sucursal.';
    END IF;
  ELSIF v_actor_rol <> 'superadmin' THEN
    RAISE EXCEPTION 'No tienes permiso para asignar personal.';
  END IF;

  SELECT p.id, p.rol, p.id_empresa, p.id_sucursal, p.activo
  INTO v_id_usuario, v_rol_anterior, v_empresa_anterior, v_sucursal_anterior, v_usuario_activo
  FROM public.perfiles AS p
  JOIN auth.users AS u ON u.id = p.id
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL
  FOR UPDATE OF p;

  IF v_id_usuario IS NULL THEN
    RAISE EXCEPTION 'No existe una cuenta registrada y verificada con ese correo.';
  END IF;
  IF NOT v_usuario_activo THEN
    RAISE EXCEPTION 'La cuenta está desactivada y no puede recibir acceso de personal.';
  END IF;
  IF v_id_usuario = v_actor THEN
    RAISE EXCEPTION 'No puedes cambiar tu propia asignación administrativa.';
  END IF;
  IF v_rol_anterior = 'superadmin' THEN
    RAISE EXCEPTION 'No se puede modificar un perfil superadministrador desde este flujo.';
  END IF;
  IF v_empresa_anterior IS NOT NULL
     AND v_empresa_anterior <> p_id_empresa THEN
    RAISE EXCEPTION 'La cuenta ya pertenece a otra empresa.';
  END IF;
  IF v_rol_anterior = 'admin' AND v_actor_rol <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo un superadministrador puede modificar una cuenta administradora.';
  END IF;
  IF v_actor_rol = 'admin'
     AND v_rol_anterior <> 'cliente'
     AND v_sucursal_anterior IS DISTINCT FROM p_id_sucursal THEN
    RAISE EXCEPTION 'Solo puedes modificar personal que ya pertenece a tu sucursal.';
  END IF;
  IF v_actor_rol = 'admin'
     AND v_rol_anterior = 'cliente'
     AND v_sucursal_anterior IS NOT NULL
     AND v_sucursal_anterior IS DISTINCT FROM p_id_sucursal THEN
    RAISE EXCEPTION 'No puedes cambiar de sucursal una cuenta ya vinculada a otra sucursal.';
  END IF;

  UPDATE public.perfiles
  SET rol = p_rol,
      id_empresa = p_id_empresa,
      id_sucursal = p_id_sucursal
  WHERE id = v_id_usuario;

  INSERT INTO public.auditoria_asignaciones_sucursal (
    id_empresa, id_sucursal, id_usuario, realizado_por, rol_anterior, rol_nuevo
  )
  VALUES (
    p_id_empresa, p_id_sucursal, v_id_usuario, v_actor, v_rol_anterior, p_rol
  );

  RETURN v_id_usuario;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_usuario_sucursal(text, integer, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_usuario_sucursal(text, integer, integer, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.proteger_desactivacion_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.activa AND NOT NEW.activa AND EXISTS (
    SELECT 1
    FROM public.sesiones_caja AS sc
    WHERE sc.id_empresa = OLD.id_empresa
      AND sc.id_sucursal = OLD.id_sucursal
      AND sc.estado = 'ABIERTA'
  ) THEN
    RAISE EXCEPTION 'Cierre las sesiones de caja abiertas antes de desactivar la sucursal.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sucursales_proteger_desactivacion
  BEFORE UPDATE OF activa ON public.sucursales
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_desactivacion_sucursal();

REVOKE ALL ON FUNCTION public.proteger_desactivacion_sucursal()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_operar_caja(
  p_id_empresa integer,
  p_id_sucursal integer,
  p_requiere_supervisor boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    JOIN public.sucursales AS s
      ON s.id_empresa = p.id_empresa
     AND s.id_sucursal = p.id_sucursal
     AND s.activa
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p_id_empresa IS NOT NULL
      AND p_id_sucursal IS NOT NULL
      AND (
        (
          p.rol = 'superadmin'
          AND s.id_empresa = p_id_empresa
          AND s.id_sucursal = p_id_sucursal
        )
        OR (
          p.id_empresa = p_id_empresa
          AND p.id_sucursal = p_id_sucursal
          AND (
            (p_requiere_supervisor AND p.rol IN ('admin', 'gerente'))
            OR (NOT p_requiere_supervisor AND p.rol IN ('admin', 'gerente', 'cajero'))
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.puede_operar_caja(integer, integer, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_operar_caja(integer, integer, boolean)
  TO authenticated;

COMMIT;
