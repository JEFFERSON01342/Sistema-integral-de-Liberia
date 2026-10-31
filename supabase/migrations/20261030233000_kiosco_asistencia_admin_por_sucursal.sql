BEGIN;

DROP FUNCTION public.listar_empleados_kiosco_asistencia();
DROP FUNCTION public.registrar_marcacion_kiosco_asistencia(bigint, text);

CREATE FUNCTION public.listar_empleados_kiosco_asistencia(p_id_sucursal integer)
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
  v_sucursal record;
  v_fecha date;
BEGIN
  SELECT p.id_empresa, p.id_sucursal, p.rol, p.activo
  INTO v_perfil
  FROM public.perfiles AS p
  WHERE p.id = (SELECT auth.uid());

  IF NOT FOUND OR NOT v_perfil.activo
     OR v_perfil.rol NOT IN ('asistencia', 'admin', 'superadmin') THEN
    RAISE EXCEPTION 'La cuenta no tiene acceso al kiosco de asistencia.';
  END IF;

  IF v_perfil.rol IN ('asistencia', 'admin')
     AND v_perfil.id_sucursal IS DISTINCT FROM p_id_sucursal THEN
    RAISE EXCEPTION 'Solo puedes consultar el kiosco de tu sucursal asignada.';
  END IF;

  SELECT s.id_empresa, s.id_sucursal, s.activa, e.zona_horaria
  INTO v_sucursal
  FROM public.sucursales AS s
  JOIN public.empresa AS e ON e.id_empresa = s.id_empresa
  WHERE s.id_empresa = v_perfil.id_empresa
    AND s.id_sucursal = p_id_sucursal;

  IF NOT FOUND OR NOT v_sucursal.activa THEN
    RAISE EXCEPTION 'La sucursal no existe o está inactiva.';
  END IF;

  v_fecha := (statement_timestamp() AT TIME ZONE v_sucursal.zona_horaria)::date;

  RETURN QUERY
  SELECT emp.id_empleado, emp.nombre_completo, a.hora_entrada, a.hora_salida
  FROM public.empleados AS emp
  LEFT JOIN public.asistencias AS a
    ON a.id_empresa = emp.id_empresa
   AND a.id_empleado = emp.id_empleado
   AND a.fecha = v_fecha
  WHERE emp.id_empresa = v_sucursal.id_empresa
    AND emp.id_sucursal = v_sucursal.id_sucursal
    AND emp.estado = 'Activo'
  ORDER BY emp.nombre_completo;
END;
$$;

CREATE FUNCTION public.registrar_marcacion_kiosco_asistencia(
  p_id_empleado bigint,
  p_pin text,
  p_id_sucursal integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil record;
  v_sucursal record;
  v_pin_hash text;
  v_intentos public.intentos_pin_asistencia%ROWTYPE;
  v_asistencia public.asistencias%ROWTYPE;
  v_fecha date;
  v_hora time;
  v_ahora timestamptz := clock_timestamp();
  v_intentos_actuales integer;
  v_bloqueado_hasta timestamptz;
BEGIN
  SELECT p.id_empresa, p.id_sucursal, p.rol, p.activo
  INTO v_perfil
  FROM public.perfiles AS p
  WHERE p.id = (SELECT auth.uid());

  IF NOT FOUND OR NOT v_perfil.activo
     OR v_perfil.rol NOT IN ('asistencia', 'admin', 'superadmin') THEN
    RAISE EXCEPTION 'La cuenta no tiene acceso al kiosco de asistencia.';
  END IF;

  IF v_perfil.rol IN ('asistencia', 'admin')
     AND v_perfil.id_sucursal IS DISTINCT FROM p_id_sucursal THEN
    RAISE EXCEPTION 'Solo puedes registrar asistencia en tu sucursal asignada.';
  END IF;

  SELECT s.id_empresa, s.id_sucursal, s.activa, e.zona_horaria
  INTO v_sucursal
  FROM public.sucursales AS s
  JOIN public.empresa AS e ON e.id_empresa = s.id_empresa
  WHERE s.id_empresa = v_perfil.id_empresa
    AND s.id_sucursal = p_id_sucursal;

  IF NOT FOUND OR NOT v_sucursal.activa THEN
    RAISE EXCEPTION 'La sucursal no existe o está inactiva.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empleados AS emp
    WHERE emp.id_empleado = p_id_empleado
      AND emp.id_empresa = v_sucursal.id_empresa
      AND emp.id_sucursal = v_sucursal.id_sucursal
      AND emp.estado = 'Activo'
  ) THEN
    RAISE EXCEPTION 'El empleado no está activo en esta sucursal.';
  END IF;

  INSERT INTO public.intentos_pin_asistencia (
    id_empresa, id_sucursal, id_empleado
  )
  VALUES (v_sucursal.id_empresa, v_sucursal.id_sucursal, p_id_empleado)
  ON CONFLICT (id_empresa, id_sucursal, id_empleado) DO NOTHING;

  SELECT attempts.*
  INTO v_intentos
  FROM public.intentos_pin_asistencia AS attempts
  WHERE attempts.id_empresa = v_sucursal.id_empresa
    AND attempts.id_sucursal = v_sucursal.id_sucursal
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
  WHERE pines.id_empresa = v_sucursal.id_empresa
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
    WHERE id_empresa = v_sucursal.id_empresa
      AND id_sucursal = v_sucursal.id_sucursal
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
  WHERE id_empresa = v_sucursal.id_empresa
    AND id_sucursal = v_sucursal.id_sucursal
    AND id_empleado = p_id_empleado;

  v_fecha := (v_ahora AT TIME ZONE v_sucursal.zona_horaria)::date;
  v_hora := (v_ahora AT TIME ZONE v_sucursal.zona_horaria)::time;

  SELECT attendance.*
  INTO v_asistencia
  FROM public.asistencias AS attendance
  WHERE attendance.id_empresa = v_sucursal.id_empresa
    AND attendance.id_empleado = p_id_empleado
    AND attendance.fecha = v_fecha
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.asistencias (
      id_empresa, id_empleado, id_sucursal, fecha, hora_entrada,
      estado, registrado_por
    )
    VALUES (
      v_sucursal.id_empresa, p_id_empleado, v_sucursal.id_sucursal,
      v_fecha, v_hora, 'presente', (SELECT auth.uid())
    )
    ON CONFLICT (id_empresa, id_empleado, fecha) DO NOTHING;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true, 'tipo', 'entrada', 'hora', v_hora,
        'message', 'Entrada registrada correctamente.'
      );
    END IF;

    SELECT attendance.*
    INTO v_asistencia
    FROM public.asistencias AS attendance
    WHERE attendance.id_empresa = v_sucursal.id_empresa
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

REVOKE ALL ON FUNCTION public.listar_empleados_kiosco_asistencia(integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_marcacion_kiosco_asistencia(bigint, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.listar_empleados_kiosco_asistencia(integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_marcacion_kiosco_asistencia(bigint, text, integer)
  TO authenticated;

COMMIT;
