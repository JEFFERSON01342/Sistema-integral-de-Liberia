import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";

export function useProductos() {
    const [productos, setProductos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { empresaId } = useEmpresa();
    const { perfil, rol } = useAuth();

    const fetchProductos = useCallback(async () => {
        if (rol !== "superadmin" && !perfil?.id_sucursal) {
            setProductos([]);
            setError("El perfil no tiene una sucursal asignada.");
            return;
        }
        if (!empresaId) {
            setProductos([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            let existenciasQuery = supabase
                .from("existencias_producto_sucursal")
                .select("id_producto, id_sucursal, cantidad_disponible, stock_minimo, valor_inventario, estado_stock")
                .eq("id_empresa", empresaId);
            if (rol !== "superadmin") {
                existenciasQuery = existenciasQuery.eq("id_sucursal", perfil.id_sucursal);
            }
            const [productosResult, existenciasResult] = await Promise.all([
                supabase
                    .from("productos")
                    .select("id_producto, sku, codigo_barras, nombre, descripcion, precio_venta, activo, created_at, imagen_principal, id_categoria, id_unidad_medida, categorias_producto(nombre), unidades_medidas(nombre, abreviatura)")
                    .eq("id_empresa", empresaId)
                    .eq("activo", true)
                    .order("nombre", { ascending: true }),
                existenciasQuery,
            ]);
            if (productosResult.error) throw productosResult.error;
            if (existenciasResult.error) throw existenciasResult.error;

            const existenciasPorProducto = new Map();
            for (const existencia of existenciasResult.data || []) {
                const acumulado = existenciasPorProducto.get(existencia.id_producto) || {
                    stock: 0,
                    stock_minimo: 0,
                    valor_inventario: 0,
                    bajo_stock: false,
                };
                acumulado.stock += Number(existencia.cantidad_disponible || 0);
                acumulado.stock_minimo += Number(existencia.stock_minimo || 0);
                acumulado.valor_inventario += Number(existencia.valor_inventario || 0);
                acumulado.bajo_stock ||= ["BAJO", "SIN_EXISTENCIA"].includes(existencia.estado_stock);
                existenciasPorProducto.set(existencia.id_producto, acumulado);
            }

            setProductos((productosResult.data || []).map((producto) => ({
                ...producto,
                codigo_sku: producto.sku,
                estado: producto.activo,
                fecha_registro: producto.created_at,
                stock: existenciasPorProducto.get(producto.id_producto)?.stock || 0,
                stock_minimo: existenciasPorProducto.get(producto.id_producto)?.stock_minimo || 0,
                valor_inventario: existenciasPorProducto.get(producto.id_producto)?.valor_inventario || 0,
                bajo_stock: existenciasPorProducto.get(producto.id_producto)?.bajo_stock || false,
            })));
        } catch (err) {
            setError(err.message);
            console.error("Error al cargar productos y existencias:", err);
            toast.error(`Error al cargar inventario: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId, perfil?.id_sucursal, rol]);

    useEffect(() => {
        fetchProductos();
    }, [fetchProductos]);

    const agregarProducto = async (nuevoProducto) => {
        setIsLoading(true);
        setError(null);

        if (!empresaId) {
            toast.error("No hay empresa seleccionada.");
            setIsLoading(false);
            return { success: false, message: "No hay empresa seleccionada." };
        }

        try {
            const precioVenta = Number(nuevoProducto.precio_venta);
            if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
                throw new Error("El precio de venta debe ser mayor que cero.");
            }
            const sku = (nuevoProducto.sku || nuevoProducto.codigo_sku || "").trim();
            if (!sku) throw new Error("El SKU es obligatorio.");

            const productoParaInsertar = {
                id_empresa: empresaId,
                sku,
                nombre: nuevoProducto.nombre.trim(),
                descripcion: nuevoProducto.descripcion?.trim() || null,
                precio_venta: precioVenta,
                activo: nuevoProducto.activo ?? nuevoProducto.estado ?? true,
                codigo_barras: nuevoProducto.codigo_barras?.trim() || sku,
                imagen_principal: nuevoProducto.imagen_principal || null,
                id_categoria: nuevoProducto.id_categoria ? Number(nuevoProducto.id_categoria) : null,
                id_unidad_medida: nuevoProducto.id_unidad_medida ? Number(nuevoProducto.id_unidad_medida) : null,
            };
            const { data: productoCreado, error: errorProducto } = await supabase
                .from("productos")
                .insert(productoParaInsertar)
                .select("id_producto,sku,codigo_barras,nombre,precio_venta")
                .single();
            if (errorProducto) throw errorProducto;
            await fetchProductos();
            return { success: true, data: productoCreado };

        } catch (err) {
            setError(err.message);
            console.error("Error al agregar producto:", err);
            return { success: false, message: err.message };
        } finally {
            setIsLoading(false);
        }
    };

    const eliminarProducto = async (idProducto) => {
        try {
            if (!empresaId) throw new Error("No hay una empresa seleccionada.");
            const { error } = await supabase
                .from("productos")
                .update({ activo: false })
                .eq("id_empresa", empresaId)
                .eq("id_producto", idProducto);

            if (error) throw error;
            await fetchProductos();
            return { success: true };
        } catch (err) {
            console.error("Error al eliminar producto:", err);
            return { success: false, message: err.message };
        }
    };

    const actualizarProducto = async (idProducto, cambios) => {
        try {
            if (!empresaId) throw new Error("No hay una empresa seleccionada.");
            const precioVenta = Number(cambios.precio_venta);
            if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
                throw new Error("El precio de venta debe ser mayor que cero.");
            }
            const payload = {
                sku: cambios.sku ?? cambios.codigo_sku,
                nombre: cambios.nombre?.trim(),
                descripcion: cambios.descripcion?.trim() || null,
                precio_venta: precioVenta,
                activo: cambios.activo ?? cambios.estado,
                codigo_barras: cambios.codigo_barras === undefined
                    ? undefined
                    : cambios.codigo_barras?.trim() || null,
                imagen_principal: cambios.imagen_principal || null,
                id_categoria: cambios.id_categoria ? Number(cambios.id_categoria) : null,
                id_unidad_medida: cambios.id_unidad_medida ? Number(cambios.id_unidad_medida) : null,
            };
            Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
            const { data, error } = await supabase
                .from("productos")
                .update(payload)
                .eq("id_empresa", empresaId)
                .eq("id_producto", idProducto)
                .select("id_producto, sku, codigo_barras, nombre, descripcion, precio_venta, activo, created_at, imagen_principal, id_categoria, id_unidad_medida, categorias_producto(nombre), unidades_medidas(nombre, abreviatura)")
                .single();

            if (error) throw error;
            await fetchProductos();
            return { success: true, data };
        } catch (err) {
            console.error("Error al actualizar producto:", err);
            return { success: false, message: err.message };
        }
    };

    return {
        productos,
        isLoading,
        error,
        setProductos,
        fetchProductos,
        agregarProducto,
        eliminarProducto,
        actualizarProducto
    };
}