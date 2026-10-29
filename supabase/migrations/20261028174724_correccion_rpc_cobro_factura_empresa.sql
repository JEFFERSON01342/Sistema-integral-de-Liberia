BEGIN;

DO $$
DECLARE
  v_definicion text;
  v_alias_incorrecto text := 'SELECT c.id_empresa, c.id_sucursal, e.zona_horaria';
BEGIN
  v_definicion := pg_catalog.pg_get_functiondef(
    'public.registrar_cobro_factura_empresa(text,jsonb,text,bigint,text)'::regprocedure
  );

  IF pg_catalog.length(v_definicion)
       - pg_catalog.length(pg_catalog.replace(v_definicion, v_alias_incorrecto, ''))
       <> pg_catalog.length(v_alias_incorrecto) THEN
    RAISE EXCEPTION
      'No se encontró exactamente una referencia al alias defectuoso en registrar_cobro_factura_empresa.';
  END IF;

  EXECUTE pg_catalog.replace(
    v_definicion,
    v_alias_incorrecto,
    'SELECT v.id_empresa, v.id_sucursal, e.zona_horaria'
  );
END;
$$;

COMMIT;
