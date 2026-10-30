import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { toast } from "react-hot-toast";

export function useCategorias({ incluirInactivas = false } = {}) {
    const [categorias, setCategorias] = useState([]);
    const [error, setError] = useState(null);
    const { empresaId } = useEmpresa();

    const fetchCategorias = useCallback(async () => {
        if (!empresaId) {
            setCategorias([]);
            return [];
        }
        setError(null);
        let query = supabase
            .from("categorias_producto")
            .select("*")
            .eq("id_empresa", empresaId)
            .order("nombre", { ascending: true });
        if (!incluirInactivas) query = query.eq("activa", true);
        const { data, error: queryError } = await query;
        if (queryError) {
            setError(queryError.message);
            console.error("Error al cargar categorías:", queryError);
            throw queryError;
        }
        setCategorias(data || []);
        return data || [];
    }, [empresaId, incluirInactivas]);

    useEffect(() => {
        fetchCategorias().catch((fetchError) => {
            toast.error(`No se pudieron cargar las categorías: ${fetchError.message}`);
        });
    }, [fetchCategorias]);

    const agregarCategoria = async (nombre, descripcion) => {
        if (!empresaId) return { success: false, message: "No hay una empresa seleccionada." };
        const { data: existente, error: errorExistente } = await supabase
            .from("categorias_producto")
            .select("id_categoria")
            .eq("id_empresa", empresaId)
            .ilike("nombre", nombre.trim())
            .maybeSingle();
        if (errorExistente) return { success: false, message: errorExistente.message };
        if (existente) return { success: false, message: "La categoría ya existe en esta empresa." };

        const { data, error: insertError } = await supabase
            .from("categorias_producto")
            .insert([{ id_empresa: empresaId, nombre: nombre.trim(), descripcion: descripcion?.trim() || null }])
            .select()
            .single();
        if (insertError) return { success: false, message: insertError.message };
        await fetchCategorias();
        return { success: true, data };
    };

    const actualizarCategoria = async (categoria) => {
        const { data, error: updateError } = await supabase
            .from("categorias_producto")
            .update({ nombre: categoria.nombre.trim(), descripcion: categoria.descripcion?.trim() || null })
            .eq("id_empresa", empresaId)
            .eq("id_categoria", categoria.id_categoria)
            .select("id_categoria")
            .maybeSingle();
        if (updateError) return { success: false, message: updateError.message };
        if (!data) return { success: false, message: "No se encontró la categoría o no tienes permiso para modificarla." };
        await fetchCategorias();
        return { success: true };
    };

    const cambiarEstadoCategoria = async (categoria) => {
        const { data, error: updateError } = await supabase
            .from("categorias_producto")
            .update({ activa: !categoria.activa })
            .eq("id_empresa", empresaId)
            .eq("id_categoria", categoria.id_categoria)
            .select("id_categoria")
            .maybeSingle();
        if (updateError) return { success: false, message: updateError.message };
        if (!data) return { success: false, message: "No se encontró la categoría o no tienes permiso para modificarla." };
        await fetchCategorias();
        return { success: true };
    };

    const eliminarCategoria = async (categoria) => {
        const { data, error: deleteError } = await supabase
            .from("categorias_producto")
            .delete()
            .eq("id_empresa", empresaId)
            .eq("id_categoria", categoria.id_categoria)
            .select("id_categoria")
            .maybeSingle();
        if (deleteError) return { success: false, message: deleteError.message };
        if (!data) return { success: false, message: "No se encontró la categoría o no tienes permiso para eliminarla." };
        await fetchCategorias();
        return { success: true };
    };

    return {
        categorias,
        error,
        agregarCategoria,
        actualizarCategoria,
        cambiarEstadoCategoria,
        eliminarCategoria,
        fetchCategorias,
    };
}
