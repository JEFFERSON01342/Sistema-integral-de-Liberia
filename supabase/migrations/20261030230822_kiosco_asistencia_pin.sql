BEGIN;

ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_rol_check;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN (
    'superadmin', 'admin', 'gerente', 'contador', 'bodega',
    'cajero', 'despacho', 'asistencia', 'cliente'
  ));

DO $$
DECLARE
  v_definition text;
  v_old_roles text :=
    'p_rol NOT IN (''admin'', ''gerente'', ''contador'', ''cajero'', ''despacho'', ''bodega'')';
  v_old_admin_check text :=
    'IF p_rol = ''admin''' || E'\n       OR v_actor_empresa IS DISTINCT FROM p_id_empresa';
BEGIN
  SELECT pg_get_functiondef(
    'public.asignar_usuario_sucursal(text,integer,integer,text)'::regprocedure
  )
  INTO v_definition;

  IF position(v_old_roles IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró la validación esperada de roles en asignar_usuario_sucursal.';
  END IF;
  v_definition := replace(
    v_definition,
    v_old_roles,
    'p_rol NOT IN (''admin'', ''gerente'', ''contador'', ''cajero'', ''despacho'', ''bodega'', ''asistencia'')'
  );

  IF position(v_old_admin_check IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró la restricción de asignación administrativa esperada.';
  END IF;
  v_definition := replace(
    v_definition,
    v_old_admin_check,
    'IF p_rol IN (''admin'', ''asistencia'')' ||
      E'\n       OR v_actor_empresa IS DISTINCT FROM p_id_empresa'
  );

  EXECUTE v_definition;
END;
$$;

CREATE TABLE public.empleados_pines_asistencia (
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  pin_hash text NOT NULL,
  creado_por uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id_empresa, id_empleado),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT
);

CREATE TABLE public.intentos_pin_asistencia (
  id_empresa integer NOT NULL,
  id_sucursal integer NOT NULL,
  id_empleado bigint NOT NULL,
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  bloqueado_hasta timestamptz,
  PRIMARY KEY (id_empresa, id_sucursal, id_empleado),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT
);

ALTER TABLE public.empleados_pines_asistencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intentos_pin_asistencia ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.empleados_pines_asistencia,
  public.intentos_pin_asistencia
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generar_pin_asistencia(p_id_empleado bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empleado record;
  v_rol text;
  v_random bytea := extensions.gen_random_bytes(4);
  v_pin text;
BEGIN
  SELECT p.rol
  INTO v_rol
  FROM public.perfiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND p.activo;

  IF v_rol NOT IN ('superadmin', 'admin') OR v_rol IS NULL THEN
    RAISE EXCEPTION 'No tienes permiso para administrar PIN de asistencia.';
  END IF;

  SELECT e.id_empresa, e.id_sucursal
  INTO v_empleado
  FROM public.empleados AS e
  WHERE e.id_empleado = p_id_empleado
    AND e.estado = 'Activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No puedes administrar el PIN de este empleado.';
  END IF;
  IF NOT public.puede_gestionar_rrhh(v_empleado.id_empresa, v_empleado.id_sucursal) THEN
    RAISE EXCEPTION 'No puedes administrar el PIN de este empleado.';
  END IF;

  v_pin := lpad((
    (
      get_byte(v_random, 0)::bigint * 16777216
      + get_byte(v_random, 1)::bigint * 65536
      + get_byte(v_random, 2)::bigint * 256
      + get_byte(v_random, 3)::bigint
    ) % 1000000
  )::text, 6, '0');

  INSERT INTO public.empleados_pines_asistencia (
    id_empresa, id_empleado, pin_hash, creado_por
  )
  VALUES (
    v_empleado.id_empresa,
    p_id_empleado,
    extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
    (SELECT auth.uid())
  )
  ON CONFLICT (id_empresa, id_empleado) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      creado_por = EXCLUDED.creado_por,
      creado_en = clock_timestamp();

  RETURN v_pin;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_empleados_kiosco_asistencia()
RETURNS TABLE (
  id_empleado bigint,
  nombre_completo text,
  hora_entrada time,
  hora_salida time
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil record;
  v_fecha date;
BEGIN
  SELECT p.id_empresa, p.id_sucursal, p.rol, p.activo,
         s.activa AS sucursal_activa, e.zona_horaria
  INTO v_perfil
  FROM public.perfiles AS p
  JOIN public.sucursales AS s
    ON s.id_empresa = p.id_empresa
   AND s.id_sucursal = p.id_sucursal
  JOIN public.empresa AS e ON e.id_empresa = p.id_empresa
  WHERE p.id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no tiene acceso al kiosco de esta sucursal.';
  END IF;
  IF NOT v_perfil.activo
     OR v_perfil.rol <> 'asistencia'
     OR NOT v_perfil.sucursal_activa THEN
    RAISE EXCEPTION 'La cuenta no tiene acceso al kiosco de esta sucursal.';
  END IF;

  v_fecha := (statement_timestamp() AT TIME ZONE v_perfil.zona_horaria)::date;

  RETURN QUERY
  SELECT emp.id_empleado, emp.nombre_completo, a.hora_entrada, a.hora_salida
  FROM public.empleados AS emp
  LEFT JOIN public.asistencias AS a
    ON a.id_empresa = emp.id_empresa
   AND a.id_empleado = emp.id_empleado
   AND a.fecha = v_fecha
  WHERE emp.id_empresa = v_perfil.id_empresa
    AND emp.id_sucursal = v_perfil.id_sucursal
    AND emp.estado = 'Activo'
  ORDER BY emp.nombre_completo;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_marcacion_kiosco_asistencia(
  p_id_empleado bigint,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil record;
  v_empleado record;
  v_pin_hash text;
  v_intentos public.intentos_pin_asistencia%ROWTYPE;
  v_asistencia public.asistencias%ROWTYPE;
  v_fecha date;
  v_hora time;
  v_ahora timestamptz := clock_timestamp();
  v_entrada_id bigint;
  v_intentos_actuales integer;
  v_bloqueado_hasta timestamptz;
BEGIN
  SELECT p.id_empresa, p.id_sucursal, p.rol, p.activo,
         s.activa AS sucursal_activa, e.zona_horaria
  INTO v_perfil
  FROM public.perfiles AS p
  JOIN public.sucursales AS s
    ON s.id_empresa = p.id_empresa
   AND s.id_sucursal = p.id_sucursal
  JOIN public.empresa AS e ON e.id_empresa = p.id_empresa
  WHERE p.id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no tiene acceso al kiosco de esta sucursal.';
  END IF;
  IF NOT v_perfil.activo
     OR v_perfil.rol <> 'asistencia'
     OR NOT v_perfil.sucursal_activa THEN
    RAISE EXCEPTION 'La cuenta no tiene acceso al kiosco de esta sucursal.';
  END IF;

  SELECT emp.id_empresa, emp.id_sucursal
  INTO v_empleado
  FROM public.empleados AS emp
  WHERE emp.id_empleado = p_id_empleado
    AND emp.id_empresa = v_perfil.id_empresa
    AND emp.id_sucursal = v_perfil.id_sucursal
    AND emp.estado = 'Activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado no está activo en esta sucursal.';
  END IF;

  INSERT INTO public.intentos_pin_asistencia (
    id_empresa, id_sucursal, id_empleado
  )
  VALUES (
    v_perfil.id_empresa, v_perfil.id_sucursal, p_id_empleado
  )
  ON CONFLICT (id_empresa, id_sucursal, id_empleado) DO NOTHING;

  SELECT attempts.*
  INTO v_intentos
  FROM public.intentos_pin_asistencia AS attempts
  WHERE attempts.id_empresa = v_perfil.id_empresa
    AND attempts.id_sucursal = v_perfil.id_sucursal
    AND attempts.id_empleado = p_id_empleado
  FOR UPDATE;

  IF v_intentos.bloqueado_hasta > v_ahora THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Demasiados intentos. Espera antes de volver a intentarlo.'
    );
  END IF;

  SELECT pines.pin_hash
  INTO v_pin_hash
  FROM public.empleados_pines_asistencia AS pines
  WHERE pines.id_empresa = v_perfil.id_empresa
    AND pines.id_empleado = p_id_empleado;

  IF v_pin_hash IS NULL
     OR p_pin IS NULL
     OR p_pin !~ '^[0-9]{6}$'
     OR extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash THEN
    v_intentos_actuales := CASE
      WHEN v_intentos.bloqueado_hasta IS NOT NULL
       AND v_intentos.bloqueado_hasta <= v_ahora THEN 1
      ELSE v_intentos.intentos + 1
    END;
    v_bloqueado_hasta := CASE
      WHEN v_intentos_actuales >= 5 THEN v_ahora + interval '15 minutes'
      ELSE NULL
    END;

    UPDATE public.intentos_pin_asistencia
    SET intentos = v_intentos_actuales,
        bloqueado_hasta = v_bloqueado_hasta
    WHERE id_empresa = v_perfil.id_empresa
      AND id_sucursal = v_perfil.id_sucursal
      AND id_empleado = p_id_empleado;

    RETURN jsonb_build_object(
      'success', false,
      'message', CASE
        WHEN v_bloqueado_hasta IS NOT NULL
          THEN 'Demasiados intentos. PIN bloqueado durante 15 minutos.'
        ELSE 'PIN incorrecto.'
      END
    );
  END IF;

  UPDATE public.intentos_pin_asistencia
  SET intentos = 0, bloqueado_hasta = NULL
  WHERE id_empresa = v_perfil.id_empresa
    AND id_sucursal = v_perfil.id_sucursal
    AND id_empleado = p_id_empleado;

  v_fecha := (v_ahora AT TIME ZONE v_perfil.zona_horaria)::date;
  v_hora := (v_ahora AT TIME ZONE v_perfil.zona_horaria)::time;

  SELECT attendance.*
  INTO v_asistencia
  FROM public.asistencias AS attendance
  WHERE attendance.id_empresa = v_perfil.id_empresa
    AND attendance.id_empleado = p_id_empleado
    AND attendance.fecha = v_fecha
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.asistencias (
      id_empresa, id_empleado, id_sucursal, fecha, hora_entrada,
      estado, registrado_por
    )
    VALUES (
      v_perfil.id_empresa, p_id_empleado, v_perfil.id_sucursal,
      v_fecha, v_hora, 'presente', (SELECT auth.uid())
    )
    ON CONFLICT (id_empresa, id_empleado, fecha) DO NOTHING
    RETURNING id INTO v_entrada_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true, 'tipo', 'entrada', 'hora', v_hora,
        'message', 'Entrada registrada correctamente.'
      );
    END IF;

    SELECT attendance.*
    INTO v_asistencia
    FROM public.asistencias AS attendance
    WHERE attendance.id_empresa = v_perfil.id_empresa
      AND attendance.id_empleado = p_id_empleado
      AND attendance.fecha = v_fecha
    FOR UPDATE;
  END IF;

  IF v_asistencia.hora_salida IS NULL THEN
    UPDATE public.asistencias
    SET hora_salida = v_hora
    WHERE id = v_asistencia.id
    RETURNING * INTO v_asistencia;

    RETURN jsonb_build_object(
      'success', true, 'tipo', 'salida', 'hora', v_hora,
      'message', 'Salida registrada correctamente.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'message', 'La entrada y salida de hoy ya están registradas.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generar_pin_asistencia(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.listar_empleados_kiosco_asistencia()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_marcacion_kiosco_asistencia(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.generar_pin_asistencia(bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_empleados_kiosco_asistencia()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_marcacion_kiosco_asistencia(bigint, text)
  TO authenticated;

COMMIT;
