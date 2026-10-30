BEGIN;

CREATE TABLE public.nomina_deducciones_adicionales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa integer NOT NULL,
  id_detalle_nomina bigint NOT NULL,
  concepto text NOT NULL CHECK (char_length(trim(concepto)) BETWEEN 1 AND 120),
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (id_empresa, id_detalle_nomina)
    REFERENCES public.nomina_detalle (id_empresa, id) ON DELETE RESTRICT
);

ALTER TABLE public.nomina_deducciones_adicionales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nomina_deducciones_adicionales
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.nomina_deducciones_adicionales TO authenticated;

CREATE POLICY nomina_deducciones_adicionales_select_rrhh
  ON public.nomina_deducciones_adicionales FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.nomina_detalle AS d
    JOIN public.nomina_periodos AS n
      ON n.id_empresa = d.id_empresa
     AND n.id = d.id_periodo
    WHERE d.id_empresa = nomina_deducciones_adicionales.id_empresa
      AND d.id = nomina_deducciones_adicionales.id_detalle_nomina
      AND (SELECT public.puede_gestionar_rrhh(n.id_empresa, n.id_sucursal))
  ));

CREATE OR REPLACE FUNCTION public.procesar_nomina_con_deducciones(
  p_datos jsonb,
  p_detalles jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id_periodo bigint;
  v_id_empresa integer;
  v_detalle record;
BEGIN
  IF p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array' THEN
    RAISE EXCEPTION 'Los detalles de nómina deben ser una lista válida.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles) AS d(
      id_empleado bigint,
      deducciones_adicionales jsonb
    )
    WHERE d.deducciones_adicionales IS NOT NULL
      AND jsonb_typeof(d.deducciones_adicionales) <> 'array'
  ) THEN
    RAISE EXCEPTION 'Las deducciones adicionales deben enviarse como una lista.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles) AS d(
      id_empleado bigint,
      deducciones_adicionales jsonb
    )
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(d.deducciones_adicionales) = 'array'
          THEN d.deducciones_adicionales
        ELSE '[]'::jsonb
      END
    ) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item -> 'concepto') <> 'string'
       OR char_length(trim(item ->> 'concepto')) NOT BETWEEN 1 AND 120
       OR CASE
         WHEN jsonb_typeof(item -> 'monto') = 'number'
           THEN (item ->> 'monto')::numeric <= 0
             OR round((item ->> 'monto')::numeric, 2) <> (item ->> 'monto')::numeric
         ELSE true
       END
  ) THEN
    RAISE EXCEPTION 'Cada deducción requiere un concepto y un monto positivo válido.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles) AS d(
      id_empleado bigint,
      otros_descuentos numeric,
      deducciones_adicionales jsonb
    )
    WHERE round(coalesce((
      SELECT sum((item ->> 'monto')::numeric)
      FROM jsonb_array_elements(
        coalesce(d.deducciones_adicionales, '[]'::jsonb)
      ) AS item
    ), 0), 2) <> round(coalesce(d.otros_descuentos, 0), 2)
  ) THEN
    RAISE EXCEPTION 'La suma de las deducciones no coincide con el total adicional del empleado.';
  END IF;

  v_id_periodo := public.procesar_nomina(p_datos, p_detalles);

  SELECT x.id_empresa
  INTO v_id_empresa
  FROM jsonb_to_record(p_datos) AS x(id_empresa integer);

  FOR v_detalle IN
    SELECT d.id_empleado, item.concepto, item.monto
    FROM jsonb_to_recordset(p_detalles) AS d(
      id_empleado bigint,
      deducciones_adicionales jsonb
    )
    CROSS JOIN LATERAL jsonb_to_recordset(
      coalesce(d.deducciones_adicionales, '[]'::jsonb)
    ) AS item(concepto text, monto numeric)
  LOOP
    INSERT INTO public.nomina_deducciones_adicionales (
      id_empresa, id_detalle_nomina, concepto, monto
    )
    SELECT
      v_id_empresa, n.id, trim(v_detalle.concepto), round(v_detalle.monto, 2)
    FROM public.nomina_detalle AS n
    WHERE n.id_empresa = v_id_empresa
      AND n.id_periodo = v_id_periodo
      AND n.id_empleado = v_detalle.id_empleado;
  END LOOP;

  RETURN v_id_periodo;
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_nomina_con_deducciones(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procesar_nomina_con_deducciones(jsonb, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
