BEGIN;

CREATE TABLE public.empleados (
  id_empleado bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL REFERENCES public.empresa (id_empresa) ON DELETE RESTRICT,
  id_sucursal integer,
  id_perfil uuid UNIQUE REFERENCES public.perfiles (id) ON DELETE SET NULL,
  nombre_completo text NOT NULL CHECK (char_length(trim(nombre_completo)) BETWEEN 2 AND 160),
  identificacion text,
  email text,
  telefono text,
  puesto text,
  departamento text,
  salario_mensual numeric(14,2) NOT NULL DEFAULT 0 CHECK (salario_mensual >= 0),
  fecha_ingreso date,
  cuenta_bancaria text,
  estado text NOT NULL DEFAULT 'Activo'
    CHECK (estado IN ('Activo', 'Inactivo', 'Suspendido', 'Terminado')),
  fecha_registro timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_empresa, id_empleado),
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX empleados_identificacion_empresa_uidx
  ON public.empleados (id_empresa, lower(trim(identificacion)))
  WHERE nullif(trim(identificacion), '') IS NOT NULL;

CREATE TABLE public.contratos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  id_sucursal integer,
  tipo_contrato text NOT NULL DEFAULT 'indefinido'
    CHECK (tipo_contrato IN ('indefinido', 'determinado', 'por_obra', 'temporal')),
  cargo text,
  jornada text DEFAULT 'tiempo_completo'
    CHECK (jornada IN ('tiempo_completo', 'medio_tiempo', 'por_horas')),
  salario numeric(14,2) NOT NULL DEFAULT 0 CHECK (salario >= 0),
  fecha_inicio date NOT NULL,
  fecha_fin date,
  periodo_prueba boolean NOT NULL DEFAULT false,
  clausulas text,
  estado text NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('vigente', 'finalizado', 'suspendido', 'rescindido')),
  archivo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE TABLE public.asistencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  id_sucursal integer,
  fecha date NOT NULL,
  hora_entrada time,
  hora_salida time,
  estado text NOT NULL DEFAULT 'presente'
    CHECK (estado IN ('presente', 'ausente', 'tardanza', 'permiso', 'incapacidad')),
  observaciones text,
  registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_salida IS NULL OR hora_entrada IS NULL OR hora_salida >= hora_entrada),
  UNIQUE (id_empresa, id_empleado, fecha),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE TABLE public.vacaciones_permisos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  id_sucursal integer,
  tipo text NOT NULL DEFAULT 'vacaciones'
    CHECK (tipo IN ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'subsidio', 'incapacidad')),
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  dias numeric(8,2) NOT NULL DEFAULT 0 CHECK (dias >= 0),
  motivo text,
  estado text NOT NULL DEFAULT 'solicitado'
    CHECK (estado IN ('solicitado', 'aprobado', 'rechazado', 'gozado')),
  aprobado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE TABLE public.prestaciones_laborales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  id_sucursal integer,
  tipo text NOT NULL
    CHECK (tipo IN ('aguinaldo', 'vacaciones', 'indemnizacion', 'bono', 'otro')),
  periodo_inicio date,
  periodo_fin date,
  monto numeric(14,2) NOT NULL CHECK (monto >= 0),
  estado text NOT NULL DEFAULT 'provisionada'
    CHECK (estado IN ('provisionada', 'pagada', 'anulada')),
  fecha_pago date,
  concepto text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (periodo_fin IS NULL OR periodo_inicio IS NULL OR periodo_fin >= periodo_inicio),
  CHECK ((estado = 'pagada' AND fecha_pago IS NOT NULL) OR estado <> 'pagada'),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE TABLE public.seguridad_higiene (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_sucursal integer,
  id_empleado bigint,
  tipo text NOT NULL DEFAULT 'capacitacion'
    CHECK (tipo IN ('capacitacion', 'inspeccion', 'accidente', 'incidente', 'epp', 'simulacro')),
  titulo text NOT NULL,
  descripcion text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  severidad text DEFAULT 'baja' CHECK (severidad IN ('baja', 'media', 'alta')),
  responsable text,
  acciones text,
  estado text NOT NULL DEFAULT 'abierto'
    CHECK (estado IN ('abierto', 'en_proceso', 'cerrado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE TABLE public.marco_legal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL REFERENCES public.empresa (id_empresa) ON DELETE RESTRICT,
  categoria text NOT NULL DEFAULT 'laboral',
  nombre_documento text NOT NULL,
  descripcion text,
  entidad text,
  referencia_legal text,
  archivo_url text,
  fecha_vencimiento date,
  estado text NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('vigente', 'por_renovar', 'vencido')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cumplimiento_obligaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_sucursal integer,
  obligacion text NOT NULL,
  entidad text NOT NULL DEFAULT 'DGI',
  periodicidad text NOT NULL DEFAULT 'mensual',
  periodo text,
  fecha_limite date NOT NULL,
  monto numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_proceso', 'presentado', 'pagado', 'vencido')),
  responsable text,
  comprobante text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE TABLE public.nomina_periodos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL REFERENCES public.empresa (id_empresa) ON DELETE RESTRICT,
  id_sucursal integer,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  tipo text NOT NULL DEFAULT 'mensual'
    CHECK (tipo IN ('semanal', 'quincenal', 'mensual', 'extraordinario')),
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'procesada', 'pagada', 'anulada')),
  total_bruto numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_bruto >= 0),
  total_deducciones numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_deducciones >= 0),
  total_neto numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_neto >= 0),
  total_costo_empresa numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_costo_empresa >= 0),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (periodo_fin >= periodo_inicio),
  UNIQUE (id_empresa, id),
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX nomina_periodos_sin_duplicados_uidx
  ON public.nomina_periodos (
    id_empresa,
    coalesce(id_sucursal, 0),
    periodo_inicio,
    periodo_fin,
    tipo
  )
  WHERE estado <> 'anulada';

