-- Fase 13: RPC transaccionales para compras, inventario, devoluciones y cierres.
-- Los documentos se registran con fecha del servidor y dentro de un período abierto.

BEGIN;

ALTER TABLE public.capas_inventario_fifo
  DROP CONSTRAINT capas_inventario_fifo_origen_tipo_check,
  ADD CONSTRAINT capas_inventario_fifo_origen_tipo_check
    CHECK (origen_tipo IN ('INVENTARIO_INICIAL', 'COMPRA', 'TRANSFERENCIA', 'DEVOLUCION', 'AJUSTE'));

ALTER TABLE public.movimientos_inventario
  DROP CONSTRAINT movimientos_inventario_tipo_check,
  ADD CONSTRAINT movimientos_inventario_tipo_check
    CHECK (tipo IN (
      'INVENTARIO_INICIAL', 'VENTA', 'COMPRA', 'DEVOLUCION',
      'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA',
      'AJUSTE_ENTRADA', 'AJUSTE_SALIDA'
    ));

ALTER TABLE public.detalles_ajuste_inventario
  DROP CONSTRAINT detalles_ajuste_inventario_check;
ALTER TABLE public.detalles_ajuste_inventario
  ADD CONSTRAINT detalles_ajuste_inventario_empresa_id_key
    UNIQUE (id_empresa, id_detalle_ajuste);

