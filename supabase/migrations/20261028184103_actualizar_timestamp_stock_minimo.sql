BEGIN;

CREATE TRIGGER stock_minimo_producto_sucursal_actualizar_updated_at
BEFORE UPDATE ON public.stock_minimo_producto_sucursal
FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();

COMMIT;
