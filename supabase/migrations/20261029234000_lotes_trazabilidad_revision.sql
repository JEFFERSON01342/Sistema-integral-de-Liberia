BEGIN;

CREATE TABLE public.lotes_inventario (
  id_lote bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_sucursal integer NOT NULL,
  id_producto bigint NOT NULL,
  id_recepcion bigint NOT NULL,
  id_detalle_recepcion bigint NOT NULL,
  codigo_lote text GENERATED ALWAYS AS ('LT-' || id_lote::text) STORED,
  lote_proveedor text,
  fecha_vencimiento date,
  estado_revision text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_revision IN ('PENDIENTE', 'APROBADO')),
  revision_detalles text,
  revisado_por uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  revisado_en timestamptz,
  huella_metadatos text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id_empresa, id_lote),
  UNIQUE (id_empresa, codigo_lote),
  UNIQUE (id_empresa, id_recepcion, id_detalle_recepcion),
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_producto)
    REFERENCES public.productos (id_empresa, id_producto) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_recepcion)
    REFERENCES public.recepciones_compra (id_empresa, id_recepcion) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_detalle_recepcion)
    REFERENCES public.detalles_recepcion_compra (id_empresa, id_detalle_recepcion)
    ON DELETE RESTRICT,
  CHECK (lote_proveedor IS NULL OR char_length(trim(lote_proveedor)) BETWEEN 1 AND 120),
  CHECK (revision_detalles IS NULL OR char_length(revision_detalles) <= 2000),
  CHECK (
    (estado_revision = 'PENDIENTE' AND revisado_por IS NULL AND revisado_en IS NULL)
    OR (estado_revision = 'APROBADO' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL)
  )
);

CREATE INDEX lotes_inventario_sucursal_revision_idx
  ON public.lotes_inventario (id_empresa, id_sucursal, estado_revision, creado_en DESC);
CREATE INDEX lotes_inventario_producto_vencimiento_idx
  ON public.lotes_inventario (id_empresa, id_producto, fecha_vencimiento)
  WHERE fecha_vencimiento IS NOT NULL;

ALTER TABLE public.capas_inventario_fifo
  ADD COLUMN id_lote bigint,
  ADD CONSTRAINT capas_fifo_lote_empresa_fkey
    FOREIGN KEY (id_empresa, id_lote)
    REFERENCES public.lotes_inventario (id_empresa, id_lote) ON DELETE RESTRICT;

CREATE INDEX capas_fifo_lote_idx
  ON public.capas_inventario_fifo (id_empresa, id_lote)
  WHERE id_lote IS NOT NULL;

CREATE TABLE public.historial_lotes_ubicacion (
  id_evento bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_lote bigint NOT NULL,
  id_sucursal integer NOT NULL,
  id_sucursal_origen integer,
  tipo_evento text NOT NULL
    CHECK (tipo_evento IN ('RECEPCION', 'REVISION', 'TRASLADO', 'VENTA', 'DEVOLUCION')),
  id_ubicacion_origen bigint,
  id_ubicacion_destino bigint,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad > 0),
  documento_tipo text NOT NULL,
  documento_id text NOT NULL,
  ocurrido_en timestamptz NOT NULL,
  registrado_por uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_lote)
    REFERENCES public.lotes_inventario (id_empresa, id_lote) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal_origen)
    REFERENCES public.sucursales (id_empresa, id_sucursal) ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal_origen, id_ubicacion_origen)
    REFERENCES public.ubicaciones_bodega (id_empresa, id_sucursal, id_ubicacion)
    ON DELETE RESTRICT,
  FOREIGN KEY (id_empresa, id_sucursal, id_ubicacion_destino)
    REFERENCES public.ubicaciones_bodega (id_empresa, id_sucursal, id_ubicacion)
    ON DELETE RESTRICT,
  CHECK (char_length(trim(documento_tipo)) > 0),
  CHECK (char_length(trim(documento_id)) > 0)
);

CREATE INDEX historial_lotes_evento_idx
  ON public.historial_lotes_ubicacion (id_empresa, id_lote, ocurrido_en, id_evento);

ALTER TABLE public.lotes_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_lotes_ubicacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lotes_inventario, public.historial_lotes_ubicacion
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.lotes_inventario, public.historial_lotes_ubicacion
  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.lotes_inventario_id_lote_seq,
  public.historial_lotes_ubicacion_id_evento_seq TO authenticated;

