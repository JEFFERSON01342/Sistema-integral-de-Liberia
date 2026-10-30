import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./authcontext";

// La aplicación administrativa está dedicada a UNA sola empresa: la librería.
// El id se toma de la variable de entorno VITE_LIBRERIA_EMPRESA_ID (por defecto 1),
// así todos los hooks del ERP quedan fijados a la librería sin selección manual.
const EMPRESA_LIBRERIA = Number(import.meta.env.VITE_LIBRERIA_EMPRESA_ID) || 1;

const EmpresaContext = createContext();

export const EmpresaProvider = ({ children }) => {
    // Fijo a la librería. Se mantiene setEmpresaId por compatibilidad con hooks existentes.
    const [empresaId, setEmpresaId] = useState(EMPRESA_LIBRERIA);
    const { perfil, rol } = useAuth();
    const idPerfil = perfil?.id;
    const idSucursalPerfil = perfil?.id_sucursal;
    const tienePerfil = Boolean(perfil);
    const [sucursalAlcance, setSucursalAlcanceState] = useState(null);

    useEffect(() => {
        if (!tienePerfil) {
            setSucursalAlcanceState(null);
            return;
        }
        if (rol !== "superadmin" && idSucursalPerfil) {
            setSucursalAlcanceState({
                id: Number(idSucursalPerfil),
                nombre: `Sucursal ${idSucursalPerfil}`,
            });
            return;
        }
        setSucursalAlcanceState(null);
    }, [idPerfil, idSucursalPerfil, tienePerfil, rol]);

    const setSucursalAlcance = useCallback((sucursal) => {
        if (rol !== "superadmin") {
            setSucursalAlcanceState(idSucursalPerfil ? {
                id: Number(idSucursalPerfil),
                nombre: `Sucursal ${idSucursalPerfil}`,
            } : null);
            return;
        }
        setSucursalAlcanceState(sucursal ? {
            id: Number(sucursal.id),
            nombre: sucursal.nombre || `Sucursal ${sucursal.id}`,
        } : null);
    }, [idSucursalPerfil, rol]);

    return (
        <EmpresaContext.Provider value={{
            empresaId,
            setEmpresaId,
            sucursalAlcance,
            alcanceSucursalId: sucursalAlcance?.id ?? null,
            alcanceSucursalNombre: sucursalAlcance?.nombre || "Toda la empresa",
            setSucursalAlcance,
        }}>
            {children}
        </EmpresaContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useEmpresa = () => {
    return useContext(EmpresaContext);
}
