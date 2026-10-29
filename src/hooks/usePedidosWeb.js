import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";

export function usePedidosWeb() {
  const { empresaId } = useEmpresa();
  const { perfil, rol } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPedidos = useCallback(async () => {
    if (!empresaId) {
      setPedidos([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("pedidos_web")
        .select(`
          id_pedido, numero_orden, id_empresa, id_sucursal, user_id,
          nombre_cliente, telefono, email, total, metodo_pago_preferido,
          tipo_entrega, direccion_entrega, notas, estado, estado_pago, id_venta, creado_en,
          detalles_pedido_web (
            id_detalle_pedido, id_producto, nombre_snapshot, cantidad,
            precio_unitario, imagen_snapshot, subtotal_linea
          )
        `)
        .eq("id_empresa", empresaId)
        .order("creado_en", { ascending: false });

      if (rol !== "superadmin" && perfil?.id_sucursal) {
        query = query.eq("id_sucursal", perfil.id_sucursal);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const { data: sucursales, error: sucursalesError } = await supabase
        .from("sucursales")
        .select("id_sucursal,nombre")
        .eq("id_empresa", empresaId);
      if (sucursalesError) throw sucursalesError;
      const sucursalesPorId = new Map((sucursales || []).map((sucursal) => [sucursal.id_sucursal, sucursal]));

      setPedidos((data || []).map((pedido) => ({
        ...pedido,
        sucursal: sucursalesPorId.get(pedido.id_sucursal) || null,
        detalles_pedido_web: pedido.detalles_pedido_web || [],
      })));
    } catch (err) {
      console.error("Error cargando pedidos web:", err);
      setError(err.message || "No se pudieron cargar los pedidos.");
      setPedidos([]);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, perfil?.id_sucursal, rol]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const cambiarEstado = async (idPedido, nuevoEstado) => {
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("cambiar_estado_pedido_web", {
        p_id_pedido: idPedido,
        p_nuevo_estado: nuevoEstado,
      });
      if (rpcError) throw rpcError;
      await fetchPedidos();
      return true;
    } catch (err) {
      console.error("Error actualizando estado del pedido:", err);
      setError(err.message || "No se pudo actualizar el estado del pedido.");
      return false;
    }
  };

  const aceptarPedido = async (pedido, metodoPagoReal, efectivoRecibido = null) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: sesion, error: sesionError } = await supabase
        .from("sesiones_caja")
        .select("id_sesion")
        .eq("id_empresa", pedido.id_empresa)
        .eq("id_sucursal", pedido.id_sucursal)
        .eq("estado", "ABIERTA")
        .order("abierta_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sesionError) throw sesionError;
      if (!sesion) throw new Error("No hay una sesión de caja abierta en la sucursal del pedido.");

      const { data: idVenta, error: rpcError } = await supabase.rpc("aceptar_pedido_web", {
        p_id_pedido: pedido.id_pedido,
        p_id_sesion: sesion.id_sesion,
        p_metodo_pago_real: metodoPagoReal,
        p_efectivo_recibido: efectivoRecibido,
      });
      if (rpcError) throw rpcError;
      await fetchPedidos();
      return { success: true, idVenta };
    } catch (err) {
      console.error("Error aceptando pedido:", err);
      setError(err.message || "No se pudo aceptar el pedido.");
      return { success: false, error: err.message || "No se pudo aceptar el pedido." };
    } finally {
      setIsLoading(false);
    }
  };

  return { pedidos, isLoading, error, fetchPedidos, cambiarEstado, aceptarPedido };
}
