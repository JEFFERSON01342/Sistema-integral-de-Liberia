BEGIN;

ALTER TABLE public.configuracion_nomina_contable
  ADD COLUMN cuenta_gasto_indemnizacion bigint
    REFERENCES public.cuentas_contables (id_cuenta) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.validar_configuracion_nomina_contable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (NEW.cuenta_gasto_salarios, 'GASTO'::text),
      (NEW.cuenta_gasto_inss_patronal, 'GASTO'::text),
      (NEW.cuenta_gasto_inatec, 'GASTO'::text),
      (NEW.cuenta_gasto_aguinaldo, 'GASTO'::text),
      (NEW.cuenta_gasto_vacaciones, 'GASTO'::text),
      (NEW.cuenta_gasto_indemnizacion, 'GASTO'::text),
      (NEW.cuenta_pasivo_salarios, 'PASIVO'::text),
      (NEW.cuenta_pasivo_inss_laboral, 'PASIVO'::text),
      (NEW.cuenta_pasivo_ir, 'PASIVO'::text),
      (NEW.cuenta_pasivo_otras_deducciones, 'PASIVO'::text),
      (NEW.cuenta_pasivo_inss_patronal, 'PASIVO'::text),
      (NEW.cuenta_pasivo_inatec, 'PASIVO'::text),
      (NEW.cuenta_pasivo_aguinaldo, 'PASIVO'::text),
      (NEW.cuenta_pasivo_vacaciones, 'PASIVO'::text)
    ) AS requeridas(id_cuenta, naturaleza)
    LEFT JOIN public.cuentas_contables AS c
      ON c.id_empresa = NEW.id_empresa
     AND c.id_cuenta = requeridas.id_cuenta
    WHERE c.id_cuenta IS NULL
       OR NOT c.activa
       OR c.es_grupo
       OR NOT c.permite_movimientos
       OR c.naturaleza <> requeridas.naturaleza
  ) THEN
    RAISE EXCEPTION 'La configuración de nómina requiere cuentas activas de movimiento y con naturaleza contable correcta.';
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.liquidaciones_laborales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_empleado bigint NOT NULL,
  id_sucursal integer NOT NULL,
  fecha_ingreso date NOT NULL,
  fecha_terminacion date NOT NULL,
  causa_terminacion text NOT NULL CHECK (
    causa_terminacion IN (
      'despido_sin_causa', 'despido_con_causa', 'renuncia',
      'mutuo_acuerdo', 'vencimiento_contrato', 'otro'
    )
  ),
  salario_mensual numeric(14,2) NOT NULL CHECK (salario_mensual >= 0),
  dias_antiguedad numeric(12,4) NOT NULL CHECK (dias_antiguedad >= 0),
  dias_indemnizacion_estimados numeric(8,4) NOT NULL DEFAULT 0
    CHECK (dias_indemnizacion_estimados >= 0 AND dias_indemnizacion_estimados <= 150),
  salario_pendiente numeric(14,2) NOT NULL DEFAULT 0 CHECK (salario_pendiente >= 0),
  dias_vacaciones_pendientes numeric(8,2) NOT NULL DEFAULT 0
    CHECK (dias_vacaciones_pendientes >= 0),
  vacaciones_estimadas numeric(14,2) NOT NULL DEFAULT 0 CHECK (vacaciones_estimadas >= 0),
  aguinaldo_estimado numeric(14,2) NOT NULL DEFAULT 0 CHECK (aguinaldo_estimado >= 0),
  indemnizacion_estimado numeric(14,2) NOT NULL DEFAULT 0 CHECK (indemnizacion_estimado >= 0),
  otros_ingresos numeric(14,2) NOT NULL DEFAULT 0 CHECK (otros_ingresos >= 0),
  otros_descuentos numeric(14,2) NOT NULL DEFAULT 0 CHECK (otros_descuentos >= 0),
  ajuste_indemnizacion numeric(14,2) NOT NULL DEFAULT 0,
  justificacion_ajuste text,
  total_bruto_estimado numeric(14,2) NOT NULL CHECK (total_bruto_estimado >= 0),
  total_neto_estimado numeric(14,2) NOT NULL CHECK (total_neto_estimado >= 0),
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'aprobada', 'pagada', 'anulada')),
  revision_confirmada boolean NOT NULL DEFAULT false,
  revisado_por uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  revisado_en timestamptz,
  id_comprobante_liquidacion bigint,
  calculo_snapshot jsonb NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_empleado)
    REFERENCES public.empleados (id_empresa, id_empleado) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_comprobante_liquidacion)
    REFERENCES public.comprobantes_contables (id_empresa, id_comprobante) ON DELETE RESTRICT,
  UNIQUE (id_empresa, id),
  CHECK (fecha_terminacion >= fecha_ingreso),
  CHECK (
    (estado IN ('aprobada', 'pagada') AND revision_confirmada AND revisado_por IS NOT NULL)
    OR (estado IN ('borrador', 'anulada'))
  ),
  CHECK (
    total_neto_estimado =
      round(total_bruto_estimado - otros_descuentos, 2)
  )
);

