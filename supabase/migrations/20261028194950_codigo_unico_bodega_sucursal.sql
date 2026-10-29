-- Cada bodega requiere un codigo unico dentro de su empresa.
-- El codigo incorpora el codigo de sucursal para mantener esa unicidad.

BEGIN;

CREATE OR REPLACE FUNCTION public.provisionar_sucursal_completa(
  p_id_empresa integer,
  p_codigo text,
  p_nombre text,
  p_direccion text DEFAULT NULL,
  p_telefono text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_codigo text := upper(trim(COALESCE(p_codigo, '')));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_id_sucursal integer;
  v_id_bodega bigint;
  v_id_caja bigint;
  v_ubicaciones jsonb;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT public.es_superadmin()) THEN
    RAISE EXCEPTION 'Solo un superadministrador puede crear sucursales.';
  END IF;
  IF p_id_empresa IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.empresa AS e
    WHERE e.id_empresa = p_id_empresa AND e.activa
  ) THEN
    RAISE EXCEPTION 'La empresa no existe o está inactiva.';
  END IF;
  IF v_codigo !~ '^[A-Z0-9][A-Z0-9_-]{1,19}$' THEN
    RAISE EXCEPTION 'El código debe tener de 2 a 20 caracteres: letras, números, guion o guion bajo.';
  END IF;
  IF char_length(v_nombre) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'El nombre de sucursal debe tener entre 2 y 120 caracteres.';
  END IF;

  INSERT INTO public.sucursales (
    id_empresa, codigo, nombre, direccion, telefono, es_principal, activa, creado_por
  )
  VALUES (
    p_id_empresa, v_codigo, v_nombre,
    NULLIF(trim(p_direccion), ''), NULLIF(trim(p_telefono), ''),
    false, true, v_actor
  )
  RETURNING id_sucursal INTO v_id_sucursal;

  INSERT INTO public.bodegas (
    id_empresa, id_sucursal, codigo, nombre, descripcion, activa
  )
  VALUES (
    p_id_empresa, v_id_sucursal, 'BOD-' || v_codigo,
    'Bodega principal ' || v_codigo,
    'Bodega inicial creada al provisionar la sucursal.',
    true
  )
  RETURNING id_bodega INTO v_id_bodega;

  INSERT INTO public.ubicaciones_bodega (
    id_empresa, id_sucursal, id_bodega, codigo, nombre, tipo_area
  )
  VALUES
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'REC-01', 'Recepción de mercancía', 'RECEPCION'),
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'ALM-01', 'Bodega', 'ALMACENAMIENTO'),
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'VTA-01', 'Área de ventas / exhibición', 'PICKING'),
    (p_id_empresa, v_id_sucursal, v_id_bodega, 'DES-01', 'Despacho / Entregas', 'DESPACHO');

  SELECT jsonb_agg(
    jsonb_build_object(
      'id_ubicacion', u.id_ubicacion,
      'codigo', u.codigo,
      'nombre', u.nombre,
      'tipo_area', u.tipo_area
    )
    ORDER BY u.codigo
  )
  INTO v_ubicaciones
  FROM public.ubicaciones_bodega AS u
  WHERE u.id_empresa = p_id_empresa
    AND u.id_sucursal = v_id_sucursal;

  INSERT INTO public.cajas (
    id_empresa, id_sucursal, codigo, nombre, activa
  )
  VALUES (
    p_id_empresa, v_id_sucursal, 'CAJ-01', 'Caja principal ' || v_codigo, true
  )
  RETURNING id_caja INTO v_id_caja;

  RETURN jsonb_build_object(
    'id_empresa', p_id_empresa,
    'id_sucursal', v_id_sucursal,
    'codigo', v_codigo,
    'id_bodega', v_id_bodega,
    'id_caja', v_id_caja,
    'ubicaciones', COALESCE(v_ubicaciones, '[]'::jsonb)
  );
END;
$$;

COMMIT;
