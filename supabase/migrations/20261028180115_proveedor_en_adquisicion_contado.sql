BEGIN;

DO $$
DECLARE
  v_definicion text;
  v_bloque text := $original$IF p_id_proveedor IS NOT NULL THEN
      RAISE EXCEPTION 'En adquisiciones al contado no se debe registrar una cuenta por pagar de proveedor.';
    END IF;
    $original$;
  v_bloque_corregido text := $corregido$IF p_id_proveedor IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.proveedores p
      WHERE p.id_empresa = v_empresa
        AND p.id_proveedor = p_id_proveedor AND p.activo
    ) THEN
      RAISE EXCEPTION 'El proveedor no existe, esta inactivo o pertenece a otra empresa.';
    END IF;
    $corregido$;
BEGIN
  v_definicion := pg_catalog.pg_get_functiondef(
    'public.registrar_adquisicion_activo_fijo(integer,bigint,text,text,text,text,date,date,numeric,numeric,text,bigint,bigint,text,text,text,text)'::regprocedure
  );
  IF pg_catalog.length(v_definicion)
       - pg_catalog.length(pg_catalog.replace(v_definicion, v_bloque, ''))
       <> pg_catalog.length(v_bloque) THEN
    RAISE EXCEPTION
      'No se encontro exactamente el bloque esperado en registrar_adquisicion_activo_fijo.';
  END IF;
  EXECUTE pg_catalog.replace(v_definicion, v_bloque, v_bloque_corregido);
END;
$$;

COMMIT;
