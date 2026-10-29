import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import { toast } from "react-hot-toast";

export function useEmpresas() {
  const { session } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEmpresas = async () => {
      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("empresa")
        .select(`
          id_empresa,
          nombre,
          descripcion,
          sector:sector (nombre_sector),
          moneda:moneda (simbolo)
        `)
        .eq("id_user", session.user.id)
        .order("id_empresa", { ascending: false });

      if (error) {
        console.error("Error al cargar las empresas:", error);
      } else {
        setEmpresas(data || []);
      }

      setIsLoading(false);
    };

    fetchEmpresas();
  }, [session]);

  const crearEmpresa = async (nuevaEmpresa) => {
    setIsLoading(true);
    try {
      // Validamos que los datos existan
      if (!nuevaEmpresa.nombre || !nuevaEmpresa.id_moneda || !nuevaEmpresa.id_sector) {
        throw new Error("Faltan datos obligatorios (Nombre, Moneda o Sector)");
      }

      const { data, error } = await supabase.rpc('sp_crear_empresa_con_catalogo', {
        p_nombre: nuevaEmpresa.nombre,
        p_descripcion: nuevaEmpresa.descripcion || "", // Enviar string vacío si es null
        p_id_moneda: parseInt(nuevaEmpresa.id_moneda),
        p_id_sector: parseInt(nuevaEmpresa.id_sector),
        p_id_user: session.user.id // El ID de autenticación de Supabase
      });

      if (error) throw error;

      toast.success("Empresa creada y catálogo generado 🚀");
      await fetchEmpresas();
      return { success: true };
    } catch (error) {
      console.error(error);
      toast.error("Error al crear empresa: " + error.message);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const eliminarEmpresa = async (idEmpresa) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('sp_eliminar_empresa', {
        p_id_empresa: idEmpresa
      });

      if (error) throw error;

      toast.success("Empresa eliminada correctamente 🗑️");

      // Refrescar la lista y limpiar la selección si borramos la activa
      await fetchEmpresas();
      return { success: true };

    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar: " + error.message);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  return { empresas, isLoading, crearEmpresa, eliminarEmpresa };
}

