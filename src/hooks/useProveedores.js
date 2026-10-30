import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { toast } from "react-hot-toast";

export function useProveedores() {
    const { empresaId } = useEmpresa();
    const [proveedores, setProveedores] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchProveedores = useCallback(async () => {
        if (!empresaId) {
            setProveedores([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { data, error: queryError } = await supabase
                .from("proveedores")
                .select("id_proveedor, codigo, nombre, nombre_legal, identificacion_fiscal, telefono, email, direccion, plazo_credito_dias, cantidad_cuotas_credito, frecuencia_cuotas_credito_dias, anticipo_credito_porcentaje, activo")
                .eq("id_empresa", empresaId)
                .order("nombre");
            if (queryError) throw queryError;

            setProveedores((data || []).map((provider) => ({
                ...provider,
                id: provider.id_proveedor,
                nombre_comercial: provider.nombre,
                razon_social: provider.nombre_legal,
                estado: provider.activo ? 1 : 0,
            })));
        } catch (err) {
            console.error("Error al cargar proveedores:", err);
            setError(err.message || "Error desconocido");
            toast.error(`No se pudieron cargar los proveedores: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchProveedores();
    }, [fetchProveedores]);

    const guardarProveedor = async (proveedor) => {
        if (!empresaId) return { success: false, message: "No hay empresa seleccionada." };
        if (!proveedor.nombre?.trim()) return { success: false, message: "El nombre del proveedor es obligatorio." };

        try {
            const datos = {
                nombre: proveedor.nombre.trim(),
                nombre_legal: proveedor.nombre_legal?.trim() || null,
                identificacion_fiscal: proveedor.identificacion_fiscal?.trim() || null,
                email: proveedor.email?.trim() || null,
                telefono: proveedor.telefono?.trim() || null,
                direccion: proveedor.direccion?.trim() || null,
                plazo_credito_dias: Number(proveedor.plazo_credito_dias) || 0,
                cantidad_cuotas_credito: Number(proveedor.cantidad_cuotas_credito) || 1,
                frecuencia_cuotas_credito_dias: Number(proveedor.frecuencia_cuotas_credito_dias) || 30,
                anticipo_credito_porcentaje: Number(proveedor.anticipo_credito_porcentaje) || 0,
            };
            const query = proveedor.id_proveedor
                ? supabase.from("proveedores").update(datos)
                    .eq("id_empresa", empresaId).eq("id_proveedor", proveedor.id_proveedor)
                : supabase.from("proveedores").insert({
                    ...datos,
                    id_empresa: empresaId,
                    codigo: `PROV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                    activo: true,
                });
            const { data, error: saveError } = proveedor.id_proveedor
                ? await query.select("id_proveedor").maybeSingle()
                : await query.select("id_proveedor").single();
            if (saveError) throw saveError;
            if (!data) throw new Error("No se encontró el proveedor o no tienes permiso para modificarlo.");

            await fetchProveedores();
            return { success: true };
        } catch (err) {
            console.error("Error al agregar proveedor:", err);
            return { success: false, message: err.message || "No se pudo guardar el proveedor." };
        }
    };

    const cambiarEstadoProveedor = async (proveedor) => {
        if (!empresaId) return { success: false, message: "No hay empresa seleccionada." };
        try {
            const { data, error: updateError } = await supabase
                .from("proveedores")
                .update({ activo: !proveedor.activo })
                .eq("id_empresa", empresaId)
                .eq("id_proveedor", proveedor.id_proveedor)
                .select("id_proveedor")
                .maybeSingle();
            if (updateError) throw updateError;
            if (!data) throw new Error("No se encontró el proveedor o no tienes permiso para modificarlo.");
            await fetchProveedores();
            return { success: true };
        } catch (err) {
            console.error("Error al cambiar estado del proveedor:", err);
            return { success: false, message: err.message || "No se pudo actualizar el proveedor." };
        }
    };

    const eliminarProveedor = async (proveedor) => {
        if (!empresaId || !proveedor.id_proveedor) {
            return { success: false, message: "No se encontró el proveedor." };
        }
        try {
            const { data, error: deleteError } = await supabase
                .from("proveedores")
                .delete()
                .eq("id_empresa", empresaId)
                .eq("id_proveedor", proveedor.id_proveedor)
                .select("id_proveedor")
                .maybeSingle();
            if (deleteError) throw deleteError;
            if (!data) throw new Error("No se encontró el proveedor o no tienes permiso para eliminarlo.");
            await fetchProveedores();
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message || "No se pudo eliminar el proveedor." };
        }
    };

    return {
        proveedores,
        isLoading,
        error,
        agregarProveedor: guardarProveedor,
        actualizarProveedor: guardarProveedor,
        cambiarEstadoProveedor,
        eliminarProveedor,
        fetchProveedores,
    };
}
