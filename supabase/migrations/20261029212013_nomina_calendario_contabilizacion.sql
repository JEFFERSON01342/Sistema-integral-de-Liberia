BEGIN;

ALTER TABLE public.empleados
  ADD COLUMN clase_trabajador text NOT NULL DEFAULT 'empleado'
    CHECK (clase_trabajador IN ('obrero', 'empleado')),
  ADD COLUMN frecuencia_pago text NOT NULL DEFAULT 'quincenal'
    CHECK (frecuencia_pago IN ('semanal', 'quincenal')),
  ADD CONSTRAINT empleados_frecuencia_por_clase_check CHECK (
    (clase_trabajador = 'obrero' AND frecuencia_pago = 'semanal')
    OR clase_trabajador = 'empleado'
  );

ALTER TABLE public.nomina_periodos
  ADD COLUMN id_comprobante_nomina bigint,
  ADD CONSTRAINT nomina_periodos_comprobante_empresa_fkey
    FOREIGN KEY (id_empresa, id_comprobante_nomina)
    REFERENCES public.comprobantes_contables (id_empresa, id_comprobante)
    ON DELETE RESTRICT,
  ADD CONSTRAINT nomina_periodos_comprobante_unico UNIQUE (id_empresa, id_comprobante_nomina);

ALTER TABLE public.pagos_salarios
  ADD COLUMN id_cuenta_pago bigint,
  ADD COLUMN id_comprobante_pago bigint,
  ADD CONSTRAINT pagos_salarios_cuenta_empresa_fkey
    FOREIGN KEY (id_empresa, id_cuenta_pago)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta)
    ON DELETE RESTRICT,
  ADD CONSTRAINT pagos_salarios_comprobante_empresa_fkey
    FOREIGN KEY (id_empresa, id_comprobante_pago)
    REFERENCES public.comprobantes_contables (id_empresa, id_comprobante)
    ON DELETE RESTRICT;

CREATE TABLE public.configuracion_nomina_contable (
  id_empresa integer PRIMARY KEY
    REFERENCES public.empresa (id_empresa) ON DELETE RESTRICT,
  cuenta_gasto_salarios bigint NOT NULL,
  cuenta_gasto_inss_patronal bigint NOT NULL,
  cuenta_gasto_inatec bigint NOT NULL,
  cuenta_gasto_aguinaldo bigint NOT NULL,
  cuenta_gasto_vacaciones bigint NOT NULL,
  cuenta_pasivo_salarios bigint NOT NULL,
  cuenta_pasivo_inss_laboral bigint NOT NULL,
  cuenta_pasivo_ir bigint NOT NULL,
  cuenta_pasivo_otras_deducciones bigint NOT NULL,
  cuenta_pasivo_inss_patronal bigint NOT NULL,
  cuenta_pasivo_inatec bigint NOT NULL,
  cuenta_pasivo_aguinaldo bigint NOT NULL,
  cuenta_pasivo_vacaciones bigint NOT NULL,
  updated_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, cuenta_gasto_salarios)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_gasto_inss_patronal)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_gasto_inatec)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_gasto_aguinaldo)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_gasto_vacaciones)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_salarios)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_inss_laboral)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_ir)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_otras_deducciones)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_inss_patronal)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_inatec)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_aguinaldo)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, cuenta_pasivo_vacaciones)
    REFERENCES public.cuentas_contables (id_empresa, id_cuenta) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.validar_periodo_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dias integer;
BEGIN
  IF NEW.id_sucursal IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.sucursales AS s
    WHERE s.id_empresa = NEW.id_empresa
      AND s.id_sucursal = NEW.id_sucursal
      AND s.activa
  ) THEN
    RAISE EXCEPTION 'Cada nómina debe pertenecer a una sucursal activa de la empresa.';
  END IF;
  v_dias := NEW.periodo_fin - NEW.periodo_inicio + 1;
  IF NEW.tipo = 'semanal' AND v_dias <> 7 THEN
    RAISE EXCEPTION 'El período semanal debe comprender exactamente siete días.';
  ELSIF NEW.tipo = 'quincenal' AND v_dias NOT BETWEEN 1 AND 15 THEN
    RAISE EXCEPTION 'El período de empleados no puede exceder quince días consecutivos.';
  ELSIF NEW.tipo NOT IN ('semanal', 'quincenal') THEN
    RAISE EXCEPTION 'Solo se admiten nóminas semanales o quincenales en este flujo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_periodo_nomina()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER nomina_periodos_validar_calendario
  BEFORE INSERT ON public.nomina_periodos
  FOR EACH ROW EXECUTE FUNCTION public.validar_periodo_nomina();

