import {CircleCheck, DollarSign, Pencil, Trash} from "lucide-react"

export default function VentasCards({ cliente, fecha, total, estado }) {
    return (
        <div className="flex flex-row border border-secondary rounded-lg p-4 justify-between shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col">
                <div className="flex flex-row gap-2 items-center mb-1">
                    <h4 className="font-semibold text-title text-lg">{cliente}</h4>
                    <div className="rounded-[20px] bg-button ml-2 py-1 gap-2 px-2 text-button flex items-center justify-center text-xs">
                        <CircleCheck className="text-button"/>
                        <span>Al dia</span>
                    </div>
                    <div>
                        <span className="text-button bg-button text-xs rounded-[20px] py-2 px-3">Activo</span>
                    </div>
                </div>
                <p className="text-sm text-subtitle mb-1">{fecha}</p>
                <p><span>Total: </span>$ {total}</p>
            </div>
            <div className="flex flex-row gap-3 items-center">
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><DollarSign /></button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><Pencil /></button>
                <button className="border border-secondary text-title p-2 rounded-[10px] text-xs cursor-pointer hover:scale-110 transition"><Trash /></button>
            </div>
        </div>
    );
}