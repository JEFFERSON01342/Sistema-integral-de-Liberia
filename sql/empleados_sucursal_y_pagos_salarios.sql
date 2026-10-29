-- Cambios de estructura aplicados en producción (aditivos y reversibles)
-- 1) Asignación de sucursal a empleados (para filtrado por rol admin/gerente)
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS id_sucursal INT REFERENCES sucursales(id) ON DELETE SET NULL;

-- 2) Tabla dedicada a pagos de salario
--    (La tabla `pagos` existente NO sirve: su id_cuenta es obligatorio y apunta a
--     cuentas_por_cobrar con un trigger de cobros a clientes.)
CREATE TABLE IF NOT EXISTS pagos_salarios (
  id_pago_salario BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa      INT NOT NULL REFERENCES empresa(id_empresa) ON DELETE CASCADE,
  id_empleado     BIGINT NOT NULL REFERENCES empleados(id_empleado) ON DELETE CASCADE,
  monto           NUMERIC(18,2) NOT NULL CHECK (monto > 0),
  metodo          VARCHAR(50),
  fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
  concepto        TEXT,
  fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS con el mismo patrón que el resto de tablas del ERP
ALTER TABLE pagos_salarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_all ON pagos_salarios;
CREATE POLICY staff_all ON pagos_salarios
  FOR ALL TO authenticated
  USING (es_staff()) WITH CHECK (es_staff());

-- Reversión:
--   ALTER TABLE empleados DROP COLUMN id_sucursal;
--   DROP TABLE pagos_salarios;