CREATE TABLE public.nomina_detalle (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_periodo bigint NOT NULL,
  id_empleado bigint NOT NULL,
  salario_bruto numeric(14,2) NOT NULL CHECK (salario_bruto >= 0),
  inss_laboral numeric(14,2) NOT NULL DEFAULT 0 CHECK (inss_laboral >= 0),
  ir_mensual numeric(14,2) NOT NULL DEFAULT 0 CHECK (ir_mensual >= 0),
  otros_descuentos numeric(14,2) NOT NULL DEFAULT 0 CHECK (otros_descuentos >= 0),
  otros_ingresos numeric(14,2) NOT NULL DEFAULT 0 CHECK (otros_ingresos >= 0),
  salario_neto numeric(14,2) NOT NULL DEFAULT 0 CHECK (salario_neto >= 0),
  monto_pagado numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0 AND monto_pagado <= salario_neto),
  inss_patronal numeric(14,2) NOT NULL DEFAULT 0 CHECK (inss_patronal >= 0),
  inatec numeric(14,2) NOT NULL DEFAULT 0 CHECK (inatec >= 0),
  aguinaldo_provisionado numeric(14,2) NOT NULL DEFAULT 0 CHECK (aguinaldo_provisionado >= 0),
  vacaciones_provisionadas numeric(14,2) NOT NULL DEFAULT 0 CHECK (vacaciones_provisionadas >= 0),
  costo_total_empresa numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_total_empresa >= 0),
  pagado boolean NOT NULL DEFAULT false,
  fecha_pago date,
  UNIQUE (id_empresa, id_periodo, id_empleado),
  UNIQUE (id_empresa, id),
  FOREIGN KEY (id_empresa, id_periodo)
    REFERENCES public.nomina_periodos (id_empresa, id) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT
);

CREATE TABLE public.pagos_salarios (
  id_pago_salario bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  id_detalle_nomina bigint,
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  metodo text,
  fecha_pago date NOT NULL DEFAULT CURRENT_DATE,
  concepto text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  fecha_registro timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_detalle_nomina)
    REFERENCES public.nomina_detalle (id_empresa, id) ON DELETE RESTRICT
);

CREATE INDEX contratos_empleado_fecha_idx
  ON public.contratos (id_empresa, id_empleado, fecha_inicio DESC);
CREATE INDEX asistencias_sucursal_fecha_idx
  ON public.asistencias (id_empresa, id_sucursal, fecha DESC);
CREATE INDEX vacaciones_empleado_fecha_idx
  ON public.vacaciones_permisos (id_empresa, id_empleado, fecha_inicio DESC);
