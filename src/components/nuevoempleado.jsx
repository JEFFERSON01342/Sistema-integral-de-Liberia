import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from "react-hot-toast"
import { useEmpleados } from "../hooks/useEmpleados";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useCatalogosLaborales } from "../hooks/useCatalogosLaborales";

export default function NuevoEmpleado({ onClose, idSucursalFija = null }) {
    const { addEmpleado } = useEmpleados();
    const { empresaId } = useEmpresa();

    const [nombreCompleto, setNombreCompleto] = useState('');
    const [identificacion, setIdentificacion] = useState('');
    const [email, setEmail] = useState('');
    const [telefono, setTelefono] = useState('');
    const [idPuesto, setIdPuesto] = useState('');
    const [idDepartamento, setIdDepartamento] = useState('');
    const [salarioMensual, setSalarioMensual] = useState('');
    const [fechaIngreso, setFechaIngreso] = useState('');
    const [cuentaBancaria, setCuentaBancaria] = useState('');
    const [estado, setEstado] = useState('Activo');
    const [claseTrabajador, setClaseTrabajador] = useState('empleado');
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState(idSucursalFija ? String(idSucursalFija) : '');
    const { departamentos, puestos, isLoading: isLoadingCatalogos } = useCatalogosLaborales();
    const puestosDisponibles = puestos.filter((puesto) =>
        String(puesto.id_departamento || "") === idDepartamento
    );
    const puestoSeleccionado = puestos.find((puesto) => String(puesto.id_puesto) === idPuesto);

    // Cargamos las sucursales disponibles (para que el superadmin pueda elegir).
    useEffect(() => {
        const cargarSucursales = async () => {
            if (!empresaId) return;
            const { data, error } = await supabase
                .from('sucursales')
                .select('id_sucursal, nombre')
                .eq('id_empresa', empresaId)
                .eq('activa', true)
                .order('nombre', { ascending: true });
            if (error) {
                toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
                return;
            }
            setSucursales(data || []);
        };
        cargarSucursales();
    }, [empresaId]);

    useEffect(() => {
        if (idSucursalFija) setSucursalId(String(idSucursalFija));
    }, [idSucursalFija]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const nuevoEmpleado = {
            nombre_completo: nombreCompleto,
            identificacion: identificacion,
            email: email,
            telefono: telefono,
            id_puesto: idPuesto ? Number(idPuesto) : null,
            id_departamento: idDepartamento ? Number(idDepartamento) : null,
            salario_mensual: Number(salarioMensual) || 0,
            fecha_ingreso: fechaIngreso || null,
            cuenta_bancaria: cuentaBancaria,
            estado: estado,
            id_sucursal: sucursalId ? Number(sucursalId) : null,
            clase_trabajador: claseTrabajador,
            frecuencia_pago: claseTrabajador === 'obrero' ? 'semanal' : 'quincenal',
        };

        const result = await addEmpleado(nuevoEmpleado);

        if (result.success) {
            toast.success("✅ Empleado agregado correctamente");
            onClose();
        } else {
            toast.error(`⚠️ ${result.message || "Error al agregar empleado"}`);
        }
    };

    return (
        <>
            <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-7xl shadow-lg animate-fade-in border-1 border-secondary">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-semibold">Nuevo Empleado</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Nombre Completo</label>
                            <input type="text" required value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} placeholder="Nombre del empleado" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Identificación</label>
                            <input type="text" value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} placeholder="Cédula o DNI" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ej: example@gmail.com" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Teléfono</label>
                            <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="ej: 8888-8888" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Departamento</label>
                            <select
                                value={idDepartamento}
                                onChange={(event) => {
                                    setIdDepartamento(event.target.value);
                                    setIdPuesto('');
                                }}
                                className="bg-input border border-secondary rounded-lg p-3"
                                disabled={isLoadingCatalogos}
                            >
                                <option value="">{isLoadingCatalogos ? "Cargando..." : "Seleccione departamento..."}</option>
                                {departamentos.map((departamento) => (
                                    <option key={departamento.id_departamento} value={departamento.id_departamento}>{departamento.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Puesto</label>
                            <select
                                value={idPuesto}
                                onChange={(event) => {
                                    const nuevoPuesto = puestos.find((puesto) => String(puesto.id_puesto) === event.target.value);
                                    setIdPuesto(event.target.value);
                                    if (nuevoPuesto?.id_departamento) setIdDepartamento(String(nuevoPuesto.id_departamento));
                                }}
                                className="bg-input border border-secondary rounded-lg p-3"
                                disabled={isLoadingCatalogos || !puestosDisponibles.length}
                            >
                                <option value="">{isLoadingCatalogos ? "Cargando..." : "Seleccione puesto..."}</option>
                                {puestosDisponibles.map((puesto) => (
                                    <option key={puesto.id_puesto} value={puesto.id_puesto}>{puesto.nombre}</option>
                                ))}
                            </select>
                            {puestoSeleccionado && (
                                <span className="text-xs text-subtitle">
                                    {puestoSeleccionado.rol_acceso
                                        ? `El rol ${puestoSeleccionado.rol_acceso} se aplicará cuando vincule una cuenta.`
                                        : "Puesto de apoyo: no requiere una cuenta de acceso."}
                                </span>
                            )}
                            {!departamentos.length && !puestos.length && !isLoadingCatalogos && (
                                <span className="text-xs text-amber-400">Primero cree departamentos y puestos en la pestaña “Puestos y departamentos”.</span>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Salario Mensual</label>
                            <input type="number" step="0.01" value={salarioMensual} onChange={e => setSalarioMensual(e.target.value)} placeholder="C$ 0.00" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Fecha de Ingreso</label>
                            <input type="date" value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Cuenta Bancaria</label>
                            <input type="text" value={cuentaBancaria} onChange={e => setCuentaBancaria(e.target.value)} placeholder="N° de cuenta (opcional)" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Estado</label>
                            <select value={estado} onChange={e => setEstado(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Clase laboral para el límite de pago</label>
                            <select value={claseTrabajador} onChange={(e) => setClaseTrabajador(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                <option value="obrero">Obrero — pago semanal (máximo 7 días)</option>
                                <option value="empleado">Empleado — pago quincenal (máximo 15 días)</option>
                            </select>
                            <span className="text-xs text-subtitle">Confirme la clasificación con RR. HH. conforme al puesto y las reglas aplicables.</span>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Sucursal</label>
                            <select
                                value={sucursalId}
                                onChange={e => setSucursalId(e.target.value)}
                                disabled={!!idSucursalFija}
                                className="bg-input border border-secondary rounded-lg p-3 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <option value="">Sin asignar</option>
                                {sucursales.map(s => (
                                    <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>
                                ))}
                            </select>
                            {idSucursalFija && (
                                <span className="text-xs text-subtitle">Se asigna automáticamente a tu sucursal.</span>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg hover:bg-button-cancel transition-transform duration-200 ease-in-out hover:scale-110">Cancelar</button>
                        <button type="submit" className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center">
                            <Save />
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}