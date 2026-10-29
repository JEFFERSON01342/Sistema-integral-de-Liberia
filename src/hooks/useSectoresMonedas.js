import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseclient";

export function useSectoresMonedas() {
    const [sectores, setSectores] = useState([]);
    const [monedas, setMonedas] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Cargar Sectores
                const { data: dataSectores } = await supabase.from('sector').select('*');
                if (dataSectores) setSectores(dataSectores);

                // 2. Cargar Monedas
                const { data: dataMonedas } = await supabase.from('moneda').select('*');
                if (dataMonedas) setMonedas(dataMonedas);

            } catch (error) {
                console.error("Error cargando catálogos:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return { sectores, monedas, loading };
}