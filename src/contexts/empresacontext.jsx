import { createContext, useContext, useState } from "react";

// La aplicación administrativa está dedicada a UNA sola empresa: la librería.
// El id se toma de la variable de entorno VITE_LIBRERIA_EMPRESA_ID (por defecto 1),
// así todos los hooks del ERP quedan fijados a la librería sin selección manual.
const EMPRESA_LIBRERIA = Number(import.meta.env.VITE_LIBRERIA_EMPRESA_ID) || 1;

const EmpresaContext = createContext();

export const EmpresaProvider = ({ children }) => {
    // Fijo a la librería. Se mantiene setEmpresaId por compatibilidad con hooks existentes.
    const [empresaId, setEmpresaId] = useState(EMPRESA_LIBRERIA);

    return (
        <EmpresaContext.Provider value={{ empresaId, setEmpresaId }}>
            {children}
        </EmpresaContext.Provider>
    );
}

export const useEmpresa = () => {
    return useContext(EmpresaContext);
}
