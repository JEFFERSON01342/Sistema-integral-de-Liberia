-- Permite que personal autorizado borre archivos solo del bucket privado de impresiones.
BEGIN;

DROP POLICY IF EXISTS print_files_staff_delete ON storage.objects;
CREATE POLICY print_files_staff_delete
ON storage.objects
FOR DELETE TO authenticated
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
