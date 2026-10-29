// /hooks/useGastosFijos.js
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
        if (!empresaId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('gastos_fijos')
                .select(`
                    *,
                    cuentas_empresa ( nombre )
                `)
                .eq('id_empresa', empresaId)
                .order('descripcion', { ascending: true });

            if (error) throw error;
            setGastosFijos(data || []);
        } catch (error) {
            toast.error(`Error al cargar gastos fijos: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchGastosFijos();
    }, [fetchGastosFijos]);

    const crearGastoFijo = async (gastoData) => {
        setIsSaving(true);
        try {
            const { data, error } = await supabase
                .from('gastos_fijos')
                .insert([{ ...gastoData, id_empresa: empresaId }])
                .select();

            if (error) throw error;
            toast.success('✅ Plantilla de gasto creada');
            await fetchGastosFijos();
            return { success: true };
        } catch (error) {
            toast.error(`Error al crear gasto: ${error.message}`);
            return { success: false };
        } finally {
            setIsSaving(false);
        }
    };

    const registrarPagoGastoFijo = async (pago) => {
        setIsSaving(true);
        try {
            const { data, error } = await supabase.rpc('sp_registrar_pago_gasto_fijo', {
                p_id_gasto_fijo: pago.id_gasto_fijo,
                p_id_empresa: empresaId,
                p_monto_real: pago.monto_real,
                p_fecha_pago: pago.fecha_pago,
                p_id_cuenta_pago: pago.id_cuenta_pago
            });
            if (error) throw error;

            toast.success(`✅ Pago registrado.`);
            await fetchGastosFijos(); // Refresca la lista (para ver 'fecha_ultimo_registro')
            return { success: true };
        } catch (error) {
            toast.error(`Error al registrar pago: ${error.message}`);
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
        fetchGastosFijos
    };
}