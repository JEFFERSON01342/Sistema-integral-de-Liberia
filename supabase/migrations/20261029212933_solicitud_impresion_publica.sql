BEGIN;

REVOKE INSERT ON public.trabajos_impresion FROM anon, authenticated;
REVOKE USAGE, SELECT ON SEQUENCE public.trabajos_impresion_id_trabajo_seq
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_trabajo_impresion(
  p_id_empresa integer,
  p_id_sucursal integer,
  p_nombre_cliente text,
  p_telefono text,
  p_archivo_nombre text,
  p_storage_path text,
  p_modo_color text,
  p_copias integer,
  p_tamano_papel text,
  p_notas text DEFAULT NULL
)
RETURNS TABLE (id_trabajo bigint, numero_orden text, precio_estimado numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
  v_numero text;
  v_precio numeric(14,2);
BEGIN
  INSERT INTO public.trabajos_impresion (
    id_empresa, id_sucursal, numero_orden, nombre_cliente, telefono,
    archivo_nombre, storage_path, modo_color, copias, tamano_papel,
    notas, precio_estimado
  )
  VALUES (
    p_id_empresa, p_id_sucursal, 'TMP-' || gen_random_uuid()::text,
    p_nombre_cliente, p_telefono, p_archivo_nombre, p_storage_path,
    p_modo_color, p_copias, p_tamano_papel, nullif(trim(p_notas), ''), 1
  )
  RETURNING trabajos_impresion.id_trabajo,
            trabajos_impresion.numero_orden,
            trabajos_impresion.precio_estimado
  INTO v_id, v_numero, v_precio;

  RETURN QUERY SELECT v_id, v_numero, v_precio;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_trabajo_impresion(
  integer, integer, text, text, text, text, text, integer, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.solicitar_trabajo_impresion(
  integer, integer, text, text, text, text, text, integer, text, text
) TO anon, authenticated;

COMMIT;
