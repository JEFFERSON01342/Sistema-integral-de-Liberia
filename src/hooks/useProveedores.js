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
                .select("id_proveedor, codigo, nombre, nombre_legal, identificacion_fiscal, telefono, email, direccion, plazo_credito_dias, activo")
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

    const agregarProveedor = async ({ nombre, nombre_legal, identificacion_fiscal, email, telefono, direccion, plazo_credito_dias }) => {
        if (!empresaId) return { success: false, message: "No hay empresa seleccionada." };
        if (!nombre?.trim()) return { success: false, message: "El nombre del proveedor es obligatorio." };

        try {
            const { data, error: insertError } = await supabase
                .from("proveedores")
                .insert({
                    id_empresa: empresaId,
                    codigo: `PROV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                    nombre: nombre.trim(),
                    nombre_legal: nombre_legal?.trim() || null,
                    identificacion_fiscal: identificacion_fiscal?.trim() || null,
                    email: email?.trim() || null,
                    telefono: telefono?.trim() || null,
                    direccion: direccion?.trim() || null,
                    plazo_credito_dias: Number(plazo_credito_dias) || 0,
                    activo: true,
                })
                .select("id_proveedor")
                .single();
            if (insertError) throw insertError;

            await fetchProveedores();
            return { success: true, data };
        } catch (err) {
            console.error("Error al agregar proveedor:", err);
            return { success: false, message: err.message || "No se pudo guardar el proveedor." };
        }
    };

    return { proveedores, isLoading, error, agregarProveedor, fetchProveedores };
}
