import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function useUnidadesMedidas() {
    const [unidadesMedidas, setUnidadesMedidas] = useState([]);
    const [error, setError] = useState(null);
    const { empresaId } = useEmpresa();

    useEffect(() => {
        const fetchUnidadesMedidas = async () => {
            if (!empresaId) {
                setUnidadesMedidas([]);
                return;
            }
            setError(null)

            const {data, error} = await supabase
                .from("unidades_medidas")
                .select("*")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .order("nombre", { ascending: true });

            if (error) {
                setError(error.message);
                console.error("Error al cargar unidades de medida:", error);
                return;
            }
            setUnidadesMedidas(data || []);
        };

        fetchUnidadesMedidas();
    }, [empresaId]);

    return {
        unidadesMedidas, error
    }
}