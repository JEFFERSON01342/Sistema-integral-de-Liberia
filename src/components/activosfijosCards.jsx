import { CircleCheck, Pencil, Trash } from "lucide-react"
import { format } from "date-fns";

const formattedDate = (dateString) => {
    const date = new Date(dateString);
    return format(date, 'dd/MM/yyyy');
};

export default function ActivosFijosCards({ nombre, vida_util_anios, fecha_compra, responsable, valor_compra }) {
    return (
        <div className="flex flex-col md:flex-row border border-secondary rounded-lg p-4 justify-between md:items-center shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col">
                <div className="flex flex-row gap-2 items-center mb-2 flex-wrap">
                    <h4 className="font-semibold text-title text-lg">{nombre}</h4>
                    <div>
                        <span className="text-button bg-button text-xs rounded-[20px] py-1 px-3">Activo</span>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:gap-2 text-sm text-subtitle mb-1">
                    <span>Vida útil: {vida_util_anios} años</span>
                    <span className="hidden md:inline">|</span>
                    <span>Adquirido: {formattedDate(fecha_compra)}</span>
                    <span className="hidden md:inline">|</span>
                    <span>Responsable: {responsable}</span>
                </div>
                <p><span className="text-subtitle">Valor Compra: </span>C$ {valor_compra.toFixed(2)}</p>
            </div>
            <div className="flex flex-row flex-wrap gap-3 items-center mt-4 md:mt-0">
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition">Dar de baja</button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition">Vender</button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><Pencil size={14} /></button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><Trash size={14} /></button>
            </div>
        </div>
    );
}