ALTER TABLE public.ordenes_compra
  ADD COLUMN clave_idempotencia text,
  ADD COLUMN huella_solicitud text,
  ADD COLUMN actualizada_por uuid REFERENCES auth.users (id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX ordenes_compra_idempotencia_key
  ON public.ordenes_compra (id_empresa, clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

ALTER TABLE public.recepciones_compra
  ADD COLUMN clave_idempotencia text,
  ADD COLUMN huella_solicitud text;
CREATE UNIQUE INDEX recepciones_compra_idempotencia_key
  ON public.recepciones_compra (id_empresa, clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

ALTER TABLE public.devoluciones_venta
  ADD COLUMN huella_solicitud text;
ALTER TABLE public.transferencias_inventario
  ADD COLUMN clave_idempotencia text,
  ADD COLUMN huella_solicitud text;
CREATE UNIQUE INDEX transferencias_inventario_idempotencia_key
  ON public.transferencias_inventario (id_empresa, clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

ALTER TABLE public.ajustes_inventario
  ADD COLUMN huella_solicitud text;

CREATE OR REPLACE FUNCTION public._registrar_asiento_operativo(
  p_id_empresa integer,
  p_id_sucursal integer,
  p_fecha date,
  p_tipo text,
  p_descripcion text,
  p_origen_tipo text,
  p_origen_id text,
  p_lineas jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_periodo bigint;
  v_comprobante bigint;
  v_linea jsonb;
  v_numero integer := 0;
  v_debe numeric(14,2) := 0;
  v_haber numeric(14,2) := 0;
  v_id_cuenta bigint;
  v_monto_debe numeric(14,2);
  v_monto_haber numeric(14,2);
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para registrar el asiento.';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) < 2 THEN
    RAISE EXCEPTION 'El asiento debe incluir al menos dos líneas.';
  END IF;

  SELECT pc.id_periodo INTO v_periodo
  FROM public.periodos_contables AS pc
  WHERE pc.id_empresa = p_id_empresa
    AND p_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin
    AND pc.estado = 'ABIERTO'
  FOR SHARE;
  IF v_periodo IS NULL THEN
    RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.';
  END IF;

  INSERT INTO public.comprobantes_contables (
    id_empresa, id_sucursal, id_periodo, tipo, fecha, descripcion,
    estado, origen_tipo, origen_id, creado_por
  )
  VALUES (
    p_id_empresa, p_id_sucursal, v_periodo, p_tipo, p_fecha,
    trim(p_descripcion), 'BORRADOR', p_origen_tipo, p_origen_id, v_usuario
  )
  RETURNING id_comprobante INTO v_comprobante;

  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    v_numero := v_numero + 1;
    v_id_cuenta := (v_linea ->> 'id_cuenta')::bigint;
    v_monto_debe := COALESCE((v_linea ->> 'debe')::numeric, 0);
    v_monto_haber := COALESCE((v_linea ->> 'haber')::numeric, 0);
    IF v_monto_debe < 0 OR v_monto_haber < 0
       OR v_monto_debe <> round(v_monto_debe, 2)
       OR v_monto_haber <> round(v_monto_haber, 2)
       OR NOT ((v_monto_debe > 0 AND v_monto_haber = 0)
         OR (v_monto_haber > 0 AND v_monto_debe = 0)) THEN
      RAISE EXCEPTION 'Las líneas del asiento deben tener un importe positivo en Debe o Haber.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.cuentas_contables AS c
      WHERE c.id_empresa = p_id_empresa AND c.id_cuenta = v_id_cuenta
        AND c.activa AND NOT c.es_grupo AND c.permite_movimientos
    ) THEN
      RAISE EXCEPTION 'Una cuenta contable no existe, está inactiva o no permite movimientos.';
    END IF;
    INSERT INTO public.lineas_comprobante_contable (
      id_empresa, id_comprobante, id_cuenta, numero_linea,
      descripcion, debe, haber
    )
    VALUES (
      p_id_empresa, v_comprobante, v_id_cuenta, v_numero,
      NULLIF(trim(v_linea ->> 'descripcion'), ''),
      v_monto_debe, v_monto_haber
    );
    v_debe := v_debe + v_monto_debe;
    v_haber := v_haber + v_monto_haber;
  END LOOP;

  IF v_debe <= 0 OR v_debe <> v_haber THEN
    RAISE EXCEPTION 'El asiento no cuadra: Debe y Haber deben ser iguales y mayores que cero.';
  END IF;
  UPDATE public.comprobantes_contables
  SET estado = 'CONTABILIZADO',
      contabilizado_por = v_usuario,
      contabilizado_en = clock_timestamp()
  WHERE id_empresa = p_id_empresa AND id_comprobante = v_comprobante;
  RETURN v_comprobante;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_orden_compra(
  p_id_sucursal integer,
  p_id_proveedor bigint,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_observaciones text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_id_orden bigint;
  v_existente bigint;
  v_huella text;
  v_hash_existente text;
  v_clave text := trim(COALESCE(p_clave_idempotencia, ''));
  v_linea record;
  v_numero integer := 0;
  v_lineas jsonb;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF char_length(v_clave) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'La clave de idempotencia debe tener entre 1 y 128 caracteres.';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'La orden debe incluir entre 1 y 100 productos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR jsonb_typeof(e.value -> 'id_producto') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad_solicitada') <> 'number'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_lineas) x(id_producto bigint, cantidad_solicitada numeric)
    WHERE x.id_producto IS NULL OR x.cantidad_solicitada IS NULL
       OR x.cantidad_solicitada <= 0 OR x.cantidad_solicitada <> round(x.cantidad_solicitada, 3)
  ) THEN
    RAISE EXCEPTION 'Cada línea requiere un producto y una cantidad positiva de hasta tres decimales.';
  END IF;
  IF EXISTS (
    SELECT id_producto FROM jsonb_to_recordset(p_lineas)
      x(id_producto bigint, cantidad_solicitada numeric)
    GROUP BY id_producto HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas productos en la orden de compra.'; END IF;

  SELECT s.id_empresa INTO v_empresa
  FROM public.sucursales s
  WHERE s.id_sucursal = p_id_sucursal AND s.activa;
  IF v_empresa IS NULL
     OR NOT (SELECT public.puede_operar_caja(v_empresa, p_id_sucursal, true)) THEN
    RAISE EXCEPTION 'No tienes permiso para crear órdenes en esta sucursal.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('OC:' || v_empresa::text || ':' || v_clave, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id_empresa = v_empresa AND p.id_proveedor = p_id_proveedor AND p.activo
  ) THEN RAISE EXCEPTION 'El proveedor no existe, está inactivo o pertenece a otra empresa.'; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id_producto', x.id_producto, 'cantidad_solicitada', x.cantidad_solicitada
  ) ORDER BY x.id_producto) INTO v_lineas
  FROM jsonb_to_recordset(p_lineas) x(id_producto bigint, cantidad_solicitada numeric);
  v_huella := md5(v_empresa::text || '|' || p_id_sucursal::text || '|' ||
    p_id_proveedor::text || '|' || v_lineas::text || '|' ||
    COALESCE(trim(p_observaciones), ''));
  SELECT o.id_orden_compra, o.huella_solicitud INTO v_existente, v_hash_existente
  FROM public.ordenes_compra o
  WHERE o.id_empresa = v_empresa AND o.clave_idempotencia = v_clave;
  IF v_existente IS NOT NULL THEN
    IF v_hash_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia de la orden ya se usó con datos distintos.';
    END IF;
    RETURN v_existente;
  END IF;

  INSERT INTO public.ordenes_compra (
    id_empresa, id_sucursal, id_proveedor, observaciones,
    creada_por, clave_idempotencia, huella_solicitud
  )
  VALUES (v_empresa, p_id_sucursal, p_id_proveedor, NULLIF(trim(p_observaciones), ''),
    v_usuario, v_clave, v_huella)
  RETURNING id_orden_compra INTO v_id_orden;
  FOR v_linea IN
    SELECT x.id_producto, x.cantidad_solicitada
    FROM jsonb_to_recordset(v_lineas) x(id_producto bigint, cantidad_solicitada numeric)
    ORDER BY x.id_producto
  LOOP
    v_numero := v_numero + 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.productos p
      WHERE p.id_empresa = v_empresa AND p.id_producto = v_linea.id_producto AND p.activo
    ) THEN RAISE EXCEPTION 'Uno de los productos no existe o está inactivo.'; END IF;
    INSERT INTO public.detalles_orden_compra (
      id_empresa, id_orden_compra, id_producto, numero_linea, cantidad_solicitada
    )
    VALUES (v_empresa, v_id_orden, v_linea.id_producto, v_numero, v_linea.cantidad_solicitada);
  END LOOP;
  RETURN v_id_orden;
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_orden_compra(
  p_id_orden_compra bigint,
  p_nuevo_estado text,
  p_observaciones text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_sucursal integer;
  v_estado text;
BEGIN
  SELECT o.id_empresa, o.id_sucursal, o.estado
  INTO v_empresa, v_sucursal, v_estado
  FROM public.ordenes_compra o
  WHERE o.id_orden_compra = p_id_orden_compra
  FOR UPDATE;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'La orden de compra no existe.'; END IF;
  IF v_usuario IS NULL
     OR NOT (SELECT public.puede_operar_caja(v_empresa, v_sucursal, true)) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar esta orden de compra.';
  END IF;
  IF NOT (
    (v_estado = 'BORRADOR' AND p_nuevo_estado IN ('ENVIADA', 'CANCELADA'))
    OR (v_estado IN ('ENVIADA', 'PARCIAL') AND p_nuevo_estado = 'CANCELADA')
  ) THEN RAISE EXCEPTION 'Transición de estado de orden no permitida.'; END IF;
  IF p_nuevo_estado = 'ENVIADA' AND NOT EXISTS (
    SELECT 1 FROM public.detalles_orden_compra d
    WHERE d.id_empresa = v_empresa AND d.id_orden_compra = p_id_orden_compra
  ) THEN RAISE EXCEPTION 'No se puede enviar una orden sin productos.'; END IF;
  UPDATE public.ordenes_compra
  SET estado = p_nuevo_estado,
      observaciones = COALESCE(NULLIF(trim(p_observaciones), ''), observaciones),
      actualizada_en = clock_timestamp(),
      actualizada_por = v_usuario
  WHERE id_orden_compra = p_id_orden_compra AND id_empresa = v_empresa;
END;
$$;

CREATE OR REPLACE FUNCTION public.recibir_orden_compra(
  p_id_orden_compra bigint,
  p_id_ubicacion bigint,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_documento_proveedor text DEFAULT NULL,
  p_observaciones text DEFAULT NULL
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
  v_proveedor bigint;
  v_estado text;
  v_bodega bigint;
  v_zona text;
  v_fecha date;
  v_ahora timestamptz := clock_timestamp();
  v_id_recepcion bigint;
  v_existente bigint;
  v_huella text;
  v_hash_existente text;
  v_clave text := trim(COALESCE(p_clave_idempotencia, ''));
  v_lineas jsonb;
  v_linea record;
  v_orden record;
  v_id_comprobante bigint;
  v_id_cuenta_inventario bigint;
  v_id_cuenta_proveedor bigint;
  v_subtotal numeric(14,2) := 0;
  v_numero integer := 0;
  v_restante numeric(14,3);
  v_estado_final text;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF char_length(v_clave) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'La clave de idempotencia debe tener entre 1 y 128 caracteres.';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'La recepción debe incluir entre 1 y 100 líneas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR jsonb_typeof(e.value -> 'id_detalle_orden') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad_aceptada') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad_rechazada') <> 'number'
       OR jsonb_typeof(e.value -> 'costo_unitario') <> 'number'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_lineas) x(
      id_detalle_orden bigint, cantidad_aceptada numeric,
      cantidad_rechazada numeric, costo_unitario numeric
    )
    WHERE x.id_detalle_orden IS NULL OR x.cantidad_aceptada IS NULL
       OR x.cantidad_rechazada IS NULL OR x.costo_unitario IS NULL
       OR x.cantidad_aceptada < 0 OR x.cantidad_rechazada < 0
       OR x.cantidad_aceptada + x.cantidad_rechazada <= 0
       OR x.cantidad_aceptada <> round(x.cantidad_aceptada, 3)
       OR x.cantidad_rechazada <> round(x.cantidad_rechazada, 3)
       OR x.costo_unitario <= 0 OR x.costo_unitario <> round(x.costo_unitario, 4)
  ) THEN RAISE EXCEPTION 'Verifica cantidades aceptadas/rechazadas y costo unitario.'; END IF;
  IF EXISTS (
    SELECT id_detalle_orden FROM jsonb_to_recordset(p_lineas) x(
      id_detalle_orden bigint, cantidad_aceptada numeric,
      cantidad_rechazada numeric, costo_unitario numeric
    ) GROUP BY id_detalle_orden HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas líneas de la orden en la recepción.'; END IF;

  SELECT o.id_empresa, o.id_sucursal, o.id_proveedor, o.estado,
         e.zona_horaria
  INTO v_empresa, v_sucursal, v_proveedor, v_estado, v_zona
  FROM public.ordenes_compra o
  JOIN public.empresa e ON e.id_empresa = o.id_empresa AND e.activa
  WHERE o.id_orden_compra = p_id_orden_compra
  FOR UPDATE OF o;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'La orden no existe o la empresa está inactiva.'; END IF;
  IF NOT (SELECT public.puede_operar_caja(v_empresa, v_sucursal, true)) THEN
    RAISE EXCEPTION 'No tienes permiso para recibir compras en esta sucursal.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('RC:' || v_empresa::text || ':' || v_clave, 0)
  );
  SELECT r.id_recepcion, r.huella_solicitud
  INTO v_existente, v_hash_existente
  FROM public.recepciones_compra r
  WHERE r.id_empresa = v_empresa AND r.clave_idempotencia = v_clave;
  SELECT jsonb_agg(jsonb_build_object(
    'id_detalle_orden', x.id_detalle_orden,
    'cantidad_aceptada', x.cantidad_aceptada,
    'cantidad_rechazada', x.cantidad_rechazada,
    'costo_unitario', x.costo_unitario
  ) ORDER BY x.id_detalle_orden) INTO v_lineas
  FROM jsonb_to_recordset(p_lineas) x(
    id_detalle_orden bigint, cantidad_aceptada numeric,
    cantidad_rechazada numeric, costo_unitario numeric
  );
  v_huella := md5(p_id_orden_compra::text || '|' || p_id_ubicacion::text || '|' ||
    v_lineas::text || '|' || COALESCE(trim(p_documento_proveedor), '') || '|' ||
    COALESCE(trim(p_observaciones), ''));
  IF v_existente IS NOT NULL THEN
    IF v_hash_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia de recepción ya se usó con datos distintos.';
    END IF;
    RETURN v_existente;
  END IF;
  IF v_estado NOT IN ('ENVIADA', 'PARCIAL') THEN
    RAISE EXCEPTION 'Solo se pueden recibir órdenes enviadas o parcialmente recibidas.';
  END IF;
  SELECT u.id_bodega INTO v_bodega
  FROM public.ubicaciones_bodega u
  WHERE u.id_empresa = v_empresa AND u.id_sucursal = v_sucursal
    AND u.id_ubicacion = p_id_ubicacion AND u.activa;
  IF v_bodega IS NULL THEN RAISE EXCEPTION 'La ubicación de recepción no existe o está inactiva.'; END IF;
  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;
  PERFORM 1 FROM public.periodos_contables pc
  WHERE pc.id_empresa = v_empresa AND pc.estado = 'ABIERTO'
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.'; END IF;

  FOR v_linea IN
    SELECT x.id_detalle_orden, x.cantidad_aceptada, x.cantidad_rechazada,
           x.costo_unitario, d.id_producto, d.cantidad_solicitada,
           d.cantidad_aceptada_acumulada, d.cantidad_rechazada_acumulada
    FROM jsonb_to_recordset(v_lineas) x(
      id_detalle_orden bigint, cantidad_aceptada numeric,
      cantidad_rechazada numeric, costo_unitario numeric
    )
    JOIN public.detalles_orden_compra d
      ON d.id_empresa = v_empresa AND d.id_orden_compra = p_id_orden_compra
     AND d.id_detalle_orden = x.id_detalle_orden
    ORDER BY d.id_detalle_orden
    FOR UPDATE OF d
  LOOP
    v_restante := v_linea.cantidad_solicitada
      - v_linea.cantidad_aceptada_acumulada - v_linea.cantidad_rechazada_acumulada;
    IF v_restante <= 0
       OR v_linea.cantidad_aceptada + v_linea.cantidad_rechazada > v_restante THEN
      RAISE EXCEPTION 'La recepción excede la cantidad pendiente de una línea de compra.';
    END IF;
    v_subtotal := v_subtotal + round(v_linea.cantidad_aceptada * v_linea.costo_unitario, 2);
  END LOOP;
  IF (SELECT count(*) FROM jsonb_to_recordset(v_lineas) x(
      id_detalle_orden bigint, cantidad_aceptada numeric,
      cantidad_rechazada numeric, costo_unitario numeric
    )) <>
     (SELECT count(*) FROM public.detalles_orden_compra d
      JOIN jsonb_to_recordset(v_lineas) x(
        id_detalle_orden bigint, cantidad_aceptada numeric,
        cantidad_rechazada numeric, costo_unitario numeric
      ) ON x.id_detalle_orden = d.id_detalle_orden
      WHERE d.id_empresa = v_empresa AND d.id_orden_compra = p_id_orden_compra) THEN
    RAISE EXCEPTION 'Una o más líneas no pertenecen a la orden de compra.';
  END IF;
  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'La recepción debe contener al menos una unidad aceptada con valor contable.';
  END IF;

  v_id_recepcion := nextval(
    pg_get_serial_sequence('public.recepciones_compra', 'id_recepcion')::regclass
  );
  SELECT c.id_cuenta INTO v_id_cuenta_inventario
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_empresa AND c.codigo = '1.1.06'
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  SELECT c.id_cuenta INTO v_id_cuenta_proveedor
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_empresa AND c.codigo = '2.1.01'
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  IF v_id_cuenta_inventario IS NULL OR v_id_cuenta_proveedor IS NULL THEN
    RAISE EXCEPTION 'Falta configurar inventario o proveedores por pagar.';
  END IF;
  v_id_comprobante := public._registrar_asiento_operativo(
    v_empresa, v_sucursal, v_fecha, 'COMPRA', 'Recepción de compra RC-' || v_id_recepcion::text,
    'RECEPCION_COMPRA', v_id_recepcion::text,
    jsonb_build_array(
      jsonb_build_object('id_cuenta', v_id_cuenta_inventario, 'debe', v_subtotal, 'haber', 0,
        'descripcion', 'Inventario recibido'),
      jsonb_build_object('id_cuenta', v_id_cuenta_proveedor, 'debe', 0, 'haber', v_subtotal,
        'descripcion', 'Cuenta por pagar al proveedor')
    )
  );
  INSERT INTO public.recepciones_compra (
    id_recepcion, id_empresa, id_sucursal, id_orden_compra, id_ubicacion,
    documento_proveedor, subtotal, observaciones, id_comprobante,
    recibida_por, recibida_en, fecha_operativa, clave_idempotencia, huella_solicitud
  )
  VALUES (
    v_id_recepcion, v_empresa, v_sucursal, p_id_orden_compra, p_id_ubicacion,
    NULLIF(trim(p_documento_proveedor), ''), v_subtotal,
    NULLIF(trim(p_observaciones), ''), v_id_comprobante,
    v_usuario, v_ahora, v_fecha, v_clave, v_huella
  );

  FOR v_linea IN
    SELECT x.id_detalle_orden, x.cantidad_aceptada, x.cantidad_rechazada,
           x.costo_unitario, d.id_producto
    FROM jsonb_to_recordset(v_lineas) x(
      id_detalle_orden bigint, cantidad_aceptada numeric,
      cantidad_rechazada numeric, costo_unitario numeric
    )
    JOIN public.detalles_orden_compra d
      ON d.id_empresa = v_empresa AND d.id_orden_compra = p_id_orden_compra
     AND d.id_detalle_orden = x.id_detalle_orden
    ORDER BY d.id_detalle_orden
  LOOP
    v_numero := v_numero + 1;
    INSERT INTO public.detalles_recepcion_compra (
      id_empresa, id_recepcion, id_detalle_orden, id_producto,
      cantidad_aceptada, cantidad_rechazada, costo_unitario, subtotal_aceptado
    )
    VALUES (
      v_empresa, v_id_recepcion, v_linea.id_detalle_orden, v_linea.id_producto,
      v_linea.cantidad_aceptada, v_linea.cantidad_rechazada, v_linea.costo_unitario,
      round(v_linea.cantidad_aceptada * v_linea.costo_unitario, 2)
    );
    UPDATE public.detalles_orden_compra
    SET cantidad_aceptada_acumulada = cantidad_aceptada_acumulada + v_linea.cantidad_aceptada,
        cantidad_rechazada_acumulada = cantidad_rechazada_acumulada + v_linea.cantidad_rechazada
    WHERE id_empresa = v_empresa AND id_detalle_orden = v_linea.id_detalle_orden;
    IF v_linea.cantidad_aceptada > 0 THEN
      INSERT INTO public.capas_inventario_fifo (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        cantidad_inicial, cantidad_disponible, costo_unitario,
        origen_tipo, origen_id, recibido_en, registrado_por
      )
      VALUES (
        v_empresa, v_sucursal, v_bodega, p_id_ubicacion, v_linea.id_producto,
        v_linea.cantidad_aceptada, v_linea.cantidad_aceptada, v_linea.costo_unitario,
        'COMPRA', v_id_recepcion::text, v_ahora, v_usuario
      );
      INSERT INTO public.movimientos_inventario (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
        registrado_en, registrado_por, origen_tipo, origen_id
      )
      VALUES (
        v_empresa, v_sucursal, v_bodega, p_id_ubicacion, v_linea.id_producto,
        'COMPRA', v_linea.cantidad_aceptada,
        round(v_linea.cantidad_aceptada * v_linea.costo_unitario, 2),
        'Entrada por recepción RC-' || v_id_recepcion::text, v_fecha,
        v_ahora, v_usuario, 'RECEPCION_COMPRA', v_id_recepcion::text
      );
    END IF;
  END LOOP;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.detalles_orden_compra d
    WHERE d.id_empresa = v_empresa AND d.id_orden_compra = p_id_orden_compra
      AND d.cantidad_aceptada_acumulada + d.cantidad_rechazada_acumulada
        < d.cantidad_solicitada
  ) THEN 'PARCIAL' ELSE 'RECIBIDA' END INTO v_estado_final;
  UPDATE public.ordenes_compra
  SET estado = v_estado_final, actualizada_en = v_ahora, actualizada_por = v_usuario
  WHERE id_empresa = v_empresa AND id_orden_compra = p_id_orden_compra;
  RETURN v_id_recepcion;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferir_inventario(
  p_id_ubicacion_origen bigint,
  p_id_ubicacion_destino bigint,
  p_lineas jsonb,
  p_motivo text,
  p_clave_idempotencia text
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
  v_bodega_origen bigint;
  v_bodega_destino bigint;
  v_zona text;
  v_fecha date;
  v_ahora timestamptz := clock_timestamp();
  v_id_transferencia bigint;
  v_existente bigint;
  v_hash_existente text;
  v_clave text := trim(COALESCE(p_clave_idempotencia, ''));
  v_huella text;
  v_lineas jsonb;
  v_linea record;
  v_capa record;
  v_id_detalle bigint;
  v_producto record;
  v_pendiente numeric(14,3);
  v_consumo numeric(14,3);
  v_costo numeric(14,2);
  v_costo_linea numeric(14,2);
  v_costos jsonb := '{}'::jsonb;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF char_length(v_clave) NOT BETWEEN 1 AND 128
     OR char_length(COALESCE(trim(p_motivo), '')) < 3 THEN
    RAISE EXCEPTION 'La transferencia requiere clave idempotente y un motivo de al menos tres caracteres.';
  END IF;
  IF p_id_ubicacion_origen = p_id_ubicacion_destino THEN
    RAISE EXCEPTION 'La ubicación de origen y destino deben ser distintas.';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'La transferencia debe incluir entre 1 y 100 productos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR jsonb_typeof(e.value -> 'id_producto') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad') <> 'number'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_lineas) x(id_producto bigint, cantidad numeric)
    WHERE x.id_producto IS NULL OR x.cantidad IS NULL OR x.cantidad <= 0
       OR x.cantidad <> round(x.cantidad, 3)
  ) THEN RAISE EXCEPTION 'Cada línea requiere producto y cantidad positiva de hasta tres decimales.'; END IF;
  IF EXISTS (
    SELECT id_producto FROM jsonb_to_recordset(p_lineas) x(id_producto bigint, cantidad numeric)
    GROUP BY id_producto HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas productos en la transferencia.'; END IF;

  SELECT o.id_empresa, o.id_sucursal, o.id_bodega, e.zona_horaria
  INTO v_empresa, v_sucursal, v_bodega_origen, v_zona
  FROM public.ubicaciones_bodega o
  JOIN public.empresa e ON e.id_empresa = o.id_empresa AND e.activa
  WHERE o.id_ubicacion = p_id_ubicacion_origen AND o.activa;
  IF v_empresa IS NULL
     OR NOT (SELECT public.puede_operar_caja(v_empresa, v_sucursal, true)) THEN
    RAISE EXCEPTION 'No tienes permiso para transferir inventario en esta ubicación.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('TR:' || v_empresa::text || ':' || v_clave, 0)
  );
  SELECT d.id_bodega INTO v_bodega_destino
  FROM public.ubicaciones_bodega d
  WHERE d.id_empresa = v_empresa AND d.id_sucursal = v_sucursal
    AND d.id_ubicacion = p_id_ubicacion_destino AND d.activa;
  IF v_bodega_destino IS NULL THEN
    RAISE EXCEPTION 'El destino debe ser una ubicación activa de la misma sucursal.';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id_producto', x.id_producto, 'cantidad', x.cantidad)
    ORDER BY x.id_producto) INTO v_lineas
  FROM jsonb_to_recordset(p_lineas) x(id_producto bigint, cantidad numeric);
  v_huella := md5(v_empresa::text || '|' || v_sucursal::text || '|' ||
    p_id_ubicacion_origen::text || '|' || p_id_ubicacion_destino::text || '|' ||
    v_lineas::text || '|' || trim(p_motivo));
  SELECT t.id_transferencia, t.huella_solicitud
  INTO v_existente, v_hash_existente
  FROM public.transferencias_inventario t
  WHERE t.id_empresa = v_empresa AND t.clave_idempotencia = v_clave;
  IF v_existente IS NOT NULL THEN
    IF v_hash_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se usó para otra transferencia.';
    END IF;
    RETURN v_existente;
  END IF;
  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;
  PERFORM 1 FROM public.periodos_contables pc
  WHERE pc.id_empresa = v_empresa AND pc.estado = 'ABIERTO'
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_lineas) x(id_producto bigint, cantidad numeric)
    LEFT JOIN public.productos p ON p.id_empresa = v_empresa AND p.id_producto = x.id_producto
    WHERE p.id_producto IS NULL OR NOT p.activo
  ) THEN RAISE EXCEPTION 'Uno o más productos no existen o están inactivos.'; END IF;
  PERFORM p.id_producto
  FROM public.productos p
  JOIN jsonb_to_recordset(v_lineas) x(id_producto bigint, cantidad numeric)
    ON x.id_producto = p.id_producto
  WHERE p.id_empresa = v_empresa
  ORDER BY p.id_producto FOR UPDATE OF p;
  FOR v_linea IN
    SELECT x.id_producto, x.cantidad FROM jsonb_to_recordset(v_lineas)
      x(id_producto bigint, cantidad numeric) ORDER BY x.id_producto
  LOOP
    v_pendiente := v_linea.cantidad;
    v_costo_linea := 0;
    FOR v_capa IN
      SELECT f.id_capa, f.cantidad_disponible, f.costo_unitario
      FROM public.capas_inventario_fifo f
      WHERE f.id_empresa = v_empresa AND f.id_sucursal = v_sucursal
        AND f.id_ubicacion = p_id_ubicacion_origen
        AND f.id_producto = v_linea.id_producto AND f.cantidad_disponible > 0
      ORDER BY f.recibido_en, f.id_capa
      FOR UPDATE OF f
    LOOP
      EXIT WHEN v_pendiente = 0;
      v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
      v_costo_linea := v_costo_linea + round(v_consumo * v_capa.costo_unitario, 2);
      v_pendiente := v_pendiente - v_consumo;
    END LOOP;
    IF v_pendiente <> 0 THEN
      RAISE EXCEPTION 'Existencias insuficientes para el producto %.', v_linea.id_producto;
    END IF;
    v_costos := v_costos || jsonb_build_object(v_linea.id_producto::text, v_costo_linea);
  END LOOP;

  INSERT INTO public.transferencias_inventario (
    id_empresa, id_sucursal, id_ubicacion_origen, id_ubicacion_destino,
    motivo, transferida_por, transferida_en, fecha_operativa,
    clave_idempotencia, huella_solicitud
  )
  VALUES (
    v_empresa, v_sucursal, p_id_ubicacion_origen, p_id_ubicacion_destino,
    trim(p_motivo), v_usuario, v_ahora, v_fecha, v_clave, v_huella
  )
  RETURNING id_transferencia INTO v_id_transferencia;

  FOR v_linea IN
    SELECT x.id_producto, x.cantidad FROM jsonb_to_recordset(v_lineas)
      x(id_producto bigint, cantidad numeric) ORDER BY x.id_producto
  LOOP
    INSERT INTO public.detalles_transferencia_inventario (
      id_empresa, id_transferencia, id_producto, cantidad, costo_total
    )
    VALUES (
      v_empresa, v_id_transferencia, v_linea.id_producto, v_linea.cantidad,
      (v_costos ->> v_linea.id_producto::text)::numeric(14,2)
    )
    RETURNING id_detalle_transferencia INTO v_id_detalle;
    v_pendiente := v_linea.cantidad;
    v_costo_linea := 0;
    FOR v_capa IN
      SELECT f.id_capa, f.cantidad_disponible, f.costo_unitario, f.recibido_en
      FROM public.capas_inventario_fifo f
      WHERE f.id_empresa = v_empresa AND f.id_sucursal = v_sucursal
        AND f.id_ubicacion = p_id_ubicacion_origen
        AND f.id_producto = v_linea.id_producto AND f.cantidad_disponible > 0
      ORDER BY f.recibido_en, f.id_capa
      FOR UPDATE OF f
    LOOP
      EXIT WHEN v_pendiente = 0;
      v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
      v_costo := round(v_consumo * v_capa.costo_unitario, 2);
      UPDATE public.capas_inventario_fifo
      SET cantidad_disponible = cantidad_disponible - v_consumo
      WHERE id_empresa = v_empresa AND id_capa = v_capa.id_capa;
      INSERT INTO public.capas_inventario_fifo (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        cantidad_inicial, cantidad_disponible, costo_unitario, origen_tipo,
        origen_id, recibido_en, registrado_por
      )
      VALUES (
        v_empresa, v_sucursal, v_bodega_destino, p_id_ubicacion_destino,
        v_linea.id_producto, v_consumo, v_consumo, v_capa.costo_unitario,
        'TRANSFERENCIA', v_id_transferencia::text, v_capa.recibido_en, v_usuario
      )
      RETURNING id_capa INTO v_existente;
      INSERT INTO public.capas_transferencia_inventario (
        id_empresa, id_detalle_transferencia, id_capa_origen,
        id_capa_destino, cantidad, costo_unitario
      )
      VALUES (
        v_empresa, v_id_detalle, v_capa.id_capa, v_existente, v_consumo,
        v_capa.costo_unitario
      );
      v_pendiente := v_pendiente - v_consumo;
      v_costo_linea := v_costo_linea + v_costo;
    END LOOP;
    IF v_pendiente <> 0 THEN RAISE EXCEPTION 'No fue posible asignar todas las capas FIFO.'; END IF;
    INSERT INTO public.movimientos_inventario (
      id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
      tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
      registrado_en, registrado_por, origen_tipo, origen_id
    )
    VALUES
      (v_empresa, v_sucursal, v_bodega_origen, p_id_ubicacion_origen,
       v_linea.id_producto, 'TRANSFERENCIA_SALIDA', -v_linea.cantidad,
       v_costo_linea, 'Salida por transferencia TR-' || v_id_transferencia::text,
       v_fecha, v_ahora, v_usuario, 'TRANSFERENCIA', v_id_transferencia::text),
      (v_empresa, v_sucursal, v_bodega_destino, p_id_ubicacion_destino,
       v_linea.id_producto, 'TRANSFERENCIA_ENTRADA', v_linea.cantidad,
       v_costo_linea, 'Entrada por transferencia TR-' || v_id_transferencia::text,
       v_fecha, v_ahora, v_usuario, 'TRANSFERENCIA', v_id_transferencia::text);
  END LOOP;
  RETURN v_id_transferencia;