CREATE UNIQUE INDEX liquidaciones_activas_empleado_uidx
  ON public.liquidaciones_laborales (id_empresa, id_empleado)
  WHERE estado IN ('borrador', 'aprobada');
CREATE INDEX liquidaciones_empresa_fecha_idx
  ON public.liquidaciones_laborales (id_empresa, fecha_terminacion DESC);

CREATE TABLE public.pagos_liquidacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_liquidacion bigint NOT NULL,
  id_cuenta_pago bigint NOT NULL,
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  metodo text NOT NULL CHECK (metodo IN ('Efectivo', 'Transferencia')),
  fecha_pago date NOT NULL,
  concepto text,
  id_comprobante_pago bigint,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_liquidacion)
    REFERENCES public.liquidaciones_laborales (id_empresa, id) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_cuenta_pago)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_comprobante_pago)
    REFERENCES public.comprobantes_contables (id_empresa, id_comprobante) ON DELETE RESTRICT
);

CREATE INDEX pagos_liquidacion_pendientes_idx
  ON public.pagos_liquidacion (id_empresa, id_liquidacion, fecha_pago)
  WHERE id_comprobante_pago IS NULL;

ALTER TABLE public.liquidaciones_laborales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_liquidacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.liquidaciones_laborales, public.pagos_liquidacion
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.liquidaciones_laborales, public.pagos_liquidacion
  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.liquidaciones_laborales_id_seq,
  public.pagos_liquidacion_id_seq TO authenticated;

CREATE POLICY liquidaciones_laborales_select
  ON public.liquidaciones_laborales FOR SELECT TO authenticated
  USING ((SELECT public.puede_gestionar_rrhh(id_empresa, id_sucursal)));
CREATE POLICY pagos_liquidacion_select
  ON public.pagos_liquidacion FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.liquidaciones_laborales AS l
    WHERE l.id_empresa = pagos_liquidacion.id_empresa
      AND l.id = pagos_liquidacion.id_liquidacion
      AND (SELECT public.puede_gestionar_rrhh(l.id_empresa, l.id_sucursal))
  ));

