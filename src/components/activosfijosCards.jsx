import { format } from "date-fns";

const formattedDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return format(date, 'dd/MM/yyyy');
};

export default function ActivosFijosCards({ codigo, nombre, vida_util_meses, fecha_adquisicion, responsable, costo_adquisicion, cuenta_activo: cuentaActivo }) {
    return (
        <div className="flex flex-col md:flex-row border border-secondary rounded-lg p-4 justify-between md:items-center shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col">
                <div className="flex flex-row gap-2 items-center mb-2 flex-wrap">
                    <h4 className="font-semibold text-title text-lg">{nombre}</h4>
                    <div>
                        <span className="text-button bg-button text-xs rounded-[20px] py-1 px-3">{codigo}</span>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:gap-2 text-sm text-subtitle mb-1">
                    <span>Vida útil: {(Number(vida_util_meses || 0) / 12).toLocaleString("es-NI")} años</span>
                    <span className="hidden md:inline">|</span>
                    <span>Adquirido: {formattedDate(fecha_adquisicion)}</span>
                    <span className="hidden md:inline">|</span>
                    <span>Responsable: {responsable || "—"}</span>
                </div>
                <p><span className="text-subtitle">Cuenta de activo: </span>{cuentaActivo?.codigo ? `${cuentaActivo.codigo} · ` : ""}{cuentaActivo?.nombre || "—"}</p>
                <p><span className="text-subtitle">Valor Compra: </span>C$ {Number(costo_adquisicion || 0).toFixed(2)}</p>
            </div>
        </div>
    );
}