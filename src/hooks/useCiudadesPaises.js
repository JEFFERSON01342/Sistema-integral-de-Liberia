import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseclient"

export function useCiudadesPaises() {
    const [paises, setPaises] = useState([]);
    const [ciudades, setCiudades] = useState([]);
    const [error, setError] = useState(null)
    const [paisSeleccionado, setPaisSeleccionado] = useState(null)

    useEffect(() => {
        const fetchPais = async () => {
            setError(null);

            const { data, error } = await supabase
                .from("pais")
                .select("*")
                .order("paisnombre", { ascending: true })

            if (error) {
                console.log("Error: ", error)
            } else {
                setPaises(data)
            }

        };

        fetchPais();
    }, []);

    useEffect(() => {
        if (!paisSeleccionado) {
            setCiudades([]);
            return;
        }

        const fetchCiudades = async () => {
            setError(null);

            const { data, error } = await supabase
                .from("estado")
                .select("*")
                .eq("ubicacionpaisid", paisSeleccionado)
                .order("estadonombre", { ascending: true });

            if (error) {
                console.error("Error cargando ciudades:", error);
                setError(error);
            } else {
                setCiudades(data);
            }

        };

        fetchCiudades();
    }, [paisSeleccionado]);

    return {
        paises,
        ciudades,
        error,
        paisSeleccionado,
        setPaisSeleccionado,
    };
}