import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

export function usePrestamos() {
    const { empresaId } = useEmpresa();
    const [prestamos, setPrestamos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const claveCreacionRef = useRef(null);
    const clavesPagoRef = useRef(new Map());

    const fetchPrestamos = useCallback(async () => {
        if (!empresaId) {
            setPrestamos([]);
            return;
        }

        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("prestamos")
                .select("id_prestamo, id_sucursal, descripcion, monto_principal, saldo_actual, tasa_interes_anual, plazo_meses, monto_cuota_mensual, fecha_desembolso, estado, id_comprobante")
                .eq("id_empresa", empresaId)
                .order("fecha_desembolso", { ascending: false });

            if (error) throw error;
            setPrestamos(data || []);
        } catch (error) {
            toast.error(`Error al cargar préstamos: ${error.message}`);
            setPrestamos([]);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchPrestamos();
    }, [fetchPrestamos]);

    const registrarPrestamo = async (nuevoPrestamo) => {
        if (!empresaId || !nuevoPrestamo.id_sucursal) {
            toast.error("Seleccione una sucursal para registrar el préstamo.");
            return { success: false };
        }

        setIsSaving(true);
        const claveIdempotencia = claveCreacionRef.current || crypto.randomUUID();
        claveCreacionRef.current = claveIdempotencia;
        try {
            const { error } = await supabase.rpc("registrar_prestamo", {
                p_id_empresa: empresaId,
                p_id_sucursal: Number(nuevoPrestamo.id_sucursal),
                p_descripcion: nuevoPrestamo.descripcion,
                p_monto_principal: Number(nuevoPrestamo.monto_principal),
                p_tasa_interes_anual: Number(nuevoPrestamo.tasa_interes_anual),
                p_plazo_meses: Number(nuevoPrestamo.plazo_meses),
                p_fecha_desembolso: nuevoPrestamo.fecha_desembolso,
                p_id_cuenta_banco: Number(nuevoPrestamo.id_cuenta_banco),
                p_id_cuenta_pasivo: Number(nuevoPrestamo.id_cuenta_pasivo),
                p_id_cuenta_gasto: Number(nuevoPrestamo.id_cuenta_gasto),
                p_clave_idempotencia: claveIdempotencia,
            });

            if (error) throw error;
            claveCreacionRef.current = null;
            toast.success(`Préstamo "${nuevoPrestamo.descripcion}" registrado correctamente.`);
            await fetchPrestamos();
            return { success: true };
        } catch (error) {
            toast.error(`Error al registrar préstamo: ${error.message}`);
            return { success: false };
        } finally {
            setIsSaving(false);
        }
    };

    const pagarCuota = async (idPrestamo, fechaPago) => {
        setIsSaving(true);
        const claveIdempotencia = clavesPagoRef.current.get(idPrestamo) || crypto.randomUUID();
        clavesPagoRef.current.set(idPrestamo, claveIdempotencia);
        try {
            const { data: pago, error } = await supabase.rpc("registrar_pago_prestamo", {
                p_id_prestamo: idPrestamo,
                p_fecha_pago: fechaPago,
                p_clave_idempotencia: claveIdempotencia,
            });
            if (error) throw error;

            clavesPagoRef.current.delete(idPrestamo);
            toast.success(`Cuota ${pago.cuota} de C$ ${Number(pago.total).toFixed(2)} registrada. Nuevo saldo: C$ ${Number(pago.saldo).toFixed(2)}`);
            await fetchPrestamos();
            return { success: true, pago };
        } catch (error) {
            toast.error(`Error al pagar cuota: ${error.message}`);
            return { success: false, message: error.message };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        prestamos,
        isLoading,
        isSaving,
        registrarPrestamo,
        pagarCuota,
        fetchPrestamos,
    };
}
