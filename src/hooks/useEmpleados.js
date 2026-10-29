import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

const TABLA = 'empleados';

export function useEmpleados(idSucursal = null) {
    const { empresaId } = useEmpresa(); 

    const [empleados, setEmpleados] = useState([]);
    const [isLoading, setIsLoading] = useState(false); 
    const [isSaving, setIsSaving] = useState(false); 
    const [error, setError] = useState(null);

    const fetchEmpleados = useCallback(async () => {
        if (!empresaId) return; 

        setIsLoading(true);
        setError(null);
        try {
            let query = supabase
                .from(TABLA)
                .select('*') 
                .eq('id_empresa', empresaId);

            // Filtro por sucursal (para admin/gerente que solo ven su sucursal)
            if (idSucursal) {
                query = query.eq('id_sucursal', idSucursal);
            }

            const { data, error } = await query
                .order('nombre_completo', { ascending: true });

            if (error) {
                throw error;
            }

            setEmpleados(data || []); 

        } catch (err) {
            console.error("Error al cargar empleados:", err.message);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId, idSucursal]); 

    useEffect(() => {
        fetchEmpleados();
    }, [fetchEmpleados]); 


    const addEmpleado = async (nuevoEmpleado) => {
        if (!empresaId) {
            return { success: false, message: "No hay empresa seleccionada." };
        }

        setIsSaving(true);
        setError(null);
        try {
            const empleadoParaInsertar = {
                ...nuevoEmpleado,
                id_empresa: empresaId
            };

            const { data, error } = await supabase
                .from(TABLA)
                .insert(empleadoParaInsertar)
                .select()
                .single();

            if (error) {
                throw error;
            }

            await fetchEmpleados();

            return { success: true, data: data };

        } catch (err) {
            console.error("Error al agregar empleado:", err.message);
            return { success: false, message: err.message };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        empleados,
        isLoading,
        isSaving,
        error,
        addEmpleado,
        fetchEmpleados 
    };
}