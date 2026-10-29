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
                    .select("id_cliente, nombre, identificacion, correo, telefono, direccion, limite_credito, tipo_cliente")
                    .eq('id_empresa', empresaId);

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
            const { data, error } = await supabase
                .from("clientes")
                .insert({ ...cliente, id_empresa: empresaId })
                .select()
                .single();      

            if (error) throw error;
            
            setClientes((prev) => [...prev, data]);
            
            return { success: true }; 
        } catch (error) {
            setError(error);
            return { success: false, message: error.message };
        }
    };

    return { clientes, loading, error, addCliente };
}