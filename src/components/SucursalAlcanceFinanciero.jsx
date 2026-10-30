import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "../contexts/authcontext";
import { useEmpresa } from "../contexts/empresacontext";
import { supabase } from "../supabase/supabaseclient";

export default function SucursalAlcanceFinanciero() {
    const { empresaId, alcanceSucursalId, alcanceSucursalNombre, setSucursalAlcance } = useEmpresa();
    const { rol } = useAuth();
    const [sucursales, setSucursales] = useState([]);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        let mounted = true;
        if (rol !== "superadmin" || !empresaId) {
            setSucursales([]);
            return () => { mounted = false; };
        }

        const cargarSucursales = async () => {
            setCargando(true);
            const { data, error } = await supabase
                .from("sucursales")
                .select("id_sucursal,nombre")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .order("nombre");
            if (!mounted) return;
            if (error) {
                toast.error(`No se pudieron cargar las sucursales para el filtro: ${error.message}`);
            } else {
                setSucursales(data || []);
            }
            setCargando(false);
        };
        cargarSucursales();
        return () => { mounted = false; };
    }, [empresaId, rol]);

    if (rol !== "superadmin") {
        return (
            <p className="text-sm text-subtitle">
                Alcance contable: <span className="font-semibold text-title">{alcanceSucursalNombre}</span>
            </p>
        );
    }

    return (
        <label className="flex flex-col gap-1 text-xs text-subtitle">
            Sucursal para estos reportes
            <select
                value={alcanceSucursalId == null ? "" : String(alcanceSucursalId)}
                onChange={(event) => {
                    if (!event.target.value) {
                        setSucursalAlcance(null);
                        return;
                    }
                    const sucursal = sucursales.find((item) => String(item.id_sucursal) === event.target.value);
                    if (sucursal) {
                        setSucursalAlcance({ id: sucursal.id_sucursal, nombre: sucursal.nombre });
                    }
                }}
                disabled={cargando}
                className="min-w-52 rounded-lg border border-secondary bg-input p-2 text-title"
            >
                <option value="">Toda la empresa</option>
                {sucursales.map((sucursal) => (
                    <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>
                        {sucursal.nombre}
                    </option>
                ))}
            </select>
        </label>
    );
}
