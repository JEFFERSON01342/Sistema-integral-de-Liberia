import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function useCuentasPorCobrar() {
    const { empresaId } = useEmpresa();
    const [facturasPendientes, setFacturasPendientes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchFacturasPendientes = useCallback(async () => {
        if (!empresaId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase.rpc('sp_get_cxc_invoices', {
                p_id_empresa: empresaId
            });
            if (error) throw error;
            setFacturasPendientes(data || []);
        } catch (error) {
            toast.error(`Error al cargar CxC: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchFacturasPendientes();
    }, [fetchFacturasPendientes]);

    const registrarPago = async (pago) => {
        setIsSaving(true);
        try {
            const { data: nuevoSaldo, error } = await supabase.rpc('sp_registrar_pago_cliente', {
                p_id_empresa: empresaId,
                p_id_cliente: pago.id_cliente,
                p_id_venta: pago.id_venta,
                p_monto_pagado: pago.monto_pagado,
                p_fecha_pago: pago.fecha_pago,
                p_id_cuenta_banco: pago.id_cuenta_banco,
                p_id_cuenta_cxc: pago.id_cuenta_cxc
            });
            if (error) throw error;

            toast.success(`✅ Pago registrado. Nuevo saldo de factura: C$ ${nuevoSaldo.toFixed(2)}`);
            await fetchFacturasPendientes();
            return { success: true };
        } catch (error) {
            toast.error(`Error al registrar pago: ${error.message}`);
            return { success: false };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        facturasPendientes,
        isLoading,
        isSaving,
        registrarPago,
        fetchFacturasPendientes
    };
}