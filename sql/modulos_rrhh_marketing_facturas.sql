-- ============================================================
-- Módulos: Recursos Humanos / Nómina, Marketing, Facturas, Códigos de barra
-- Aditivo y seguro (IF NOT EXISTS). RLS con patrón es_staff().
-- ============================================================

-- ---------- NÓMINA ----------
CREATE TABLE IF NOT EXISTS nomina_periodos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa INT NOT NULL REFERENCES empresa(id_empresa),
  id_sucursal INT REFERENCES sucursales(id),
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  tipo TEXT DEFAULT 'mensual',
  estado TEXT DEFAULT 'borrador',
  total_bruto DECIMAL(18,2) DEFAULT 0,
  total_deducciones DECIMAL(18,2) DEFAULT 0,
  total_neto DECIMAL(18,2) DEFAULT 0,
  total_costo_empresa DECIMAL(18,2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nomina_detalle (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_periodo BIGINT REFERENCES nomina_periodos(id) ON DELETE CASCADE,
  id_empleado BIGINT REFERENCES empleados(id_empleado),
  salario_bruto DECIMAL(18,2) NOT NULL,
  inss_laboral DECIMAL(18,2) DEFAULT 0,
  ir_mensual DECIMAL(18,2) DEFAULT 0,
  otros_descuentos DECIMAL(18,2) DEFAULT 0,
  otros_ingresos DECIMAL(18,2) DEFAULT 0,
  salario_neto DECIMAL(18,2) DEFAULT 0,
  inss_patronal DECIMAL(18,2) DEFAULT 0,
  inatec DECIMAL(18,2) DEFAULT 0,
  aguinaldo_provisionado DECIMAL(18,2) DEFAULT 0,
  vacaciones_provisionadas DECIMAL(18,2) DEFAULT 0,
  costo_total_empresa DECIMAL(18,2) DEFAULT 0,
  pagado BOOLEAN DEFAULT false,
  fecha_pago DATE
);

ALTER TABLE nomina_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomina_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_all" ON nomina_periodos;
DROP POLICY IF EXISTS "staff_all" ON nomina_detalle;
CREATE POLICY "staff_all" ON nomina_periodos FOR ALL TO authenticated USING (es_staff()) WITH CHECK (es_staff());
CREATE POLICY "staff_all" ON nomina_detalle FOR ALL TO authenticated USING (es_staff()) WITH CHECK (es_staff());

-- ---------- MARKETING / DESCUENTOS ----------
CREATE TABLE IF NOT EXISTS descuentos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa INT NOT NULL REFERENCES empresa(id_empresa),
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  tipo TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  codigo_descuento VARCHAR(50),
  fecha_inicio DATE,
  fecha_fin DATE,
  activo BOOLEAN DEFAULT true,
  aplica_a TEXT DEFAULT 'todos',
  imagen_url TEXT,
  banner_texto TEXT,
  temporada TEXT,
  usos_maximos INT,
  usos_actuales INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS descuento_productos (
  id_descuento BIGINT REFERENCES descuentos(id) ON DELETE CASCADE,
  id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
  PRIMARY KEY (id_descuento, id_producto)
);

CREATE TABLE IF NOT EXISTS descuento_categorias (
  id_descuento BIGINT REFERENCES descuentos(id) ON DELETE CASCADE,
  id_categoria INT REFERENCES categorias_producto(id_categoria) ON DELETE CASCADE,
  PRIMARY KEY (id_descuento, id_categoria)
);

ALTER TABLE descuentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE descuento_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE descuento_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_all" ON descuentos;
DROP POLICY IF EXISTS "public_read" ON descuentos;
DROP POLICY IF EXISTS "staff_all" ON descuento_productos;
DROP POLICY IF EXISTS "staff_all" ON descuento_categorias;
CREATE POLICY "staff_all" ON descuentos FOR ALL TO authenticated USING (es_staff()) WITH CHECK (es_staff());
CREATE POLICY "public_read" ON descuentos FOR SELECT TO anon, authenticated USING (activo = true);
CREATE POLICY "staff_all" ON descuento_productos FOR ALL TO authenticated USING (es_staff()) WITH CHECK (es_staff());
CREATE POLICY "staff_all" ON descuento_categorias FOR ALL TO authenticated USING (es_staff()) WITH CHECK (es_staff());

-- ---------- FACTURAS ----------
CREATE TABLE IF NOT EXISTS facturas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_factura VARCHAR(20) NOT NULL UNIQUE,
  id_venta BIGINT,
  id_empresa INT NOT NULL,
  contenido_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_all" ON facturas;
CREATE POLICY "staff_all" ON facturas FOR ALL TO authenticated USING (es_staff()) WITH CHECK (es_staff());

-- ---------- CÓDIGOS DE BARRA ----------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(13);