CREATE POLICY lotes_inventario_select_bodega
  ON public.lotes_inventario FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal))
    OR EXISTS (
      SELECT 1
      FROM public.capas_inventario_fifo f
      WHERE f.id_empresa = lotes_inventario.id_empresa
        AND f.id_lote = lotes_inventario.id_lote
        AND (SELECT public.puede_ver_bodega_sucursal(f.id_empresa, f.id_sucursal))
    )
  );
CREATE POLICY historial_lotes_select_bodega
  ON public.historial_lotes_ubicacion FOR SELECT TO authenticated
  USING (
    (SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal))
    OR (id_sucursal_origen IS NOT NULL AND
      (SELECT public.puede_ver_bodega_sucursal(id_empresa, id_sucursal_origen)))
  );

CREATE OR REPLACE FUNCTION public.lote_habilitado_venta(
  p_id_empresa integer,
  p_id_lote bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_id_lote IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.lotes_inventario l
        JOIN public.empresa e ON e.id_empresa = l.id_empresa
        WHERE l.id_empresa = p_id_empresa
          AND l.id_lote = p_id_lote
          AND l.estado_revision = 'APROBADO'
          AND (l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >=
            (statement_timestamp() AT TIME ZONE e.zona_horaria)::date)
      );
$$;
REVOKE ALL ON FUNCTION public.lote_habilitado_venta(integer, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_recepcion_compra_con_lotes(
  p_id_orden_compra bigint,
  p_id_ubicacion bigint,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_documento_proveedor text,
  p_observaciones text,
  p_lotes jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id_recepcion bigint;
  v_empresa integer;
  v_sucursal integer;
  v_hash text;
  v_total_aceptado integer;
  v_total_metadatos integer;
BEGIN
  IF jsonb_typeof(p_lotes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lotes) NOT BETWEEN 1 AND 100
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_lotes) e(value)
       WHERE jsonb_typeof(e.value) <> 'object'
          OR jsonb_typeof(e.value -> 'id_detalle_orden') <> 'number'
          OR (e.value ? 'lote_proveedor'
              AND jsonb_typeof(e.value -> 'lote_proveedor') NOT IN ('string', 'null'))
          OR (e.value ? 'fecha_vencimiento'
              AND jsonb_typeof(e.value -> 'fecha_vencimiento') NOT IN ('string', 'null'))
     ) THEN
    RAISE EXCEPTION 'Cada línea aceptada requiere metadatos de lote válidos.';
  END IF;
  IF EXISTS (
    SELECT id_detalle_orden
    FROM jsonb_to_recordset(p_lotes) AS x(
      id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
    )
    GROUP BY id_detalle_orden HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No repitas metadatos para una línea de recepción.';
  END IF;

  v_id_recepcion := public.recibir_orden_compra(
    p_id_orden_compra, p_id_ubicacion, p_lineas, p_clave_idempotencia,
    p_documento_proveedor, p_observaciones
  );
  IF EXISTS (
    SELECT 1 FROM public.ubicaciones_bodega u
    WHERE u.id_ubicacion = p_id_ubicacion
      AND u.tipo_area = 'PICKING'
  ) THEN
    RAISE EXCEPTION 'La recepción debe ir primero a recepción o almacenamiento; aprueba el lote antes de pasarlo al área de venta.';
  END IF;
  SELECT r.id_empresa, r.id_sucursal INTO STRICT v_empresa, v_sucursal
  FROM public.recepciones_compra r
  WHERE r.id_recepcion = v_id_recepcion;

  SELECT count(*) INTO v_total_aceptado
  FROM public.detalles_recepcion_compra d
  WHERE d.id_empresa = v_empresa AND d.id_recepcion = v_id_recepcion
    AND d.cantidad_aceptada > 0;
  SELECT count(*) INTO v_total_metadatos
  FROM jsonb_to_recordset(p_lotes) AS x(
    id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
  );
  IF v_total_aceptado <> v_total_metadatos
     OR EXISTS (
       SELECT 1
       FROM public.detalles_recepcion_compra d
       JOIN public.detalles_orden_compra o
         ON o.id_empresa = d.id_empresa
        AND o.id_detalle_orden = d.id_detalle_orden
       LEFT JOIN jsonb_to_recordset(p_lotes) AS x(
         id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
       ) ON x.id_detalle_orden = d.id_detalle_orden
       WHERE d.id_empresa = v_empresa AND d.id_recepcion = v_id_recepcion
         AND d.cantidad_aceptada > 0 AND x.id_detalle_orden IS NULL
     ) THEN
    RAISE EXCEPTION 'Los metadatos deben coincidir exactamente con las líneas aceptadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lotes) AS x(
      id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
    )
    JOIN public.detalles_recepcion_compra d
      ON d.id_empresa = v_empresa
     AND d.id_recepcion = v_id_recepcion
     AND d.id_detalle_orden = x.id_detalle_orden
    WHERE x.id_detalle_orden IS NULL
       OR d.cantidad_aceptada <= 0
       OR (x.lote_proveedor IS NOT NULL
           AND char_length(trim(x.lote_proveedor)) NOT BETWEEN 1 AND 120)
       OR (x.fecha_vencimiento IS NOT NULL
           AND x.fecha_vencimiento < (SELECT r.fecha_operativa
                                      FROM public.recepciones_compra r
                                      WHERE r.id_recepcion = v_id_recepcion))
  ) THEN
    RAISE EXCEPTION 'El lote del proveedor o la fecha de vencimiento no son válidos.';
  END IF;

  SELECT md5(coalesce(jsonb_agg(jsonb_build_object(
    'id_detalle_orden', x.id_detalle_orden,
    'lote_proveedor', nullif(trim(x.lote_proveedor), ''),
    'fecha_vencimiento', x.fecha_vencimiento
  ) ORDER BY x.id_detalle_orden)::text, '[]'))
  INTO v_hash
  FROM jsonb_to_recordset(p_lotes) AS x(
    id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
  );

  IF EXISTS (
    SELECT 1
    FROM public.lotes_inventario l
    JOIN public.detalles_recepcion_compra d
      ON d.id_empresa = l.id_empresa
     AND d.id_detalle_recepcion = l.id_detalle_recepcion
    JOIN public.detalles_orden_compra o
      ON o.id_empresa = d.id_empresa AND o.id_detalle_orden = d.id_detalle_orden
    JOIN jsonb_to_recordset(p_lotes) AS x(
      id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
    ) ON x.id_detalle_orden = o.id_detalle_orden
    WHERE l.id_empresa = v_empresa AND l.id_recepcion = v_id_recepcion
      AND l.huella_metadatos IS DISTINCT FROM md5(jsonb_build_object(
        'id_detalle_orden', x.id_detalle_orden,
        'lote_proveedor', nullif(trim(x.lote_proveedor), ''),
        'fecha_vencimiento', x.fecha_vencimiento
      )::text)
  ) THEN
    RAISE EXCEPTION 'La recepción ya existe con datos de lote distintos.';
  END IF;

  INSERT INTO public.lotes_inventario (
    id_empresa, id_sucursal, id_producto, id_recepcion,
    id_detalle_recepcion, lote_proveedor, fecha_vencimiento, huella_metadatos
  )
  SELECT v_empresa, v_sucursal, d.id_producto, v_id_recepcion,
    d.id_detalle_recepcion, nullif(trim(x.lote_proveedor), ''),
    x.fecha_vencimiento,
    md5(jsonb_build_object(
      'id_detalle_orden', x.id_detalle_orden,
      'lote_proveedor', nullif(trim(x.lote_proveedor), ''),
      'fecha_vencimiento', x.fecha_vencimiento
    )::text)
  FROM public.detalles_recepcion_compra d
  JOIN public.detalles_orden_compra o
    ON o.id_empresa = d.id_empresa AND o.id_detalle_orden = d.id_detalle_orden
  JOIN jsonb_to_recordset(p_lotes) AS x(
    id_detalle_orden bigint, lote_proveedor text, fecha_vencimiento date
  ) ON x.id_detalle_orden = o.id_detalle_orden
  WHERE d.id_empresa = v_empresa AND d.id_recepcion = v_id_recepcion
    AND d.cantidad_aceptada > 0
  ON CONFLICT (id_empresa, id_recepcion, id_detalle_recepcion) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.detalles_recepcion_compra d
    JOIN public.capas_inventario_fifo f
      ON f.id_empresa = d.id_empresa
     AND f.origen_tipo = 'COMPRA'
     AND f.origen_id = v_id_recepcion::text
     AND f.id_producto = d.id_producto
    JOIN public.lotes_inventario l
      ON l.id_empresa = d.id_empresa
     AND l.id_recepcion = d.id_recepcion
     AND l.id_detalle_recepcion = d.id_detalle_recepcion
    WHERE d.id_empresa = v_empresa AND d.id_recepcion = v_id_recepcion
      AND d.cantidad_aceptada > 0
      AND f.id_lote IS NOT NULL
      AND f.id_lote IS DISTINCT FROM l.id_lote
  ) THEN
    RAISE EXCEPTION 'No se pudo asociar cada capa FIFO con su lote de recepción.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.lotes_inventario l
    LEFT JOIN public.capas_inventario_fifo f
      ON f.id_empresa = l.id_empresa
     AND f.origen_tipo = 'COMPRA'
     AND f.origen_id = v_id_recepcion::text
     AND f.id_producto = l.id_producto
    WHERE l.id_empresa = v_empresa AND l.id_recepcion = v_id_recepcion
    GROUP BY l.id_lote
    HAVING count(f.id_capa) <> 1
  ) THEN
    RAISE EXCEPTION 'Cada lote aceptado debe corresponder a una única capa FIFO de compra.';
  END IF;

  UPDATE public.capas_inventario_fifo f
  SET id_lote = l.id_lote
  FROM public.detalles_recepcion_compra d
  JOIN public.lotes_inventario l
    ON l.id_empresa = d.id_empresa
   AND l.id_recepcion = d.id_recepcion
   AND l.id_detalle_recepcion = d.id_detalle_recepcion
  WHERE d.id_empresa = v_empresa AND d.id_recepcion = v_id_recepcion
    AND d.cantidad_aceptada > 0
    AND f.id_empresa = d.id_empresa
    AND f.origen_tipo = 'COMPRA'
    AND f.origen_id = v_id_recepcion::text
    AND f.id_producto = d.id_producto
    AND f.id_lote IS NULL;

  INSERT INTO public.historial_lotes_ubicacion (
    id_empresa, id_lote, id_sucursal, tipo_evento,
    id_ubicacion_destino, cantidad, documento_tipo, documento_id,
    ocurrido_en, registrado_por
  )
  SELECT l.id_empresa, l.id_lote, l.id_sucursal, 'RECEPCION',
    f.id_ubicacion, f.cantidad_inicial, 'RECEPCION_COMPRA',
    l.id_recepcion::text, f.recibido_en, f.registrado_por
  FROM public.lotes_inventario l
  JOIN public.capas_inventario_fifo f
    ON f.id_empresa = l.id_empresa AND f.id_lote = l.id_lote
  WHERE l.id_empresa = v_empresa AND l.id_recepcion = v_id_recepcion
    AND NOT EXISTS (
      SELECT 1 FROM public.historial_lotes_ubicacion h
      WHERE h.id_empresa = l.id_empresa AND h.id_lote = l.id_lote
        AND h.tipo_evento = 'RECEPCION'
    );

  RETURN v_id_recepcion;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_recepcion_compra_con_lotes(
  bigint, bigint, jsonb, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion_compra_con_lotes(
  bigint, bigint, jsonb, text, text, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.aprobar_revision_lote(
  p_codigo_lote text,
  p_revision_detalles text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote record;
  v_ahora timestamptz := clock_timestamp();
BEGIN
  SELECT l.id_empresa, l.id_lote, l.id_sucursal, l.estado_revision,
         l.fecha_vencimiento
  INTO v_lote
  FROM public.lotes_inventario l
  WHERE l.codigo_lote = trim(coalesce(p_codigo_lote, ''))
  FOR UPDATE;
  IF v_lote.id_lote IS NULL THEN
    RAISE EXCEPTION 'No se encontró el lote escaneado.';
  END IF;
  PERFORM 1
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = v_lote.id_empresa
    AND f.id_lote = v_lote.id_lote
    AND f.cantidad_disponible > 0
  FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1
    FROM public.capas_inventario_fifo f
    WHERE f.id_empresa = v_lote.id_empresa
      AND f.id_lote = v_lote.id_lote
      AND f.cantidad_disponible > 0
  ) THEN
    RAISE EXCEPTION 'El lote no tiene existencias disponibles para revisar en esta sucursal.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.capas_inventario_fifo f
    WHERE f.id_empresa = v_lote.id_empresa
      AND f.id_lote = v_lote.id_lote
      AND f.cantidad_disponible > 0
      AND (SELECT public.puede_administrar_ubicacion(f.id_empresa, f.id_sucursal))
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar la revisión de este lote.';
  END IF;
  IF v_lote.estado_revision <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'El lote ya fue revisado.';
  END IF;
  IF v_lote.fecha_vencimiento IS NOT NULL AND v_lote.fecha_vencimiento <
    (SELECT (clock_timestamp() AT TIME ZONE e.zona_horaria)::date
     FROM public.empresa e WHERE e.id_empresa = v_lote.id_empresa) THEN
    RAISE EXCEPTION 'No se puede aprobar un lote vencido.';
  END IF;
  IF char_length(coalesce(p_revision_detalles, '')) > 2000 THEN
    RAISE EXCEPTION 'Las observaciones de revisión no pueden exceder 2000 caracteres.';
  END IF;

  UPDATE public.lotes_inventario
  SET estado_revision = 'APROBADO',
      revision_detalles = nullif(trim(p_revision_detalles), ''),
      revisado_por = (SELECT auth.uid()),
      revisado_en = v_ahora
  WHERE id_empresa = v_lote.id_empresa AND id_lote = v_lote.id_lote;

  INSERT INTO public.historial_lotes_ubicacion (
    id_empresa, id_lote, id_sucursal, tipo_evento,
    id_ubicacion_destino, cantidad, documento_tipo, documento_id,
    ocurrido_en, registrado_por
  )
  SELECT v_lote.id_empresa, v_lote.id_lote, f.id_sucursal,
    'REVISION', f.id_ubicacion, f.cantidad_disponible,
    'REVISION_CALIDAD', v_lote.id_lote::text, v_ahora, (SELECT auth.uid())
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = v_lote.id_empresa AND f.id_lote = v_lote.id_lote
    AND f.cantidad_disponible > 0
    AND (SELECT public.puede_administrar_ubicacion(f.id_empresa, f.id_sucursal));
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_revision_lote(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aprobar_revision_lote(text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_trazabilidad_transferencia_lote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen record;
  v_destino record;
  v_transferencia record;
  v_lote record;
BEGIN
  SELECT f.id_lote, f.id_sucursal, f.id_ubicacion
  INTO v_origen
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = NEW.id_empresa AND f.id_capa = NEW.id_capa_origen;
  IF v_origen.id_lote IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.estado_revision, l.fecha_vencimiento
  INTO v_lote
  FROM public.lotes_inventario l
  WHERE l.id_empresa = NEW.id_empresa AND l.id_lote = v_origen.id_lote;
  SELECT t.id_sucursal_destino, t.id_ubicacion_destino, t.transferida_en,
         t.id_transferencia, u.tipo_area
  INTO v_transferencia
  FROM public.detalles_transferencia_inventario d
  JOIN public.transferencias_inventario t
    ON t.id_empresa = d.id_empresa AND t.id_transferencia = d.id_transferencia
  JOIN public.ubicaciones_bodega u
    ON u.id_empresa = t.id_empresa
   AND u.id_sucursal = t.id_sucursal_destino
   AND u.id_ubicacion = t.id_ubicacion_destino
  WHERE d.id_empresa = NEW.id_empresa
    AND d.id_detalle_transferencia = NEW.id_detalle_transferencia;
  IF v_transferencia.tipo_area = 'PICKING'
     AND (v_lote.estado_revision <> 'APROBADO'
       OR (v_lote.fecha_vencimiento IS NOT NULL
         AND v_lote.fecha_vencimiento < (
           SELECT (v_transferencia.transferida_en AT TIME ZONE e.zona_horaria)::date
           FROM public.empresa e
           JOIN public.lotes_inventario l
             ON l.id_empresa = e.id_empresa
           WHERE l.id_empresa = NEW.id_empresa AND l.id_lote = v_origen.id_lote
         ))) THEN
    RAISE EXCEPTION 'Solo se pueden colocar en el área de venta lotes aprobados y no vencidos.';
  END IF;

  UPDATE public.capas_inventario_fifo
  SET id_lote = v_origen.id_lote
  WHERE id_empresa = NEW.id_empresa AND id_capa = NEW.id_capa_destino;

  SELECT f.id_ubicacion INTO v_destino
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = NEW.id_empresa AND f.id_capa = NEW.id_capa_destino;
  INSERT INTO public.historial_lotes_ubicacion (
    id_empresa, id_lote, id_sucursal, id_sucursal_origen, tipo_evento,
    id_ubicacion_origen, id_ubicacion_destino, cantidad,
    documento_tipo, documento_id, ocurrido_en, registrado_por
  )
  SELECT NEW.id_empresa, v_origen.id_lote, v_transferencia.id_sucursal_destino,
    v_origen.id_sucursal, 'TRASLADO', v_origen.id_ubicacion, v_destino.id_ubicacion,
    NEW.cantidad, 'TRANSFERENCIA', v_transferencia.id_transferencia::text,
    v_transferencia.transferida_en, t.transferida_por
  FROM public.transferencias_inventario t
  WHERE t.id_empresa = NEW.id_empresa
    AND t.id_transferencia = v_transferencia.id_transferencia;
  RETURN NEW;
END;
$$;

CREATE TRIGGER capas_transferencia_lote_trazabilidad
AFTER INSERT ON public.capas_transferencia_inventario
FOR EACH ROW EXECUTE FUNCTION public.registrar_trazabilidad_transferencia_lote();

CREATE OR REPLACE FUNCTION public.registrar_trazabilidad_devolucion_lote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen record;
  v_destino record;
  v_devolucion record;
BEGIN
  SELECT f.id_lote, f.id_sucursal, f.id_ubicacion
  INTO v_origen
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = NEW.id_empresa AND f.id_capa = NEW.id_capa_origen;
  IF v_origen.id_lote IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT d.id_sucursal, d.id_ubicacion, d.id_devolucion,
         d.procesada_en, d.procesada_por
  INTO v_devolucion
  FROM public.detalles_devolucion_venta x
  JOIN public.devoluciones_venta d
    ON d.id_empresa = x.id_empresa AND d.id_devolucion = x.id_devolucion
  WHERE x.id_empresa = NEW.id_empresa
    AND x.id_detalle_devolucion = NEW.id_detalle_devolucion;
  UPDATE public.capas_inventario_fifo
  SET id_lote = v_origen.id_lote
  WHERE id_empresa = NEW.id_empresa AND id_capa = NEW.id_capa_reingreso;
  SELECT f.id_ubicacion INTO v_destino
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = NEW.id_empresa AND f.id_capa = NEW.id_capa_reingreso;
  INSERT INTO public.historial_lotes_ubicacion (
    id_empresa, id_lote, id_sucursal, id_sucursal_origen, tipo_evento,
    id_ubicacion_origen, id_ubicacion_destino, cantidad,
    documento_tipo, documento_id, ocurrido_en, registrado_por
  )
  VALUES (
    NEW.id_empresa, v_origen.id_lote, v_devolucion.id_sucursal,
    v_origen.id_sucursal, 'DEVOLUCION',
    v_origen.id_ubicacion, v_destino.id_ubicacion, NEW.cantidad,
    'DEVOLUCION_VENTA', v_devolucion.id_devolucion::text,
    v_devolucion.procesada_en, v_devolucion.procesada_por
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER devoluciones_fifo_lote_trazabilidad
AFTER INSERT ON public.devoluciones_fifo
FOR EACH ROW EXECUTE FUNCTION public.registrar_trazabilidad_devolucion_lote();

CREATE OR REPLACE FUNCTION public.registrar_trazabilidad_venta_lote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capa record;
  v_venta record;
BEGIN
  SELECT f.id_lote, f.id_sucursal, f.id_ubicacion
  INTO v_capa
  FROM public.capas_inventario_fifo f
  WHERE f.id_empresa = NEW.id_empresa AND f.id_capa = NEW.id_capa;
  IF v_capa.id_lote IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT v.id_venta, v.fecha_operativa, v.registrada_en, v.registrada_por
  INTO v_venta
  FROM public.ventas v
  WHERE v.id_empresa = NEW.id_empresa AND v.id_venta = NEW.id_venta;
  INSERT INTO public.historial_lotes_ubicacion (
    id_empresa, id_lote, id_sucursal, id_sucursal_origen, tipo_evento,
    id_ubicacion_origen, cantidad, documento_tipo, documento_id,
    ocurrido_en, registrado_por
  )
  VALUES (
    NEW.id_empresa, v_capa.id_lote, v_capa.id_sucursal, v_capa.id_sucursal, 'VENTA',
    v_capa.id_ubicacion, NEW.cantidad, 'VENTA', v_venta.id_venta::text,
    v_venta.registrada_en, v_venta.registrada_por
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER consumos_fifo_venta_lote_trazabilidad
AFTER INSERT ON public.consumos_fifo_venta
FOR EACH ROW EXECUTE FUNCTION public.registrar_trazabilidad_venta_lote();

CREATE OR REPLACE VIEW public.lotes_trazabilidad_bodega
WITH (security_barrier = true)
AS
SELECT l.id_empresa, l.id_lote, COALESCE(stock.id_sucursal, l.id_sucursal) AS id_sucursal,
  l.id_producto, l.codigo_lote,
  l.lote_proveedor, l.fecha_vencimiento, l.estado_revision,
  l.revision_detalles, l.revisado_en, p.sku, p.nombre AS producto,
  p.codigo_barras AS codigo_barras_producto,
  r.numero AS numero_recepcion, r.documento_proveedor,
  r.recibida_en, r.id_orden_compra, pr.nombre AS proveedor,
  d.costo_unitario, d.cantidad_aceptada,
  (SELECT min(h.ocurrido_en)
   FROM public.historial_lotes_ubicacion h
   JOIN public.ubicaciones_bodega u
     ON u.id_empresa = h.id_empresa
    AND u.id_sucursal = h.id_sucursal
    AND u.id_ubicacion = h.id_ubicacion_destino
   WHERE h.id_empresa = l.id_empresa AND h.id_lote = l.id_lote
     AND h.tipo_evento IN ('RECEPCION', 'TRASLADO')
     AND public.puede_ver_bodega_sucursal(h.id_empresa, h.id_sucursal)
     AND u.tipo_area = 'PICKING') AS fecha_area_venta,
  COALESCE(stock.cantidad_actual, 0)::numeric(14,3) AS cantidad_actual,
  stock.ubicaciones_actuales
FROM public.lotes_inventario l
JOIN public.productos p
  ON p.id_empresa = l.id_empresa AND p.id_producto = l.id_producto
JOIN public.recepciones_compra r
  ON r.id_empresa = l.id_empresa AND r.id_recepcion = l.id_recepcion
JOIN public.ordenes_compra o
  ON o.id_empresa = r.id_empresa AND o.id_orden_compra = r.id_orden_compra
JOIN public.proveedores pr
  ON pr.id_empresa = o.id_empresa AND pr.id_proveedor = o.id_proveedor
JOIN public.detalles_recepcion_compra d
  ON d.id_empresa = l.id_empresa AND d.id_detalle_recepcion = l.id_detalle_recepcion
LEFT JOIN LATERAL (
  SELECT f.id_sucursal,
    sum(f.cantidad_disponible)::numeric(14,3) AS cantidad_actual,
    jsonb_agg(jsonb_build_object(
      'id_ubicacion', f.id_ubicacion,
      'codigo', u.codigo,
      'nombre', u.nombre,
      'tipo_area', u.tipo_area,
      'cantidad', f.cantidad_disponible
    ) ORDER BY u.codigo) FILTER (WHERE f.cantidad_disponible > 0) AS ubicaciones_actuales
  FROM public.capas_inventario_fifo f
  JOIN public.ubicaciones_bodega u
    ON u.id_empresa = f.id_empresa
   AND u.id_sucursal = f.id_sucursal
   AND u.id_ubicacion = f.id_ubicacion
  WHERE f.id_empresa = l.id_empresa AND f.id_lote = l.id_lote
    AND public.puede_ver_bodega_sucursal(f.id_empresa, f.id_sucursal)
  GROUP BY f.id_sucursal
) stock ON true
WHERE public.puede_ver_bodega_sucursal(
  l.id_empresa, COALESCE(stock.id_sucursal, l.id_sucursal)
);

GRANT SELECT ON public.lotes_trazabilidad_bodega TO authenticated;

CREATE OR REPLACE VIEW public.historial_lotes_trazabilidad
WITH (security_invoker = true)
AS
SELECT h.id_empresa, h.id_lote, l.codigo_lote, h.id_sucursal,
  h.tipo_evento, h.id_ubicacion_origen, uo.codigo AS ubicacion_origen,
  h.id_ubicacion_destino, ud.codigo AS ubicacion_destino,
  h.cantidad, h.documento_tipo, h.documento_id, h.ocurrido_en
FROM public.historial_lotes_ubicacion h
JOIN public.lotes_inventario l
  ON l.id_empresa = h.id_empresa AND l.id_lote = h.id_lote
LEFT JOIN public.ubicaciones_bodega uo
  ON uo.id_empresa = h.id_empresa AND uo.id_sucursal = h.id_sucursal_origen
 AND uo.id_ubicacion = h.id_ubicacion_origen
LEFT JOIN public.ubicaciones_bodega ud
  ON ud.id_empresa = h.id_empresa AND ud.id_sucursal = h.id_sucursal
 AND ud.id_ubicacion = h.id_ubicacion_destino;
GRANT SELECT ON public.historial_lotes_trazabilidad TO authenticated;

CREATE OR REPLACE VIEW public.catalogo_web_productos
WITH (security_barrier = true)
AS
SELECT p.id_empresa, p.id_producto, p.sku, p.nombre, p.descripcion,
  p.precio_venta, p.codigo_barras, p.imagen_principal,
  p.id_categoria, cp.nombre AS categoria, p.id_unidad_medida,
  um.nombre AS unidad_medida, um.abreviatura AS unidad_abreviatura,
  s.id_sucursal, s.nombre AS sucursal,
  COALESCE(sum(f.cantidad_disponible), 0)::numeric(14,3) AS cantidad_disponible
FROM public.productos p
JOIN public.empresa e ON e.id_empresa = p.id_empresa AND e.activa
JOIN public.sucursales s ON s.id_empresa = p.id_empresa AND s.activa
LEFT JOIN public.categorias_producto cp
  ON cp.id_empresa = p.id_empresa AND cp.id_categoria = p.id_categoria AND cp.activa
LEFT JOIN public.unidades_medidas um
  ON um.id_empresa = p.id_empresa AND um.id_unidad_medida = p.id_unidad_medida AND um.activa
LEFT JOIN public.capas_inventario_fifo f
  ON f.id_empresa = p.id_empresa
 AND f.id_sucursal = s.id_sucursal
 AND f.id_producto = p.id_producto
 AND f.cantidad_disponible > 0
 AND public.lote_habilitado_venta(f.id_empresa, f.id_lote)
WHERE p.activo
GROUP BY p.id_empresa, p.id_producto, p.sku, p.nombre, p.descripcion,
  p.precio_venta, p.codigo_barras, p.imagen_principal, p.id_categoria,
  cp.nombre, p.id_unidad_medida, um.nombre, um.abreviatura,
  s.id_sucursal, s.nombre;
GRANT SELECT ON public.catalogo_web_productos TO anon, authenticated;

DO $$
DECLARE
  v_definicion text;
  v_actualizada text;
  v_firma text;
  v_anterior text;
  v_nuevo text;
  v_esperado integer;
  v_encontrado integer;
  v_cambios record;
BEGIN
  FOR v_cambios IN
    SELECT * FROM (VALUES
      ('public.registrar_venta_pos(bigint,jsonb,jsonb,text,bigint)',
       'AND cf.id_ubicacion = v_id_ubicacion AND cf.id_producto = v_producto.id_producto;',
       'AND cf.id_ubicacion = v_id_ubicacion AND cf.id_producto = v_producto.id_producto' ||
         E'\n      AND public.lote_habilitado_venta(cf.id_empresa, cf.id_lote);', 1),
      ('public.registrar_venta_pos(bigint,jsonb,jsonb,text,bigint)',
       'AND cf.cantidad_disponible > 0',
       'AND cf.cantidad_disponible > 0' ||
         E'\n        AND public.lote_habilitado_venta(cf.id_empresa, cf.id_lote)', 1),
      ('public._registrar_pedido_web(integer,uuid,jsonb,jsonb,text,boolean)',
       'AND f.cantidad_disponible > 0;',
       'AND f.cantidad_disponible > 0' ||
         E'\n      AND public.lote_habilitado_venta(f.id_empresa, f.id_lote);', 1),
      ('public.crear_factura_credito_empresa(integer,bigint,bigint,jsonb,text)',
       'AND f.id_ubicacion = p_id_ubicacion AND f.id_producto = v_linea.id_producto;',
       'AND f.id_ubicacion = p_id_ubicacion AND f.id_producto = v_linea.id_producto' ||
         E'\n      AND public.lote_habilitado_venta(f.id_empresa, f.id_lote);', 1),
      ('public.crear_factura_credito_empresa(integer,bigint,bigint,jsonb,text)',
       'AND f.id_producto = v_linea.id_producto AND f.cantidad_disponible > 0',
       'AND f.id_producto = v_linea.id_producto AND f.cantidad_disponible > 0' ||
         E'\n        AND public.lote_habilitado_venta(f.id_empresa, f.id_lote)', 1)
    ) AS cambios(firma, anterior, nuevo, esperado)
  LOOP
    v_firma := v_cambios.firma;
    v_anterior := v_cambios.anterior;
    v_nuevo := v_cambios.nuevo;
    v_esperado := v_cambios.esperado;
    EXECUTE 'SELECT pg_catalog.pg_get_functiondef($1::regprocedure)'
      INTO v_definicion USING v_firma;
    v_encontrado := (
      length(v_definicion) - length(replace(v_definicion, v_anterior, ''))
    ) / length(v_anterior);
    IF v_encontrado <> v_esperado THEN
      RAISE EXCEPTION 'No se aplicó el filtro de lotes a %: se esperaban % coincidencias, se encontraron %.',
        v_firma, v_esperado, v_encontrado;
    END IF;
    v_actualizada := replace(v_definicion, v_anterior, v_nuevo);
    EXECUTE v_actualizada;
  END LOOP;
END;
$$;

COMMIT;
