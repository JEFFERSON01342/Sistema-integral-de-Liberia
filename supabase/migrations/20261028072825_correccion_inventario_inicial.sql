-- Corrección de la fase 7: separar el ID de la cuenta de inventario del ID
-- del movimiento, para que el comprobante de apertura use la cuenta correcta.

CREATE OR REPLACE FUNCTION public.registrar_inventario_inicial(
  p_id_producto bigint,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_motivo text,
  p_idempotencia_key text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_sucursal integer;
  v_id_bodega bigint;
  v_id_ubicacion bigint;
  v_zona text;
  v_fecha date;
  v_ahora timestamptz := clock_timestamp();
  v_periodo bigint;
  v_producto_activo boolean;
  v_id_capa bigint;
  v_capa_producto bigint;
  v_capa_cantidad numeric(14, 3);
  v_capa_costo numeric(14, 4);
  v_id_comprobante bigint;
  v_id_cuenta_inventario bigint;
  v_id_capital bigint;
  v_id_movimiento bigint;
  v_total numeric(14, 2);
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para cargar inventario inicial.';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0
     OR p_cantidad <> round(p_cantidad, 3)
     OR p_costo_unitario IS NULL OR p_costo_unitario <= 0
     OR p_costo_unitario <> round(p_costo_unitario, 4) THEN
    RAISE EXCEPTION 'La cantidad debe ser positiva con máximo tres decimales y el costo unitario positivo con máximo cuatro.';
  END IF;

  IF p_motivo IS NULL OR char_length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'El motivo del inventario inicial debe tener al menos tres caracteres.';
  END IF;

  IF p_idempotencia_key IS NULL
     OR char_length(trim(p_idempotencia_key)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria y debe tener entre 1 y 128 caracteres.';
  END IF;

  SELECT p.id_empresa, p.activo
  INTO v_empresa, v_producto_activo
  FROM public.productos AS p
  WHERE p.id_producto = p_id_producto
  FOR UPDATE;

  IF v_empresa IS NULL OR NOT v_producto_activo THEN
    RAISE EXCEPTION 'El producto no existe o está inactivo.';
  END IF;

  IF NOT (SELECT public.puede_administrar_empresa(v_empresa)) THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar inventario inicial.';
  END IF;

  SELECT cf.id_capa, cf.id_producto, cf.cantidad_inicial, cf.costo_unitario
  INTO v_id_capa, v_capa_producto, v_capa_cantidad, v_capa_costo
  FROM public.capas_inventario_fifo AS cf
  WHERE cf.id_empresa = v_empresa
    AND cf.origen_tipo = 'INVENTARIO_INICIAL'
    AND cf.origen_id = trim(p_idempotencia_key);

  IF v_id_capa IS NOT NULL THEN
    IF v_capa_producto <> p_id_producto
       OR v_capa_cantidad <> p_cantidad
       OR v_capa_costo <> p_costo_unitario THEN
      RAISE EXCEPTION 'La clave de inventario inicial ya se usó con datos diferentes.';
    END IF;
    RETURN v_id_capa;
  END IF;

  SELECT s.id_sucursal, e.zona_horaria
  INTO v_sucursal, v_zona
  FROM public.sucursales AS s
  JOIN public.empresa AS e ON e.id_empresa = s.id_empresa
  WHERE s.id_empresa = v_empresa
    AND s.activa
    AND e.activa
    AND s.es_principal
  ORDER BY s.id_sucursal
  LIMIT 1;

  IF v_sucursal IS NULL THEN
    RAISE EXCEPTION 'La empresa no tiene una sucursal principal activa.';
  END IF;

  SELECT b.id_bodega INTO v_id_bodega
  FROM public.bodegas AS b
  WHERE b.id_empresa = v_empresa
    AND b.id_sucursal = v_sucursal
    AND b.activa
  ORDER BY b.id_bodega
  LIMIT 1;

  SELECT u.id_ubicacion INTO v_id_ubicacion
  FROM public.ubicaciones_bodega AS u
  WHERE u.id_empresa = v_empresa
    AND u.id_sucursal = v_sucursal
    AND u.id_bodega = v_id_bodega
    AND u.tipo_area = 'PICKING'
    AND u.activa
  ORDER BY u.id_ubicacion
  LIMIT 1;

  IF v_id_bodega IS NULL OR v_id_ubicacion IS NULL THEN
    RAISE EXCEPTION 'Falta una bodega activa o una ubicación de ventas/exhibición PICKING.';
  END IF;

  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;

  SELECT pc.id_periodo INTO v_periodo
  FROM public.periodos_contables AS pc
  WHERE pc.id_empresa = v_empresa
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin
    AND pc.estado = 'ABIERTO'
  FOR SHARE;

  IF v_periodo IS NULL THEN
    RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.';
  END IF;

  SELECT c.id_cuenta INTO v_id_cuenta_inventario
  FROM public.cuentas_contables AS c
  WHERE c.id_empresa = v_empresa
    AND c.codigo = '1.1.06'
    AND c.activa
    AND NOT c.es_grupo
    AND c.permite_movimientos;

  SELECT c.id_cuenta INTO v_id_capital
  FROM public.cuentas_contables AS c
  WHERE c.id_empresa = v_empresa
    AND c.codigo = '3.1.01'
    AND c.activa
    AND NOT c.es_grupo
    AND c.permite_movimientos;

  IF v_id_cuenta_inventario IS NULL OR v_id_capital IS NULL THEN
    RAISE EXCEPTION 'Falta configurar las cuentas activas de inventario y capital aportado.';
  END IF;

  v_total := round(p_cantidad * p_costo_unitario, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El valor del inventario inicial debe ser al menos 0.01.';
  END IF;

  INSERT INTO public.capas_inventario_fifo (
    id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
    cantidad_inicial, cantidad_disponible, costo_unitario,
    origen_tipo, origen_id, recibido_en, registrado_por
  )
  VALUES (
    v_empresa, v_sucursal, v_id_bodega, v_id_ubicacion, p_id_producto,
    p_cantidad, p_cantidad, p_costo_unitario,
    'INVENTARIO_INICIAL', trim(p_idempotencia_key), v_ahora, v_usuario
  )
  RETURNING id_capa INTO v_id_capa;

  INSERT INTO public.movimientos_inventario (
    id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
    tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
    registrado_en, registrado_por, origen_tipo, origen_id
  )
  VALUES (
    v_empresa, v_sucursal, v_id_bodega, v_id_ubicacion, p_id_producto,
    'INVENTARIO_INICIAL', p_cantidad, v_total, trim(p_motivo), v_fecha,
    v_ahora, v_usuario, 'CAPA_FIFO', v_id_capa::text
  )
  RETURNING id_movimiento INTO v_id_movimiento;

  INSERT INTO public.comprobantes_contables (
    id_empresa, id_sucursal, id_periodo, tipo, fecha, descripcion,
    origen_tipo, origen_id, idempotencia_key, creado_por
  )
  VALUES (
    v_empresa, v_sucursal, v_periodo, 'APERTURA', v_fecha,
    'Inventario inicial: ' || trim(p_motivo),
    'INVENTARIO_INICIAL', v_id_movimiento::text,
    'INVENTARIO_INICIAL:' || trim(p_idempotencia_key), v_usuario
  )
  RETURNING id_comprobante INTO v_id_comprobante;

  INSERT INTO public.lineas_comprobante_contable (
    id_empresa, id_comprobante, id_cuenta, numero_linea, descripcion, debe, haber
  )
  VALUES
    (v_empresa, v_id_comprobante, v_id_cuenta_inventario, 1, 'Inventario inicial', v_total, 0),
    (v_empresa, v_id_comprobante, v_id_capital, 2, 'Contrapartida de apertura', 0, v_total);

  UPDATE public.comprobantes_contables
  SET estado = 'CONTABILIZADO',
      contabilizado_por = v_usuario,
      contabilizado_en = v_ahora
  WHERE id_empresa = v_empresa
    AND id_comprobante = v_id_comprobante;

  RETURN v_id_capa;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_inventario_inicial(
  bigint, numeric, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_inventario_inicial(
  bigint, numeric, numeric, text, text
) TO authenticated;
