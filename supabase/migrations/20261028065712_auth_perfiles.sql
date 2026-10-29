-- Fase 1: perfiles vinculados a Supabase Auth.
-- Ejecutar solo en el proyecto NUEVO de Supabase.

BEGIN;

CREATE TABLE public.perfiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre_completo text,
  email text,
  telefono text,
  rol text NOT NULL DEFAULT 'cliente'
    CHECK (rol IN ('superadmin', 'admin', 'gerente', 'cajero', 'despacho', 'vendedor', 'cliente')),
  id_empresa integer,
  id_sucursal integer,
  activo boolean NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.es_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p.rol IN ('superadmin', 'admin', 'gerente', 'cajero', 'despacho', 'vendedor')
  );
$$;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p.rol IN ('superadmin', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.es_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.es_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.crear_perfil_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre_completo, email, telefono, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre_completo', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data ->> 'telefono',
    'cliente'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_perfil_auth() FROM PUBLIC;

CREATE TRIGGER al_crear_usuario_auth
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.crear_perfil_auth();

CREATE OR REPLACE FUNCTION public.actualizar_perfil_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER actualizar_perfil_updated_at
BEFORE UPDATE ON public.perfiles
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_perfil_updated_at();

REVOKE ALL ON TABLE public.perfiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.perfiles TO authenticated;
GRANT UPDATE (nombre_completo, telefono, avatar_url)
  ON TABLE public.perfiles TO authenticated;

CREATE POLICY perfil_select_propio_o_staff
ON public.perfiles
FOR SELECT
TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT public.es_staff()));

CREATE POLICY perfil_update_propio
ON public.perfiles
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

COMMIT;
