import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";

const CUENTAS_ACTIVO_FIJO = new Set(["1.2.01", "1.2.02", "1.2.03"]);
const CUENTAS_DEPRECIACION = new Set(["1.3.01", "1.3.02"]);
const CUENTA_GASTO_DEPRECIACION = "6.5.01";

export function useActivosFijos() {
    const { empresaId } = useEmpresa();
    const { perfil } = useAuth();
    const [activosFijos, setActivosFijos] = useState([]);
    const [cuentasActivoFijo, setCuentasActivoFijo] = useState([]);
    const [cuentasDepreciacionAcumulada, setCuentasDepreciacionAcumulada] = useState([]);
    const [cuentasGasto, setCuentasGasto] = useState([]);
    const [cuentasPago, setCuentasPago] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const fetchActivosFijos = useCallback(async () => {
        if (!empresaId) {
            setActivosFijos([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { data: activos, error: activosError } = await supabase
                .from("activos_fijos")
                .select("*")
                .eq("id_empresa", empresaId)
                .order("nombre", { ascending: true });
            if (activosError) throw activosError;

            const accountIds = [...new Set((activos || []).flatMap((activo) => [
                activo.id_cuenta_activo,
                activo.id_cuenta_depreciacion_acumulada,
                activo.id_cuenta_gasto_depreciacion,
            ]))];
            let cuentas = [];
            if (accountIds.length) {
                const { data, error: cuentasError } = await supabase
                    .from("cuentas_contables")
                    .select("id_cuenta, codigo, nombre")
                    .eq("id_empresa", empresaId)
                    .in("id_cuenta", accountIds);
                if (cuentasError) throw cuentasError;
                cuentas = data || [];
            }
            const cuentasPorId = new Map(cuentas.map((cuenta) => [cuenta.id_cuenta, cuenta]));
            setActivosFijos((activos || []).map((activo) => ({
                ...activo,
                cuenta_activo: cuentasPorId.get(activo.id_cuenta_activo) || null,
            })));
        } catch (fetchError) {
            console.error("Error al cargar activos fijos:", fetchError.message);
            setError(fetchError.message);
            toast.error(`Error al cargar activos fijos: ${fetchError.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    const fetchCatalogos = useCallback(async () => {
        if (!empresaId) {
            setCuentasActivoFijo([]);
            setCuentasDepreciacionAcumulada([]);
            setCuentasGasto([]);
            setCuentasPago([]);
            return;
        }
        const { data, error: cuentasError } = await supabase
            .from("cuentas_contables")
            .select("id_cuenta, codigo, nombre, naturaleza, es_efectivo, es_banco")
            .eq("id_empresa", empresaId)
            .eq("activa", true)
            .eq("es_grupo", false)
            .eq("permite_movimientos", true)
            .order("codigo", { ascending: true });
        if (cuentasError) {
            console.error("Error al cargar cuentas para activos fijos:", cuentasError.message);
            setError(cuentasError.message);
            toast.error(`Error al cargar cuentas contables: ${cuentasError.message}`);
            return;
        }

        const cuentas = data || [];
        setCuentasActivoFijo(cuentas.filter((cuenta) => CUENTAS_ACTIVO_FIJO.has(cuenta.codigo)));
        setCuentasDepreciacionAcumulada(cuentas.filter((cuenta) => CUENTAS_DEPRECIACION.has(cuenta.codigo)));
        setCuentasGasto(cuentas.filter((cuenta) =>
            cuenta.codigo === CUENTA_GASTO_DEPRECIACION
        ));
        setCuentasPago(cuentas.filter((cuenta) =>
            cuenta.es_efectivo || cuenta.es_banco
        ));
    }, [empresaId]);

    useEffect(() => {
        fetchActivosFijos();
        fetchCatalogos();
    }, [fetchActivosFijos, fetchCatalogos]);

    const addActivoFijo = async (nuevoActivo) => {
        if (!empresaId || !nuevoActivo.id_sucursal) {
            return { success: false, message: "Selecciona una sucursal activa." };
        }
        if (!perfil?.id || !nuevoActivo.clave_idempotencia) {
            return { success: false, message: "No se pudo validar la sesión para registrar el activo." };
        }
        if (!nuevoActivo.id_cuenta_pago) {
            return { success: false, message: "Debes seleccionar la cuenta de pago (Caja o Banco)." };
        }

        setIsSaving(true);
        setError(null);
        try {
            const codigoCategoria = `AF-${nuevoActivo.codigo}`.replace(/[^A-Z0-9_-]/gi, "").slice(0, 40);
            const { data, error: adquisicionError } = await supabase.rpc(
                "registrar_activo_fijo_con_categoria",
                {
                    p_id_empresa: empresaId,
                    p_codigo_categoria: codigoCategoria,
                    p_nombre_categoria: nuevoActivo.nombre,
                    p_vida_util_meses: nuevoActivo.vida_util_meses,
                    p_id_cuenta_activo: nuevoActivo.id_cuenta_activo,
                    p_id_cuenta_depreciacion_acumulada: nuevoActivo.id_cuenta_depreciacion_acumulada,
                    p_id_cuenta_gasto_depreciacion: nuevoActivo.id_cuenta_gasto_depreciacion,
                    p_id_sucursal: Number(nuevoActivo.id_sucursal),
                    p_codigo: nuevoActivo.codigo,
                    p_nombre: nuevoActivo.nombre,
                    p_descripcion: nuevoActivo.descripcion || null,
                    p_numero_serie: nuevoActivo.numero_serie || null,
                    p_fecha_adquisicion: nuevoActivo.fecha_compra,
                    p_fecha_puesta_en_servicio: nuevoActivo.fecha_compra,
                    p_costo_adquisicion: Number(nuevoActivo.valor_compra),
                    p_valor_residual: Number(nuevoActivo.valor_residual || 0),
                    p_id_cuenta_contrapartida: Number(nuevoActivo.id_cuenta_pago),
                    p_ubicacion: nuevoActivo.ubicacion || null,
                    p_responsable: nuevoActivo.responsable || null,
                    p_clave_idempotencia: nuevoActivo.clave_idempotencia,
                }
            );
            if (adquisicionError) throw adquisicionError;

            toast.success("Activo fijo y asiento contable registrados.");
            await fetchActivosFijos();
            return { success: true, data };
        } catch (saveError) {
            console.error("Error al agregar activo fijo:", saveError.message);
            setError(saveError.message);
            return { success: false, message: saveError.message };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        activosFijos,
        cuentasActivoFijo,
        cuentasDepreciacionAcumulada,
        cuentasGasto,
        cuentasPago,
        isLoading,
        isSaving,
        error,
        addActivoFijo,
        fetchActivosFijos,
    };
}
