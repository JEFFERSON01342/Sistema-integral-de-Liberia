BEGIN;

CREATE OR REPLACE FUNCTION public.validar_jerarquia_cuenta_contable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_naturaleza_padre text;
  v_padre_es_grupo boolean;
BEGIN
  IF NEW.id_cuenta_padre IS NOT NULL THEN
    SELECT c.naturaleza, c.es_grupo
    INTO v_naturaleza_padre, v_padre_es_grupo
    FROM public.cuentas_contables AS c
    WHERE c.id_empresa = NEW.id_empresa
      AND c.id_cuenta = NEW.id_cuenta_padre;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La cuenta padre no existe en esta empresa.';
    END IF;

    IF v_naturaleza_padre <> NEW.naturaleza THEN
      RAISE EXCEPTION 'La cuenta hija debe tener la misma naturaleza que su cuenta padre.';
    END IF;

    IF NOT v_padre_es_grupo THEN
      RAISE EXCEPTION 'Solo una cuenta de grupo puede tener cuentas hijas.';
    END IF;

    IF EXISTS (
      WITH RECURSIVE ancestros AS (
        SELECT c.id_cuenta, c.id_cuenta_padre, ARRAY[c.id_cuenta] AS ruta
        FROM public.cuentas_contables AS c
        WHERE c.id_empresa = NEW.id_empresa
          AND c.id_cuenta = NEW.id_cuenta_padre
        UNION ALL
        SELECT c.id_cuenta, c.id_cuenta_padre, a.ruta || c.id_cuenta
        FROM public.cuentas_contables AS c
        JOIN ancestros AS a ON c.id_cuenta = a.id_cuenta_padre
        WHERE c.id_empresa = NEW.id_empresa
          AND NOT c.id_cuenta = ANY(a.ruta)
      )
      SELECT 1 FROM ancestros WHERE id_cuenta = NEW.id_cuenta
    ) THEN
      RAISE EXCEPTION 'La jerarquía de cuentas no puede formar ciclos.';
    END IF;
  END IF;

  IF NOT NEW.es_grupo AND EXISTS (
    SELECT 1
    FROM public.cuentas_contables AS hija
    WHERE hija.id_empresa = NEW.id_empresa
      AND hija.id_cuenta_padre = NEW.id_cuenta
  ) THEN
    RAISE EXCEPTION 'Una cuenta con cuentas hijas debe permanecer como cuenta de grupo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cuentas_contables AS hija
    WHERE hija.id_empresa = NEW.id_empresa
      AND hija.id_cuenta_padre = NEW.id_cuenta
      AND hija.naturaleza <> NEW.naturaleza
  ) THEN
    RAISE EXCEPTION 'La naturaleza debe coincidir con la de todas sus cuentas hijas.';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
