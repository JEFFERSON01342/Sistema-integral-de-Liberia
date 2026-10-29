-- No asignar perfiles desactivados ni mover clientes ya vinculados a otra sucursal.

BEGIN;

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

COMMIT;
