import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function useCuentasContables() {
    const { empresaId } = useEmpresa();
    const [cuentas, setCuentas] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchCuentas = useCallback(async () => {
        if (!empresaId) {
            setCuentas([]);
            return;
        }

        setIsLoading(true);
        const { data, error } = await supabase
            .from("cuentas_contables")
            .select("id_cuenta, codigo, nombre, naturaleza, saldo_normal, es_grupo, permite_movimientos, activa, es_banco, es_efectivo")
            .eq("id_empresa", empresaId)
            .eq("activa", true)
            .eq("es_grupo", false)
            .eq("permite_movimientos", true)
            .order("codigo", { ascending: true });

        if (error) {
            toast.error(`No se pudieron cargar las cuentas contables: ${error.message}`);
            setCuentas([]);
        } else {
            setCuentas(data || []);
        }
        setIsLoading(false);
    }, [empresaId]);

    useEffect(() => {
        fetchCuentas();
    }, [fetchCuentas]);

    return { cuentas, isLoading, fetchCuentas };
}
