BEGIN;

ALTER TABLE public.transferencias_inventario
  ADD COLUMN id_sucursal_destino integer;

DROP TRIGGER transferencias_inventario_inmutables
  ON public.transferencias_inventario;

UPDATE public.transferencias_inventario
SET id_sucursal_destino = id_sucursal;

CREATE TRIGGER transferencias_inventario_inmutables
BEFORE UPDATE OR DELETE ON public.transferencias_inventario
FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_operativo_inmutable();

ALTER TABLE public.transferencias_inventario
  ALTER COLUMN id_sucursal_destino SET NOT NULL,
  ADD CONSTRAINT transferencias_inventario_destino_sucursal_fkey
    FOREIGN KEY (id_empresa, id_sucursal_destino)
    REFERENCES public.sucursales (id_empresa, id_sucursal),
  ADD CONSTRAINT transferencias_inventario_destino_ubicacion_fkey
    FOREIGN KEY (id_empresa, id_sucursal_destino, id_ubicacion_destino)
    REFERENCES public.ubicaciones_bodega (id_empresa, id_sucursal, id_ubicacion);

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT c.conname
  INTO v_constraint
  FROM pg_catalog.pg_constraint AS c
  WHERE c.conrelid = 'public.transferencias_inventario'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public.ubicaciones_bodega'::regclass
    AND c.conkey = ARRAY[
      (SELECT a.attnum FROM pg_catalog.pg_attribute AS a
       WHERE a.attrelid = c.conrelid AND a.attname = 'id_empresa' AND NOT a.attisdropped),
      (SELECT a.attnum FROM pg_catalog.pg_attribute AS a
       WHERE a.attrelid = c.conrelid AND a.attname = 'id_sucursal' AND NOT a.attisdropped),
      (SELECT a.attnum FROM pg_catalog.pg_attribute AS a
       WHERE a.attrelid = c.conrelid AND a.attname = 'id_ubicacion_destino' AND NOT a.attisdropped)
    ]::smallint[];

  IF v_constraint IS NULL THEN
    RAISE EXCEPTION 'No se encontró la clave foránea de la ubicación destino de transferencias.';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.transferencias_inventario DROP CONSTRAINT %I',
    v_constraint
  );
END;
$$;

DROP POLICY transferencias_inventario_select_sucursal
  ON public.transferencias_inventario;

CREATE POLICY transferencias_inventario_select_sucursal
ON public.transferencias_inventario
FOR SELECT TO authenticated
USING (
  (SELECT public.puede_ver_sucursal(id_empresa, id_sucursal))
  OR
  (SELECT public.puede_ver_sucursal(id_empresa, id_sucursal_destino))
);

DROP POLICY detalles_transferencia_inventario_select_empresa
  ON public.detalles_transferencia_inventario;

