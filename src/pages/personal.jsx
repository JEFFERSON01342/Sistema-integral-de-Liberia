import StatsCards from "../components/statscards";
import NuevoEmpleado from "../components/nuevoempleado";
import { useState, useMemo } from "react";
import { DollarSign, Clock, Users, Plus, Calendar, Building2 } from "lucide-react";
import EmpleadosCards from "../components/empleadosCards";
import { useEmpleados } from "../hooks/useEmpleados";
import { useCatalogosLaborales } from "../hooks/useCatalogosLaborales";
import { useAuth } from "../contexts/authcontext";

export default function Personal() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { rol, perfil } = useAuth();

    // Admin y gerente solo ven empleados de su sucursal asignada.
    const restringidoPorSucursal = rol === 'admin' || rol === 'gerente';
    const idSucursalFiltro = restringidoPorSucursal ? (perfil?.id_sucursal || null) : null;

    const { empleados, isLoading, fetchEmpleados } = useEmpleados(idSucursalFiltro);
    const { departamentos, puestos } = useCatalogosLaborales({ incluirInactivos: true });
    // Conteo total de empleados de la empresa (para comparar contra la sucursal).
    const { empleados: todosLosEmpleados } = useEmpleados();

    const { empleadosActivos, nominaMensual } = useMemo(() => {
        const activos = empleados.filter(e => e.estado === 'Activo'); // Asumo que el estado se llama 'Activo'
        const nomina = activos.reduce((sum, e) => sum + (e.salario_mensual || 0), 0);
        return {
            empleadosActivos: activos.length,
            nominaMensual: nomina
        };
    }, [empleados]);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Empleados Activos"} icon={<Users className="text-title" />} value={empleadosActivos} />
                <StatsCards title={"Nómina Mensual"} icon={<DollarSign className="text-title" />} value={`C$${nominaMensual.toFixed(2)}`} />
                <StatsCards title={"Pagos Pendientes"} icon={<Calendar color="red" />} value={0} />
                <StatsCards title={"Asistencias Hoy"} icon={<Clock className="text-title" />} value={"0"} />
            </div>

            <div className="mt-6">
                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-title text-xl font-bold">Gestión de Empleados</h3>
                            <p className="text-subtitle text-s">Administra todos tus empleados</p>
                            {restringidoPorSucursal && (
                                <span className="inline-flex items-center gap-1 w-fit mt-1 bg-button/20 text-title text-xs font-medium px-2.5 py-1 rounded-full">
                                    <Building2 size={12} /> Tu sucursal: {empleados.length} empleado(s) · {todosLosEmpleados.length} en total
                                </span>
                            )}
                        </div>
                        <button className="btn-new bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:opacity-95 hover:scale-110 transition" onClick={() => setIsModalOpen(true)}>
                            <span className="icon"><Plus /></span> Nuevo Empleado
                        </button>
                    </div>

                    {isLoading ? ( 
                        <p className="p-4 text-center text-subtitle">Cargando empleados...</p>
                    ) : empleados.length === 0 ? (
                        <p className="text-center text-subtitle p-4">No hay empleados registrados</p>
                    ) : (
                        <div className="mt-8 flex flex-col gap-4">
                            {empleados.map(empleado => (
                                <EmpleadosCards
                                    key={empleado.id_empleado}
                                    {...empleado}
                                    rol={rol}
                                    rolAccesoPuesto={puestos.find((puesto) =>
                                        Number(puesto.id_puesto) === Number(empleado.id_puesto)
                                    )?.rol_acceso || null}
                                    departamentosLaborales={departamentos}
                                    puestosLaborales={puestos}
                                    onActualizar={fetchEmpleados}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <NuevoEmpleado onClose={() => setIsModalOpen(false)} idSucursalFija={idSucursalFiltro} />
                    </div>
                </div>
            )}
        </div>
    );
}