CREATE OR REPLACE FUNCTION public.validar_frecuencia_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empleado record;
  v_periodo record;
  v_ultimo_periodo_fin date;
BEGIN
  SELECT e.clase_trabajador, e.frecuencia_pago
  INTO v_empleado
  FROM public.empleados AS e
  WHERE e.id_empresa = NEW.id_empresa
    AND e.id_empleado = NEW.id_empleado
  FOR SHARE OF e;

  SELECT n.tipo, n.periodo_inicio, n.periodo_fin
  INTO v_periodo
  FROM public.nomina_periodos AS n
  WHERE n.id_empresa = NEW.id_empresa
    AND n.id = NEW.id_periodo;

  IF v_empleado.frecuencia_pago IS NULL OR v_periodo.tipo IS NULL THEN
    RAISE EXCEPTION 'No se encontró la frecuencia del empleado o el período de nómina.';
  END IF;
  IF v_periodo.tipo NOT IN ('semanal', 'quincenal')
     OR v_periodo.tipo <> v_empleado.frecuencia_pago THEN
    RAISE EXCEPTION 'La frecuencia del período no coincide con la frecuencia pactada del empleado.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'NOMINA:' || NEW.id_empresa::text || ':' || NEW.id_empleado::text,
      0
    )
  );
  IF EXISTS (
    SELECT 1
    FROM public.nomina_detalle AS d
    JOIN public.nomina_periodos AS p
      ON p.id_empresa = d.id_empresa
     AND p.id = d.id_periodo
    WHERE d.id_empresa = NEW.id_empresa
      AND d.id_empleado = NEW.id_empleado
      AND d.id_periodo <> NEW.id_periodo
      AND p.estado <> 'anulada'
      AND p.periodo_inicio <= v_periodo.periodo_fin
      AND p.periodo_fin >= v_periodo.periodo_inicio
  ) THEN
    RAISE EXCEPTION 'El empleado ya tiene una nómina para fechas que se superponen.';
  END IF;
  SELECT max(p.periodo_fin)
  INTO v_ultimo_periodo_fin
  FROM public.nomina_detalle AS d
  JOIN public.nomina_periodos AS p
    ON p.id_empresa = d.id_empresa
   AND p.id = d.id_periodo
  WHERE d.id_empresa = NEW.id_empresa
    AND d.id_empleado = NEW.id_empleado
    AND p.estado <> 'anulada';
  IF v_ultimo_periodo_fin IS NOT NULL
     AND v_periodo.periodo_inicio <> v_ultimo_periodo_fin + 1 THEN
    RAISE EXCEPTION 'Los períodos del empleado deben ser consecutivos y procesarse en orden; el siguiente inicia el día %.',
      v_ultimo_periodo_fin + 1;
  END IF;

  IF v_periodo.tipo = 'semanal'
     AND v_periodo.periodo_fin - v_periodo.periodo_inicio <> 6 THEN
    RAISE EXCEPTION 'El período semanal debe comprender exactamente siete días.';
  END IF;

  IF v_periodo.tipo = 'quincenal'
     AND v_periodo.periodo_fin - v_periodo.periodo_inicio >= 15 THEN
    RAISE EXCEPTION 'El período de empleados no puede exceder quince días consecutivos.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_frecuencia_nomina()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER nomina_detalle_validar_frecuencia
  BEFORE INSERT ON public.nomina_detalle
  FOR EACH ROW EXECUTE FUNCTION public.validar_frecuencia_nomina();

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

REVOKE ALL ON FUNCTION public.validar_configuracion_nomina_contable()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER configuracion_nomina_contable_validar
  BEFORE INSERT OR UPDATE ON public.configuracion_nomina_contable
  FOR EACH ROW EXECUTE FUNCTION public.validar_configuracion_nomina_contable();

