import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function useVenta() {
  const [ventas, setVentas] = useState(undefined);
  const { empresaId } = useEmpresa();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchVentas = useCallback(async () => {
    if (!empresaId) {
      setVentas([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("ventas")
        .select(
          "id_venta, numero, id_cliente, fecha_operativa, registrada_en, metodo_pago, subtotal, impuesto, total, efectivo_recibido, cambio, costo_total_fifo, id_comprobante, id_sucursal, id_sesion, registrada_por"
        )
        .eq("id_empresa", empresaId)
        .order("registrada_en", { ascending: false });

      if (queryError) throw queryError;
      const { data: sucursales, error: sucursalesError } = await supabase
        .from("sucursales")
        .select("id_sucursal,nombre")
        .eq("id_empresa", empresaId);
      if (sucursalesError) throw sucursalesError;
      const sucursalesPorId = new Map((sucursales || []).map((sucursal) => [
        String(sucursal.id_sucursal),
        sucursal.nombre,
      ]));
      setVentas((data || []).map((venta) => ({
        ...venta,
        sucursal: { nombre: sucursalesPorId.get(String(venta.id_sucursal)) || "—" },
        numero_factura: venta.numero,
        fecha_venta: venta.registrada_en,
        monto_total: venta.total,
        tipo_pago: venta.metodo_pago,
        comprobante_id: venta.id_comprobante,
        id_apertura_caja: venta.id_sesion,
        usuario_registra: venta.registrada_por,
        canal: "sucursal",
        estado: "Pagada",
        estado_contable: venta.id_comprobante ? "CONTABILIZADO" : "PENDIENTE",
      })));
    } catch (err) {
      console.error("Error cargando ventas:", err.message);
      setError(err.message);
      setVentas([]);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  const crearVenta = async (ventaData) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!empresaId || !ventaData.id_sesion || !Array.isArray(ventaData.detalle_items) || ventaData.detalle_items.length === 0) {
        throw new Error("Se requiere una sesión de caja abierta y al menos un producto.");
      }

      const { data: nuevaVentaId, error: rpcError } = await supabase.rpc("registrar_venta_pos", {
        p_id_sesion: Number(ventaData.id_sesion),
        p_items: ventaData.detalle_items,
        p_pagos: ventaData.pagos,
        p_idempotencia_key: ventaData.idempotencia_key,
        p_id_cliente: ventaData.id_cliente ? Number(ventaData.id_cliente) : null,
      });

      if (rpcError) throw rpcError;

      return Number(nuevaVentaId);
    } catch (err) {
      console.error("Error creando venta:", err.message);
      setError(err.message);
      return { error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  return { crearVenta, isLoading, error, ventas, fetchVentas };
}
