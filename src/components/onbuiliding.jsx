import { MessageSquareCode } from "lucide-react"

export default function OnBuilding() {
    return(
        <>
            <div className="flex flex-col gap-4 items-center p-8 mt-10">
                <span className="icon"><MessageSquareCode size={72} /></span>
                <h3 className="text-title text-2xl font-bold">Pagina en desarrollo</h3>
                <p className="text-subtitle text-l">Lo sentimos, estamos aun trabajando en esta pagina</p>
            </div>
        </>
    )
}