ALTER TABLE public.configuracion_nomina_contable ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.configuracion_nomina_contable FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.configuracion_nomina_contable TO authenticated;

CREATE POLICY configuracion_nomina_contable_select
  ON public.configuracion_nomina_contable FOR SELECT TO authenticated
  USING ((SELECT public.puede_ver_rrhh_empresa(id_empresa)));
CREATE POLICY configuracion_nomina_contable_insert
  ON public.configuracion_nomina_contable FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.activo
        AND (
          p.rol = 'superadmin'
          OR (p.rol = 'admin' AND p.id_empresa = id_empresa)
        )
    )
  );
CREATE POLICY configuracion_nomina_contable_update
  ON public.configuracion_nomina_contable FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.activo
        AND (
          p.rol = 'superadmin'
          OR (p.rol = 'admin' AND p.id_empresa = id_empresa)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.activo
        AND (
          p.rol = 'superadmin'
          OR (p.rol = 'admin' AND p.id_empresa = id_empresa)
        )
    )
  );

DROP FUNCTION public.registrar_pago_nomina(bigint, numeric, text, date, text);

CREATE OR REPLACE FUNCTION public.registrar_pago_nomina(
  p_id_detalle bigint,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date,
  p_concepto text,
  p_id_cuenta_pago bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_detalle record;
  v_cuenta record;
  v_frecuencia text;
  v_dias_maximos integer;
  v_fecha_pago_anterior date;
  v_pagado numeric(14,2);
  v_id_pago bigint;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 OR p_fecha_pago IS NULL
     OR p_id_cuenta_pago IS NULL
     OR lower(coalesce(p_metodo, '')) NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'El pago requiere monto positivo, fecha, método válido y cuenta de salida.';
  END IF;

  SELECT d.id_empresa, d.id_empleado, d.id_periodo, d.salario_neto,
         n.id_sucursal, n.estado AS estado_periodo, n.periodo_inicio, n.periodo_fin
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

  SELECT e.frecuencia_pago
  INTO v_frecuencia
  FROM public.empleados AS e
  WHERE e.id_empresa = v_detalle.id_empresa
    AND e.id_empleado = v_detalle.id_empleado
  FOR SHARE OF e;
  v_dias_maximos := CASE v_frecuencia
    WHEN 'semanal' THEN 7
    WHEN 'quincenal' THEN 15
    ELSE NULL
  END;
  IF v_dias_maximos IS NULL THEN
    RAISE EXCEPTION 'El empleado no tiene una frecuencia de pago válida.';
  END IF;
  IF p_fecha_pago < v_detalle.periodo_inicio THEN
    RAISE EXCEPTION 'La fecha de pago no puede preceder al inicio del período trabajado.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'NOMINA:' || v_detalle.id_empresa::text || ':' || v_detalle.id_empleado::text,
      0
    )
  );
  SELECT max(p.fecha_pago)
  INTO v_fecha_pago_anterior
  FROM public.pagos_salarios AS p
  JOIN public.nomina_detalle AS d
    ON d.id_empresa = p.id_empresa
   AND d.id = p.id_detalle_nomina
  JOIN public.nomina_periodos AS n
    ON n.id_empresa = d.id_empresa
   AND n.id = d.id_periodo
  WHERE p.id_empresa = v_detalle.id_empresa
    AND d.id_empleado = v_detalle.id_empleado
    AND n.estado <> 'anulada';
  IF v_fecha_pago_anterior IS NOT NULL
     AND (
       p_fecha_pago < v_fecha_pago_anterior
       OR p_fecha_pago - v_fecha_pago_anterior > v_dias_maximos
     ) THEN
    RAISE EXCEPTION 'La fecha debe respetar el orden y el intervalo máximo de % días entre pagos.', v_dias_maximos;
  ELSIF v_fecha_pago_anterior IS NULL
     AND p_fecha_pago - v_detalle.periodo_inicio > v_dias_maximos THEN
    RAISE EXCEPTION 'El primer pago registrado debe ocurrir dentro del límite de % días desde el inicio del período. Reconcilie pagos anteriores antes de usar este módulo.', v_dias_maximos;
  END IF;

  SELECT c.id_cuenta, c.activa, c.naturaleza, c.es_banco, c.es_efectivo,
         c.es_grupo, c.permite_movimientos
  INTO v_cuenta
  FROM public.cuentas_contables AS c
  WHERE c.id_empresa = v_detalle.id_empresa
    AND c.id_cuenta = p_id_cuenta_pago;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta de salida no pertenece a la empresa.';
  END IF;
  IF NOT v_cuenta.activa OR v_cuenta.es_grupo
     OR NOT v_cuenta.permite_movimientos OR v_cuenta.naturaleza <> 'ACTIVO'
     OR NOT (v_cuenta.es_banco OR v_cuenta.es_efectivo) THEN
    RAISE EXCEPTION 'Selecciona una cuenta activa de banco o efectivo de la empresa.';
  END IF;
  IF (lower(p_metodo) = 'efectivo' AND NOT v_cuenta.es_efectivo)
     OR (lower(p_metodo) = 'transferencia' AND NOT v_cuenta.es_banco) THEN
    RAISE EXCEPTION 'La cuenta de salida no coincide con el método de pago.';
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
    id_empresa, id_empleado, id_detalle_nomina, id_cuenta_pago,
    monto, metodo, fecha_pago, concepto
  )
  VALUES (
    v_detalle.id_empresa, v_detalle.id_empleado, p_id_detalle, p_id_cuenta_pago,
    round(p_monto, 2), nullif(trim(p_metodo), ''), p_fecha_pago,
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

REVOKE ALL ON FUNCTION public.registrar_pago_nomina(bigint, numeric, text, date, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pago_nomina(bigint, numeric, text, date, text, bigint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.contabilizar_nomina(p_id_periodo bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_periodo record;
  v_config record;
  v_totales record;
  v_lineas jsonb := '[]'::jsonb;
  v_id_comprobante bigint;
BEGIN
  SELECT n.id_empresa, n.id_sucursal, n.periodo_fin, n.estado, n.id_comprobante_nomina
  INTO v_periodo
  FROM public.nomina_periodos AS n
  WHERE n.id = p_id_periodo
  FOR UPDATE;
  IF v_periodo.id_empresa IS NULL THEN
    RAISE EXCEPTION 'El período de nómina no existe.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_periodo.id_empresa, v_periodo.id_sucursal))
     OR NOT (SELECT public.puede_crear_comprobante_contable(
       v_periodo.id_empresa, v_periodo.id_sucursal, 'MANUAL', 'NOMINA', p_id_periodo::text
     )) THEN
    RAISE EXCEPTION 'No tienes permiso para contabilizar esta nómina.';
  END IF;
  IF v_periodo.id_comprobante_nomina IS NOT NULL THEN
    RETURN v_periodo.id_comprobante_nomina;
  END IF;
  IF v_periodo.estado NOT IN ('procesada', 'pagada') OR v_periodo.id_sucursal IS NULL THEN
    RAISE EXCEPTION 'Solo se contabilizan nóminas procesadas de una sucursal definida.';
  END IF;

  SELECT * INTO v_config
  FROM public.configuracion_nomina_contable AS c
  WHERE c.id_empresa = v_periodo.id_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configura las cuentas contables de nómina antes de contabilizar.';
  END IF;

  SELECT
    round(sum(d.salario_bruto + d.otros_ingresos), 2) AS salarios,
    round(sum(d.inss_patronal), 2) AS inss_patronal,
    round(sum(d.inatec), 2) AS inatec,
    round(sum(d.aguinaldo_provisionado), 2) AS aguinaldo,
    round(sum(d.vacaciones_provisionadas), 2) AS vacaciones,
    round(sum(d.salario_neto), 2) AS salario_neto,
    round(sum(d.inss_laboral), 2) AS inss_laboral,
    round(sum(d.ir_mensual), 2) AS ir,
    round(sum(d.otros_descuentos), 2) AS otras_deducciones
  INTO v_totales
  FROM public.nomina_detalle AS d
  WHERE d.id_empresa = v_periodo.id_empresa
    AND d.id_periodo = p_id_periodo;

  IF v_totales.salarios IS NULL OR v_totales.salarios <= 0 THEN
    RAISE EXCEPTION 'El período no contiene detalles para contabilizar.';
  END IF;

  IF v_totales.salarios > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_salarios, 'debe', v_totales.salarios, 'haber', 0,
      'descripcion', 'Salarios brutos y otros ingresos'
    ));
  END IF;
  IF v_totales.inss_patronal > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_inss_patronal, 'debe', v_totales.inss_patronal, 'haber', 0,
      'descripcion', 'Aporte patronal INSS'
    ));
  END IF;
  IF v_totales.inatec > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_inatec, 'debe', v_totales.inatec, 'haber', 0,
      'descripcion', 'Aporte patronal INATEC'
    ));
  END IF;
  IF v_totales.aguinaldo > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_aguinaldo, 'debe', v_totales.aguinaldo, 'haber', 0,
      'descripcion', 'Provisión de aguinaldo'
    ));
  END IF;
  IF v_totales.vacaciones > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_gasto_vacaciones, 'debe', v_totales.vacaciones, 'haber', 0,
      'descripcion', 'Provisión de vacaciones'
    ));
  END IF;
  IF v_totales.salario_neto > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_salarios, 'debe', 0, 'haber', v_totales.salario_neto,
      'descripcion', 'Salario neto por pagar'
    ));
  END IF;
  IF v_totales.inss_laboral > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_inss_laboral, 'debe', 0, 'haber', v_totales.inss_laboral,
      'descripcion', 'INSS laboral retenido por pagar'
    ));
  END IF;
  IF v_totales.ir > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_ir, 'debe', 0, 'haber', v_totales.ir,
      'descripcion', 'IR retenido por pagar'
    ));
  END IF;
  IF v_totales.otras_deducciones > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_otras_deducciones, 'debe', 0, 'haber', v_totales.otras_deducciones,
      'descripcion', 'Otras deducciones por pagar'
    ));
  END IF;
  IF v_totales.inss_patronal > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_inss_patronal, 'debe', 0, 'haber', v_totales.inss_patronal,
      'descripcion', 'INSS patronal por pagar'
    ));
  END IF;
  IF v_totales.inatec > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_inatec, 'debe', 0, 'haber', v_totales.inatec,
      'descripcion', 'INATEC por pagar'
    ));
  END IF;
  IF v_totales.aguinaldo > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_aguinaldo, 'debe', 0, 'haber', v_totales.aguinaldo,
      'descripcion', 'Aguinaldo provisionado por pagar'
    ));
  END IF;
  IF v_totales.vacaciones > 0 THEN
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'id_cuenta', v_config.cuenta_pasivo_vacaciones, 'debe', 0, 'haber', v_totales.vacaciones,
      'descripcion', 'Vacaciones provisionadas por pagar'
    ));
  END IF;

  v_id_comprobante := public._registrar_asiento_operativo(
    v_periodo.id_empresa, v_periodo.id_sucursal, v_periodo.periodo_fin, 'MANUAL',
    'Contabilización de nómina #' || p_id_periodo, 'NOMINA',
    p_id_periodo::text, v_lineas
  );

  UPDATE public.nomina_periodos
  SET id_comprobante_nomina = v_id_comprobante
  WHERE id = p_id_periodo;

  RETURN v_id_comprobante;
