BEGIN;

DO $$
DECLARE
  v_funcion regprocedure;
  v_definicion text;
  v_declaracion text := 'v_sesion record;';
  v_declaracion_corregida text := 'v_sesion public.sesiones_caja%ROWTYPE;';
BEGIN
  FOREACH v_funcion IN ARRAY ARRAY[
    'public.registrar_cobro_factura_empresa(text,jsonb,text,bigint,text)'::regprocedure,
    'public.registrar_pago_proveedor(text,jsonb,text,bigint,text)'::regprocedure
  ]
  LOOP
    v_definicion := pg_catalog.pg_get_functiondef(v_funcion);

    IF pg_catalog.length(v_definicion)
         - pg_catalog.length(pg_catalog.replace(v_definicion, v_declaracion, ''))
         <> pg_catalog.length(v_declaracion) THEN
      RAISE EXCEPTION
        'No se encontró exactamente una declaración de sesión esperada en %.',
        v_funcion;
    END IF;

    EXECUTE pg_catalog.replace(
      v_definicion,
      v_declaracion,
      v_declaracion_corregida
    );
  END LOOP;
END;
$$;

COMMIT;