CREATE OR REPLACE FUNCTION public.crear_liquidacion_laboral(
  p_id_empleado bigint,
  p_fecha_terminacion date,
  p_causa_terminacion text,
  p_salario_pendiente numeric DEFAULT 0,
  p_dias_vacaciones_pendientes numeric DEFAULT 0,
  p_aguinaldo_estimado numeric DEFAULT 0,
  p_otros_ingresos numeric DEFAULT 0,
  p_otros_descuentos numeric DEFAULT 0,
  p_ajuste_indemnizacion numeric DEFAULT 0,
  p_justificacion_ajuste text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empleado record;
  v_antiguedad numeric(12,4);
  v_dias_indemnizacion numeric(8,4) := 0;
  v_dias_base numeric(8,4);
  v_vacaciones numeric(14,2);
  v_indemnizacion numeric(14,2);
  v_bruto numeric(14,2);
  v_neto numeric(14,2);
  v_id bigint;
BEGIN
  IF p_fecha_terminacion IS NULL
     OR p_causa_terminacion NOT IN (
       'despido_sin_causa', 'despido_con_causa', 'renuncia',
       'mutuo_acuerdo', 'vencimiento_contrato', 'otro'
     )
     OR coalesce(p_salario_pendiente, 0) < 0
     OR coalesce(p_dias_vacaciones_pendientes, 0) < 0
     OR coalesce(p_aguinaldo_estimado, 0) < 0
     OR coalesce(p_otros_ingresos, 0) < 0
     OR coalesce(p_otros_descuentos, 0) < 0 THEN
    RAISE EXCEPTION 'Verifique fecha, causal y montos no negativos del borrador de liquidación.';
  END IF;

  SELECT e.id_empresa, e.id_sucursal, e.fecha_ingreso, e.salario_mensual,
         e.estado, s.activa AS sucursal_activa
  INTO v_empleado
  FROM public.empleados AS e
  JOIN public.sucursales AS s
    ON s.id_empresa = e.id_empresa AND s.id_sucursal = e.id_sucursal
  WHERE e.id_empleado = p_id_empleado
  FOR SHARE OF e;
  IF NOT FOUND OR v_empleado.fecha_ingreso IS NULL
     OR v_empleado.estado <> 'Activo' OR NOT v_empleado.sucursal_activa THEN
    RAISE EXCEPTION 'El empleado debe estar activo, asignado a sucursal activa y tener fecha de ingreso.';
  END IF;
  IF p_fecha_terminacion < v_empleado.fecha_ingreso THEN
    RAISE EXCEPTION 'La fecha de terminación no puede ser anterior a la fecha de ingreso.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_empleado.id_empresa, v_empleado.id_sucursal)) THEN
    RAISE EXCEPTION 'No tienes permiso para preparar esta liquidación.';
  END IF;

  v_antiguedad := p_fecha_terminacion - v_empleado.fecha_ingreso + 1;
  IF p_causa_terminacion = 'despido_sin_causa' THEN
    v_dias_base := least(
      150::numeric,
      least(v_antiguedad / 365.25, 3) * 30
        + least(greatest(v_antiguedad / 365.25 - 3, 0), 2) * 20
    );
    v_dias_indemnizacion := round(v_dias_base, 4);
  END IF;
  v_vacaciones := round(
    coalesce(p_dias_vacaciones_pendientes, 0) * v_empleado.salario_mensual / 30,
    2
  );
  v_indemnizacion := round(
    greatest(
      0,
      v_dias_indemnizacion * v_empleado.salario_mensual / 30
        + coalesce(p_ajuste_indemnizacion, 0)
    ),
    2
  );
  v_bruto := round(
    coalesce(p_salario_pendiente, 0) + v_vacaciones
      + coalesce(p_aguinaldo_estimado, 0) + v_indemnizacion
      + coalesce(p_otros_ingresos, 0),
    2
  );
  v_neto := round(v_bruto - coalesce(p_otros_descuentos, 0), 2);
  IF v_bruto <= 0 THEN
    RAISE EXCEPTION 'La liquidación debe incluir al menos un monto bruto positivo.';
  END IF;
  IF v_neto < 0 THEN
    RAISE EXCEPTION 'Las deducciones no pueden superar el total bruto estimado.';
  END IF;
  IF coalesce(p_ajuste_indemnizacion, 0) <> 0
     AND nullif(trim(p_justificacion_ajuste), '') IS NULL THEN
    RAISE EXCEPTION 'Documente la justificación del ajuste firmado de indemnización.';
  END IF;

  INSERT INTO public.liquidaciones_laborales (
    id_empresa, id_empleado, id_sucursal, fecha_ingreso, fecha_terminacion,
    causa_terminacion, salario_mensual, dias_antiguedad,
    dias_indemnizacion_estimados, salario_pendiente,
    dias_vacaciones_pendientes, vacaciones_estimadas, aguinaldo_estimado,
    indemnizacion_estimado, otros_ingresos, otros_descuentos,
    ajuste_indemnizacion, justificacion_ajuste, total_bruto_estimado,
    total_neto_estimado, calculo_snapshot
  )
  VALUES (
    v_empleado.id_empresa, p_id_empleado, v_empleado.id_sucursal,
    v_empleado.fecha_ingreso, p_fecha_terminacion, p_causa_terminacion,
    v_empleado.salario_mensual, v_antiguedad, v_dias_indemnizacion,
    coalesce(p_salario_pendiente, 0), coalesce(p_dias_vacaciones_pendientes, 0),
    v_vacaciones, coalesce(p_aguinaldo_estimado, 0), v_indemnizacion,
    coalesce(p_otros_ingresos, 0), coalesce(p_otros_descuentos, 0),
    coalesce(p_ajuste_indemnizacion, 0), nullif(trim(p_justificacion_ajuste), ''),
    v_bruto, v_neto,
    jsonb_build_object(
      'version', 'NI-draft-2026-01',
      'legal_status', 'estimacion_no_verificada',
      'indemnizacion_days_formula', '30 días/año hasta 3 años, 20 días/año hasta 5 años, máximo 150; prorrata por días/365.25',
      'daily_salary_formula', 'salario mensual / 30',
      'vacation_days_supplied_by_user', coalesce(p_dias_vacaciones_pendientes, 0),
      'aguinaldo_supplied_by_user', coalesce(p_aguinaldo_estimado, 0),
      'salary_pending_supplied_by_user', coalesce(p_salario_pendiente, 0),
      'other_income_supplied_by_user', coalesce(p_otros_ingresos, 0),
      'other_deductions_supplied_by_user', coalesce(p_otros_descuentos, 0),
      'adjustment_reason', nullif(trim(p_justificacion_ajuste), '')
    )
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aprobar_liquidacion_laboral(
  p_id_liquidacion bigint,
  p_confirmar_revision boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liquidacion record;
BEGIN
  SELECT l.id_empresa, l.id_sucursal, l.id_empleado, l.estado,
         l.fecha_terminacion, l.id_comprobante_liquidacion
  INTO v_liquidacion
  FROM public.liquidaciones_laborales AS l
  WHERE l.id = p_id_liquidacion
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el borrador de liquidación.';
  END IF;
  IF NOT (SELECT public.puede_administrar_empresa(v_liquidacion.id_empresa))
     OR NOT (SELECT public.puede_gestionar_rrhh(v_liquidacion.id_empresa, v_liquidacion.id_sucursal)) THEN
    RAISE EXCEPTION 'Solo un administrador de la empresa puede aprobar la liquidación.';
  END IF;
  IF v_liquidacion.estado <> 'borrador' OR p_confirmar_revision IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Revise el cálculo y confirme expresamente antes de aprobarlo.';
  END IF;

  UPDATE public.liquidaciones_laborales
  SET estado = 'aprobada',
      revision_confirmada = true,
      revisado_por = auth.uid(),
      revisado_en = now()
  WHERE id = p_id_liquidacion;
  UPDATE public.empleados
  SET estado = 'Terminado'
  WHERE id_empresa = v_liquidacion.id_empresa
    AND id_empleado = v_liquidacion.id_empleado
    AND estado = 'Activo';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado ya no está activo; revise el borrador antes de aprobar.';
  END IF;
  UPDATE public.contratos
  SET estado = 'finalizado',
      fecha_fin = greatest(fecha_inicio, v_liquidacion.fecha_terminacion)
  WHERE id_empresa = v_liquidacion.id_empresa
    AND id_empleado = v_liquidacion.id_empleado
    AND estado = 'vigente';
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_liquidacion_laboral(p_id_liquidacion bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liquidacion record;
BEGIN
  SELECT l.id_empresa, l.id_sucursal, l.estado
  INTO v_liquidacion
  FROM public.liquidaciones_laborales AS l
  WHERE l.id = p_id_liquidacion
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la liquidación.';
  END IF;
  IF NOT (SELECT public.puede_administrar_empresa(v_liquidacion.id_empresa))
     OR v_liquidacion.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo un administrador puede anular un borrador de liquidación.';
  END IF;
  UPDATE public.liquidaciones_laborales
  SET estado = 'anulada'
  WHERE id = p_id_liquidacion;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_liquidacion(
  p_id_liquidacion bigint,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date,
  p_id_cuenta_pago bigint,
  p_concepto text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liquidacion record;
  v_cuenta record;
  v_pagado numeric(14,2);
  v_id_pago bigint;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 OR p_fecha_pago IS NULL
     OR p_id_cuenta_pago IS NULL
     OR p_metodo NOT IN ('Efectivo', 'Transferencia') THEN
    RAISE EXCEPTION 'El pago requiere monto positivo, método, fecha y cuenta de salida.';
  END IF;
  SELECT l.id_empresa, l.id_sucursal, l.id_empleado, l.estado,
         l.fecha_terminacion, l.total_neto_estimado, l.id_comprobante_liquidacion
  INTO v_liquidacion
  FROM public.liquidaciones_laborales AS l
  WHERE l.id = p_id_liquidacion
  FOR UPDATE;
  IF NOT FOUND OR v_liquidacion.estado NOT IN ('aprobada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se pueden pagar liquidaciones aprobadas.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_liquidacion.id_empresa, v_liquidacion.id_sucursal)) THEN
    RAISE EXCEPTION 'No tienes permiso para pagar esta liquidación.';
  END IF;
  IF p_fecha_pago < v_liquidacion.fecha_terminacion THEN
    RAISE EXCEPTION 'La fecha de pago no puede preceder a la fecha de terminación.';
  END IF;
  SELECT c.activa, c.naturaleza, c.es_banco, c.es_efectivo, c.es_grupo, c.permite_movimientos
  INTO v_cuenta
  FROM public.cuentas_contables AS c
  WHERE c.id_empresa = v_liquidacion.id_empresa
    AND c.id_cuenta = p_id_cuenta_pago;
  IF NOT FOUND OR NOT v_cuenta.activa OR v_cuenta.es_grupo
     OR NOT v_cuenta.permite_movimientos OR v_cuenta.naturaleza <> 'ACTIVO'
     OR (p_metodo = 'Efectivo' AND NOT v_cuenta.es_efectivo)
     OR (p_metodo = 'Transferencia' AND NOT v_cuenta.es_banco) THEN
    RAISE EXCEPTION 'La cuenta activa debe ser banco o caja y coincidir con el método.';
  END IF;
  IF v_liquidacion.id_comprobante_liquidacion IS NULL THEN
    RAISE EXCEPTION 'Contabilice primero el devengo de la liquidación.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('LIQUIDACION:' || p_id_liquidacion::text, 0)
  );
  SELECT coalesce(sum(p.monto), 0)
  INTO v_pagado
  FROM public.pagos_liquidacion AS p
  WHERE p.id_empresa = v_liquidacion.id_empresa
    AND p.id_liquidacion = p_id_liquidacion;
  IF round(v_pagado + p_monto, 2) > v_liquidacion.total_neto_estimado THEN
    RAISE EXCEPTION 'El pago excede el saldo de la liquidación.';
  END IF;
  INSERT INTO public.pagos_liquidacion (
    id_empresa, id_liquidacion, id_cuenta_pago, monto, metodo,
    fecha_pago, concepto
  )
  VALUES (
    v_liquidacion.id_empresa, p_id_liquidacion, p_id_cuenta_pago,
    round(p_monto, 2), p_metodo, p_fecha_pago, nullif(trim(p_concepto), '')
  )
  RETURNING id INTO v_id_pago;
  SELECT coalesce(sum(p.monto), 0)
  INTO v_pagado
  FROM public.pagos_liquidacion AS p
  WHERE p.id_empresa = v_liquidacion.id_empresa
    AND p.id_liquidacion = p_id_liquidacion;
  IF v_pagado >= v_liquidacion.total_neto_estimado THEN
    UPDATE public.liquidaciones_laborales
    SET estado = 'pagada'
    WHERE id = p_id_liquidacion;
  END IF;
  RETURN v_id_pago;
END;
$$;

CREATE OR REPLACE FUNCTION public.contabilizar_liquidacion(p_id_liquidacion bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liquidacion record;
  v_config record;
  v_lineas jsonb := '[]'::jsonb;
  v_id_comprobante bigint;
BEGIN
  SELECT l.id_empresa, l.id_sucursal, l.estado, l.fecha_terminacion,
         l.salario_pendiente, l.otros_ingresos, l.vacaciones_estimadas,
         l.aguinaldo_estimado, l.indemnizacion_estimado,
         l.otros_descuentos, l.total_neto_estimado,
         l.id_comprobante_liquidacion
  INTO v_liquidacion
  FROM public.liquidaciones_laborales AS l
  WHERE l.id = p_id_liquidacion
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la liquidación.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_liquidacion.id_empresa, v_liquidacion.id_sucursal))
     OR NOT (SELECT public.puede_crear_comprobante_contable(
       v_liquidacion.id_empresa, v_liquidacion.id_sucursal,
       'MANUAL', 'FINIQUITO', p_id_liquidacion::text
     )) THEN
    RAISE EXCEPTION 'No tienes permiso para contabilizar esta liquidación.';
  END IF;
  IF v_liquidacion.id_comprobante_liquidacion IS NOT NULL THEN
    RETURN v_liquidacion.id_comprobante_liquidacion;
  END IF;
  IF v_liquidacion.estado NOT IN ('aprobada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se contabilizan liquidaciones aprobadas.';
  END IF;
  SELECT * INTO v_config
  FROM public.configuracion_nomina_contable AS c
  WHERE c.id_empresa = v_liquidacion.id_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configure las cuentas contables de nómina y liquidación.';
  END IF;
  IF v_liquidacion.salario_pendiente + v_liquidacion.otros_ingresos > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_salarios,
      'debe', v_liquidacion.salario_pendiente + v_liquidacion.otros_ingresos,
      'haber', 0, 'descripcion', 'Salario y otros ingresos de liquidación'
    ));
  END IF;
  IF v_liquidacion.aguinaldo_estimado > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_aguinaldo,
      'debe', v_liquidacion.aguinaldo_estimado,
      'haber', 0, 'descripcion', 'Aguinaldo estimado de liquidación'
    ));
  END IF;
  IF v_liquidacion.vacaciones_estimadas > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_vacaciones,
      'debe', v_liquidacion.vacaciones_estimadas,
      'haber', 0, 'descripcion', 'Vacaciones estimadas de liquidación'
    ));
  END IF;
  IF v_liquidacion.indemnizacion_estimado > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_indemnizacion,
      'debe', v_liquidacion.indemnizacion_estimado,
      'haber', 0, 'descripcion', 'Indemnización estimada de liquidación'
    ));
  END IF;
  IF v_liquidacion.total_neto_estimado > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_salarios,
      'debe', 0, 'haber', v_liquidacion.total_neto_estimado,
      'descripcion', 'Liquidación neta por pagar'
    ));
  END IF;
  IF v_liquidacion.otros_descuentos > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_otras_deducciones,
      'debe', 0, 'haber', v_liquidacion.otros_descuentos,
      'descripcion', 'Deducciones de liquidación por enterar'
    ));
  END IF;
  v_id_comprobante := public._registrar_asiento_operativo(
    v_liquidacion.id_empresa, v_liquidacion.id_sucursal,
    v_liquidacion.fecha_terminacion, 'MANUAL',
    'Devengo de liquidación #' || p_id_liquidacion,
    'FINIQUITO', p_id_liquidacion::text, v_lineas
  );
  UPDATE public.liquidaciones_laborales
  SET id_comprobante_liquidacion = v_id_comprobante
  WHERE id = p_id_liquidacion;
  RETURN v_id_comprobante;
