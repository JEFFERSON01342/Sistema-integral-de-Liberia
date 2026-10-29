import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";

export function useVenta() {
  const [ventas, setVentas] = useState(undefined);
  const { empresaId } = useEmpresa();
  const { user } = useAuth();
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
      // RLS ya limita las ventas por sucursal (superadmin ve todas).
      const { data, error } = await supabase
        .from("ventas")
        .select(
          "id_venta, numero_factura, id_cliente, fecha_venta, plazo_dias, monto_total, tipo_pago, estado, estado_contable, comprobante_id, motivo_anulacion, id_sucursal, id_apertura_caja, usuario_registra, canal, sucursal:sucursales(nombre)"
        )
        .eq('id_empresa', empresaId)
        .order('fecha_venta', { ascending: false });

      if (error) throw error;
      setVentas(data);

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
      if (!empresaId || !ventaData.id_cliente || ventaData.detalle_items.length === 0) {
        throw new Error("Faltan datos obligatorios: empresa, cliente o items.");
      }

      const { data: nuevaVentaId, error: rpcError } = await supabase.rpc("sp_registrar_venta", {
        p_id_empresa: empresaId,
        p_id_cliente: Number(ventaData.id_cliente),
        p_tipo_pago: ventaData.tipo_pago,
        p_detalle_ventas: ventaData.detalle_items,
        p_numero_factura: ventaData.numero_factura,
        p_fecha_vencimiento: ventaData.fechavencimiento,
        p_plazo_dias: ventaData.plazo_dias
      });

      if (rpcError) throw rpcError;

      // Marcar quién registró la venta y a qué apertura de caja pertenece.
      // (La sucursal la asigna automáticamente el trigger de stock por contexto del perfil.)
      try {
        const campos = {};
        if (user?.id) campos.usuario_registra = user.id;
        if (ventaData.id_apertura_caja) campos.id_apertura_caja = ventaData.id_apertura_caja;
        if (Object.keys(campos).length > 0) {
          await supabase.from("ventas").update(campos).eq("id_venta", nuevaVentaId);
        }
      } catch (e) {
        console.warn("No se pudo asociar cajero/caja a la venta:", e.message);
      }

      await fetchVentas();
      return nuevaVentaId;

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
