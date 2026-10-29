-- =====================================================================
-- Migración: Módulos ERP RF-08 a RF-22 (Librería Lisjuashde)
-- Crea nuevas tablas, actualiza perfiles y roles, habilita RLS.
-- EMPRESA_ID = 1 (fijo)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES: nuevos roles + columnas
-- ---------------------------------------------------------------------
-- Actualizar check de roles para soportar los 6 niveles
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol = ANY (ARRAY[
    'superadmin'::text, 'admin'::text, 'gerente'::text,
    'cajero'::text, 'despacho'::text, 'vendedor'::text, 'cliente'::text
  ]));

-- Columnas nuevas (no rompe datos existentes)
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS id_sucursal INTEGER;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

-- Actualizar es_staff para incluir los nuevos roles (permite entrar al panel)
CREATE OR REPLACE FUNCTION public.es_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid()
          AND rol IN ('superadmin','admin','gerente','cajero','despacho','vendedor')
    );
$function$;

-- ---------------------------------------------------------------------
-- 2. SUCURSALES (RF-09)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sucursales (
    id          SERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    direccion   TEXT,
    telefono    TEXT,
    estado      BOOLEAN DEFAULT true,
    id_empresa  INTEGER DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. TERMINALES POS (RF-11)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.terminales_pos (
    id           SERIAL PRIMARY KEY,
    nombre       TEXT NOT NULL,
    numero_serie TEXT,
    id_sucursal  INTEGER REFERENCES public.sucursales(id) ON DELETE SET NULL,
    estado       BOOLEAN DEFAULT true,
    id_empresa   INTEGER DEFAULT 1,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. APERTURA / CIERRE DE CAJA (RF-12)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.apertura_caja (
    id             SERIAL PRIMARY KEY,
    id_cajero      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    id_terminal    INTEGER REFERENCES public.terminales_pos(id) ON DELETE SET NULL,
    id_sucursal    INTEGER REFERENCES public.sucursales(id) ON DELETE SET NULL,
    monto_inicial  DECIMAL(14,2) DEFAULT 0,
    monto_cierre   DECIMAL(14,2),
    fecha_apertura TIMESTAMPTZ DEFAULT now(),
    fecha_cierre   TIMESTAMPTZ,
    estado         TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
    id_empresa     INTEGER DEFAULT 1,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. DEVOLUCIONES (RF-14)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devoluciones (
    id         SERIAL PRIMARY KEY,
    id_venta   INTEGER REFERENCES public.ventas(id_venta) ON DELETE SET NULL,
    id_cajero  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    motivo     TEXT,
    total      DECIMAL(14,2) DEFAULT 0,
    estado     TEXT DEFAULT 'completada',
    id_empresa INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.detalle_devoluciones (
    id              SERIAL PRIMARY KEY,
    id_devolucion   INTEGER REFERENCES public.devoluciones(id) ON DELETE CASCADE,
    id_producto     INTEGER REFERENCES public.productos(id_producto) ON DELETE SET NULL,
    cantidad        INTEGER NOT NULL DEFAULT 1,
    precio_unitario DECIMAL(14,2) DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 6. AUDITORÍA (RF-22)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auditoria (
    id            SERIAL PRIMARY KEY,
    id_usuario    UUID,
    nombre_usuario TEXT,
    operacion     TEXT,
    modulo        TEXT,
    detalle       TEXT,
    ip            TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 7. TRANSFERENCIAS ENTRE SUCURSALES (RF-08)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transferencias_sucursal (
    id                  SERIAL PRIMARY KEY,
    id_sucursal_origen  INTEGER REFERENCES public.sucursales(id) ON DELETE SET NULL,
    id_sucursal_destino INTEGER REFERENCES public.sucursales(id) ON DELETE SET NULL,
    id_usuario          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    motivo              TEXT,
    estado              TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','completada')),
    id_empresa          INTEGER DEFAULT 1,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.detalle_transferencia (
    id              SERIAL PRIMARY KEY,
    id_transferencia INTEGER REFERENCES public.transferencias_sucursal(id) ON DELETE CASCADE,
    id_producto     INTEGER REFERENCES public.productos(id_producto) ON DELETE SET NULL,
    cantidad        INTEGER NOT NULL DEFAULT 1,
    costo_unitario  DECIMAL(14,2) DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 8. RLS: habilitar y crear políticas permisivas para staff autenticado
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
    tablas TEXT[] := ARRAY[
        'sucursales','terminales_pos','apertura_caja','devoluciones',
        'detalle_devoluciones','auditoria','transferencias_sucursal',
        'detalle_transferencia'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        -- Limpiar políticas previas si existieran
        EXECUTE format('DROP POLICY IF EXISTS %I_all ON public.%I;', t, t);
        -- Política permisiva: cualquier usuario autenticado (staff) puede operar
        EXECUTE format($f$
            CREATE POLICY %I_all ON public.%I
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
        $f$, t, t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 9. Sucursal por defecto (Casa Matriz) para que exista al menos una
-- ---------------------------------------------------------------------
INSERT INTO public.sucursales (nombre, direccion, telefono, estado, id_empresa)
SELECT 'Casa Matriz', 'Sucursal principal', '', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.sucursales WHERE id_empresa = 1);