CREATE POLICY detalles_transferencia_inventario_select_sucursal
ON public.detalles_transferencia_inventario
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.transferencias_inventario AS t
    WHERE t.id_empresa = detalles_transferencia_inventario.id_empresa
      AND t.id_transferencia = detalles_transferencia_inventario.id_transferencia
      AND (
        (SELECT public.puede_ver_sucursal(t.id_empresa, t.id_sucursal))
        OR
        (SELECT public.puede_ver_sucursal(t.id_empresa, t.id_sucursal_destino))
      )
  )
);

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
  v_sucursal_origen integer;
  v_sucursal_destino integer;
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
  v_pendiente numeric(14,3);
  v_consumo numeric(14,3);
  v_costo numeric(14,2);
  v_costo_linea numeric(14,2);
  v_costos jsonb := '{}'::jsonb;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
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
    SELECT 1
    FROM jsonb_array_elements(p_lineas) AS e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR jsonb_typeof(e.value -> 'id_producto') <> 'number'
       OR jsonb_typeof(e.value -> 'cantidad') <> 'number'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lineas) AS x(id_producto bigint, cantidad numeric)
    WHERE x.id_producto IS NULL
       OR x.cantidad IS NULL
       OR x.cantidad <= 0
       OR x.cantidad <> round(x.cantidad, 3)
  ) THEN
    RAISE EXCEPTION 'Cada línea requiere producto y cantidad positiva de hasta tres decimales.';
  END IF;
  IF EXISTS (
    SELECT x.id_producto
    FROM jsonb_to_recordset(p_lineas) AS x(id_producto bigint, cantidad numeric)
    GROUP BY x.id_producto
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No repitas productos en la transferencia.';
  END IF;

  SELECT o.id_empresa, o.id_sucursal, o.id_bodega, e.zona_horaria
  INTO v_empresa, v_sucursal_origen, v_bodega_origen, v_zona
  FROM public.ubicaciones_bodega AS o
  JOIN public.sucursales AS so
    ON so.id_empresa = o.id_empresa
   AND so.id_sucursal = o.id_sucursal
   AND so.activa
  JOIN public.empresa AS e
    ON e.id_empresa = o.id_empresa
   AND e.activa
  WHERE o.id_ubicacion = p_id_ubicacion_origen
    AND o.activa;

  IF v_empresa IS NULL
     OR NOT (
       SELECT public.puede_operar_caja(
         v_empresa, v_sucursal_origen, true
       )
     ) THEN
    RAISE EXCEPTION 'No tienes permiso para transferir inventario desde esta sucursal.';
  END IF;

  SELECT d.id_sucursal, d.id_bodega
  INTO v_sucursal_destino, v_bodega_destino
  FROM public.ubicaciones_bodega AS d
  JOIN public.sucursales AS sd
    ON sd.id_empresa = d.id_empresa
   AND sd.id_sucursal = d.id_sucursal
   AND sd.activa
  WHERE d.id_empresa = v_empresa
    AND d.id_ubicacion = p_id_ubicacion_destino
    AND d.activa;

  IF v_sucursal_destino IS NULL THEN
    RAISE EXCEPTION 'El destino debe ser una ubicación activa de una sucursal activa de la misma empresa.';
  END IF;
  IF NOT (
    SELECT public.puede_operar_caja(
      v_empresa, v_sucursal_destino, true
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para transferir inventario a esta sucursal.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('TR:' || v_empresa::text || ':' || v_clave, 0)
  );

  SELECT jsonb_agg(
    jsonb_build_object('id_producto', x.id_producto, 'cantidad', x.cantidad)
    ORDER BY x.id_producto
  )
  INTO v_lineas
  FROM jsonb_to_recordset(p_lineas) AS x(id_producto bigint, cantidad numeric);

  v_huella := md5(
    v_empresa::text || '|' ||
    v_sucursal_origen::text || '|' ||
    v_sucursal_destino::text || '|' ||
    p_id_ubicacion_origen::text || '|' ||
    p_id_ubicacion_destino::text || '|' ||
    v_lineas::text || '|' ||
    trim(p_motivo)
  );

  SELECT t.id_transferencia, t.huella_solicitud
  INTO v_existente, v_hash_existente
  FROM public.transferencias_inventario AS t
  WHERE t.id_empresa = v_empresa
    AND t.clave_idempotencia = v_clave;
  IF v_existente IS NOT NULL THEN
    IF v_hash_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se usó para otra transferencia.';
    END IF;
    RETURN v_existente;
  END IF;

  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;
  PERFORM 1
  FROM public.periodos_contables AS pc
  WHERE pc.id_empresa = v_empresa
    AND pc.estado = 'ABIERTO'
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay un período contable abierto para la fecha operativa actual.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_lineas) AS x(id_producto bigint, cantidad numeric)
    LEFT JOIN public.productos AS p
      ON p.id_empresa = v_empresa
     AND p.id_producto = x.id_producto
    WHERE p.id_producto IS NULL
       OR NOT p.activo
  ) THEN
    RAISE EXCEPTION 'Uno o más productos no existen o están inactivos.';
  END IF;

  PERFORM p.id_producto
  FROM public.productos AS p
  JOIN jsonb_to_recordset(v_lineas) AS x(id_producto bigint, cantidad numeric)
    ON x.id_producto = p.id_producto
  WHERE p.id_empresa = v_empresa
  ORDER BY p.id_producto
  FOR UPDATE OF p;

  FOR v_linea IN
    SELECT x.id_producto, x.cantidad
    FROM jsonb_to_recordset(v_lineas) AS x(id_producto bigint, cantidad numeric)
    ORDER BY x.id_producto
  LOOP
    v_pendiente := v_linea.cantidad;
    v_costo_linea := 0;
    FOR v_capa IN
      SELECT f.id_capa, f.cantidad_disponible, f.costo_unitario
      FROM public.capas_inventario_fifo AS f
      WHERE f.id_empresa = v_empresa
        AND f.id_sucursal = v_sucursal_origen
        AND f.id_ubicacion = p_id_ubicacion_origen
        AND f.id_producto = v_linea.id_producto
        AND f.cantidad_disponible > 0
      ORDER BY f.recibido_en, f.id_capa
      FOR UPDATE OF f
    LOOP
      EXIT WHEN v_pendiente = 0;
      v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
      v_costo_linea := v_costo_linea
        + round(v_consumo * v_capa.costo_unitario, 2);
      v_pendiente := v_pendiente - v_consumo;
    END LOOP;
    IF v_pendiente <> 0 THEN
      RAISE EXCEPTION 'Existencias insuficientes para el producto %.', v_linea.id_producto;
    END IF;
    v_costos := v_costos || jsonb_build_object(
      v_linea.id_producto::text, v_costo_linea
    );
  END LOOP;

  INSERT INTO public.transferencias_inventario (
    id_empresa, id_sucursal, id_sucursal_destino,
    id_ubicacion_origen, id_ubicacion_destino, motivo,
    transferida_por, transferida_en, fecha_operativa,
    clave_idempotencia, huella_solicitud
  )
  VALUES (
    v_empresa, v_sucursal_origen, v_sucursal_destino,
    p_id_ubicacion_origen, p_id_ubicacion_destino, trim(p_motivo),
    v_usuario, v_ahora, v_fecha, v_clave, v_huella
  )
  RETURNING id_transferencia INTO v_id_transferencia;

  FOR v_linea IN
    SELECT x.id_producto, x.cantidad
    FROM jsonb_to_recordset(v_lineas) AS x(id_producto bigint, cantidad numeric)
    ORDER BY x.id_producto
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
      FROM public.capas_inventario_fifo AS f
      WHERE f.id_empresa = v_empresa
        AND f.id_sucursal = v_sucursal_origen
        AND f.id_ubicacion = p_id_ubicacion_origen
        AND f.id_producto = v_linea.id_producto
        AND f.cantidad_disponible > 0
      ORDER BY f.recibido_en, f.id_capa
      FOR UPDATE OF f
    LOOP
      EXIT WHEN v_pendiente = 0;
      v_consumo := LEAST(v_pendiente, v_capa.cantidad_disponible);
      v_costo := round(v_consumo * v_capa.costo_unitario, 2);

      UPDATE public.capas_inventario_fifo
      SET cantidad_disponible = cantidad_disponible - v_consumo
      WHERE id_empresa = v_empresa
        AND id_capa = v_capa.id_capa;

      INSERT INTO public.capas_inventario_fifo (
        id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
        cantidad_inicial, cantidad_disponible, costo_unitario, origen_tipo,
        origen_id, recibido_en, registrado_por
      )
      VALUES (
        v_empresa, v_sucursal_destino, v_bodega_destino,
        p_id_ubicacion_destino, v_linea.id_producto,
        v_consumo, v_consumo, v_capa.costo_unitario, 'TRANSFERENCIA',
        v_id_transferencia::text, v_capa.recibido_en, v_usuario
      )
      RETURNING id_capa INTO v_existente;

      INSERT INTO public.capas_transferencia_inventario (
        id_empresa, id_detalle_transferencia, id_capa_origen,
        id_capa_destino, cantidad, costo_unitario
      )
      VALUES (
        v_empresa, v_id_detalle, v_capa.id_capa, v_existente,
        v_consumo, v_capa.costo_unitario
      );

      v_pendiente := v_pendiente - v_consumo;
      v_costo_linea := v_costo_linea + v_costo;
    END LOOP;
    IF v_pendiente <> 0 THEN
      RAISE EXCEPTION 'No fue posible asignar todas las capas FIFO.';
    END IF;

    INSERT INTO public.movimientos_inventario (
      id_empresa, id_sucursal, id_bodega, id_ubicacion, id_producto,
      tipo, cantidad_delta, costo_total, descripcion, fecha_operativa,
      registrado_en, registrado_por, origen_tipo, origen_id
    )
    VALUES
      (
        v_empresa, v_sucursal_origen, v_bodega_origen,
        p_id_ubicacion_origen, v_linea.id_producto,
        'TRANSFERENCIA_SALIDA', -v_linea.cantidad, v_costo_linea,
        'Salida por transferencia TR-' || v_id_transferencia::text,
        v_fecha, v_ahora, v_usuario, 'TRANSFERENCIA',
        v_id_transferencia::text
      ),
      (
        v_empresa, v_sucursal_destino, v_bodega_destino,
        p_id_ubicacion_destino, v_linea.id_producto,
        'TRANSFERENCIA_ENTRADA', v_linea.cantidad, v_costo_linea,
        'Entrada por transferencia TR-' || v_id_transferencia::text,
        v_fecha, v_ahora, v_usuario, 'TRANSFERENCIA',
        v_id_transferencia::text
      );
  END LOOP;

  RETURN v_id_transferencia;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_inventario(bigint, bigint, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_inventario(bigint, bigint, jsonb, text, text)
  TO authenticated;

COMMIT;
