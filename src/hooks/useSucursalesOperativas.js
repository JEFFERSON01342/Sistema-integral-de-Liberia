import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";

export function useSucursalesOperativas() {
    const { empresaId } = useEmpresa();
    const { perfil } = useAuth();
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const fetchSucursales = useCallback(async () => {
        if (!empresaId || !perfil) {
            setSucursales([]);
            setSucursalId("");
            return;
        }
        if (perfil.rol !== "superadmin" && !perfil.id_sucursal) {
            toast.error("El perfil no tiene una sucursal asignada.");
            setSucursales([]);
            setSucursalId("");
            return;
        }

        setIsLoading(true);
        let query = supabase
            .from("sucursales")
            .select("id_sucursal, nombre")
            .eq("id_empresa", empresaId)
            .eq("activa", true)
            .order("nombre");

        if (perfil.rol !== "superadmin" && perfil.id_sucursal) {
            query = query.eq("id_sucursal", perfil.id_sucursal);
        }

        const { data, error } = await query;
        if (error) {
            toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
            setSucursales([]);
            setSucursalId("");
        } else {
            const opciones = data || [];
            setSucursales(opciones);
            setSucursalId((actual) => {
                if (opciones.some((sucursal) => String(sucursal.id_sucursal) === actual)) return actual;
                if (perfil.id_sucursal && opciones.some((sucursal) => String(sucursal.id_sucursal) === String(perfil.id_sucursal))) {
                    return String(perfil.id_sucursal);
                }
                return perfil.rol === "superadmin" && opciones.length === 1
                    ? String(opciones[0].id_sucursal)
                    : "";
            });
        }
        setIsLoading(false);
    }, [empresaId, perfil]);

    useEffect(() => {
        fetchSucursales();
    }, [fetchSucursales]);

    return { sucursales, sucursalId, setSucursalId, isLoading, fetchSucursales };
}
