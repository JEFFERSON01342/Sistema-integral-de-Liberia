import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function useCompras() {
    const { empresaId } = useEmpresa();
    const [ordenes, setOrdenes] = useState([]);
    const [cuentasPorPagar, setCuentasPorPagar] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchCompras = useCallback(async () => {
        if (!empresaId) {
            setOrdenes([]);
            setCuentasPorPagar([]);
            return;
        }
        setIsLoading(true);
        try {
            const [ordenesResult, detallesResult, proveedoresResult, productosResult, cuentasResult] = await Promise.all([
                supabase
                    .from("ordenes_compra")
                    .select("id_orden_compra, numero, id_sucursal, id_proveedor, estado, observaciones, creada_en")
                    .eq("id_empresa", empresaId)
                    .order("creada_en", { ascending: false }),
                supabase
                    .from("detalles_orden_compra")
                    .select("id_orden_compra, id_detalle_orden, id_producto, cantidad_solicitada, cantidad_aceptada_acumulada, cantidad_rechazada_acumulada")
                    .eq("id_empresa", empresaId),
                supabase
                    .from("proveedores")
                    .select("id_proveedor, nombre")
                    .eq("id_empresa", empresaId),
                supabase
                    .from("productos")
                    .select("id_producto, nombre")
                    .eq("id_empresa", empresaId),
                supabase
                    .from("saldos_cuentas_por_pagar")
                    .select("id_cuenta_por_pagar, id_proveedor, id_recepcion, id_sucursal, fecha_emision, fecha_vencimiento, total, monto_pagado, saldo_pendiente, dias_vencidos, estado")
                    .eq("id_empresa", empresaId)
                    .gt("saldo_pendiente", 0)
                    .order("fecha_vencimiento"),
            ]);
            for (const result of [ordenesResult, detallesResult, proveedoresResult, productosResult, cuentasResult]) {
                if (result.error) throw result.error;
            }

            const proveedoresPorId = new Map((proveedoresResult.data || []).map((provider) => [
                provider.id_proveedor,
                provider.nombre,
            ]));
            const productosPorId = new Map((productosResult.data || []).map((product) => [
                product.id_producto,
                product.nombre,
            ]));
            const detallesPorOrden = new Map();
            for (const detail of detallesResult.data || []) {
                const items = detallesPorOrden.get(detail.id_orden_compra) || [];
                items.push({
                    ...detail,
                    nombre_producto: productosPorId.get(detail.id_producto) || `Producto #${detail.id_producto}`,
                    cantidad_pendiente: Number(detail.cantidad_solicitada)
                        - Number(detail.cantidad_aceptada_acumulada)
                        - Number(detail.cantidad_rechazada_acumulada),
                });
                detallesPorOrden.set(detail.id_orden_compra, items);
            }

            setOrdenes((ordenesResult.data || []).map((order) => ({
                ...order,
                nombre_proveedor: proveedoresPorId.get(order.id_proveedor) || `Proveedor #${order.id_proveedor}`,
                lineas: detallesPorOrden.get(order.id_orden_compra) || [],
            })));
            setCuentasPorPagar((cuentasResult.data || []).map((account) => ({
                ...account,
                nombre_proveedor: proveedoresPorId.get(account.id_proveedor) || `Proveedor #${account.id_proveedor}`,
            })));
        } catch (error) {
            console.error("Error al cargar órdenes y cuentas por pagar:", error);
            toast.error(`Error al cargar compras y CxP: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchCompras();
    }, [fetchCompras]);

    const ejecutarAccion = async (mensajeError, accion) => {
        setIsSaving(true);
        try {
            const resultado = await accion();
            if (resultado.error) throw resultado.error;
            await fetchCompras();
            return { success: true, data: resultado.data };
        } catch (error) {
            console.error(mensajeError, error);
            toast.error(`${mensajeError}: ${error.message}`);
            return { success: false, message: error.message };
        } finally {
            setIsSaving(false);
        }
    };

    const crearOrdenCompra = (orden) => ejecutarAccion("No se pudo crear la orden", () => supabase.rpc("crear_orden_compra", {
        p_id_sucursal: Number(orden.id_sucursal),
        p_id_proveedor: Number(orden.id_proveedor),
        p_lineas: orden.lineas.map((linea) => ({
            id_producto: Number(linea.id_producto),
            cantidad_solicitada: Number(linea.cantidad_solicitada),
        })),
        p_clave_idempotencia: orden.clave_idempotencia,
        p_observaciones: orden.observaciones || null,
    }));

    const cambiarEstadoOrdenCompra = (idOrden, estado, observaciones = null) => ejecutarAccion("No se pudo actualizar la orden", () => (
        supabase.rpc("cambiar_estado_orden_compra", {
            p_id_orden_compra: Number(idOrden),
            p_nuevo_estado: estado,
            p_observaciones: observaciones,
        })
    ));

    const recibirOrdenCompra = (recepcion) => ejecutarAccion("No se pudo registrar la recepción", () => (
        supabase.rpc("recibir_orden_compra", {
            p_id_orden_compra: Number(recepcion.id_orden_compra),
            p_id_ubicacion: Number(recepcion.id_ubicacion),
            p_lineas: recepcion.lineas,
            p_clave_idempotencia: recepcion.clave_idempotencia,
            p_documento_proveedor: recepcion.documento_proveedor || null,
            p_observaciones: recepcion.observaciones || null,
        })
    ));

    const registrarPagoProveedor = (pago) => ejecutarAccion("No se pudo registrar el pago", () => (
        supabase.rpc("registrar_pago_proveedor", {
            p_metodo_pago: pago.metodo_pago,
            p_asignaciones: [{
                id_cuenta_por_pagar: Number(pago.id_cuenta_por_pagar),
                monto: Number(pago.monto),
            }],
            p_clave_idempotencia: pago.clave_idempotencia,
            p_id_sesion: pago.id_sesion ? Number(pago.id_sesion) : null,
            p_referencia: pago.referencia || null,
            p_id_cuenta_pago: pago.id_cuenta_pago ? Number(pago.id_cuenta_pago) : null,
        })
    ));

    return {
        ordenes,
        cuentasPorPagar,
        isLoading,
        isSaving,
        crearOrdenCompra,
        cambiarEstadoOrdenCompra,
        recibirOrdenCompra,
        registrarPagoProveedor,
        fetchCompras,
    };
}
