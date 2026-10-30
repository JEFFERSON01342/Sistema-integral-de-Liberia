BEGIN;

CREATE INDEX aplicaciones_descuento_venta_idx
  ON public.aplicaciones_descuento (id_empresa, id_venta);
CREATE INDEX descuento_productos_empresa_descuento_idx
  ON public.descuento_productos (id_empresa, id_descuento);
CREATE INDEX descuento_productos_empresa_producto_idx
  ON public.descuento_productos (id_empresa, id_producto);
CREATE INDEX descuento_categorias_empresa_descuento_idx
  ON public.descuento_categorias (id_empresa, id_descuento);
CREATE INDEX descuento_categorias_empresa_categoria_idx
  ON public.descuento_categorias (id_empresa, id_categoria);
CREATE INDEX detalle_ventas_empresa_descuento_idx
  ON public.detalle_ventas (id_empresa, id_descuento);
CREATE INDEX detalles_pedido_web_empresa_descuento_idx
  ON public.detalles_pedido_web (id_empresa, id_descuento);

COMMIT;
