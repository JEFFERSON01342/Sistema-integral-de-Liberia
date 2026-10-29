import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";

const TABLA = 'activos_fijos';

export function useActivosFijos() {
    const { empresaId } = useEmpresa();
    const [activosFijos, setActivosFijos] = useState([]);
    
    // Listas para los Dropdowns
    const [cuentasActivoFijo, setCuentasActivoFijo] = useState([]); 
    const [cuentasGasto, setCuentasGasto] = useState([]); 
    const [cuentasPago, setCuentasPago] = useState([]); 

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    // 1. Cargar Activos Fijos (Tabla Principal)
    const fetchActivosFijos = useCallback(async () => {
        if (!empresaId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from(TABLA)
                .select(`
                    *, 
                    cuentas_empresa:id_cuenta_activo ( nombre, codigo )
                `)
                .eq('id_empresa', empresaId)
                .order('nombre', { ascending: true });

            if (error) throw error;
            setActivosFijos(data || []);
        } catch (err) {
            console.error("Error al cargar activos fijos:", err.message);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId]);

    // 2. Cargar Catálogos (LA CORRECCIÓN)
    const fetchCatalogos = useCallback(async () => {
        if (!empresaId) return;
        try {
            // Traemos TODAS las cuentas con sus relaciones
            // tipo_cuenta y subtipo_cuenta deben coincidir con los nombres de tus tablas de catálogo
            const { data: todasLasCuentas, error } = await supabase
                .from('cuentas_empresa')
                .select(`
                    *,
                    tipo_cuenta:id_tipo ( nombre ),
                    subtipo_cuenta:id_subtipo ( nombre )
                `)
                .eq('id_empresa', empresaId);

            if (error) throw error;

            if (todasLasCuentas) {
                // A. Filtrar Activos No Corrientes (Para el activo fijo)
                const activos = todasLasCuentas.filter(c => 
                    c.tipo_cuenta?.nombre === 'Activo' && 
                    c.subtipo_cuenta?.nombre?.includes('No Corriente')
                );
                setCuentasActivoFijo(activos);

                // B. Filtrar Gastos (Para la depreciación)
                const gastos = todasLasCuentas.filter(c => 
                    c.tipo_cuenta?.nombre === 'Gasto'
                );
                setCuentasGasto(gastos);

                // C. Filtrar Efectivo (Para pagar) -> Buscamos "Caja" o "Banco" en el nombre
                const pagos = todasLasCuentas.filter(c => 
                    c.tipo_cuenta?.nombre === 'Activo' && 
                    (c.nombre.toLowerCase().includes('caja') || c.nombre.toLowerCase().includes('banco'))
                );
                setCuentasPago(pagos);
            }

        } catch (err) {
            console.error("Error al cargar catálogos:", err.message);
            // toast.error("Error cargando cuentas contables");
        }
    }, [empresaId]);

    useEffect(() => {
        fetchActivosFijos();
        fetchCatalogos();
    }, [fetchActivosFijos, fetchCatalogos]);


    // 3. Guardar Nuevo Activo (IGUAL QUE ANTES)
    const addActivoFijo = async (nuevoActivo) => {
        if (!empresaId) return { success: false, message: "No hay empresa seleccionada." };

        if (!nuevoActivo.id_cuenta_pago) {
            return { success: false, message: "Debes seleccionar la cuenta de pago (Caja o Banco)." };
        }

        setIsSaving(true);
        setError(null);

        try {
            const { id_cuenta_pago, ...activoParaInsertar } = nuevoActivo;

            const activoData = {
                ...activoParaInsertar,
                id_empresa: empresaId
            };

            const { data, error } = await supabase
                .from(TABLA)
                .insert(activoData)
                .select()
                .single();

            if (error) throw error;

            const movimientos = [
                {
                    id_empresa: empresaId,
                    id_cuenta: nuevoActivo.id_cuenta_activo,
                    fecha: nuevoActivo.fecha_compra,
                    tipo: 'DEBE',
                    monto: Number(nuevoActivo.valor_compra),
                    descripcion: `Compra de activo fijo: ${nuevoActivo.nombre}`
                },
                {
                    id_empresa: empresaId,
                    id_cuenta: id_cuenta_pago,
                    fecha: nuevoActivo.fecha_compra,
                    tipo: 'HABER',
                    monto: Number(nuevoActivo.valor_compra),
                    descripcion: `Pago por compra de activo: ${nuevoActivo.nombre}`
                }
            ];

            const { error: errorMovimiento } = await supabase
                .from('movimiento')
                .insert(movimientos);

            if (errorMovimiento) {
                console.error("Error asiento:", errorMovimiento);
                toast.error("Activo guardado, pero falló el registro contable.");
            } else {
                toast.success("Activo y asiento contable registrados.");
            }

            await fetchActivosFijos();
            return { success: true, data: data };

        } catch (err) {
            console.error("Error al agregar activo fijo:", err.message);
            return { success: false, message: err.message }; 
        } finally {
            setIsSaving(false);
        }
    };

    return {
        activosFijos,
        cuentasActivoFijo,
        cuentasGasto,
        cuentasPago,
        isLoading,
        isSaving,
        error,
        addActivoFijo,
        fetchActivosFijos
    };
}