import { CircleCheck, DollarSign, Pencil, Trash } from "lucide-react";

export default function ClientesCards({ nombre, identificacion, correo, telefono, direccion, limite_credito }) {
    return (
        // --- 1. Contenedor Principal Corregido ---
        // 'flex-col' (apilado) en móvil
        // 'md:flex-row' (lado a lado) en desktop
        <div className="flex flex-col md:flex-row border border-secondary rounded-lg p-4 justify-between md:items-center shadow-sm hover:shadow-md transition-shadow duration-200">

            <div className="flex flex-col">
                {/* --- 2. Sección de Título (con flex-wrap) --- */}
                {/* 'flex-wrap' permite que los badges caigan a la siguiente línea si no hay espacio */}
                <div className="flex flex-row gap-2 items-center mb-2 flex-wrap">
                    <h4 className="font-semibold text-title text-lg">{nombre}</h4>
                    <div className="rounded-[20px] bg-button py-1 gap-2 px-2 text-button flex items-center justify-center text-xs">
                        <CircleCheck className="text-button" size={14} />
                        <span>Al dia</span>
                    </div>
                    <div>
                        <span className="text-button bg-button text-xs rounded-[20px] py-1 px-3">Activo</span>
                    </div>
                </div>

                {/* --- 3. Información de Contacto Corregida --- */}
                {/* Se apila en móvil, se pone en línea en desktop */}
                <div className="flex flex-col md:flex-row md:items-center md:gap-2 text-sm text-subtitle mb-1">
                    <span>{identificacion}</span>
                    <span className="hidden md:inline">|</span>
                    <span>{correo}</span>
                    <span className="hidden md:inline">|</span>
                    <span>{telefono}</span>
                </div>

                <p><span>Credito: </span>$ {limite_credito}</p>
            </div>

            {/* --- 4. Sección de Botones Corregida --- */}
            {/* 'mt-4' (margen superior) en móvil, 'md:mt-0' (sin margen) en desktop */}
            <div className="flex flex-row gap-3 items-center mt-4 md:mt-0">
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><DollarSign /></button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><Pencil /></button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><Trash /></button>
            </div>
        </div>
    );
}