END;
$$;

CREATE OR REPLACE FUNCTION public.contabilizar_pagos_liquidacion(p_id_liquidacion bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liquidacion record;
  v_grupo record;
  v_id_comprobante bigint;
  v_cantidad integer := 0;
BEGIN
  SELECT l.id_empresa, l.id_sucursal, l.estado, l.id_comprobante_liquidacion
  INTO v_liquidacion
  FROM public.liquidaciones_laborales AS l
  WHERE l.id = p_id_liquidacion
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la liquidación.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_liquidacion.id_empresa, v_liquidacion.id_sucursal))
     OR NOT (SELECT public.puede_crear_comprobante_contable(
       v_liquidacion.id_empresa, v_liquidacion.id_sucursal,
       'MANUAL', 'FINIQUITO_PAGO', p_id_liquidacion::text
     )) THEN
    RAISE EXCEPTION 'No tienes permiso para contabilizar el pago de esta liquidación.';
  END IF;
  IF v_liquidacion.estado NOT IN ('aprobada', 'pagada')
     OR v_liquidacion.id_comprobante_liquidacion IS NULL THEN
    RAISE EXCEPTION 'Apruebe y contabilice primero el devengo de la liquidación.';
  END IF;
  FOR v_grupo IN
    SELECT p.id_cuenta_pago, p.fecha_pago, max(p.id) AS ultimo_pago_id,
           round(sum(p.monto), 2) AS monto
    FROM public.pagos_liquidacion AS p
    WHERE p.id_empresa = v_liquidacion.id_empresa
      AND p.id_liquidacion = p_id_liquidacion
      AND p.id_comprobante_pago IS NULL
    GROUP BY p.id_cuenta_pago, p.fecha_pago
    ORDER BY p.fecha_pago, p.id_cuenta_pago
  LOOP
    v_id_comprobante := public._registrar_asiento_operativo(
      v_liquidacion.id_empresa, v_liquidacion.id_sucursal,
      v_grupo.fecha_pago, 'MANUAL',
      'Pago de liquidación #' || p_id_liquidacion,
      'FINIQUITO_PAGO',
      p_id_liquidacion::text || ':' || v_grupo.fecha_pago::text || ':'
        || v_grupo.id_cuenta_pago::text || ':' || v_grupo.ultimo_pago_id::text,
      jsonb_build_array(
        jsonb_build_object(
          'id_cuenta', (SELECT c.cuenta_pasivo_salarios
            FROM public.configuracion_nomina_contable AS c
            WHERE c.id_empresa = v_liquidacion.id_empresa),
          'debe', v_grupo.monto, 'haber', 0, 'descripcion', 'Pago de liquidación'
        ),
        jsonb_build_object(
          'id_cuenta', v_grupo.id_cuenta_pago,
          'debe', 0, 'haber', v_grupo.monto, 'descripcion', 'Salida de banco/caja'
        )
      )
    );
    UPDATE public.pagos_liquidacion AS p
    SET id_comprobante_pago = v_id_comprobante
    WHERE p.id_empresa = v_liquidacion.id_empresa
      AND p.id_liquidacion = p_id_liquidacion
      AND p.id_cuenta_pago = v_grupo.id_cuenta_pago
      AND p.fecha_pago = v_grupo.fecha_pago
      AND p.id_comprobante_pago IS NULL;
    v_cantidad := v_cantidad + 1;
  END LOOP;
  RETURN v_cantidad;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_liquidacion_laboral(
  bigint, date, text, numeric, numeric, numeric, numeric, numeric, numeric, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.aprobar_liquidacion_laboral(bigint, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.anular_liquidacion_laboral(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_pago_liquidacion(
  bigint, numeric, text, date, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.contabilizar_liquidacion(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.contabilizar_pagos_liquidacion(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_liquidacion_laboral(
  bigint, date, text, numeric, numeric, numeric, numeric, numeric, numeric, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_liquidacion_laboral(bigint, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_liquidacion_laboral(bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_liquidacion(
  bigint, numeric, text, date, bigint, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contabilizar_liquidacion(bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.contabilizar_pagos_liquidacion(bigint)
  TO authenticated;

CREATE TABLE public.tarifas_impresion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL REFERENCES public.empresa (id_empresa) ON DELETE RESTRICT,
  modo_color text NOT NULL CHECK (char_length(trim(modo_color)) BETWEEN 1 AND 40),
  tamano_papel text NOT NULL CHECK (char_length(trim(tamano_papel)) BETWEEN 1 AND 40),
  precio_por_copia numeric(14,2) NOT NULL CHECK (precio_por_copia > 0),
  activa boolean NOT NULL DEFAULT true,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_empresa, modo_color, tamano_papel)
);

CREATE TABLE public.trabajos_impresion (
  id_trabajo bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL REFERENCES public.empresa (id_empresa) ON DELETE RESTRICT,
  id_sucursal integer,
  numero_orden text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  nombre_cliente text NOT NULL CHECK (char_length(trim(nombre_cliente)) BETWEEN 2 AND 160),
  telefono text NOT NULL CHECK (char_length(trim(telefono)) BETWEEN 5 AND 40),
  archivo_nombre text NOT NULL CHECK (char_length(trim(archivo_nombre)) BETWEEN 1 AND 255),
  archivo_url text,
  storage_path text NOT NULL,
  modo_color text NOT NULL,
  copias integer NOT NULL CHECK (copias BETWEEN 1 AND 500),
  tamano_papel text NOT NULL,
  notas text,
  precio_estimado numeric(14,2) NOT NULL CHECK (precio_estimado > 0),
  precio_final numeric(14,2) CHECK (precio_final IS NULL OR precio_final > 0),
  estado text NOT NULL DEFAULT 'Pendiente'
    CHECK (estado IN ('Pendiente', 'En proceso', 'Listo', 'Entregado', 'Cancelado')),
  id_venta bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_venta)
    REFERENCES public.ventas (id_empresa, id_venta) ON DELETE RESTRICT
);

CREATE INDEX trabajos_impresion_empresa_fecha_idx
  ON public.trabajos_impresion (id_empresa, created_at DESC);
CREATE INDEX trabajos_impresion_cliente_idx
  ON public.trabajos_impresion (user_id, created_at DESC);

ALTER TABLE public.tarifas_impresion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajos_impresion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tarifas_impresion, public.trabajos_impresion
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.trabajos_impresion TO anon, authenticated;
GRANT SELECT ON public.tarifas_impresion TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_impresion TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.trabajos_impresion_id_trabajo_seq,
  public.tarifas_impresion_id_seq TO anon, authenticated;

CREATE POLICY tarifas_impresion_public_read
  ON public.tarifas_impresion FOR SELECT TO anon, authenticated
  USING (activa);
CREATE POLICY tarifas_impresion_admin
  ON public.tarifas_impresion FOR ALL TO authenticated
  USING ((SELECT public.puede_administrar_empresa(id_empresa)))
  WITH CHECK ((SELECT public.puede_administrar_empresa(id_empresa)));
CREATE POLICY trabajos_impresion_select
  ON public.trabajos_impresion FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.puede_ver_empresa(id_empresa))
  );
CREATE POLICY trabajos_impresion_insert
  ON public.trabajos_impresion FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY trabajos_impresion_staff_update
  ON public.trabajos_impresion FOR UPDATE TO authenticated
  USING ((SELECT public.puede_ver_empresa(id_empresa)))
  WITH CHECK ((SELECT public.puede_ver_empresa(id_empresa)));

CREATE OR REPLACE FUNCTION public.preparar_trabajo_impresion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_precio numeric(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.copias NOT BETWEEN 1 AND 500
       OR nullif(trim(NEW.modo_color), '') IS NULL
       OR nullif(trim(NEW.tamano_papel), '') IS NULL
       OR nullif(trim(NEW.storage_path), '') IS NULL
       OR NEW.storage_path !~ '^prints/'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects AS o
         WHERE o.bucket_id = 'print-files'
           AND o.name = NEW.storage_path
           AND o.owner_id IS NOT DISTINCT FROM auth.uid()::text
       ) THEN
      RAISE EXCEPTION 'La solicitud requiere archivo previamente cargado, formato válido y entre 1 y 500 copias.';
    END IF;
    IF NEW.id_sucursal IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.sucursales AS s
      WHERE s.id_empresa = NEW.id_empresa
        AND s.id_sucursal = NEW.id_sucursal
        AND s.activa
    ) THEN
      RAISE EXCEPTION 'La sucursal de impresión no pertenece a la empresa o está inactiva.';
    END IF;
    SELECT t.precio_por_copia
    INTO v_precio
    FROM public.tarifas_impresion AS t
    WHERE t.id_empresa = NEW.id_empresa
      AND lower(t.modo_color) = lower(trim(NEW.modo_color))
      AND lower(t.tamano_papel) = lower(trim(NEW.tamano_papel))
      AND t.activa;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No existe una tarifa activa para esta combinación de color y papel.';
    END IF;
    NEW.user_id := auth.uid();
    NEW.numero_orden := 'IMP-' || lpad(NEW.id_trabajo::text, 8, '0');
    NEW.precio_estimado := round(v_precio * NEW.copias, 2);
    NEW.precio_final := NULL;
    NEW.estado := 'Pendiente';
    NEW.id_venta := NULL;
    NEW.archivo_url := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NOT (SELECT public.puede_ver_empresa(OLD.id_empresa))
     OR NEW.id_empresa <> OLD.id_empresa
     OR NEW.id_trabajo <> OLD.id_trabajo
     OR NEW.numero_orden <> OLD.numero_orden
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.nombre_cliente <> OLD.nombre_cliente
     OR NEW.telefono <> OLD.telefono
     OR NEW.archivo_nombre <> OLD.archivo_nombre
     OR NEW.archivo_url IS DISTINCT FROM OLD.archivo_url
     OR NEW.storage_path <> OLD.storage_path
     OR NEW.modo_color <> OLD.modo_color
     OR NEW.copias <> OLD.copias
     OR NEW.tamano_papel <> OLD.tamano_papel
     OR NEW.precio_estimado <> OLD.precio_estimado
     OR NEW.id_sucursal IS DISTINCT FROM OLD.id_sucursal
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Solo se permite actualizar estado, precio final, notas o venta asociada del trabajo.';
  END IF;
  IF NEW.estado <> OLD.estado AND NOT (
    (OLD.estado = 'Pendiente' AND NEW.estado IN ('En proceso', 'Listo', 'Cancelado'))
    OR (OLD.estado = 'En proceso' AND NEW.estado IN ('Listo', 'Cancelado'))
    OR (OLD.estado = 'Listo' AND NEW.estado IN ('Entregado', 'Cancelado'))
  ) THEN
    RAISE EXCEPTION 'Transición de estado de impresión no permitida.';
  END IF;
  IF NEW.precio_final IS DISTINCT FROM OLD.precio_final
     AND NOT (SELECT public.puede_administrar_empresa(OLD.id_empresa)) THEN
    RAISE EXCEPTION 'Solo un administrador puede confirmar el precio final.';
  END IF;
  IF NEW.id_venta IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ventas AS v
    WHERE v.id_empresa = OLD.id_empresa AND v.id_venta = NEW.id_venta
  ) THEN
    RAISE EXCEPTION 'La venta asociada no existe en la empresa.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trabajos_impresion_preparar
  BEFORE INSERT OR UPDATE ON public.trabajos_impresion
  FOR EACH ROW EXECUTE FUNCTION public.preparar_trabajo_impresion();

REVOKE ALL ON FUNCTION public.preparar_trabajo_impresion()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validar_tarifa_impresion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.modo_color := lower(trim(NEW.modo_color));
  NEW.tamano_papel := lower(trim(NEW.tamano_papel));
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tarifas_impresion_actualizar
  BEFORE INSERT OR UPDATE ON public.tarifas_impresion
  FOR EACH ROW EXECUTE FUNCTION public.validar_tarifa_impresion();
REVOKE ALL ON FUNCTION public.validar_tarifa_impresion()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
