import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

async function crearYContabilizarAsiento({
    empresaId,
    sucursalId,
    fecha,
    descripcion,
    lineas,
    idempotenciaKey,
    tipo = "MANUAL",
    origenTipo,
    origenId,
}) {
    const { data: nuevoId, error: errorBorrador } = await supabase.rpc("crear_comprobante_borrador", {
        p_id_empresa: empresaId,
        p_id_sucursal: sucursalId,
        p_fecha: fecha,
        p_tipo: tipo,
        p_descripcion: descripcion,
        p_lineas: lineas,
        p_idempotencia_key: idempotenciaKey,
        p_origen_tipo: origenTipo,
        p_origen_id: origenId,
    });

    let idComprobante = nuevoId;
    if (errorBorrador) {
        const { data: existente, error: errorConsulta } = await supabase
            .from("comprobantes_contables")
            .select("id_comprobante, estado")
            .eq("id_empresa", empresaId)
            .eq("idempotencia_key", idempotenciaKey)
            .maybeSingle();
        if (errorConsulta) throw errorConsulta;
        if (!existente) throw errorBorrador;
        if (existente.estado === "CANCELADO") {
            throw new Error(`El comprobante ${existente.id_comprobante} asociado al intento ya está cancelado.`);
        }
        if (existente.estado === "CONTABILIZADO") return existente.id_comprobante;
        idComprobante = existente.id_comprobante;
    }

    const { error: errorContabilizar } = await supabase.rpc("contabilizar_comprobante", {
        p_id_comprobante: idComprobante,
    });
    if (errorContabilizar) {
        throw new Error(`El borrador ${idComprobante} quedó guardado, pero no se pudo contabilizar: ${errorContabilizar.message}`);
    }

    return idComprobante;
}

