import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

const BUCKET = "print-files";

export function useImpresiones() {
  const { empresaId } = useEmpresa();
  const [trabajos, setTrabajos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrabajos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("trabajos_impresion")
        .select(
          "id_trabajo, numero_orden, user_id, nombre_cliente, telefono, archivo_nombre, archivo_url, storage_path, modo_color, copias, tamano_papel, notas, precio_estimado, estado, id_venta, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTrabajos(data || []);
    } catch (err) {
      console.error("Error cargando impresiones:", err.message);
      setError(err.message);
      setTrabajos([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrabajos();
  }, [fetchTrabajos]);

  // Genera una URL firmada temporal para descargar el archivo privado.
  const getDownloadUrl = async (storagePath) => {
    if (!storagePath) return null;
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 60 * 10); // 10 minutos
      if (error) throw error;
      return data?.signedUrl || null;
    } catch (err) {
      console.error("Error generando URL de descarga:", err.message);
      setError(err.message);
      return null;
    }
  };

  const cambiarEstado = async (idTrabajo, nuevoEstado) => {
    try {
      const { error } = await supabase
        .from("trabajos_impresion")
        .update({ estado: nuevoEstado })
        .eq("id_trabajo", idTrabajo);
      if (error) throw error;

      if (nuevoEstado === "Entregado") {
        return eliminarArchivoTrabajo(idTrabajo);
      }

      await fetchTrabajos();
      return { success: true };
    } catch (err) {
      console.error("Error actualizando trabajo:", err.message);
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const eliminarArchivoTrabajo = async (idTrabajo) => {
    try {
      const { data: trabajo, error: consultaError } = await supabase
        .from("trabajos_impresion")
        .select("estado,storage_path")
        .eq("id_trabajo", idTrabajo)
        .maybeSingle();
      if (consultaError) throw consultaError;
      if (trabajo && trabajo.estado !== "Entregado") {
        throw new Error("Solo se eliminan archivos de trabajos ya entregados.");
      }
      if (!trabajo?.storage_path) {
        await fetchTrabajos();
        return { success: true, fileDeleted: true };
      }
      if (!trabajo.storage_path.startsWith("prints/")) {
        throw new Error("La ruta del archivo no pertenece al directorio autorizado de impresiones.");
      }

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([trabajo.storage_path]);
      if (storageError) throw storageError;

      const { error: actualizarError } = await supabase
        .from("trabajos_impresion")
        .update({ storage_path: null })
        .eq("id_trabajo", idTrabajo);
      if (actualizarError) throw actualizarError;

      setError(null);
      await fetchTrabajos();
      return { success: true, fileDeleted: true };
    } catch (err) {
      console.error("Error eliminando archivo de impresión:", err.message);
      setError(err.message);
      await fetchTrabajos();
      return { success: false, fileDeleted: false, error: err.message };
    }
  };

  // Registra el cobro de la impresión como una venta contable de servicio.
  // Como la impresión no descuenta un producto del inventario, registramos
  // el ingreso mediante un producto "Servicio de Impresión" del catálogo.
  const cobrarImpresion = async (trabajo, idProductoServicio) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!idProductoServicio) {
        // Sin producto de servicio configurado, sólo marcamos como Listo.
        await cambiarEstado(trabajo.id_trabajo, "Listo");
        return true;
      }
      const numeroFactura = `IMP-${trabajo.id_trabajo}-${Date.now().toString().slice(-5)}`;
      const { data: idVenta, error: rpcError } = await supabase.rpc("sp_registrar_venta", {
        p_id_empresa: empresaId,
        p_id_cliente: 1, // Público General
        p_tipo_pago: "efectivo",
        p_detalle_ventas: [{ IdProducto: Number(idProductoServicio), Cantidad: Number(trabajo.copias) || 1 }],
        p_numero_factura: numeroFactura,
        p_fecha_vencimiento: null,
        p_plazo_dias: 0,
      });
      if (rpcError) throw rpcError;

      const { error: updError } = await supabase
        .from("trabajos_impresion")
        .update({ estado: "Listo", id_venta: idVenta })
        .eq("id_trabajo", trabajo.id_trabajo);
      if (updError) throw updError;

      await fetchTrabajos();
      return idVenta;
    } catch (err) {
      console.error("Error cobrando impresión:", err.message);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    trabajos,
    isLoading,
    error,
    fetchTrabajos,
    getDownloadUrl,
    cambiarEstado,
    eliminarArchivoTrabajo,
    cobrarImpresion,
  };
}
