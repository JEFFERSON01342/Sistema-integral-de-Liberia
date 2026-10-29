import { supabase } from "../supabase/supabaseclient";
import { useState, useEffect } from "react";
import { useEmpresa } from "../contexts/empresacontext";

export function useClientes() {
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { empresaId } = useEmpresa();

    useEffect(() => {
        if (!empresaId) {
            setClientes([]);
            setLoading(false);
            return;
        }

        const fetchClientes = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("clientes")
                    .select("id_cliente, nombre, identificacion, correo:email, telefono, limite_credito, tipo_cliente")
                    .eq('id_empresa', empresaId)
                    .eq('activo', true);

                if (error) throw error;
                setClientes(data);
            } catch (error) {
                setError(error);
            } finally {
                setLoading(false);
            }
        };

        fetchClientes();
    }, [empresaId]);

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
            setClientes((prev) => [...prev, clienteCreado]);
            
            return { success: true, data: clienteCreado };
        } catch (error) {
            setError(error);
            return { success: false, message: error.message };
        }
    };

    return { clientes, loading, error, addCliente };
}