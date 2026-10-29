GRANT SELECT (
  id_sucursal,
  id_empresa,
  nombre,
  direccion,
  telefono,
  es_principal,
  activa
)
ON TABLE public.sucursales
TO anon;

CREATE POLICY sucursales_catalogo_publico_activas
  ON public.sucursales
  FOR SELECT
  TO anon
  USING (id_empresa = 1 AND activa IS TRUE);
