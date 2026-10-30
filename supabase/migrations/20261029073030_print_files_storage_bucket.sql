-- Bucket privado para los archivos adjuntos a pedidos de impresión en línea.
BEGIN;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'print-files',
  'print-files',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS print_files_customer_upload ON storage.objects;
CREATE POLICY print_files_customer_upload
ON storage.objects
FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'print-files'
  AND (storage.foldername(name))[1] = 'prints'
);

DROP POLICY IF EXISTS print_files_staff_read ON storage.objects;
CREATE POLICY print_files_staff_read
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'print-files'
  AND (storage.foldername(name))[1] = 'prints'
  AND EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.activo
      AND p.rol IN ('superadmin', 'admin', 'gerente', 'vendedor')
      AND (p.rol = 'superadmin' OR p.id_empresa = 1)
  )
);

COMMIT;
