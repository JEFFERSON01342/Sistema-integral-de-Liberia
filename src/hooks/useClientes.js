import { supabase } from "../supabase/supabaseclient";
import { useState, useEffect, useCallback } from "react";
import { useEmpresa } from "../contexts/empresacontext";
import { toast } from "react-hot-toast";

export function useClientes() {
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { empresaId } = useEmpresa();

    const fetchClientes = useCallback(async () => {
        if (!empresaId) {
            setClientes([]);
            setLoading(false);
            return [];
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: queryError } = await supabase
                .from("clientes")
                .select("id_cliente, nombre, identificacion, correo:email, telefono, limite_credito, tipo_cliente, activo")
                .eq("id_empresa", empresaId)
                .order("nombre", { ascending: true });
            if (queryError) throw queryError;
            setClientes(data || []);
            return data || [];
        } catch (fetchError) {
            setError(fetchError);
            toast.error(`No se pudieron cargar los clientes: ${fetchError.message}`);
            return [];
        } finally {
            setLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchClientes();
    }, [fetchClientes]);

    const addCliente = async (cliente) => {
        try {
            const datosCliente = { ...cliente };
            delete datosCliente.correo;
            delete datosCliente.direccion;
            const codigo = cliente.codigo || `CLI-${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
            const { data, error } = await supabase
                .from("clientes")
                .insert({
                    ...datosCliente,
                    codigo,
                    email: cliente.correo || cliente.email || null,
                    tipo_cliente: cliente.tipo_cliente || "PERSONA",
                    limite_credito: Number(cliente.limite_credito || 0),
                    plazo_credito_dias: Number(cliente.plazo_credito_dias || 0),
                    id_empresa: empresaId,
                })
                .select()
                .single();      

            if (error) throw error;
            const clienteCreado = { ...data, correo: data.email };
            await fetchClientes();
            return { success: true, data: clienteCreado };
        } catch (error) {
            setError(error);
            return { success: false, message: error.message };
        }
    };

    const updateCliente = async (cliente) => {
        if (!empresaId || !cliente.id_cliente) {
            return { success: false, message: "No se encontró el cliente que se desea editar." };
        }
        try {
            const { data, error: updateError } = await supabase
                .from("clientes")
                .update({
                    nombre: cliente.nombre.trim(),
                    identificacion: cliente.identificacion?.trim() || null,
                    email: cliente.correo?.trim() || null,
                    telefono: cliente.telefono?.trim() || null,
                    limite_credito: Number(cliente.limite_credito) || 0,
                })
                .eq("id_empresa", empresaId)
                .eq("id_cliente", cliente.id_cliente)
                .select("id_cliente")
                .maybeSingle();
            if (updateError) throw updateError;
            if (!data) throw new Error("No se encontró el cliente o no tienes permiso para modificarlo.");
            await fetchClientes();
            return { success: true };
        } catch (updateError) {
            setError(updateError);
            return { success: false, message: updateError.message };
        }
    };

    const cambiarEstadoCliente = async (cliente) => {
        if (!empresaId || !cliente.id_cliente) {
            return { success: false, message: "No se encontró el cliente." };
        }
        try {
            const { data, error: updateError } = await supabase
                .from("clientes")
                .update({ activo: !cliente.activo })
                .eq("id_empresa", empresaId)
                .eq("id_cliente", cliente.id_cliente)
                .select("id_cliente")
                .maybeSingle();
            if (updateError) throw updateError;
            if (!data) throw new Error("No se encontró el cliente o no tienes permiso para modificarlo.");
            await fetchClientes();
            return { success: true };
        } catch (updateError) {
            return { success: false, message: updateError.message };
        }
    };

    const eliminarCliente = async (cliente) => {
        if (!empresaId || !cliente.id_cliente) {
            return { success: false, message: "No se encontró el cliente." };
        }
        try {
            const { data, error: deleteError } = await supabase
                .from("clientes")
                .delete()
                .eq("id_empresa", empresaId)
                .eq("id_cliente", cliente.id_cliente)
                .select("id_cliente")
                .maybeSingle();
            if (deleteError) throw deleteError;
            if (!data) throw new Error("No se encontró el cliente o no tienes permiso para eliminarlo.");
            await fetchClientes();
            return { success: true };
        } catch (deleteError) {
            return { success: false, message: deleteError.message };
        }
    };

    return {
        clientes,
        loading,
        error,
        addCliente,
        updateCliente,
        cambiarEstadoCliente,
        eliminarCliente,
        fetchClientes,
    };
}