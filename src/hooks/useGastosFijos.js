import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function useGastosFijos() {
    const { empresaId } = useEmpresa();
    const [gastosFijos, setGastosFijos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchGastosFijos = useCallback(async () => {
        if (!empresaId) {
            setGastosFijos([]);
            return;
        }
        setIsLoading(true);
        try {
            const { data: gastos, error } = await supabase
                .from("gastos_fijos")
                .select("*")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .order("descripcion", { ascending: true });
            if (error) throw error;

            const accountIds = [...new Set((gastos || []).map((gasto) => gasto.id_cuenta_gasto))];
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
            setGastosFijos((gastos || []).map((gasto) => ({
                ...gasto,
                monto_estimado: Number(gasto.monto_estimado),
                cuenta_gasto: cuentasPorId.get(gasto.id_cuenta_gasto) || null,
            })));
        } catch (fetchError) {
            toast.error(`Error al cargar gastos fijos: ${fetchError.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchGastosFijos();
    }, [fetchGastosFijos]);

    const crearGastoFijo = async (gastoData) => {
        if (!empresaId) return { success: false };
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from("gastos_fijos")
                .insert({
                    ...gastoData,
                    id_empresa: empresaId,
                });
            if (error) throw error;
            toast.success("Plantilla de gasto creada.");
            await fetchGastosFijos();
            return { success: true };
        } catch (saveError) {
            toast.error(`Error al crear gasto: ${saveError.message}`);
            return { success: false };
        } finally {
            setIsSaving(false);
        }
    };

    const registrarPagoGastoFijo = async (pago) => {
        setIsSaving(true);
        try {
            const { error } = await supabase.rpc("sp_registrar_pago_gasto_fijo", {
                p_id_gasto_fijo: pago.id_gasto_fijo,
                p_id_sucursal: Number(pago.id_sucursal),
                p_monto_real: Number(pago.monto_real),
                p_fecha_pago: pago.fecha_pago,
                p_id_cuenta_pago: Number(pago.id_cuenta_pago),
                p_clave_idempotencia: pago.clave_idempotencia,
            });
            if (error) throw error;
            toast.success("Pago y asiento contable registrados.");
            await fetchGastosFijos();
            return { success: true };
        } catch (saveError) {
            toast.error(`Error al registrar pago: ${saveError.message}`);
            return { success: false };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        gastosFijos,
        isLoading,
        isSaving,
        crearGastoFijo,
        registrarPagoGastoFijo,
        fetchGastosFijos,
    };
}
