-- Fase 14: identificadores de producto e imágenes públicas de catálogo.
-- El código de barras identifica el producto o presentación, nunca su lote.

BEGIN;

ALTER TABLE public.productos
  ADD COLUMN codigo_barras text,
  ADD COLUMN imagen_principal text,
  ADD CONSTRAINT productos_codigo_barras_no_vacio_check
    CHECK (codigo_barras IS NULL OR char_length(trim(codigo_barras)) > 0);

CREATE UNIQUE INDEX productos_empresa_codigo_barras_key
  ON public.productos (id_empresa, codigo_barras)
  WHERE codigo_barras IS NOT NULL;

COMMENT ON COLUMN public.productos.codigo_barras IS
  'GTIN/EAN/UPC o código interno escaneable; texto para conservar ceros iniciales. No representa lote.';
COMMENT ON COLUMN public.productos.imagen_principal IS
  'URL pública de la imagen principal del producto en el bucket product-images.';

GRANT UPDATE (codigo_barras, imagen_principal)
  ON public.productos TO authenticated;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_public_read ON storage.objects;
CREATE POLICY product_images_public_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS product_images_admin_write ON storage.objects;
CREATE POLICY product_images_admin_write
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'product-images'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9]+$' THEN
        public.puede_administrar_empresa(
          ((storage.foldername(name))[1])::integer
        )
      ELSE false
    END
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9]+$' THEN
        public.puede_administrar_empresa(
          ((storage.foldername(name))[1])::integer
        )
      ELSE false
    END
  );

COMMIT;