CREATE INDEX prestaciones_empleado_fecha_idx
  ON public.prestaciones_laborales (id_empresa, id_empleado, created_at DESC);
CREATE INDEX nomina_periodos_empresa_fecha_idx
  ON public.nomina_periodos (id_empresa, periodo_inicio DESC);
CREATE INDEX pagos_salarios_empleado_fecha_idx
  ON public.pagos_salarios (id_empresa, id_empleado, fecha_pago DESC);

CREATE OR REPLACE FUNCTION public.puede_gestionar_rrhh(
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
     AND EXISTS (
       SELECT 1
       FROM public.perfiles AS p
       WHERE p.id = (SELECT auth.uid())
         AND p.activo
         AND (
           p.rol = 'superadmin'
           OR (
             p.rol IN ('admin', 'gerente')
             AND p.id_empresa = p_id_empresa
             AND p.id_sucursal = p_id_sucursal
             AND p_id_sucursal IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.puede_ver_rrhh_empresa(p_id_empresa integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_id_empresa IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.perfiles AS p
       WHERE p.id = (SELECT auth.uid())
         AND p.activo
         AND (
           p.rol = 'superadmin'
           OR (p.rol IN ('admin', 'gerente') AND p.id_empresa = p_id_empresa)
         )
     );
$$;

REVOKE ALL ON FUNCTION public.puede_gestionar_rrhh(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.puede_ver_rrhh_empresa(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_rrhh(integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_rrhh_empresa(integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_empleado_rrhh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil record;
BEGIN
  IF NEW.id_sucursal IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sucursales AS s
    WHERE s.id_empresa = NEW.id_empresa
      AND s.id_sucursal = NEW.id_sucursal
  ) THEN
    RAISE EXCEPTION 'La sucursal del empleado no pertenece a la empresa indicada.';
  END IF;

  IF NEW.id_perfil IS NOT NULL THEN
    SELECT p.id_empresa, p.id_sucursal, p.rol, p.activo
    INTO v_perfil
    FROM public.perfiles AS p
    WHERE p.id = NEW.id_perfil;

    IF NOT FOUND
       OR NOT v_perfil.activo
       OR v_perfil.id_empresa IS DISTINCT FROM NEW.id_empresa
       OR v_perfil.id_sucursal IS DISTINCT FROM NEW.id_sucursal
       OR v_perfil.rol NOT IN ('superadmin', 'admin', 'gerente', 'contador', 'cajero', 'despacho', 'bodega') THEN
      RAISE EXCEPTION 'El perfil debe ser una cuenta activa de personal de la misma empresa y sucursal.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_empleado_rrhh() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER empleados_validar_rrhh
  BEFORE INSERT OR UPDATE OF id_empresa, id_sucursal, id_perfil ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.validar_empleado_rrhh();

CREATE OR REPLACE FUNCTION public.preparar_detalle_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_periodo record;
  v_empleado record;
BEGIN
  SELECT n.id_empresa, n.id_sucursal, n.estado
  INTO v_periodo
  FROM public.nomina_periodos AS n
  WHERE n.id = NEW.id_periodo;

  SELECT e.id_empresa, e.id_sucursal, e.estado
  INTO v_empleado
  FROM public.empleados AS e
  WHERE e.id_empleado = NEW.id_empleado;

  IF NOT FOUND OR v_periodo.id_empresa IS NULL OR v_empleado.id_empresa IS NULL THEN
    RAISE EXCEPTION 'El período o el empleado de la nómina no existe.';
  END IF;
  IF v_periodo.id_empresa <> v_empleado.id_empresa
     OR (v_periodo.id_sucursal IS NOT NULL AND v_periodo.id_sucursal <> v_empleado.id_sucursal) THEN
    RAISE EXCEPTION 'El empleado no pertenece a la empresa/sucursal del período de nómina.';
  END IF;
  IF v_empleado.estado <> 'Activo' THEN
    RAISE EXCEPTION 'Solo se pueden procesar empleados activos.';
  END IF;
  IF v_periodo.estado IN ('pagada', 'anulada') THEN
    RAISE EXCEPTION 'No se pueden agregar detalles a una nómina pagada o anulada.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_periodo.id_empresa, v_periodo.id_sucursal)) THEN
    RAISE EXCEPTION 'No tienes permiso para procesar nóminas en esta empresa/sucursal.';
  END IF;

  NEW.id_empresa := v_periodo.id_empresa;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_detalle_nomina() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER nomina_detalle_preparar
  BEFORE INSERT ON public.nomina_detalle
  FOR EACH ROW EXECUTE FUNCTION public.preparar_detalle_nomina();

CREATE OR REPLACE FUNCTION public.procesar_nomina(
  p_datos jsonb,
  p_detalles jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_datos record;
  v_numero bigint;
  v_empleados_unicos bigint;
  v_bruto numeric(14,2);
  v_deducciones numeric(14,2);
  v_neto numeric(14,2);
  v_costo numeric(14,2);
  v_id_periodo bigint;
  v_detalle record;
BEGIN
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array'
     OR jsonb_array_length(p_detalles) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'La nómina requiere período y al menos un detalle válido.';
  END IF;

  SELECT *
  INTO v_datos
  FROM jsonb_to_record(p_datos) AS x(
    id_empresa integer,
    id_sucursal integer,
    periodo_inicio date,
    periodo_fin date,
    tipo text,
    total_bruto numeric,
    total_deducciones numeric,
    total_neto numeric,
    total_costo_empresa numeric
  );

  IF v_datos.id_empresa IS NULL
     OR v_datos.periodo_inicio IS NULL
     OR v_datos.periodo_fin IS NULL
     OR v_datos.periodo_fin < v_datos.periodo_inicio
     OR v_datos.tipo IS NULL
     OR v_datos.tipo NOT IN ('semanal', 'quincenal', 'mensual', 'extraordinario')
     OR v_datos.total_bruto IS NULL
     OR v_datos.total_bruto < 0
     OR v_datos.total_deducciones IS NULL
     OR v_datos.total_deducciones < 0
     OR v_datos.total_neto IS NULL
     OR v_datos.total_neto < 0
     OR v_datos.total_costo_empresa IS NULL
     OR v_datos.total_costo_empresa < 0 THEN
    RAISE EXCEPTION 'El período o los totales de nómina no son válidos.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_datos.id_empresa, v_datos.id_sucursal)) THEN
    RAISE EXCEPTION 'No tienes permiso para procesar nóminas en esta empresa/sucursal.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles) AS d(
      id_empleado bigint,
      salario_bruto numeric,
      inss_laboral numeric,
      ir_mensual numeric,
      otros_descuentos numeric,
      otros_ingresos numeric,
      salario_neto numeric,
      inss_patronal numeric,
      inatec numeric,
      aguinaldo_provisionado numeric,
      vacaciones_provisionadas numeric,
      costo_total_empresa numeric
    )
    WHERE d.id_empleado IS NULL
       OR d.salario_bruto IS NULL OR d.salario_bruto < 0
       OR d.inss_laboral IS NULL OR d.inss_laboral < 0
       OR d.ir_mensual IS NULL OR d.ir_mensual < 0
       OR coalesce(d.otros_descuentos, 0) < 0
       OR coalesce(d.otros_ingresos, 0) < 0
       OR d.salario_neto IS NULL OR d.salario_neto < 0
       OR d.inss_patronal IS NULL OR d.inss_patronal < 0
       OR d.inatec IS NULL OR d.inatec < 0
       OR coalesce(d.aguinaldo_provisionado, 0) < 0
       OR coalesce(d.vacaciones_provisionadas, 0) < 0
       OR d.costo_total_empresa IS NULL OR d.costo_total_empresa < 0
       OR round(
         d.salario_bruto + coalesce(d.otros_ingresos, 0)
         - d.inss_laboral - d.ir_mensual - coalesce(d.otros_descuentos, 0),
         2
       ) <> d.salario_neto
       OR round(
         d.salario_bruto + coalesce(d.otros_ingresos, 0)
         + d.inss_patronal + d.inatec
         + coalesce(d.aguinaldo_provisionado, 0)
         + coalesce(d.vacaciones_provisionadas, 0),
         2
       ) <> d.costo_total_empresa
  ) THEN
    RAISE EXCEPTION 'Un detalle tiene importes negativos o totales inconsistentes.';
  END IF;

  SELECT count(*), count(DISTINCT d.id_empleado),
         round(sum(d.salario_bruto), 2),
         round(sum(d.inss_laboral + d.ir_mensual + coalesce(d.otros_descuentos, 0)), 2),
         round(sum(d.salario_neto), 2),
         round(sum(d.costo_total_empresa), 2)
  INTO v_numero, v_empleados_unicos, v_bruto, v_deducciones, v_neto, v_costo
  FROM jsonb_to_recordset(p_detalles) AS d(
    id_empleado bigint,
    salario_bruto numeric,
    inss_laboral numeric,
    ir_mensual numeric,
    otros_descuentos numeric,
    otros_ingresos numeric,
    salario_neto numeric,
    inss_patronal numeric,
    inatec numeric,
    aguinaldo_provisionado numeric,
    vacaciones_provisionadas numeric,
    costo_total_empresa numeric
  );

  IF v_numero <> v_empleados_unicos
     OR round(v_bruto, 2) <> round(v_datos.total_bruto, 2)
     OR round(v_deducciones, 2) <> round(v_datos.total_deducciones, 2)
     OR round(v_neto, 2) <> round(v_datos.total_neto, 2)
     OR round(v_costo, 2) <> round(v_datos.total_costo_empresa, 2) THEN
    RAISE EXCEPTION 'Los totales del período no coinciden con los detalles.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles) AS d(id_empleado bigint)
    LEFT JOIN public.empleados AS e
      ON e.id_empresa = v_datos.id_empresa
     AND e.id_empleado = d.id_empleado
    WHERE e.id_empleado IS NULL
       OR e.estado <> 'Activo'
       OR (v_datos.id_sucursal IS NOT NULL AND e.id_sucursal <> v_datos.id_sucursal)
  ) THEN
    RAISE EXCEPTION 'Todos los empleados deben estar activos y pertenecer al período indicado.';
  END IF;

  INSERT INTO public.nomina_periodos (
    id_empresa, id_sucursal, periodo_inicio, periodo_fin, tipo, estado,
    total_bruto, total_deducciones, total_neto, total_costo_empresa
  )
  VALUES (
    v_datos.id_empresa, v_datos.id_sucursal, v_datos.periodo_inicio,
    v_datos.periodo_fin, v_datos.tipo, 'procesada',
    round(v_datos.total_bruto, 2), round(v_datos.total_deducciones, 2),
    round(v_datos.total_neto, 2), round(v_datos.total_costo_empresa, 2)
  )
  RETURNING id INTO v_id_periodo;

  FOR v_detalle IN
    SELECT *
    FROM jsonb_to_recordset(p_detalles) AS d(
      id_empleado bigint,
      salario_bruto numeric,
      inss_laboral numeric,
      ir_mensual numeric,
      otros_descuentos numeric,
      otros_ingresos numeric,
      salario_neto numeric,
      inss_patronal numeric,
      inatec numeric,
      aguinaldo_provisionado numeric,
      vacaciones_provisionadas numeric,
      costo_total_empresa numeric
    )
  LOOP
    INSERT INTO public.nomina_detalle (
      id_empresa, id_periodo, id_empleado, salario_bruto, inss_laboral,
      ir_mensual, otros_descuentos, otros_ingresos, salario_neto,
      inss_patronal, inatec, aguinaldo_provisionado,
      vacaciones_provisionadas, costo_total_empresa
    )
    VALUES (
      v_datos.id_empresa, v_id_periodo, v_detalle.id_empleado,
      round(v_detalle.salario_bruto, 2), round(v_detalle.inss_laboral, 2),
      round(v_detalle.ir_mensual, 2), round(coalesce(v_detalle.otros_descuentos, 0), 2),
      round(coalesce(v_detalle.otros_ingresos, 0), 2), round(v_detalle.salario_neto, 2),
      round(v_detalle.inss_patronal, 2), round(v_detalle.inatec, 2),
      round(coalesce(v_detalle.aguinaldo_provisionado, 0), 2),
      round(coalesce(v_detalle.vacaciones_provisionadas, 0), 2),
      round(v_detalle.costo_total_empresa, 2)
    );
  END LOOP;

  RETURN v_id_periodo;
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_nomina(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procesar_nomina(jsonb, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.vincular_perfil_empleado(
  p_id_empleado bigint,
  p_id_perfil uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empresa integer;
  v_sucursal integer;
  v_perfil record;
BEGIN
  SELECT e.id_empresa, e.id_sucursal
  INTO v_empresa, v_sucursal
  FROM public.empleados AS e
  WHERE e.id_empleado = p_id_empleado;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'El empleado no existe.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_empresa, v_sucursal)) THEN
    RAISE EXCEPTION 'No tienes permiso para vincular perfiles en esta empresa/sucursal.';
  END IF;

  IF p_id_perfil IS NOT NULL THEN
    SELECT p.id_empresa, p.id_sucursal, p.rol, p.activo
    INTO v_perfil
    FROM public.perfiles AS p
    WHERE p.id = p_id_perfil;

    IF NOT FOUND
       OR NOT v_perfil.activo
       OR v_perfil.id_empresa IS DISTINCT FROM v_empresa
       OR v_perfil.id_sucursal IS DISTINCT FROM v_sucursal
       OR v_perfil.rol NOT IN ('superadmin', 'admin', 'gerente', 'contador', 'cajero', 'despacho', 'bodega') THEN
      RAISE EXCEPTION 'El perfil debe ser una cuenta activa de personal de la misma empresa y sucursal.';
    END IF;
  END IF;

  UPDATE public.empleados
  SET id_perfil = p_id_perfil
  WHERE id_empleado = p_id_empleado;
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_perfil_empleado(bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vincular_perfil_empleado(bigint, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_pago_nomina(
  p_id_detalle bigint,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date DEFAULT CURRENT_DATE,
  p_concepto text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_detalle record;
  v_pagado numeric(14,2);
  v_id_pago bigint;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 OR p_fecha_pago IS NULL THEN
    RAISE EXCEPTION 'El pago requiere monto positivo y fecha.';
  END IF;

  SELECT d.id_empresa, d.id_empleado, d.id_periodo, d.salario_neto,
         n.id_sucursal, n.estado AS estado_periodo
  INTO v_detalle
  FROM public.nomina_detalle AS d
  JOIN public.nomina_periodos AS n
    ON n.id_empresa = d.id_empresa
   AND n.id = d.id_periodo
  WHERE d.id = p_id_detalle
  FOR UPDATE OF d;

  IF v_detalle.id_empresa IS NULL THEN
    RAISE EXCEPTION 'El detalle de nómina no existe.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_detalle.id_empresa, v_detalle.id_sucursal)) THEN
    RAISE EXCEPTION 'No tienes permiso para pagar esta nómina.';
  END IF;
  IF v_detalle.estado_periodo IN ('borrador', 'anulada') THEN
    RAISE EXCEPTION 'Solo se pueden pagar nóminas procesadas.';
  END IF;

  SELECT coalesce(sum(p.monto), 0)
  INTO v_pagado
  FROM public.pagos_salarios AS p
  WHERE p.id_empresa = v_detalle.id_empresa
    AND p.id_detalle_nomina = p_id_detalle;

  IF round(v_pagado + p_monto, 2) > v_detalle.salario_neto THEN
    RAISE EXCEPTION 'El pago supera el saldo neto pendiente.';
  END IF;

  INSERT INTO public.pagos_salarios (
    id_empresa, id_empleado, id_detalle_nomina, monto, metodo, fecha_pago, concepto
  )
  VALUES (
    v_detalle.id_empresa,
    v_detalle.id_empleado,
    p_id_detalle,
    round(p_monto, 2),
    nullif(trim(p_metodo), ''),
    p_fecha_pago,
    nullif(trim(p_concepto), '')
  )
  RETURNING id_pago_salario INTO v_id_pago;

  SELECT coalesce(sum(p.monto), 0)
  INTO v_pagado
  FROM public.pagos_salarios AS p
  WHERE p.id_empresa = v_detalle.id_empresa
    AND p.id_detalle_nomina = p_id_detalle;

  UPDATE public.nomina_detalle
  SET monto_pagado = round(v_pagado, 2),
      pagado = v_pagado >= v_detalle.salario_neto,
      fecha_pago = CASE
        WHEN v_pagado >= v_detalle.salario_neto THEN p_fecha_pago
        ELSE NULL
      END
  WHERE id_empresa = v_detalle.id_empresa
    AND id = p_id_detalle;

  UPDATE public.nomina_periodos AS n
  SET estado = 'pagada'
  WHERE n.id_empresa = v_detalle.id_empresa
    AND n.id = v_detalle.id_periodo
    AND n.estado = 'procesada'
    AND NOT EXISTS (
      SELECT 1
      FROM public.nomina_detalle AS d
      WHERE d.id_empresa = n.id_empresa
        AND d.id_periodo = n.id
        AND NOT d.pagado
    );

  RETURN v_id_pago;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_nomina(bigint, numeric, text, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pago_nomina(bigint, numeric, text, date, text)
  TO authenticated;

ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestaciones_laborales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguridad_higiene ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marco_legal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cumplimiento_obligaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_salarios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.empleados,
  public.contratos,
  public.asistencias,
  public.vacaciones_permisos,
  public.prestaciones_laborales,
  public.seguridad_higiene,
  public.marco_legal,
  public.cumplimiento_obligaciones,
  public.nomina_periodos,
  public.nomina_detalle,
  public.pagos_salarios
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.empleados TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.contratos,
  public.asistencias,
  public.vacaciones_permisos,
  public.prestaciones_laborales,
  public.seguridad_higiene,
  public.marco_legal,
  public.cumplimiento_obligaciones
TO authenticated;
GRANT SELECT ON public.nomina_periodos, public.nomina_detalle TO authenticated;
GRANT SELECT, INSERT ON public.pagos_salarios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE
  public.empleados_id_empleado_seq,
  public.contratos_id_seq,
  public.asistencias_id_seq,
  public.vacaciones_permisos_id_seq,
  public.prestaciones_laborales_id_seq,
  public.seguridad_higiene_id_seq,
  public.marco_legal_id_seq,
  public.cumplimiento_obligaciones_id_seq,
  public.nomina_periodos_id_seq,
  public.nomina_detalle_id_seq,
  public.pagos_salarios_id_pago_salario_seq
TO authenticated;

CREATE POLICY empleados_select_rrhh
  ON public.empleados FOR SELECT TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY empleados_insert_rrhh
  ON public.empleados FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY empleados_update_rrhh
  ON public.empleados FOR UPDATE TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));

CREATE POLICY contratos_rrhh
  ON public.contratos FOR ALL TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY asistencias_rrhh
  ON public.asistencias FOR ALL TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY vacaciones_rrhh
  ON public.vacaciones_permisos FOR ALL TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY prestaciones_rrhh
  ON public.prestaciones_laborales FOR ALL TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY seguridad_rrhh
  ON public.seguridad_higiene FOR ALL TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY marco_legal_rrhh
  ON public.marco_legal FOR ALL TO authenticated
  USING ((SELECT public.puede_ver_rrhh_empresa(id_empresa)))
  WITH CHECK ((SELECT public.puede_ver_rrhh_empresa(id_empresa)));
CREATE POLICY cumplimiento_rrhh
  ON public.cumplimiento_obligaciones FOR ALL TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)))
  WITH CHECK ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));

CREATE POLICY nomina_periodos_select_rrhh
  ON public.nomina_periodos FOR SELECT TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY nomina_detalle_select_rrhh
  ON public.nomina_detalle FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.nomina_periodos AS n
    WHERE n.id_empresa = nomina_detalle.id_empresa
      AND n.id = nomina_detalle.id_periodo
      AND (SELECT public.puede_gestionar_rrhh(n.id_empresa, n.id_sucursal))
  ));
CREATE POLICY pagos_salarios_select_rrhh
  ON public.pagos_salarios FOR SELECT TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(
    id_empresa,
    (SELECT e.id_sucursal FROM public.empleados AS e
      WHERE e.id_empresa = pagos_salarios.id_empresa
        AND e.id_empleado = pagos_salarios.id_empleado)
  )));
CREATE POLICY pagos_salarios_insert_rrhh
  ON public.pagos_salarios FOR INSERT TO authenticated
  WITH CHECK (id_detalle_nomina IS NULL AND (SELECT public.puede_gestionar_rrhh(
    id_empresa,
    (SELECT e.id_sucursal FROM public.empleados AS e
      WHERE e.id_empresa = pagos_salarios.id_empresa
        AND e.id_empleado = pagos_salarios.id_empleado)
  )));

COMMIT;