END;
$$;

CREATE TABLE public.consumos_fifo_ajuste (
  id_consumo_ajuste bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_detalle_ajuste bigint NOT NULL,
  id_capa bigint NOT NULL,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(14,4) NOT NULL CHECK (costo_unitario > 0),
  costo_total numeric(14,2) NOT NULL CHECK (costo_total >= 0),
  FOREIGN KEY (id_empresa, id_detalle_ajuste)
    REFERENCES public.detalles_ajuste_inventario (id_empresa, id_detalle_ajuste),
  FOREIGN KEY (id_empresa, id_capa)
    REFERENCES public.capas_inventario_fifo (id_empresa, id_capa)
);
ALTER TABLE public.consumos_fifo_ajuste ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consumos_fifo_ajuste FROM anon, authenticated;
GRANT SELECT ON TABLE public.consumos_fifo_ajuste TO authenticated;
CREATE POLICY consumos_fifo_ajuste_select_empresa
ON public.consumos_fifo_ajuste FOR SELECT TO authenticated
USING ((SELECT public.puede_ver_empresa(id_empresa)));
CREATE TRIGGER consumos_fifo_ajuste_inmutables
BEFORE UPDATE OR DELETE ON public.consumos_fifo_ajuste
FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_operativo_inmutable();

CREATE OR REPLACE FUNCTION public.registrar_ajuste_inventario(
  p_id_sucursal integer,
  p_id_ubicacion bigint,
  p_lineas jsonb,
  p_motivo text,
  p_clave_idempotencia text,
  p_id_cuenta_contrapartida bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_bodega bigint;
  v_zona text;
  v_fecha date;
  v_ahora timestamptz := clock_timestamp();
  v_id_ajuste bigint;
  v_existente bigint;
  v_huella text;
  v_hash_existente text;
  v_clave text := trim(COALESCE(p_clave_idempotencia, ''));
  v_lineas jsonb;
  v_linea record;
  v_capa record;
  v_id_detalle bigint;
  v_id_comprobante bigint;
  v_id_cuenta_inventario bigint;
  v_pendiente numeric(14,3);
  v_consumo numeric(14,3);
  v_costo numeric(14,2);
  v_total numeric(14,2);
  v_unitario numeric(14,4);
  v_positivos numeric(14,2) := 0;
  v_negativos numeric(14,2) := 0;
  v_asiento jsonb;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF char_length(v_clave) NOT BETWEEN 1 AND 128
     OR char_length(COALESCE(trim(p_motivo), '')) < 3 THEN
    RAISE EXCEPTION 'El ajuste requiere clave idempotente y un motivo de al menos tres caracteres.';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'El ajuste debe incluir entre 1 y 100 productos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR jsonb_typeof(e.value -> 'id_producto') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad_delta') <> 'number'
       OR jsonb_typeof(e.value -> 'costo_unitario') <> 'number'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_lineas) x(
      id_producto bigint, cantidad_delta numeric, costo_unitario numeric
    )
    WHERE x.id_producto IS NULL OR x.cantidad_delta IS NULL OR x.costo_unitario IS NULL
       OR x.cantidad_delta = 0 OR x.cantidad_delta <> round(x.cantidad_delta, 3)
       OR x.costo_unitario <= 0 OR x.costo_unitario <> round(x.costo_unitario, 4)
  ) THEN RAISE EXCEPTION 'Cada ajuste requiere producto, cantidad distinta de cero y costo unitario válido.'; END IF;
  IF EXISTS (
    SELECT id_producto FROM jsonb_to_recordset(p_lineas) x(
      id_producto bigint, cantidad_delta numeric, costo_unitario numeric
    ) GROUP BY id_producto HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas productos en un ajuste.'; END IF;
  SELECT s.id_empresa, e.zona_horaria INTO v_empresa, v_zona
  FROM public.sucursales s
  JOIN public.empresa e ON e.id_empresa = s.id_empresa AND e.activa
  WHERE s.id_sucursal = p_id_sucursal AND s.activa;
  IF v_empresa IS NULL OR NOT (
    SELECT public.puede_operar_caja(v_empresa, p_id_sucursal, true)
  ) THEN RAISE EXCEPTION 'No tienes permiso para ajustar inventario en esta sucursal.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('AI:' || v_empresa::text || ':' || v_clave, 0)
  );
  SELECT u.id_bodega INTO v_bodega
  FROM public.ubicaciones_bodega u
  WHERE u.id_empresa = v_empresa AND u.id_sucursal = p_id_sucursal
    AND u.id_ubicacion = p_id_ubicacion AND u.activa;
  IF v_bodega IS NULL THEN RAISE EXCEPTION 'La ubicación no existe o está inactiva.'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'id_producto', x.id_producto, 'cantidad_delta', x.cantidad_delta,
    'costo_unitario', x.costo_unitario
  ) ORDER BY x.id_producto) INTO v_lineas
  FROM jsonb_to_recordset(p_lineas) x(
    id_producto bigint, cantidad_delta numeric, costo_unitario numeric
  );
  v_huella := md5(v_empresa::text || '|' || p_id_sucursal::text || '|' ||
    p_id_ubicacion::text || '|' || v_lineas::text || '|' ||
    trim(p_motivo) || '|' || p_id_cuenta_contrapartida::text);
  SELECT a.id_ajuste, a.huella_solicitud
  INTO v_existente, v_hash_existente
  FROM public.ajustes_inventario a
  WHERE a.id_empresa = v_empresa AND a.clave_idempotencia = v_clave;
  IF v_existente IS NOT NULL THEN
    IF v_hash_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se usó para otro ajuste.';
    END IF;
    RETURN v_existente;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cuentas_contables c
    WHERE c.id_empresa = v_empresa AND c.id_cuenta = p_id_cuenta_contrapartida
      AND c.activa AND NOT c.es_grupo AND c.permite_movimientos
  ) THEN RAISE EXCEPTION 'La cuenta de contrapartida no está activa o no permite movimientos.'; END IF;
  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;
  PERFORM 1 FROM public.periodos_contables pc
  WHERE pc.id_empresa = v_empresa AND pc.estado = 'ABIERTO'
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.'; END IF;
  SELECT c.id_cuenta INTO v_id_cuenta_inventario
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_empresa AND c.codigo = '1.1.06'
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  IF v_id_cuenta_inventario IS NULL THEN RAISE EXCEPTION 'La cuenta de inventario no está configurada.'; END IF;
  IF p_id_cuenta_contrapartida = v_id_cuenta_inventario THEN
    RAISE EXCEPTION 'La contrapartida no puede ser la misma cuenta de inventario.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_lineas) x(
      id_producto bigint, cantidad_delta numeric, costo_unitario numeric
    )
    LEFT JOIN public.productos p ON p.id_empresa = v_empresa AND p.id_producto = x.id_producto
    WHERE p.id_producto IS NULL OR NOT p.activo
  ) THEN RAISE EXCEPTION 'Uno o más productos no existen o están inactivos.'; END IF;
  PERFORM p.id_producto
  FROM public.productos p
  JOIN jsonb_to_recordset(v_lineas) x(
    id_producto bigint, cantidad_delta numeric, costo_unitario numeric
  ) ON x.id_producto = p.id_producto
  WHERE p.id_empresa = v_empresa
  ORDER BY p.id_producto FOR UPDATE OF p;
  FOR v_linea IN
    SELECT x.id_producto, x.cantidad_delta, x.costo_unitario
    FROM jsonb_to_recordset(v_lineas) x(
      id_producto bigint, cantidad_delta numeric, costo_unitario numeric
    ) ORDER BY x.id_producto
  LOOP
    IF v_linea.cantidad_delta < 0 THEN
      SELECT COALESCE(sum(f.cantidad_disponible), 0) INTO v_pendiente
      FROM public.capas_inventario_fifo f
      WHERE f.id_empresa = v_empresa AND f.id_sucursal = p_id_sucursal
        AND f.id_ubicacion = p_id_ubicacion AND f.id_producto = v_linea.id_producto;
      IF v_pendiente < abs(v_linea.cantidad_delta) THEN
        RAISE EXCEPTION 'Existencias insuficientes para el ajuste negativo del producto %.',
          v_linea.id_producto;
      END IF;
      v_pendiente := abs(v_linea.cantidad_delta);
      v_total := 0;
      FOR v_capa IN
        SELECT f.id_capa, f.cantidad_disponible, f.costo_unitario
        FROM public.capas_inventario_fifo f
        WHERE f.id_empresa = v_empresa AND f.id_sucursal = p_id_sucursal
          AND f.id_ubicacion = p_id_ubicacion AND f.id_producto = v_linea.id_producto
          AND f.cantidad_disponible > 0
        ORDER BY f.recibido_en, f.id_capa
        FOR UPDATE OF f
      LOOP
        EXIT WHEN v_pendiente = 0;
        v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
        v_total := v_total + round(v_consumo * v_capa.costo_unitario, 2);
        v_pendiente := v_pendiente - v_consumo;
      END LOOP;
      IF v_pendiente <> 0 OR v_total <= 0 THEN
        RAISE EXCEPTION 'El ajuste FIFO no puede calcular un costo de salida válido.';
      END IF;
      v_negativos := v_negativos + v_total;
    ELSE
      v_total := round(v_linea.cantidad_delta * v_linea.costo_unitario, 2);
      IF v_total <= 0 THEN RAISE EXCEPTION 'El valor del ajuste de entrada debe ser al menos 0.01.'; END IF;
      v_positivos := v_positivos + v_total;
    END IF;
  END LOOP;

  v_id_ajuste := nextval(
    pg_get_serial_sequence('public.ajustes_inventario', 'id_ajuste')::regclass
  );
  v_asiento := '[]'::jsonb;
  IF v_positivos > 0 THEN
    v_asiento := v_asiento || jsonb_build_array(
      jsonb_build_object('id_cuenta', v_id_cuenta_inventario, 'debe', v_positivos,
        'haber', 0, 'descripcion', 'Ajustes positivos de inventario'),
      jsonb_build_object('id_cuenta', p_id_cuenta_contrapartida, 'debe', 0,
        'haber', v_positivos, 'descripcion', 'Contrapartida de ajustes positivos')
    );
  END IF;
  IF v_negativos > 0 THEN
    v_asiento := v_asiento || jsonb_build_array(
      jsonb_build_object('id_cuenta', p_id_cuenta_contrapartida, 'debe', v_negativos,
        'haber', 0, 'descripcion', 'Contrapartida de ajustes negativos'),
      jsonb_build_object('id_cuenta', v_id_cuenta_inventario, 'debe', 0,
        'haber', v_negativos, 'descripcion', 'Salida FIFO por ajuste')
    );
  END IF;
  v_id_comprobante := public._registrar_asiento_operativo(
    v_empresa, p_id_sucursal, v_fecha, 'AJUSTE',
    'Ajuste de inventario AI-' || v_id_ajuste::text,
    'AJUSTE_INVENTARIO', v_id_ajuste::text, v_asiento
  );
  INSERT INTO public.ajustes_inventario (
    id_ajuste, id_empresa, id_sucursal, id_ubicacion, motivo,
    id_comprobante, clave_idempotencia, huella_solicitud,
    registrado_por, registrado_en, fecha_operativa
  )
  VALUES (
    v_id_ajuste, v_empresa, p_id_sucursal, p_id_ubicacion, trim(p_motivo),
    v_id_comprobante, v_clave, v_huella, v_usuario, v_ahora, v_fecha
  );
  FOR v_linea IN
    SELECT x.id_producto, x.cantidad_delta, x.costo_unitario
    FROM jsonb_to_recordset(v_lineas) x(
      id_producto bigint, cantidad_delta numeric, costo_unitario numeric
    ) ORDER BY x.id_producto
  LOOP
    IF v_linea.cantidad_delta > 0 THEN
      v_total := round(v_linea.cantidad_delta * v_linea.costo_unitario, 2);
      v_unitario := v_linea.costo_unitario;
    ELSE
      v_pendiente := abs(v_linea.cantidad_delta);
      v_total := 0;
      v_unitario := 0;
      FOR v_capa IN
        SELECT f.id_capa, f.cantidad_disponible, f.costo_unitario
        FROM public.capas_inventario_fifo f
        WHERE f.id_empresa = v_empresa AND f.id_sucursal = p_id_sucursal
          AND f.id_ubicacion = p_id_ubicacion AND f.id_producto = v_linea.id_producto
          AND f.cantidad_disponible > 0
        ORDER BY f.recibido_en, f.id_capa
        FOR UPDATE OF f
      LOOP
        EXIT WHEN v_pendiente = 0;
        v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
        v_total := v_total + round(v_consumo * v_capa.costo_unitario, 2);
        v_unitario := v_unitario + v_capa.costo_unitario * v_consumo;
        v_pendiente := v_pendiente - v_consumo;
      END LOOP;
      IF v_pendiente <> 0 OR v_total <= 0 THEN
        RAISE EXCEPTION 'El ajuste FIFO cambió mientras se procesaba; no se registró el documento.';
      END IF;
      v_unitario := round(v_unitario / abs(v_linea.cantidad_delta), 4);
    END IF;
    INSERT INTO public.detalles_ajuste_inventario (
      id_empresa, id_ajuste, id_producto, cantidad_delta, costo_unitario, costo_total
    )
    VALUES (
      v_empresa, v_id_ajuste, v_linea.id_producto, v_linea.cantidad_delta,
      v_unitario, v_total
    )
    RETURNING id_detalle_ajuste INTO v_id_detalle;
    IF v_linea.cantidad_delta > 0 THEN
      INSERT INTO public.capas_inventario_fifo (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        cantidad_inicial, cantidad_disponible, costo_unitario,
        origen_tipo, origen_id, recibido_en, registrado_por
      )
      VALUES (
        v_empresa, p_id_sucursal, v_bodega, p_id_ubicacion, v_linea.id_producto,
        v_linea.cantidad_delta, v_linea.cantidad_delta, v_unitario,
        'AJUSTE', v_id_ajuste::text, v_ahora, v_usuario
      );
      INSERT INTO public.movimientos_inventario (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
        registrado_en, registrado_por, origen_tipo, origen_id
      )
      VALUES (
        v_empresa, p_id_sucursal, v_bodega, p_id_ubicacion, v_linea.id_producto,
        'AJUSTE_ENTRADA', v_linea.cantidad_delta, v_total,
        'Entrada por ajuste AI-' || v_id_ajuste::text, v_fecha,
        v_ahora, v_usuario, 'AJUSTE', v_id_ajuste::text
      );
    ELSE
      v_pendiente := abs(v_linea.cantidad_delta);
      FOR v_capa IN
        SELECT f.id_capa, f.cantidad_disponible, f.costo_unitario
        FROM public.capas_inventario_fifo f
        WHERE f.id_empresa = v_empresa AND f.id_sucursal = p_id_sucursal
          AND f.id_ubicacion = p_id_ubicacion AND f.id_producto = v_linea.id_producto
          AND f.cantidad_disponible > 0
        ORDER BY f.recibido_en, f.id_capa
        FOR UPDATE OF f
      LOOP
        EXIT WHEN v_pendiente = 0;
        v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
        v_costo := round(v_consumo * v_capa.costo_unitario, 2);
        UPDATE public.capas_inventario_fifo
        SET cantidad_disponible = cantidad_disponible - v_consumo
        WHERE id_empresa = v_empresa AND id_capa = v_capa.id_capa;
        INSERT INTO public.consumos_fifo_ajuste (
          id_empresa, id_detalle_ajuste, id_capa, cantidad, costo_unitario, costo_total
        )
        VALUES (
          v_empresa, v_id_detalle, v_capa.id_capa, v_consumo,
          v_capa.costo_unitario, v_costo
        );
        v_pendiente := v_pendiente - v_consumo;
      END LOOP;
      IF v_pendiente <> 0 THEN RAISE EXCEPTION 'No fue posible consumir todas las capas FIFO.'; END IF;
      INSERT INTO public.movimientos_inventario (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
        registrado_en, registrado_por, origen_tipo, origen_id
      )
      VALUES (
        v_empresa, p_id_sucursal, v_bodega, p_id_ubicacion, v_linea.id_producto,
        'AJUSTE_SALIDA', v_linea.cantidad_delta, v_total,
        'Salida por ajuste AI-' || v_id_ajuste::text, v_fecha,
        v_ahora, v_usuario, 'AJUSTE', v_id_ajuste::text
      );
    END IF;
  END LOOP;
  RETURN v_id_ajuste;
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_periodo_contable(p_id_periodo bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_inicio date;
  v_fin date;
  v_estado text;
BEGIN
  SELECT pc.id_empresa, pc.fecha_inicio, pc.fecha_fin, pc.estado
  INTO v_empresa, v_inicio, v_fin, v_estado
  FROM public.periodos_contables pc
  WHERE pc.id_periodo = p_id_periodo
  FOR UPDATE;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'El período contable no existe.'; END IF;
  IF v_usuario IS NULL OR NOT (
    SELECT public.puede_administrar_empresa(v_empresa)
  ) THEN RAISE EXCEPTION 'Solo un administrador puede cerrar el período contable.'; END IF;
  IF v_estado <> 'ABIERTO' THEN RAISE EXCEPTION 'El período ya está cerrado.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.sesiones_caja s
    WHERE s.id_empresa = v_empresa AND s.estado = 'ABIERTA'
      AND s.fecha_operativa <= v_fin
  ) THEN RAISE EXCEPTION 'Cierre todas las sesiones de caja antes de cerrar el período.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.comprobantes_contables c
    WHERE c.id_empresa = v_empresa AND c.id_periodo = p_id_periodo
      AND c.estado = 'BORRADOR'
  ) THEN RAISE EXCEPTION 'Contabilice o cancele todos los comprobantes en borrador antes del cierre.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.comprobantes_contables c
    WHERE c.id_empresa = v_empresa AND c.id_periodo = p_id_periodo
      AND (c.fecha < v_inicio OR c.fecha > v_fin)
  ) THEN RAISE EXCEPTION 'Hay comprobantes fuera de las fechas del período.'; END IF;
  UPDATE public.periodos_contables
  SET estado = 'CERRADO', cerrado_por = v_usuario, cerrado_en = clock_timestamp()
  WHERE id_empresa = v_empresa AND id_periodo = p_id_periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_sesion_caja_interno(
  p_id_sesion bigint,
  p_efectivo_contado numeric,
  p_motivo text,
  p_excepcional boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_sucursal integer;
  v_estado text;
  v_zona_horaria text;
  v_ahora timestamptz := clock_timestamp();
  v_fecha_operativa date;
  v_efectivo_esperado numeric(14,2);
  v_diferencia numeric(14,2);
  v_motivo text := NULLIF(trim(p_motivo), '');
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para cerrar una caja.';
  END IF;
  IF p_efectivo_contado IS NULL OR p_efectivo_contado < 0
     OR p_efectivo_contado <> round(p_efectivo_contado, 2) THEN
    RAISE EXCEPTION 'El efectivo contado debe ser cero o un monto positivo con máximo dos decimales.';
  END IF;
  SELECT s.id_empresa, s.id_sucursal, s.estado, s.zona_horaria
  INTO v_empresa, v_sucursal, v_estado, v_zona_horaria
  FROM public.sesiones_caja s WHERE s.id_sesion = p_id_sesion FOR UPDATE;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'La sesión de caja no existe.'; END IF;
  IF NOT (SELECT public.puede_operar_caja(v_empresa, v_sucursal, p_excepcional)) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar esta sesión de caja.';
  END IF;
  IF v_estado <> 'ABIERTA' THEN RAISE EXCEPTION 'La sesión ya está cerrada.'; END IF;
  IF p_excepcional AND char_length(COALESCE(v_motivo, '')) < 3 THEN
    RAISE EXCEPTION 'El cierre excepcional requiere un motivo de al menos tres caracteres.';
  END IF;
  SELECT COALESCE(sum(CASE
    WHEN mc.tipo IN ('APERTURA', 'INGRESO', 'VENTA_EFECTIVO') THEN mc.monto
    ELSE -mc.monto
  END), 0)::numeric(14,2)
  INTO v_efectivo_esperado
  FROM public.movimientos_caja mc
  WHERE mc.id_sesion = p_id_sesion;
  v_diferencia := p_efectivo_contado - v_efectivo_esperado;
  IF v_diferencia <> 0 AND char_length(COALESCE(v_motivo, '')) < 3 THEN
    RAISE EXCEPTION 'La diferencia de caja requiere un motivo de al menos tres caracteres.';
  END IF;
  v_fecha_operativa := (v_ahora AT TIME ZONE v_zona_horaria)::date;
  UPDATE public.sesiones_caja
  SET estado = 'CERRADA', fecha_cierre_operativa = v_fecha_operativa,
      efectivo_esperado_cierre = v_efectivo_esperado,
      efectivo_contado_cierre = p_efectivo_contado,
      diferencia_cierre = v_diferencia,
      tipo_cierre = CASE WHEN p_excepcional THEN 'EXCEPCIONAL' ELSE 'NORMAL' END,
      motivo_cierre = v_motivo, cerrada_por = v_usuario, cerrada_en = v_ahora
  WHERE id_sesion = p_id_sesion;
END;
$$;

CREATE OR REPLACE FUNCTION public.procesar_devolucion_venta(
  p_id_sesion bigint,
  p_id_venta bigint,
  p_lineas jsonb,
  p_metodo_reembolso text,
  p_motivo text,
  p_clave_idempotencia text
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
  v_caja bigint;
  v_zona text;
  v_estado_sesion text;
  v_venta record;
  v_fecha date;
  v_ahora timestamptz := clock_timestamp();
  v_id_devolucion bigint;
  v_existente bigint;
  v_huella text;
  v_hash_existente text;
  v_clave text := trim(COALESCE(p_clave_idempotencia, ''));
  v_lineas jsonb;
  v_linea record;
  v_capa record;
  v_id_detalle_devolucion bigint;
  v_id_comprobante bigint;
  v_id_cuenta_venta bigint;
  v_id_cuenta_inventario bigint;
  v_id_cuenta_costo bigint;
  v_id_cuenta_pago bigint;
  v_cantidad_pendiente numeric(14,3);
  v_cantidad_reingreso numeric(14,3);
  v_costo_reingreso numeric(14,2);
  v_costo_total numeric(14,2) := 0;
  v_costo_linea numeric(14,2);
  v_costos jsonb := '{}'::jsonb;
  v_subtotal numeric(14,2) := 0;
  v_monto_pagado numeric(14,2);
  v_monto_reembolsado numeric(14,2);
  v_numero integer := 0;
  v_bodega bigint;
  v_ubicacion bigint;
  v_lineas_asiento jsonb;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF char_length(v_clave) NOT BETWEEN 1 AND 128
     OR char_length(COALESCE(trim(p_motivo), '')) < 3 THEN
    RAISE EXCEPTION 'La devolución requiere una clave idempotente y un motivo de al menos tres caracteres.';
  END IF;
  IF p_metodo_reembolso IS NULL
     OR p_metodo_reembolso NOT IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'El método de reembolso no es válido.';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'La devolución debe incluir entre 1 y 50 líneas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR jsonb_typeof(e.value -> 'id_detalle_venta') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad') <> 'number'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_lineas) x(id_detalle_venta bigint, cantidad numeric)
    WHERE x.id_detalle_venta IS NULL OR x.cantidad IS NULL
       OR x.cantidad <= 0 OR x.cantidad <> round(x.cantidad, 3)
  ) THEN RAISE EXCEPTION 'Cada línea requiere un detalle de venta y una cantidad positiva de hasta tres decimales.'; END IF;
  IF EXISTS (
    SELECT id_detalle_venta FROM jsonb_to_recordset(p_lineas)
      x(id_detalle_venta bigint, cantidad numeric)
    GROUP BY id_detalle_venta HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas detalles de venta en la devolución.'; END IF;

  SELECT v.id_empresa, v.id_sucursal, v.id_caja, v.total, v.fecha_operativa
  INTO v_venta
  FROM public.ventas v
  WHERE v.id_venta = p_id_venta
  FOR UPDATE;
  IF v_venta.id_empresa IS NULL THEN RAISE EXCEPTION 'La venta no existe.'; END IF;
  IF NOT (SELECT public.puede_operar_caja(v_venta.id_empresa, v_venta.id_sucursal, false)) THEN
    RAISE EXCEPTION 'No tienes permiso para procesar devoluciones en esta sucursal.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('DV:' || v_venta.id_empresa::text || ':' || v_clave, 0)
  );
  SELECT s.id_empresa, s.id_sucursal, s.id_caja, s.estado, s.zona_horaria
  INTO v_empresa, v_sucursal, v_caja, v_estado_sesion, v_zona
  FROM public.sesiones_caja s
  WHERE s.id_sesion = p_id_sesion
  FOR UPDATE;
  IF v_estado_sesion IS DISTINCT FROM 'ABIERTA'
     OR v_empresa <> v_venta.id_empresa OR v_sucursal <> v_venta.id_sucursal THEN
    RAISE EXCEPTION 'La devolución requiere una sesión abierta de caja en la sucursal de la venta.';
  END IF;
  SELECT d.id_devolucion, d.huella_solicitud
  INTO v_existente, v_hash_existente
  FROM public.devoluciones_venta d
  WHERE d.id_empresa = v_venta.id_empresa AND d.clave_idempotencia = v_clave;
  SELECT jsonb_agg(jsonb_build_object(
    'id_detalle_venta', x.id_detalle_venta, 'cantidad', x.cantidad
  ) ORDER BY x.id_detalle_venta) INTO v_lineas
  FROM jsonb_to_recordset(p_lineas) x(id_detalle_venta bigint, cantidad numeric);
  v_huella := md5(p_id_sesion::text || '|' || p_id_venta::text || '|' ||
    v_lineas::text || '|' || p_metodo_reembolso || '|' || trim(p_motivo));
  IF v_existente IS NOT NULL THEN
    IF v_hash_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia de devolución ya se usó con datos distintos.';
    END IF;
    RETURN v_existente;
  END IF;

  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;
  PERFORM 1 FROM public.periodos_contables pc
  WHERE pc.id_empresa = v_venta.id_empresa AND pc.estado = 'ABIERTO'
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.'; END IF;

  FOR v_linea IN
    SELECT x.id_detalle_venta, x.cantidad, dv.id_producto, dv.cantidad AS vendida,
           dv.precio_unitario
    FROM jsonb_to_recordset(v_lineas) x(id_detalle_venta bigint, cantidad numeric)
    JOIN public.detalle_ventas dv
      ON dv.id_empresa = v_venta.id_empresa AND dv.id_venta = p_id_venta
     AND dv.id_detalle = x.id_detalle_venta
    ORDER BY dv.id_detalle
    FOR UPDATE OF dv
  LOOP
    IF v_linea.cantidad >
      v_linea.vendida - COALESCE((
        SELECT sum(dd.cantidad)
        FROM public.detalles_devolucion_venta dd
        JOIN public.devoluciones_venta d ON d.id_empresa = dd.id_empresa
          AND d.id_devolucion = dd.id_devolucion
        WHERE d.id_venta = p_id_venta
          AND dd.id_detalle_venta = v_linea.id_detalle_venta
      ), 0) THEN
      RAISE EXCEPTION 'La devolución supera la cantidad vendida que aún no se ha devuelto.';
    END IF;
    v_subtotal := v_subtotal + round(v_linea.cantidad * v_linea.precio_unitario, 2);
  END LOOP;
  IF (SELECT count(*) FROM jsonb_to_recordset(v_lineas)
      x(id_detalle_venta bigint, cantidad numeric)) <>
     (SELECT count(*) FROM public.detalle_ventas dv
      JOIN jsonb_to_recordset(v_lineas) x(id_detalle_venta bigint, cantidad numeric)
        ON x.id_detalle_venta = dv.id_detalle
      WHERE dv.id_empresa = v_venta.id_empresa AND dv.id_venta = p_id_venta) THEN
    RAISE EXCEPTION 'Uno o más detalles no pertenecen a la venta indicada.';
  END IF;
  SELECT COALESCE(sum(p.monto), 0) INTO v_monto_pagado
  FROM public.pagos_venta p
  WHERE p.id_empresa = v_venta.id_empresa AND p.id_venta = p_id_venta
    AND p.metodo_pago = p_metodo_reembolso;
  SELECT COALESCE(sum(d.total), 0) INTO v_monto_reembolsado
  FROM public.devoluciones_venta d
  WHERE d.id_empresa = v_venta.id_empresa AND d.id_venta = p_id_venta
    AND d.metodo_reembolso = p_metodo_reembolso;
  IF v_subtotal <= 0 OR v_subtotal > v_monto_pagado - v_monto_reembolsado THEN
    RAISE EXCEPTION 'El reembolso excede el importe aún disponible para ese medio de pago.';
  END IF;

  SELECT c.id_cuenta INTO v_id_cuenta_venta
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_venta.id_empresa AND c.codigo = '4.1.01'
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  SELECT c.id_cuenta INTO v_id_cuenta_inventario
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_venta.id_empresa AND c.codigo = '1.1.06'
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  SELECT c.id_cuenta INTO v_id_cuenta_costo
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_venta.id_empresa AND c.codigo = '5.1.01'
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  SELECT c.id_cuenta INTO v_id_cuenta_pago
  FROM public.cuentas_contables c
  WHERE c.id_empresa = v_venta.id_empresa
    AND c.codigo = CASE p_metodo_reembolso
      WHEN 'EFECTIVO' THEN '1.1.02'
      WHEN 'TARJETA' THEN '1.1.08'
      ELSE '1.1.04' END
    AND c.activa AND NOT c.es_grupo AND c.permite_movimientos;
  IF v_id_cuenta_venta IS NULL OR v_id_cuenta_inventario IS NULL
     OR v_id_cuenta_costo IS NULL OR v_id_cuenta_pago IS NULL THEN
    RAISE EXCEPTION 'Falta configurar una cuenta contable necesaria para la devolución.';
  END IF;

  FOR v_linea IN
    SELECT x.id_detalle_venta, x.cantidad
    FROM jsonb_to_recordset(v_lineas) x(id_detalle_venta bigint, cantidad numeric)
    ORDER BY x.id_detalle_venta
  LOOP
    v_cantidad_pendiente := v_linea.cantidad;
    v_costo_linea := 0;
    FOR v_capa IN
      SELECT cf.id_capa, cf.cantidad, cf.costo_total, c.costo_unitario,
        cf.cantidad - COALESCE((
          SELECT sum(df.cantidad)
          FROM public.devoluciones_fifo df
          JOIN public.detalles_devolucion_venta dd
            ON dd.id_empresa = df.id_empresa
           AND dd.id_detalle_devolucion = df.id_detalle_devolucion
          WHERE dd.id_detalle_venta = v_linea.id_detalle_venta
            AND df.id_capa_origen = cf.id_capa
        ), 0) AS cantidad_disponible,
        cf.costo_total - COALESCE((
          SELECT sum(df.costo_total)
          FROM public.devoluciones_fifo df
          JOIN public.detalles_devolucion_venta dd
            ON dd.id_empresa = df.id_empresa
           AND dd.id_detalle_devolucion = df.id_detalle_devolucion
          WHERE dd.id_detalle_venta = v_linea.id_detalle_venta
            AND df.id_capa_origen = cf.id_capa
        ), 0) AS costo_disponible
      FROM public.consumos_fifo_venta cf
      JOIN public.capas_inventario_fifo c
        ON c.id_empresa = cf.id_empresa AND c.id_capa = cf.id_capa
      WHERE cf.id_empresa = v_venta.id_empresa
        AND cf.id_venta = p_id_venta AND cf.id_detalle = v_linea.id_detalle_venta
      ORDER BY c.recibido_en, cf.id_capa
    LOOP
      EXIT WHEN v_cantidad_pendiente = 0;
      IF v_capa.cantidad_disponible <= 0 THEN CONTINUE; END IF;
      v_cantidad_reingreso := LEAST(v_cantidad_pendiente, v_capa.cantidad_disponible);
      IF v_cantidad_reingreso = v_capa.cantidad_disponible THEN
        v_costo_reingreso := v_capa.costo_disponible;
      ELSE
        v_costo_reingreso := LEAST(round(v_cantidad_reingreso * v_capa.costo_unitario, 2),
          v_capa.costo_disponible);
      END IF;
      v_cantidad_pendiente := v_cantidad_pendiente - v_cantidad_reingreso;
      v_costo_linea := v_costo_linea + v_costo_reingreso;
    END LOOP;
    IF v_cantidad_pendiente <> 0 THEN
      RAISE EXCEPTION 'No se encontró costo FIFO disponible para reingresar toda la devolución.';
    END IF;
    v_costo_linea := round(v_costo_linea, 2);
    v_costos := v_costos || jsonb_build_object(v_linea.id_detalle_venta::text, v_costo_linea);
    v_costo_total := v_costo_total + v_costo_linea;
  END LOOP;

  v_id_devolucion := nextval(
    pg_get_serial_sequence('public.devoluciones_venta', 'id_devolucion')::regclass
  );
  v_lineas_asiento := jsonb_build_array(
    jsonb_build_object('id_cuenta', v_id_cuenta_venta, 'debe', v_subtotal,
      'haber', 0, 'descripcion', 'Reversión de ingreso por devolución'),
    jsonb_build_object('id_cuenta', v_id_cuenta_pago, 'debe', 0,
      'haber', v_subtotal, 'descripcion', 'Reembolso ' || p_metodo_reembolso)
  );
  IF v_costo_total > 0 THEN
    v_lineas_asiento := v_lineas_asiento || jsonb_build_array(
      jsonb_build_object('id_cuenta', v_id_cuenta_inventario, 'debe', v_costo_total,
        'haber', 0, 'descripcion', 'Reingreso FIFO de mercancía'),
      jsonb_build_object('id_cuenta', v_id_cuenta_costo, 'debe', 0,
        'haber', v_costo_total, 'descripcion', 'Reversión de costo FIFO')
    );
  END IF;
  v_id_comprobante := public._registrar_asiento_operativo(
    v_venta.id_empresa, v_venta.id_sucursal, v_fecha, 'DEVOLUCION',
    'Devolución de venta DV-' || v_id_devolucion::text,
    'DEVOLUCION_VENTA', v_id_devolucion::text, v_lineas_asiento
  );
  INSERT INTO public.devoluciones_venta (
    id_devolucion, id_empresa, id_sucursal, id_venta, id_caja, id_sesion,
    metodo_reembolso, subtotal, impuesto, total, costo_fifo_revertido, motivo,
    id_comprobante, clave_idempotencia, huella_solicitud,
    procesada_por, procesada_en, fecha_operativa
  )
  VALUES (
    v_id_devolucion, v_venta.id_empresa, v_venta.id_sucursal, p_id_venta,
    v_caja, p_id_sesion, p_metodo_reembolso, v_subtotal, 0, v_subtotal,
    v_costo_total, trim(p_motivo), v_id_comprobante, v_clave, v_huella,
    v_usuario, v_ahora, v_fecha
  );

  FOR v_linea IN
    SELECT x.id_detalle_venta, x.cantidad, dv.id_producto, dv.precio_unitario
    FROM jsonb_to_recordset(v_lineas) x(id_detalle_venta bigint, cantidad numeric)
    JOIN public.detalle_ventas dv ON dv.id_detalle = x.id_detalle_venta
      AND dv.id_empresa = v_venta.id_empresa AND dv.id_venta = p_id_venta
    ORDER BY dv.id_detalle
  LOOP
    v_numero := v_numero + 1;
    INSERT INTO public.detalles_devolucion_venta (
      id_empresa, id_devolucion, id_detalle_venta, id_producto,
      cantidad, precio_unitario, subtotal, costo_fifo_revertido
    )
    VALUES (
      v_venta.id_empresa, v_id_devolucion, v_linea.id_detalle_venta,
      v_linea.id_producto, v_linea.cantidad, v_linea.precio_unitario,
      round(v_linea.cantidad * v_linea.precio_unitario, 2),
      (v_costos ->> v_linea.id_detalle_venta::text)::numeric
    )
    RETURNING id_detalle_devolucion INTO v_id_detalle_devolucion;
    v_cantidad_pendiente := v_linea.cantidad;
    FOR v_capa IN
      SELECT cf.id_capa, cf.cantidad, cf.costo_total,
             c.costo_unitario, c.recibido_en,
             cf.cantidad - COALESCE((
               SELECT sum(df.cantidad)
               FROM public.devoluciones_fifo df
               JOIN public.detalles_devolucion_venta dd
                 ON dd.id_empresa = df.id_empresa
                AND dd.id_detalle_devolucion = df.id_detalle_devolucion
               WHERE dd.id_detalle_venta = v_linea.id_detalle_venta
                 AND df.id_capa_origen = cf.id_capa
             ), 0) AS cantidad_disponible,
             cf.costo_total - COALESCE((
               SELECT sum(df.costo_total)
               FROM public.devoluciones_fifo df
               JOIN public.detalles_devolucion_venta dd
                 ON dd.id_empresa = df.id_empresa
                AND dd.id_detalle_devolucion = df.id_detalle_devolucion
               WHERE dd.id_detalle_venta = v_linea.id_detalle_venta
                 AND df.id_capa_origen = cf.id_capa
             ), 0) AS costo_disponible
      FROM public.consumos_fifo_venta cf
      JOIN public.capas_inventario_fifo c
        ON c.id_empresa = cf.id_empresa AND c.id_capa = cf.id_capa
      WHERE cf.id_empresa = v_venta.id_empresa
        AND cf.id_venta = p_id_venta AND cf.id_detalle = v_linea.id_detalle_venta
      ORDER BY c.recibido_en, cf.id_capa
    LOOP
      EXIT WHEN v_cantidad_pendiente = 0;
      IF v_capa.cantidad_disponible <= 0 THEN CONTINUE; END IF;
      v_cantidad_reingreso := LEAST(v_cantidad_pendiente, v_capa.cantidad_disponible);
      IF v_capa.cantidad_disponible = v_cantidad_reingreso THEN
        v_costo_reingreso := v_capa.costo_disponible;
      ELSE
        v_costo_reingreso := LEAST(round(v_cantidad_reingreso * v_capa.costo_unitario, 2),
          v_capa.costo_disponible);
      END IF;
      SELECT m.id_bodega, m.id_ubicacion INTO v_bodega, v_ubicacion
      FROM public.movimientos_inventario m
      WHERE m.id_empresa = v_venta.id_empresa AND m.id_sucursal = v_venta.id_sucursal
        AND m.id_producto = v_linea.id_producto
        AND m.tipo = 'VENTA' AND m.origen_tipo = 'VENTA' AND m.origen_id = p_id_venta::text
      ORDER BY m.id_movimiento LIMIT 1;
      IF v_bodega IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.ubicaciones_bodega u
        WHERE u.id_empresa = v_venta.id_empresa AND u.id_sucursal = v_venta.id_sucursal
          AND u.id_bodega = v_bodega AND u.id_ubicacion = v_ubicacion AND u.activa
      ) THEN RAISE EXCEPTION 'La ubicación de origen de venta no está disponible para reingresar el producto.'; END IF;
      INSERT INTO public.capas_inventario_fifo (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        cantidad_inicial, cantidad_disponible, costo_unitario,
        origen_tipo, origen_id, recibido_en, registrado_por
      )
      VALUES (
        v_venta.id_empresa, v_venta.id_sucursal, v_bodega, v_ubicacion,
        v_linea.id_producto, v_cantidad_reingreso, v_cantidad_reingreso,
        v_capa.costo_unitario, 'DEVOLUCION', v_id_devolucion::text,
        v_ahora, v_usuario
      )
      RETURNING id_capa INTO v_existente;
      INSERT INTO public.devoluciones_fifo (
        id_empresa, id_detalle_devolucion, id_capa_origen, id_capa_reingreso,
        cantidad, costo_unitario, costo_total
      )
      VALUES (
        v_venta.id_empresa, v_id_detalle_devolucion, v_capa.id_capa,
        v_existente, v_cantidad_reingreso, v_capa.costo_unitario, v_costo_reingreso
      );
      INSERT INTO public.movimientos_inventario (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
        registrado_en, registrado_por, origen_tipo, origen_id
      )
      VALUES (
        v_venta.id_empresa, v_venta.id_sucursal, v_bodega, v_ubicacion,
        v_linea.id_producto, 'DEVOLUCION', v_cantidad_reingreso, v_costo_reingreso,
        'Reingreso por devolución DV-' || v_id_devolucion::text, v_fecha,
        v_ahora, v_usuario, 'DEVOLUCION', v_id_devolucion::text
      );
      v_cantidad_pendiente := v_cantidad_pendiente - v_cantidad_reingreso;
      v_costo_total := v_costo_total + v_costo_reingreso;
    END LOOP;
    IF v_cantidad_pendiente <> 0 THEN
      RAISE EXCEPTION 'No se encontró costo FIFO disponible para reingresar toda la devolución.';
    END IF;
  END LOOP;

  IF p_metodo_reembolso = 'EFECTIVO' THEN
    INSERT INTO public.movimientos_caja (
      id_empresa, id_sucursal, id_caja, id_sesion, tipo, monto,
      descripcion, fecha_operativa, registrado_en, registrado_por,
      origen_tipo, origen_id, idempotencia_key
    )
    VALUES (
      v_venta.id_empresa, v_venta.id_sucursal, v_caja, p_id_sesion,
      'DEVOLUCION_EFECTIVO', v_subtotal, 'Reembolso devolución DV-' || v_id_devolucion::text,
      v_fecha, v_ahora, v_usuario, 'DEVOLUCION', v_id_devolucion::text,
      'DEVOLUCION:' || v_id_devolucion::text
    );
  END IF;

  RETURN v_id_devolucion;
END;
$$;

REVOKE ALL ON FUNCTION public._registrar_asiento_operativo(
  integer, integer, date, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_orden_compra(integer, bigint, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cambiar_estado_orden_compra(bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recibir_orden_compra(bigint, bigint, jsonb, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.procesar_devolucion_venta(bigint, bigint, jsonb, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transferir_inventario(bigint, bigint, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_ajuste_inventario(integer, bigint, jsonb, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cerrar_periodo_contable(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cerrar_sesion_caja_interno(bigint, numeric, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_orden_compra(integer, bigint, jsonb, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_orden_compra(bigint, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.recibir_orden_compra(bigint, bigint, jsonb, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_devolucion_venta(bigint, bigint, jsonb, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_inventario(bigint, bigint, jsonb, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_inventario(integer, bigint, jsonb, text, text, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_periodo_contable(bigint)
  TO authenticated;

COMMIT;
