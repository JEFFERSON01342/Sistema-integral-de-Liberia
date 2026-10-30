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
            setFacturasPendientes((data || []).map((factura) => ({
                ...factura,
                monto_total: Number(factura.monto_total),
                saldo_pendiente: Number(factura.saldo_pendiente),
            })));
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
            const { data: idCobro, error } = await supabase.rpc('registrar_cobro_factura_empresa', {
                p_metodo_pago: pago.metodo_pago,
                p_asignaciones: [{
                    id_factura: pago.id_factura,
                    monto: pago.monto_pagado,
                }],
                p_clave_idempotencia: pago.clave_idempotencia,
                p_id_sesion: pago.id_sesion || null,
                p_referencia: pago.referencia || null,
            });
            if (error) throw error;

            toast.success(`Pago registrado correctamente (cobro #${idCobro}).`);
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