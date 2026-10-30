-- Plantillas y tasa referenciales para simulación; no habilitan cálculo fiscal ni contabilización automática.
BEGIN;

CREATE OR REPLACE FUNCTION public.crear_regla_contable(
  p_id_empresa integer,
  p_evento text,
  p_nombre text,
  p_lineas jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_evento text := upper(trim(COALESCE(p_evento, '')));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_id_regla bigint;
  v_linea jsonb;
  v_componente text;
  v_lado text;
  v_id_cuenta bigint;
  v_componentes text[] := ARRAY[]::text[];
  v_tiene_debe boolean := false;
  v_tiene_haber boolean := false;
BEGIN
  IF v_usuario IS NULL
     OR p_id_empresa IS NULL
     OR NOT (SELECT public.puede_administrar_empresa(p_id_empresa)) THEN
    RAISE EXCEPTION 'No tienes permiso para configurar las reglas de esta empresa.';
  END IF;
  IF v_evento !~ '^[A-Z][A-Z0-9_]{2,79}$'
     OR char_length(v_nombre) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'El código de evento o el nombre de la regla no son válidos.';
  END IF;
  IF pg_catalog.jsonb_typeof(p_lineas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Las líneas de la regla deben enviarse como una lista.';
  END IF;
  IF pg_catalog.jsonb_array_length(p_lineas) NOT BETWEEN 2 AND 30 THEN
    RAISE EXCEPTION 'La regla debe incluir entre 2 y 30 componentes.';
  END IF;

  INSERT INTO public.reglas_contables (id_empresa, evento, nombre, activa)
  VALUES (p_id_empresa, v_evento, v_nombre, true)
  RETURNING id_regla INTO v_id_regla;

  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lineas)
  LOOP
    v_componente := trim(COALESCE(v_linea ->> 'componente', ''));
    v_lado := upper(trim(COALESCE(v_linea ->> 'lado', '')));
    v_id_cuenta := NULLIF(v_linea ->> 'id_cuenta', '')::bigint;
    IF char_length(v_componente) NOT BETWEEN 1 AND 80
       OR v_lado NOT IN ('DEBE', 'HABER')
       OR v_id_cuenta IS NULL THEN
      RAISE EXCEPTION 'Cada componente requiere nombre, lado y cuenta contable.';
    END IF;
    IF v_componente = ANY(v_componentes) THEN
      RAISE EXCEPTION 'Cada componente debe aparecer una sola vez en la regla.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.cuentas_contables c
      WHERE c.id_empresa = p_id_empresa
        AND c.id_cuenta = v_id_cuenta
        AND c.activa
        AND NOT c.es_grupo
        AND c.permite_movimientos
    ) THEN
      RAISE EXCEPTION 'Selecciona cuentas activas que permitan movimientos en esta empresa.';
    END IF;

    INSERT INTO public.reglas_contables_lineas (
      id_empresa, id_regla, componente, lado, id_cuenta
    )
    VALUES (p_id_empresa, v_id_regla, v_componente, v_lado, v_id_cuenta);

    v_componentes := pg_catalog.array_append(v_componentes, v_componente);
    v_tiene_debe := v_tiene_debe OR v_lado = 'DEBE';
    v_tiene_haber := v_tiene_haber OR v_lado = 'HABER';
  END LOOP;

  IF NOT v_tiene_debe OR NOT v_tiene_haber THEN
    RAISE EXCEPTION 'La plantilla debe incluir al menos un componente al Debe y uno al Haber.';
  END IF;
  RETURN v_id_regla;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_regla_contable(integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_regla_contable(integer, text, text, jsonb)
  TO authenticated;

DO $$
DECLARE
  v_empresa integer;
  v_id_regla bigint;
  v_fila record;
  v_id_cuenta bigint;
BEGIN
  SELECT e.id_empresa INTO v_empresa
  FROM public.empresa e
  WHERE e.id_empresa = 1
    AND e.activa;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'No se encontró la empresa activa esperada para las plantillas de simulación.';
  END IF;

  FOR v_fila IN
    SELECT *
    FROM (VALUES
      ('SIM_VENTA_CONTADO', 'Simulación · Venta de productos al contado', 'EFECTIVO', 'DEBE', '1.1.01'),
      ('SIM_VENTA_CONTADO', 'Simulación · Venta de productos al contado', 'VENTAS', 'HABER', '4.1.01'),
      ('SIM_VENTA_CONTADO', 'Simulación · Venta de productos al contado', 'COSTO_VENTA', 'DEBE', '5.1.01'),
      ('SIM_VENTA_CONTADO', 'Simulación · Venta de productos al contado', 'INVENTARIO', 'HABER', '1.1.06'),
      ('SIM_VENTA_CREDITO', 'Simulación · Venta de productos al crédito', 'CLIENTES', 'DEBE', '1.1.05'),
      ('SIM_VENTA_CREDITO', 'Simulación · Venta de productos al crédito', 'VENTAS', 'HABER', '4.1.01'),
      ('SIM_VENTA_CREDITO', 'Simulación · Venta de productos al crédito', 'COSTO_VENTA', 'DEBE', '5.1.01'),
      ('SIM_VENTA_CREDITO', 'Simulación · Venta de productos al crédito', 'INVENTARIO', 'HABER', '1.1.06'),
      ('SIM_COMPRA_CONTADO', 'Simulación · Compra de inventario al contado', 'INVENTARIO', 'DEBE', '1.1.06'),
      ('SIM_COMPRA_CONTADO', 'Simulación · Compra de inventario al contado', 'EFECTIVO', 'HABER', '1.1.01'),
      ('SIM_COMPRA_CREDITO', 'Simulación · Compra de inventario al crédito', 'INVENTARIO', 'DEBE', '1.1.06'),
      ('SIM_COMPRA_CREDITO', 'Simulación · Compra de inventario al crédito', 'PROVEEDORES', 'HABER', '2.1.01'),
      ('SIM_COBRO_CXC', 'Simulación · Cobro a cliente', 'EFECTIVO', 'DEBE', '1.1.01'),
      ('SIM_COBRO_CXC', 'Simulación · Cobro a cliente', 'CLIENTES', 'HABER', '1.1.05'),
      ('SIM_PAGO_PROVEEDOR', 'Simulación · Pago a proveedor', 'PROVEEDORES', 'DEBE', '2.1.01'),
      ('SIM_PAGO_PROVEEDOR', 'Simulación · Pago a proveedor', 'EFECTIVO', 'HABER', '1.1.01'),
      ('SIM_DEPOSITO_CAJA_BANCO', 'Simulación · Depósito de efectivo a banco', 'BANCO', 'DEBE', '1.1.04'),
      ('SIM_DEPOSITO_CAJA_BANCO', 'Simulación · Depósito de efectivo a banco', 'EFECTIVO', 'HABER', '1.1.01'),
      ('SIM_GASTO_OPERATIVO', 'Simulación · Gasto operativo pagado', 'GASTO', 'DEBE', '6.5.03'),
      ('SIM_GASTO_OPERATIVO', 'Simulación · Gasto operativo pagado', 'EFECTIVO', 'HABER', '1.1.01')
    ) AS plantillas(evento, nombre, componente, lado, codigo_cuenta)
  LOOP
    INSERT INTO public.reglas_contables (id_empresa, evento, nombre, activa)
    VALUES (v_empresa, v_fila.evento, v_fila.nombre, true)
    ON CONFLICT (id_empresa, evento) DO NOTHING;

    SELECT r.id_regla INTO v_id_regla
    FROM public.reglas_contables r
    WHERE r.id_empresa = v_empresa
      AND r.evento = v_fila.evento;

    SELECT c.id_cuenta INTO v_id_cuenta
    FROM public.cuentas_contables c
    WHERE c.id_empresa = v_empresa
      AND c.codigo = v_fila.codigo_cuenta
      AND c.activa
      AND NOT c.es_grupo
      AND c.permite_movimientos;
    IF v_id_cuenta IS NULL THEN
      RAISE EXCEPTION 'Falta una cuenta activa y transaccional requerida para la plantilla %: %.',
        v_fila.evento, v_fila.codigo_cuenta;
    END IF;

    INSERT INTO public.reglas_contables_lineas (
      id_empresa, id_regla, componente, lado, id_cuenta
    )
    VALUES (
      v_empresa, v_id_regla, v_fila.componente, v_fila.lado, v_id_cuenta
    )
    ON CONFLICT (id_regla, componente) DO NOTHING;
  END LOOP;

  INSERT INTO public.impuestos_config (
    id_empresa, codigo, nombre, tipo, tasa_porcentual,
    cuenta_impuesto_por_pagar, cuenta_impuesto_acreditable,
    vigente_desde, solo_simulacion, activo
  )
  SELECT
    v_empresa,
    'IVA_GENERAL_SIM',
    'IVA general 15% · referencia de simulación',
    'IVA',
    15.0000,
    pagar.id_cuenta,
    acreditar.id_cuenta,
    DATE '2026-10-30',
    true,
    true
  FROM public.cuentas_contables pagar
  JOIN public.cuentas_contables acreditar
    ON acreditar.id_empresa = pagar.id_empresa
  WHERE pagar.id_empresa = v_empresa
    AND pagar.codigo = '2.1.04'
    AND acreditar.codigo = '1.1.07'
    AND pagar.activa
    AND acreditar.activa
  ON CONFLICT (id_empresa, codigo, vigente_desde) DO NOTHING;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