END;
$$;

CREATE OR REPLACE FUNCTION public.contabilizar_pagos_nomina(p_id_periodo bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_periodo record;
  v_config record;
  v_grupo record;
  v_id_comprobante bigint;
  v_contabilizados integer := 0;
BEGIN
  SELECT n.id_empresa, n.id_sucursal, n.estado, n.id_comprobante_nomina
  INTO v_periodo
  FROM public.nomina_periodos AS n
  WHERE n.id = p_id_periodo
  FOR UPDATE;
  IF v_periodo.id_empresa IS NULL THEN
    RAISE EXCEPTION 'El período de nómina no existe.';
  END IF;
  IF NOT (SELECT public.puede_gestionar_rrhh(v_periodo.id_empresa, v_periodo.id_sucursal))
     OR NOT (SELECT public.puede_crear_comprobante_contable(
       v_periodo.id_empresa, v_periodo.id_sucursal, 'MANUAL', 'NOMINA_PAGO', p_id_periodo::text
     )) THEN
    RAISE EXCEPTION 'No tienes permiso para contabilizar pagos de esta nómina.';
  END IF;
  IF v_periodo.estado NOT IN ('procesada', 'pagada') THEN
    RAISE EXCEPTION 'La nómina debe estar procesada antes de contabilizar sus pagos.';
  END IF;
  IF v_periodo.id_comprobante_nomina IS NULL THEN
    RAISE EXCEPTION 'Contabilice primero el devengo de la nómina antes de contabilizar los desembolsos.';
  END IF;
  SELECT * INTO v_config
  FROM public.configuracion_nomina_contable AS c
  WHERE c.id_empresa = v_periodo.id_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configura las cuentas contables de nómina antes de contabilizar pagos.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pagos_salarios AS p
    JOIN public.nomina_detalle AS d
      ON d.id_empresa = p.id_empresa
     AND d.id = p.id_detalle_nomina
    WHERE p.id_empresa = v_periodo.id_empresa
      AND d.id_periodo = p_id_periodo
      AND p.id_comprobante_pago IS NULL
      AND p.id_cuenta_pago IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay pagos anteriores sin cuenta de salida; asígneles cuenta antes de contabilizarlos.';
  END IF;

  FOR v_grupo IN
    SELECT p.id_cuenta_pago, p.fecha_pago, round(sum(p.monto), 2) AS monto
    FROM public.pagos_salarios AS p
    WHERE p.id_empresa = v_periodo.id_empresa
      AND p.id_detalle_nomina IN (
        SELECT d.id FROM public.nomina_detalle AS d
        WHERE d.id_empresa = v_periodo.id_empresa
          AND d.id_periodo = p_id_periodo
      )
      AND p.id_comprobante_pago IS NULL
      AND p.id_cuenta_pago IS NOT NULL
    GROUP BY p.id_cuenta_pago, p.fecha_pago
    ORDER BY p.fecha_pago, p.id_cuenta_pago
  LOOP
    v_id_comprobante := public._registrar_asiento_operativo(
      v_periodo.id_empresa, v_periodo.id_sucursal, v_grupo.fecha_pago, 'MANUAL',
      'Pago de salarios de nómina #' || p_id_periodo, 'NOMINA_PAGO',
      p_id_periodo::text || ':' || v_grupo.fecha_pago::text || ':' || v_grupo.id_cuenta_pago::text,
      jsonb_build_array(
        jsonb_build_object(
          'id_cuenta', v_config.cuenta_pasivo_salarios,
          'debe', v_grupo.monto, 'haber', 0, 'descripcion', 'Cancelación de salario por pagar'
        ),
        jsonb_build_object(
          'id_cuenta', v_grupo.id_cuenta_pago,
          'debe', 0, 'haber', v_grupo.monto, 'descripcion', 'Desembolso de nómina'
        )
      )
    );

    UPDATE public.pagos_salarios AS p
    SET id_comprobante_pago = v_id_comprobante
    WHERE p.id_empresa = v_periodo.id_empresa
      AND p.id_cuenta_pago = v_grupo.id_cuenta_pago
      AND p.fecha_pago = v_grupo.fecha_pago
      AND p.id_comprobante_pago IS NULL
      AND p.id_detalle_nomina IN (
        SELECT d.id FROM public.nomina_detalle AS d
        WHERE d.id_empresa = v_periodo.id_empresa
          AND d.id_periodo = p_id_periodo
      );
    v_contabilizados := v_contabilizados + 1;
  END LOOP;

  IF v_contabilizados = 0 THEN
    RETURN 0;
  END IF;
  RETURN v_contabilizados;
END;
$$;

REVOKE ALL ON FUNCTION public.contabilizar_nomina(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.contabilizar_pagos_nomina(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contabilizar_nomina(bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.contabilizar_pagos_nomina(bigint)
  TO authenticated;

COMMIT;
