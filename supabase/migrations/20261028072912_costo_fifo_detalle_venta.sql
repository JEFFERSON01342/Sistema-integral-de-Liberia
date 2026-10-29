-- Permite el valor temporal cero dentro de la transacción de venta;
-- el RPC asigna el costo FIFO antes de confirmar la operación.

ALTER TABLE public.detalle_ventas
  DROP CONSTRAINT detalle_ventas_costo_fifo_check;

ALTER TABLE public.detalle_ventas
  ADD CONSTRAINT detalle_ventas_costo_fifo_check
  CHECK (costo_fifo >= 0);
