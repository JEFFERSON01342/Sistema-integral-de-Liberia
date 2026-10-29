BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_pago_proveedor(
  p_metodo_pago text,
  p_asignaciones jsonb,
  p_clave_idempotencia text,
  p_id_sesion bigint DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_id_cuenta_pago bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := (SELECT auth.uid());
  v_empresa integer;
  v_sucursal integer;
  v_zona text;
  v_fecha date;
  v_ahora timestamptz := clock_timestamp();
  v_clave text := trim(COALESCE(p_clave_idempotencia, ''));
  v_asignaciones jsonb;
  v_huella text;
  v_existente bigint;
  v_huella_existente text;
  v_id_pago bigint;
  v_id_comprobante bigint;
  v_id_periodo bigint;
  v_id_cuenta_ap bigint;
  v_id_cuenta_pago bigint;
  v_total numeric(14,2) := 0;
  v_restante numeric(14,2);
  v_aplicar_cuota numeric(14,2);
  v_item record;
  v_cuota record;
  v_sesion public.sesiones_caja%ROWTYPE;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'El método de pago no es válido.';
  END IF;
  IF char_length(v_clave) NOT BETWEEN 1 AND 128
     OR char_length(COALESCE(trim(p_referencia), '')) > 120 THEN
    RAISE EXCEPTION 'La clave de idempotencia o referencia no es válida.';
  END IF;
  IF jsonb_typeof(p_asignaciones) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_asignaciones) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'El pago debe aplicarse a entre 1 y 100 cuentas por pagar.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_asignaciones)
      x(id_cuenta_por_pagar bigint, monto numeric)
    WHERE x.id_cuenta_por_pagar IS NULL OR x.monto IS NULL
       OR x.monto <= 0 OR x.monto <> round(x.monto, 2)
  ) OR EXISTS (
    SELECT id_cuenta_por_pagar
    FROM jsonb_to_recordset(p_asignaciones)
      x(id_cuenta_por_pagar bigint, monto numeric)
    GROUP BY id_cuenta_por_pagar HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada cuenta por pagar debe tener un monto positivo y no repetirse.';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'id_cuenta_por_pagar', x.id_cuenta_por_pagar, 'monto', x.monto
  ) ORDER BY x.id_cuenta_por_pagar), COALESCE(sum(x.monto), 0)::numeric(14,2)
  INTO v_asignaciones, v_total
  FROM jsonb_to_recordset(p_asignaciones)
    x(id_cuenta_por_pagar bigint, monto numeric);
  v_huella := md5(p_metodo_pago || '|' || v_asignaciones::text || '|'
    || COALESCE(p_id_sesion::text, '') || '|' || COALESCE(trim(p_referencia), '')
    || CASE WHEN p_id_cuenta_pago IS NULL THEN ''
      ELSE '|' || p_id_cuenta_pago::text END);

  SELECT c.id_empresa, c.id_sucursal, e.zona_horaria
  INTO v_empresa, v_sucursal, v_zona
  FROM public.cuentas_por_pagar c
  JOIN public.empresa e ON e.id_empresa = c.id_empresa AND e.activa
  JOIN jsonb_to_recordset(v_asignaciones)
    x(id_cuenta_por_pagar bigint, monto numeric)
    ON x.id_cuenta_por_pagar = c.id_cuenta_por_pagar
  ORDER BY c.id_cuenta_por_pagar LIMIT 1;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'No se encontró una cuenta por pagar válida.'; END IF;
  IF NOT (SELECT public.puede_operar_caja(v_empresa, v_sucursal, true)) THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar pagos a proveedores.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.cuentas_por_pagar c
    JOIN jsonb_to_recordset(v_asignaciones)
      x(id_cuenta_por_pagar bigint, monto numeric)
      ON x.id_cuenta_por_pagar = c.id_cuenta_por_pagar
    WHERE c.id_empresa <> v_empresa OR c.id_sucursal <> v_sucursal
  ) THEN
    RAISE EXCEPTION 'Un pago solo puede aplicar cuentas por pagar de la misma sucursal.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('PPR:' || v_empresa::text || ':' || v_clave, 0)
  );
  SELECT p.id_pago_proveedor, p.huella_solicitud
  INTO v_existente, v_huella_existente
  FROM public.pagos_proveedor p
  WHERE p.id_empresa = v_empresa AND p.clave_idempotencia = v_clave;
  IF v_existente IS NOT NULL THEN
    IF v_huella_existente IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se usó con datos distintos.';
    END IF;
    RETURN v_existente;
  END IF;

  PERFORM c.id_cuenta_por_pagar
  FROM public.cuentas_por_pagar c
  JOIN jsonb_to_recordset(v_asignaciones)
    x(id_cuenta_por_pagar bigint, monto numeric)
    ON x.id_cuenta_por_pagar = c.id_cuenta_por_pagar
  WHERE c.id_empresa = v_empresa
  ORDER BY c.id_cuenta_por_pagar
  FOR UPDATE OF c;

  FOR v_item IN
    SELECT c.id_cuenta_por_pagar, c.total,
           COALESCE(sum(a.monto), 0)::numeric(14,2) AS pagado,
           x.monto AS aplicar
    FROM jsonb_to_recordset(v_asignaciones)
      x(id_cuenta_por_pagar bigint, monto numeric)
    JOIN public.cuentas_por_pagar c
      ON c.id_empresa = v_empresa
     AND c.id_cuenta_por_pagar = x.id_cuenta_por_pagar
    LEFT JOIN public.aplicaciones_pago_proveedor a
      ON a.id_empresa = c.id_empresa
     AND a.id_cuenta_por_pagar = c.id_cuenta_por_pagar
    GROUP BY c.id_cuenta_por_pagar, c.total, x.monto
    ORDER BY c.id_cuenta_por_pagar
  LOOP
    IF v_item.pagado + v_item.aplicar > v_item.total THEN
      RAISE EXCEPTION 'El pago excede el saldo pendiente de la cuenta %.',
        v_item.id_cuenta_por_pagar;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_to_recordset(v_asignaciones)
        x(id_cuenta_por_pagar bigint, monto numeric))
     <> (SELECT count(*) FROM public.cuentas_por_pagar c
        JOIN jsonb_to_recordset(v_asignaciones)
          x(id_cuenta_por_pagar bigint, monto numeric)
          ON x.id_cuenta_por_pagar = c.id_cuenta_por_pagar
        WHERE c.id_empresa = v_empresa) THEN
    RAISE EXCEPTION 'Una o más cuentas por pagar no pertenecen a la empresa.';
  END IF;

  v_fecha := (v_ahora AT TIME ZONE v_zona)::date;
  SELECT pc.id_periodo INTO v_id_periodo
  FROM public.periodos_contables pc
  WHERE pc.id_empresa = v_empresa AND pc.estado = 'ABIERTO'
    AND v_fecha BETWEEN pc.fecha_inicio AND pc.fecha_fin
  FOR SHARE;
  IF v_id_periodo IS NULL THEN
    RAISE EXCEPTION 'No hay un período contable abierto para la fecha del pago.';
  END IF;
  IF p_metodo_pago = 'EFECTIVO' THEN
    SELECT sc.*
    INTO v_sesion
    FROM public.sesiones_caja sc
    WHERE sc.id_sesion = p_id_sesion
    FOR UPDATE;
    IF v_sesion.id_empresa IS DISTINCT FROM v_empresa
       OR v_sesion.id_sucursal IS DISTINCT FROM v_sucursal
       OR v_sesion.estado IS DISTINCT FROM 'ABIERTA'
       OR NOT (SELECT public.puede_operar_caja(v_empresa, v_sucursal, true)) THEN
      RAISE EXCEPTION 'El pago en efectivo requiere una sesión abierta autorizada de la sucursal.';
    END IF;
  ELSIF p_id_sesion IS NOT NULL THEN
    RAISE EXCEPTION 'No se debe asociar una sesión de caja a un pago por transferencia.';
  END IF;

  SELECT id_cuenta INTO v_id_cuenta_ap
  FROM public.cuentas_contables
  WHERE id_empresa = v_empresa AND codigo = '2.1.01'
    AND activa AND NOT es_grupo AND permite_movimientos;
  IF p_metodo_pago = 'EFECTIVO' THEN
    SELECT id_cuenta INTO v_id_cuenta_pago
    FROM public.cuentas_contables
    WHERE id_empresa = v_empresa AND codigo = '1.1.02'
      AND activa AND NOT es_grupo AND permite_movimientos;
    IF p_id_cuenta_pago IS NOT NULL
       AND p_id_cuenta_pago IS DISTINCT FROM v_id_cuenta_pago THEN
      RAISE EXCEPTION 'Los pagos en efectivo deben usar la cuenta de caja configurada.';
    END IF;
  ELSE
    IF p_id_cuenta_pago IS NULL THEN
      SELECT id_cuenta INTO v_id_cuenta_pago
      FROM public.cuentas_contables
      WHERE id_empresa = v_empresa AND codigo = '1.1.04'
        AND activa AND NOT es_grupo AND permite_movimientos;
    ELSE
      SELECT id_cuenta INTO v_id_cuenta_pago
      FROM public.cuentas_contables
      WHERE id_empresa = v_empresa AND id_cuenta = p_id_cuenta_pago
        AND (codigo = '1.1.04' OR codigo LIKE '1.1.04.%')
        AND activa AND NOT es_grupo AND permite_movimientos;
      IF v_id_cuenta_pago IS NULL THEN
        RAISE EXCEPTION 'La cuenta seleccionada debe ser una cuenta bancaria activa de la empresa.';
      END IF;
    END IF;
  END IF;
  IF v_id_cuenta_ap IS NULL OR v_id_cuenta_pago IS NULL THEN
    RAISE EXCEPTION 'Falta configurar la cuenta de proveedores por pagar o del medio de pago.';
  END IF;

  v_id_pago := nextval(
    pg_get_serial_sequence('public.pagos_proveedor', 'id_pago_proveedor')::regclass
  );
  v_id_comprobante := public._registrar_asiento_operativo(
    v_empresa, v_sucursal, v_fecha, 'PAGO',
    'Pago a proveedor PP-' || v_id_pago::text,
    'PAGO_PROVEEDOR', v_clave,
    jsonb_build_array(
      jsonb_build_object('id_cuenta', v_id_cuenta_ap, 'debe', v_total, 'haber', 0,
        'descripcion', 'Abono a proveedores por pagar'),
      jsonb_build_object('id_cuenta', v_id_cuenta_pago, 'debe', 0, 'haber', v_total,
        'descripcion', 'Pago a proveedor por ' || p_metodo_pago)
    )
  );
  INSERT INTO public.pagos_proveedor (
    id_pago_proveedor, id_empresa, id_sucursal, id_caja, id_sesion, metodo_pago,
    referencia, fecha_operativa, monto, clave_idempotencia, huella_solicitud,
    id_comprobante, registrado_por, id_cuenta_pago
  )
  VALUES (
    v_id_pago, v_empresa, v_sucursal,
    CASE WHEN p_metodo_pago = 'EFECTIVO' THEN v_sesion.id_caja END,
    p_id_sesion, p_metodo_pago,
    NULLIF(trim(p_referencia), ''), v_fecha, v_total, v_clave, v_huella,
    v_id_comprobante, v_usuario, v_id_cuenta_pago
  );

  INSERT INTO public.aplicaciones_pago_proveedor (
    id_empresa, id_pago_proveedor, id_cuenta_por_pagar, monto
  )
  SELECT v_empresa, v_id_pago, x.id_cuenta_por_pagar, x.monto
  FROM jsonb_to_recordset(v_asignaciones)
    x(id_cuenta_por_pagar bigint, monto numeric);

  FOR v_item IN
    SELECT x.id_cuenta_por_pagar, x.monto
    FROM jsonb_to_recordset(v_asignaciones)
      x(id_cuenta_por_pagar bigint, monto numeric)
    ORDER BY x.id_cuenta_por_pagar
  LOOP
    v_restante := v_item.monto;
    FOR v_cuota IN
      SELECT q.id_cuota, q.monto - COALESCE(sum(a.monto), 0) AS saldo
      FROM public.cuotas_cuentas_por_pagar q
      LEFT JOIN public.aplicaciones_pago_cuota_proveedor a
        ON a.id_empresa = q.id_empresa AND a.id_cuota = q.id_cuota
      WHERE q.id_empresa = v_empresa
        AND q.id_cuenta_por_pagar = v_item.id_cuenta_por_pagar
      GROUP BY q.id_cuota, q.numero_cuota, q.fecha_vencimiento, q.monto
      HAVING q.monto > COALESCE(sum(a.monto), 0)
      ORDER BY q.fecha_vencimiento, q.numero_cuota
    LOOP
      EXIT WHEN v_restante = 0;
      v_aplicar_cuota := LEAST(v_restante, v_cuota.saldo);
      INSERT INTO public.aplicaciones_pago_cuota_proveedor (
        id_empresa, id_pago_proveedor, id_cuenta_por_pagar, id_cuota, monto
      )
      VALUES (
        v_empresa, v_id_pago, v_item.id_cuenta_por_pagar,
        v_cuota.id_cuota, v_aplicar_cuota
      );
      v_restante := v_restante - v_aplicar_cuota;
    END LOOP;
    IF v_restante <> 0 THEN
      RAISE EXCEPTION 'No se pudo distribuir el pago entre las cuotas pendientes de la cuenta %.',
        v_item.id_cuenta_por_pagar;
    END IF;
  END LOOP;

  IF p_metodo_pago = 'EFECTIVO' THEN
    INSERT INTO public.movimientos_caja (
      id_empresa, id_sucursal, id_caja, id_sesion, tipo, monto,
      descripcion, fecha_operativa, registrado_en, registrado_por,
      origen_tipo, origen_id, idempotencia_key
    )
    VALUES (
      v_empresa, v_sucursal, v_sesion.id_caja, p_id_sesion, 'RETIRO',
      v_total, 'Pago a proveedor PP-' || v_id_pago,
      v_fecha, v_ahora, v_usuario, 'PAGO_PROVEEDOR',
      v_id_pago::text, 'PAGO_PROVEEDOR:' || v_id_pago::text
    );
  END IF;
  RETURN v_id_pago;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_proveedor(text, jsonb, text, bigint, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor(text, jsonb, text, bigint, text, bigint) TO authenticated;

COMMIT;