export function useCajasBancos() {
    const { empresaId } = useEmpresa();
    const [movimientos, setMovimientos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingMov, setIsSavingMov] = useState(false);
    const [isDeletingMov, setIsDeletingMov] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const movimientoAttemptRef = useRef(null);
    const saldoInicialAttemptRef = useRef(null);
    const savingMovementRef = useRef(false);
    const savingOpeningRef = useRef(false);

    const fetchMovimientos = useCallback(async () => {
        if (!empresaId) {
            setMovimientos([]);
            return;
        }

        setIsLoading(true);
        try {
            const { data: cuentas, error: errorCuentas } = await supabase
                .from("cuentas_contables")
                .select("id_cuenta")
                .eq("id_empresa", empresaId)
                .or("es_banco.eq.true,es_efectivo.eq.true");
            if (errorCuentas) throw errorCuentas;

            if (!cuentas?.length) {
                setMovimientos([]);
                return;
            }

            const lineas = [];
            const pageSize = 1000;
            let offset = 0;
            while (true) {
                const { data, error } = await supabase
                    .from("lineas_comprobante_contable")
                    .select(`
                        id_linea, id_cuenta, debe, haber, descripcion,
                        cuentas_contables!inner ( id_cuenta, nombre, codigo, es_banco, es_efectivo ),
                        comprobantes_contables!inner ( id_comprobante, numero, fecha, descripcion, tipo, estado, origen_tipo, reverso_de_id, revertido_por_id )
                    `)
                    .eq("id_empresa", empresaId)
                    .in("id_cuenta", cuentas.map((cuenta) => cuenta.id_cuenta))
                    .eq("comprobantes_contables.estado", "CONTABILIZADO")
                    .order("id_linea", { ascending: false })
                    .range(offset, offset + pageSize - 1);
                if (error) throw error;
                lineas.push(...(data || []));
                if (!data || data.length < pageSize) break;
                offset += pageSize;
            }

            setMovimientos(lineas.map((linea) => ({
                id_movimiento: linea.id_linea,
                fecha: linea.comprobantes_contables.fecha,
                descripcion: linea.descripcion || linea.comprobantes_contables.descripcion,
                tipo: Number(linea.debe) > 0 ? "DEBE" : "HABER",
                monto: Number(linea.debe) || Number(linea.haber),
                comprobante_id: linea.comprobantes_contables.id_comprobante,
                cuentas_contables: linea.cuentas_contables,
                comprobantes_contables: linea.comprobantes_contables,
            })));
        } catch (error) {
            console.error("Error al cargar movimientos de caja y bancos:", error.message);
            toast.error(`No se pudieron cargar los movimientos: ${error.message}`);
            setMovimientos([]);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    useEffect(() => {
        fetchMovimientos();
    }, [fetchMovimientos]);

    const agregarMovimiento = async (movimiento) => {
        if (!empresaId || !movimiento.id_sucursal) {
            toast.error("Seleccione una sucursal para registrar el movimiento.");
            return null;
        }
        const monto = Number(movimiento.monto);
        if (!Number.isFinite(monto) || monto <= 0 || !/^\d+(\.\d{1,2})?$/.test(String(movimiento.monto).trim())) {
            toast.error("El monto debe ser positivo y tener como máximo dos decimales.");
            return null;
        }
        if (!movimiento.id_cuenta || !movimiento.id_contrapartida
            || Number(movimiento.id_cuenta) === Number(movimiento.id_contrapartida)) {
            toast.error("Seleccione cuentas distintas para el movimiento.");
            return null;
        }

        const descripcion = [
            movimiento.descripcion?.trim() || "Movimiento de caja/banco",
            movimiento.referencia?.trim() ? `Referencia: ${movimiento.referencia.trim()}` : null,
        ].filter(Boolean).join(" · ");
        const debeCuenta = movimiento.tipo === "DEBE" ? Number(movimiento.id_cuenta) : Number(movimiento.id_contrapartida);
        const haberCuenta = movimiento.tipo === "DEBE" ? Number(movimiento.id_contrapartida) : Number(movimiento.id_cuenta);
        const lineas = [
            { id_cuenta: debeCuenta, debe: monto, haber: 0, descripcion },
            { id_cuenta: haberCuenta, debe: 0, haber: monto, descripcion },
        ];
        const fingerprint = JSON.stringify({
            sucursalId: Number(movimiento.id_sucursal),
            fecha: movimiento.fecha,
            descripcion,
            lineas,
        });
        if (movimientoAttemptRef.current && movimientoAttemptRef.current.fingerprint !== fingerprint) {
            toast.error("Hay un intento previo pendiente. Reintente con los mismos datos antes de cambiar el movimiento.");
            return null;
        }
        if (savingMovementRef.current) return null;
        savingMovementRef.current = true;
        setIsSavingMov(true);
        const intento = movimientoAttemptRef.current || {
            key: crypto.randomUUID(),
            fingerprint,
        };
        movimientoAttemptRef.current = intento;

        try {
            await crearYContabilizarAsiento({
                empresaId,
                sucursalId: Number(movimiento.id_sucursal),
                fecha: movimiento.fecha,
                descripcion,
                idempotenciaKey: intento.key,
                origenTipo: "MOVIMIENTO_CAJA_BANCO",
                origenId: intento.key,
                lineas,
            });
            movimientoAttemptRef.current = null;
            toast.success("Movimiento registrado y contabilizado.");
            await fetchMovimientos();
            return true;
        } catch (error) {
            console.error("Error al guardar movimiento:", error.message);
            toast.error(`No se pudo guardar el movimiento: ${error.message}`);
            return null;
        } finally {
            savingMovementRef.current = false;
            setIsSavingMov(false);
        }
    };

    const revertirMovimiento = async (comprobanteId, motivo, fecha) => {
        setIsDeletingMov(true);
        try {
            const { error } = await supabase.rpc("revertir_comprobante_contable", {
                p_id_comprobante: Number(comprobanteId),
                p_fecha_reversion: fecha,
                p_motivo: motivo,
            });
            if (error) throw error;

            await fetchMovimientos();
            return { success: true };
        } catch (error) {
            console.error("Error al revertir movimiento:", error.message);
            return { success: false, message: error.message };
        } finally {
            setIsDeletingMov(false);
        }
    };

    const registrarSaldoInicial = async (datos) => {
        if (!empresaId || !datos.id_sucursal) {
            toast.error("Seleccione una sucursal para registrar el saldo inicial.");
            return { success: false };
        }
        const monto = Number(datos.monto);
        if (!Number.isFinite(monto) || monto <= 0 || !/^\d+(\.\d{1,2})?$/.test(String(datos.monto).trim())) {
            toast.error("El monto debe ser positivo y tener como máximo dos decimales.");
            return { success: false };
        }
        if (!datos.id_cuenta || !datos.id_cuenta_capital
            || Number(datos.id_cuenta) === Number(datos.id_cuenta_capital)) {
            toast.error("Seleccione una cuenta de caja/banco y una cuenta de capital distintas.");
            return { success: false };
        }

        const lineas = [
            { id_cuenta: Number(datos.id_cuenta), debe: monto, haber: 0 },
            { id_cuenta: Number(datos.id_cuenta_capital), debe: 0, haber: monto },
        ];
        const fingerprint = JSON.stringify({
            sucursalId: Number(datos.id_sucursal),
            fecha: datos.fecha,
            descripcion: datos.descripcion || "Asiento de apertura (saldo inicial)",
            lineas,
        });
        if (saldoInicialAttemptRef.current && saldoInicialAttemptRef.current.fingerprint !== fingerprint) {
            toast.error("Hay un intento previo pendiente. Reintente con los mismos datos antes de cambiar el saldo inicial.");
            return { success: false };
        }
        if (savingOpeningRef.current) return { success: false };
        savingOpeningRef.current = true;
        setIsSaving(true);
        const intento = saldoInicialAttemptRef.current || {
            key: crypto.randomUUID(),
            fingerprint,
        };
        saldoInicialAttemptRef.current = intento;
        try {
            await crearYContabilizarAsiento({
                empresaId,
                sucursalId: Number(datos.id_sucursal),
                fecha: datos.fecha,
                tipo: "APERTURA",
                descripcion: datos.descripcion || "Asiento de Apertura (Saldo Inicial)",
                idempotenciaKey: intento.key,
                origenTipo: "SALDO_INICIAL",
                origenId: intento.key,
                lineas,
            });
            saldoInicialAttemptRef.current = null;
            toast.success("Saldo inicial registrado correctamente.");
            await fetchMovimientos();
            return { success: true };
        } catch (error) {
            console.error("Error al registrar saldo inicial:", error.message);
            toast.error(`No se pudo registrar el saldo inicial: ${error.message}`);
            return { success: false };
        } finally {
            savingOpeningRef.current = false;
            setIsSaving(false);
        }
    };

    return {
        movimientos,
        isLoading,
        agregarMovimiento,
        isSavingMov,
        revertirMovimiento,
        isDeletingMov,
        registrarSaldoInicial,
        isSaving,
        fetchMovimientos,
    };
}
