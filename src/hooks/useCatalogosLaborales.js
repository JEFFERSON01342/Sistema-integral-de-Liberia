import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { toast } from "react-hot-toast";

export function useCatalogosLaborales({ incluirInactivos = false } = {}) {
    const { empresaId } = useEmpresa();
    const [departamentos, setDepartamentos] = useState([]);
    const [puestos, setPuestos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchCatalogos = useCallback(async () => {
        if (!empresaId) {
            setDepartamentos([]);
            setPuestos([]);
            return;
        }

        setIsLoading(true);
        setError(null);
        const departamentosQuery = supabase
            .from("departamentos_empresa")
            .select("id_departamento, nombre, activo")
            .eq("id_empresa", empresaId)
            .order("nombre", { ascending: true });
        const puestosQuery = supabase
            .from("puestos_empresa")
            .select("id_puesto, id_departamento, nombre, rol_acceso, activo")
            .eq("id_empresa", empresaId)
            .order("nombre", { ascending: true });

        const [departamentosResult, puestosResult] = await Promise.all([
            incluirInactivos ? departamentosQuery : departamentosQuery.eq("activo", true),
            incluirInactivos ? puestosQuery : puestosQuery.eq("activo", true),
        ]);
        if (departamentosResult.error || puestosResult.error) {
            const fetchError = departamentosResult.error || puestosResult.error;
            setError(fetchError.message);
            setIsLoading(false);
            toast.error(`No se pudieron cargar departamentos y puestos: ${fetchError.message}`);
            return;
        }
        setDepartamentos(departamentosResult.data || []);
        setPuestos(puestosResult.data || []);
        setIsLoading(false);
    }, [empresaId, incluirInactivos]);

    useEffect(() => {
        fetchCatalogos();
    }, [fetchCatalogos]);

    return { departamentos, puestos, isLoading, error, fetchCatalogos };
}
