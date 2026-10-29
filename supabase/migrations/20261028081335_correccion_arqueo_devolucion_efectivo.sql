-- Fase 12: las devoluciones y anulaciones en efectivo reducen el saldo esperado.
-- Esta migración no crea datos operativos; solo corrige el cálculo del arqueo.

BEGIN;

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
  v_efectivo_esperado numeric(14, 2);
  v_diferencia numeric(14, 2);
  v_motivo text := NULLIF(trim(p_motivo), '');
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para cerrar una caja.';
  END IF;
  IF p_efectivo_contado IS NULL
     OR p_efectivo_contado < 0
     OR p_efectivo_contado <> round(p_efectivo_contado, 2) THEN
    RAISE EXCEPTION 'El efectivo contado debe ser cero o un monto positivo con máximo dos decimales.';
  END IF;

  SELECT s.id_empresa, s.id_sucursal, s.estado, s.zona_horaria
  INTO v_empresa, v_sucursal, v_estado, v_zona_horaria
  FROM public.sesiones_caja AS s
  WHERE s.id_sesion = p_id_sesion
  FOR UPDATE;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'La sesión de caja no existe.';
  END IF;
  IF NOT (
    SELECT public.puede_operar_caja(v_empresa, v_sucursal, p_excepcional)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar esta sesión de caja.';
  END IF;
  IF v_estado <> 'ABIERTA' THEN
    RAISE EXCEPTION 'La sesión ya está cerrada.';
  END IF;
  IF p_excepcional AND char_length(COALESCE(v_motivo, '')) < 3 THEN
    RAISE EXCEPTION 'El cierre excepcional requiere un motivo de al menos tres caracteres.';
  END IF;

  SELECT COALESCE(sum(
    CASE
      WHEN mc.tipo IN ('APERTURA', 'INGRESO', 'VENTA_EFECTIVO') THEN mc.monto
      ELSE -mc.monto
    END
  ), 0)::numeric(14, 2)
  INTO v_efectivo_esperado
  FROM public.movimientos_caja AS mc
  WHERE mc.id_sesion = p_id_sesion;

  v_diferencia := p_efectivo_contado - v_efectivo_esperado;
  IF v_diferencia <> 0 AND char_length(COALESCE(v_motivo, '')) < 3 THEN
    RAISE EXCEPTION 'La diferencia de caja requiere un motivo de al menos tres caracteres.';
  END IF;

  v_fecha_operativa := (v_ahora AT TIME ZONE v_zona_horaria)::date;
  UPDATE public.sesiones_caja
  SET estado = 'CERRADA',
      fecha_cierre_operativa = v_fecha_operativa,
      efectivo_esperado_cierre = v_efectivo_esperado,
      efectivo_contado_cierre = p_efectivo_contado,
      diferencia_cierre = v_diferencia,
      tipo_cierre = CASE WHEN p_excepcional THEN 'EXCEPCIONAL' ELSE 'NORMAL' END,
      motivo_cierre = v_motivo,
      cerrada_por = v_usuario,
      cerrada_en = v_ahora
  WHERE id_sesion = p_id_sesion;
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_sesion_caja_interno(bigint, numeric, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
