-- Fase 4: catálogo contable inicial para la papelería.
-- Crea cuentas de configuración; no registra saldos, impuestos ni movimientos.

BEGIN;

DO $$
DECLARE
  v_id_empresa integer;
BEGIN
  SELECT e.id_empresa INTO v_id_empresa
  FROM public.empresa AS e
  WHERE e.nombre = 'Librería Lisjuashde';

  IF v_id_empresa IS NULL THEN
    RAISE EXCEPTION 'No se encontró la empresa Librería Lisjuashde.';
  END IF;

  IF (SELECT count(*) FROM public.empresa WHERE nombre = 'Librería Lisjuashde') <> 1 THEN
    RAISE EXCEPTION 'Se esperaba una sola empresa Librería Lisjuashde.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cuentas_contables WHERE id_empresa = v_id_empresa
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene cuentas contables; se cancela para evitar mezclar catálogos.';
  END IF;

  INSERT INTO public.cuentas_contables
    (id_empresa, codigo, nombre, naturaleza, saldo_normal, es_grupo, permite_movimientos)
  VALUES
    (v_id_empresa, '1', 'ACTIVOS', 'ACTIVO', 'DEBE', true, false),
    (v_id_empresa, '2', 'PASIVOS', 'PASIVO', 'HABER', true, false),
    (v_id_empresa, '3', 'PATRIMONIO', 'PATRIMONIO', 'HABER', true, false),
    (v_id_empresa, '4', 'INGRESOS', 'INGRESO', 'HABER', true, false),
    (v_id_empresa, '5', 'COSTOS', 'COSTO', 'DEBE', true, false),
    (v_id_empresa, '6', 'GASTOS', 'GASTO', 'DEBE', true, false);

  INSERT INTO public.cuentas_contables
    (id_empresa, codigo, nombre, naturaleza, saldo_normal, id_cuenta_padre, es_grupo, permite_movimientos)
  SELECT v_id_empresa, x.codigo, x.nombre, x.naturaleza, x.saldo_normal,
         p.id_cuenta, true, false
  FROM (VALUES
    ('1.1', 'Activos corrientes', 'ACTIVO', 'DEBE', '1'),
    ('1.2', 'Activos no corrientes', 'ACTIVO', 'DEBE', '1'),
    ('1.3', 'Depreciación acumulada', 'ACTIVO', 'HABER', '1'),
    ('2.1', 'Pasivos corrientes', 'PASIVO', 'HABER', '2'),
    ('3.1', 'Capital y patrimonio', 'PATRIMONIO', 'HABER', '3'),
    ('3.2', 'Resultados acumulados', 'PATRIMONIO', 'HABER', '3'),
    ('4.1', 'Ingresos operativos', 'INGRESO', 'HABER', '4'),
    ('4.2', 'Devoluciones y descuentos sobre ventas', 'INGRESO', 'DEBE', '4'),
    ('5.1', 'Costo de ventas', 'COSTO', 'DEBE', '5'),
    ('6.1', 'Gastos de personal y recursos humanos', 'GASTO', 'DEBE', '6'),
    ('6.2', 'Gastos de ocupación y servicios', 'GASTO', 'DEBE', '6'),
    ('6.3', 'Gastos de venta y distribución', 'GASTO', 'DEBE', '6'),
    ('6.4', 'Gastos de administración', 'GASTO', 'DEBE', '6'),
    ('6.5', 'Depreciación y otros gastos operativos', 'GASTO', 'DEBE', '6')
  ) AS x(codigo, nombre, naturaleza, saldo_normal, codigo_padre)
  JOIN public.cuentas_contables AS p
    ON p.id_empresa = v_id_empresa AND p.codigo = x.codigo_padre;

  INSERT INTO public.cuentas_contables
    (id_empresa, codigo, nombre, naturaleza, saldo_normal, id_cuenta_padre, es_grupo, permite_movimientos)
  SELECT v_id_empresa, x.codigo, x.nombre, x.naturaleza, x.saldo_normal,
         p.id_cuenta, false, true
  FROM (VALUES
    ('1.1.01', 'Caja general', 'ACTIVO', 'DEBE', '1.1'),
    ('1.1.02', 'Fondos de caja POS', 'ACTIVO', 'DEBE', '1.1'),
    ('1.1.03', 'Caja chica', 'ACTIVO', 'DEBE', '1.1'),
    ('1.1.04', 'Bancos', 'ACTIVO', 'DEBE', '1.1'),
    ('1.1.05', 'Cuentas por cobrar a clientes', 'ACTIVO', 'DEBE', '1.1'),
    ('1.1.06', 'Inventario de mercadería', 'ACTIVO', 'DEBE', '1.1'),
    ('1.1.07', 'Impuestos acreditables (configurable)', 'ACTIVO', 'DEBE', '1.1'),
    ('1.2.01', 'Mobiliario y equipo de tienda', 'ACTIVO', 'DEBE', '1.2'),
    ('1.2.02', 'Equipo de cómputo y POS', 'ACTIVO', 'DEBE', '1.2'),
    ('1.2.03', 'Equipo de bodega y transporte', 'ACTIVO', 'DEBE', '1.2'),
    ('1.3.01', 'Depreciación acumulada de mobiliario', 'ACTIVO', 'HABER', '1.3'),
    ('1.3.02', 'Depreciación acumulada de equipo', 'ACTIVO', 'HABER', '1.3'),
    ('2.1.01', 'Proveedores por pagar', 'PASIVO', 'HABER', '2.1'),
    ('2.1.02', 'Salarios por pagar', 'PASIVO', 'HABER', '2.1'),
    ('2.1.03', 'Obligaciones laborales por pagar', 'PASIVO', 'HABER', '2.1'),
    ('2.1.04', 'Impuestos por pagar (configurable)', 'PASIVO', 'HABER', '2.1'),
    ('2.1.05', 'Retenciones por pagar (configurable)', 'PASIVO', 'HABER', '2.1'),
    ('3.1.01', 'Capital aportado', 'PATRIMONIO', 'HABER', '3.1'),
    ('3.2.01', 'Resultados de períodos anteriores', 'PATRIMONIO', 'HABER', '3.2'),
    ('3.2.02', 'Resultado del período', 'PATRIMONIO', 'HABER', '3.2'),
    ('4.1.01', 'Ventas de productos', 'INGRESO', 'HABER', '4.1'),
    ('4.1.02', 'Servicios de impresión y copiado', 'INGRESO', 'HABER', '4.1'),
    ('4.1.03', 'Otros ingresos operativos', 'INGRESO', 'HABER', '4.1'),
    ('4.2.01', 'Devoluciones sobre ventas', 'INGRESO', 'DEBE', '4.2'),
    ('4.2.02', 'Descuentos sobre ventas', 'INGRESO', 'DEBE', '4.2'),
    ('5.1.01', 'Costo de mercadería vendida (FIFO)', 'COSTO', 'DEBE', '5.1'),
    ('5.1.02', 'Costo de servicios de impresión', 'COSTO', 'DEBE', '5.1'),
    ('6.1.01', 'Salarios y sueldos', 'GASTO', 'DEBE', '6.1'),
    ('6.1.02', 'Aportes patronales y cargas laborales', 'GASTO', 'DEBE', '6.1'),
    ('6.1.03', 'Prestaciones y beneficios laborales', 'GASTO', 'DEBE', '6.1'),
    ('6.1.04', 'Capacitación de personal', 'GASTO', 'DEBE', '6.1'),
    ('6.2.01', 'Alquiler de local', 'GASTO', 'DEBE', '6.2'),
    ('6.2.02', 'Agua y alcantarillado', 'GASTO', 'DEBE', '6.2'),
    ('6.2.03', 'Energía eléctrica', 'GASTO', 'DEBE', '6.2'),
    ('6.2.04', 'Internet y telefonía', 'GASTO', 'DEBE', '6.2'),
    ('6.3.01', 'Combustible para reparto y transporte', 'GASTO', 'DEBE', '6.3'),
    ('6.3.02', 'Fletes y entregas de venta', 'GASTO', 'DEBE', '6.3'),
    ('6.3.03', 'Publicidad y promociones', 'GASTO', 'DEBE', '6.3'),
    ('6.4.01', 'Papelería y útiles de uso interno', 'GASTO', 'DEBE', '6.4'),
    ('6.4.02', 'Comisiones y cargos bancarios', 'GASTO', 'DEBE', '6.4'),
    ('6.4.03', 'Honorarios profesionales', 'GASTO', 'DEBE', '6.4'),
    ('6.4.04', 'Mantenimiento y reparaciones', 'GASTO', 'DEBE', '6.4'),
    ('6.4.05', 'Limpieza y seguridad', 'GASTO', 'DEBE', '6.4'),
    ('6.5.01', 'Gasto por depreciación', 'GASTO', 'DEBE', '6.5'),
    ('6.5.02', 'Mermas y faltantes de inventario', 'GASTO', 'DEBE', '6.5'),
    ('6.5.03', 'Otros gastos operativos', 'GASTO', 'DEBE', '6.5')
  ) AS x(codigo, nombre, naturaleza, saldo_normal, codigo_padre)
  JOIN public.cuentas_contables AS p
    ON p.id_empresa = v_id_empresa AND p.codigo = x.codigo_padre;
END;
$$;

COMMIT;
