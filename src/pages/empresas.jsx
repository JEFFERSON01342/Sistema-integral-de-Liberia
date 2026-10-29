import { Building2, Plus, SquarePen, Trash } from "lucide-react"
import { useEffect, useState } from "react"
import { useEmpresas } from "../hooks/useEmpresas"
import { useEmpresa } from "../contexts/empresacontext"
import NuevaEmpresaModal from "../components/nuevaEmpresaModal"
import Swal from "sweetalert2"

export default function Empresas() {
    const { empresas, isLoading, eliminarEmpresa } = useEmpresas();
    const { empresaId, setEmpresaId } = useEmpresa();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const empresaSeleccionada = empresas.find(e => e.id_empresa === empresaId)

    useEffect(() => {
        if (empresas.length > 0 && !empresaSeleccionada) {
            setEmpresaId(empresas[0].id_empresa)
        }
    }, [empresas, empresaId, setEmpresaId])

    const handleDelete = async (e, id, nombre) => {
        e.stopPropagation(); // Evita que se seleccione la empresa al hacer click en borrar
        
        Swal.fire({
            title: '¿Eliminar Empresa?',
            text: `Estás a punto de borrar "${nombre}" y TODOS sus datos (ventas, contabilidad, inventario). Esta acción no se puede deshacer.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar todo',
            cancelButtonText: 'Cancelar',
            background: '#1a1a1a', // Ajusta a tu tema oscuro
            color: '#ffffff'
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { success } = await eliminarEmpresa(id);
                // Si borramos la empresa actual, limpiamos el contexto o seleccionamos otra
                if (success && id === empresaId) {
                    setEmpresaId(null); 
                }
            }
        });
    };

    return (
        <>
            <div className="flex flex-row justify-between mt-4">
                <div className="flex-col">
                    <h3 className="text-title text-2xl font-bold">Gestión de Empresas</h3>
                    <p className="text-subtitle">Administra las empresas y selecciona una para trabajar</p>
                </div>
                <button className="bg-button flex flex-row h-10 text-button text-l gap-3 p-2 rounded-xl items-center hover:opacity-95 transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer" onClick={() => setIsModalOpen(true)}>
                    <Plus />
                    Nueva empresa
                </button>
            </div>
            <div className="flex flex-col mt-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-8">
                        <div className="w-10 h-10 border-4 border-title border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-title text-lg mt-4">Cargando...</p>
                    </div>
                ) : empresas.length === 0 ? (
                    <div className="flex flex-col items-center border-1 border-secondary rounded-xl gap-4 p-4">
                        <span className="icon"><Building2 size={64} /></span>
                        <h3 className="text-title text-xl">No hay empresas registradas</h3>
                        <p className="text-subtitle text-s">Crea tu primera empresa para empezar a gestionarla</p>
                        <button className="btn-new bg-button text-button flex flex-row h-10 text-l gap-3 p-1 rounded-xl items-center hover:opacity-95 transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer" onClick={() => setIsModalOpen(true)}>
                            <span className="icon"><Plus /></span>
                            Crear primera empresa
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                        {empresas.map((empresa) => {
                            const isSelected = empresaSeleccionada?.id_empresa === empresa.id_empresa;
                            return (
                                <div key={empresa.id_empresa} className={`flex flex-col gap-2 border border-secondary rounded-xl p-8 justify-between min-w-[80%] cursor-pointer transition-transform duration-200 ease-in-out hover:scale-105 ${isSelected ? "border-2 border-cards" : "border border-secondary"}`} onClick={() => setEmpresaId(empresa.id_empresa)}>
                                    <div className="flex flex-row justify-between items-center">
                                        <h4 className="text-title text-xl font-semibold">
                                            {empresa.nombre}
                                        </h4>
                                        <div className="gap-4 flex flex-row">
                                            <button className="hover:bg-blue-800 cursor-pointer rounded-4xl p-2 transition-transform duration-200 ease-in-out hover:scale-110">
                                                <span className="icon"><SquarePen size={18} /></span>
                                            </button>
                                            <button className="hover:bg-[#96030C] cursor-pointer rounded-4xl p-2 transition-transform duration-200 ease-in-out hover:scale-110" onClick={(e) => handleDelete(e, empresa.id_empresa, empresa.nombre)}>
                                                <span className="icon"><Trash size={18} /></span>
                                            </button>
                                        </div>

                                    </div>
                                    <p className="text-subtitle text-sm">{empresa.descripcion}</p>
                                    {empresa.sector && (
                                        <div className="p-2 w-40 bg-secondary rounded-2xl flex flex-row justify-center mt-8">
                                            <h6 className="text-title text-xs font-bold">{empresa.sector.nombre_sector}</h6>
                                        </div>
                                    )}
                                    {empresa.moneda && (
                                        <div className="flex flex-row justify-between items-center">
                                            <p className="text-subtitle text-s">
                                                Moneda: {empresa.moneda.simbolo}
                                            </p>
                                            <div className="p-2 rounded-2xl bg-button flex flex-row items-center justify-center">
                                                <p className="text-button text-xs">Seleccionada</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )
                }
            </div>

            {isModalOpen && (
                <NuevaEmpresaModal onClose={() => setIsModalOpen(false)} />
            )}
        </>
    )
}