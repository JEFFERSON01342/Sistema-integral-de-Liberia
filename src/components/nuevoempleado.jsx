import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from "react-hot-toast"
import { useEmpleados } from "../hooks/useEmpleados";
import { supabase } from "../supabase/supabaseclient";

export default function NuevoEmpleado({ onClose, idSucursalFija = null }) {
    const { addEmpleado } = useEmpleados();

    const [nombreCompleto, setNombreCompleto] = useState('');
    const [identificacion, setIdentificacion] = useState('');
    const [email, setEmail] = useState('');
    const [telefono, setTelefono] = useState('');
    const [puesto, setPuesto] = useState('');
    const [departamento, setDepartamento] = useState(''); 
    const [salarioMensual, setSalarioMensual] = useState('');
    const [fechaIngreso, setFechaIngreso] = useState('');
    const [cuentaBancaria, setCuentaBancaria] = useState('');
    const [estado, setEstado] = useState('Activo');
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState(idSucursalFija ? String(idSucursalFija) : '');

    // Cargamos las sucursales disponibles (para que el superadmin pueda elegir).
    useEffect(() => {
        const cargarSucursales = async () => {
            const { data, error } = await supabase
                .from('sucursales')
                .select('id, nombre')
                .order('nombre', { ascending: true });
            if (!error) setSucursales(data || []);
        };
        cargarSucursales();
    }, []);

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
            puesto: puesto,
            departamento: departamento,
            salario_mensual: Number(salarioMensual) || 0,
            fecha_ingreso: fechaIngreso || null,
            cuenta_bancaria: cuentaBancaria,
            estado: estado,
            id_sucursal: sucursalId ? Number(sucursalId) : null
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
                            <label className="text-sm font-medium text-title">Puesto</label>
                            <input type="text" value={puesto} onChange={e => setPuesto(e.target.value)} placeholder="Ej: Gerente de Ventas" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Departamento</label>
                            <input type="text" value={departamento} onChange={e => setDepartamento(e.target.value)} placeholder="Ej: Ventas" className="bg-input border border-secondary rounded-lg p-3" />
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
                            <label className="text-sm font-medium text-title">Sucursal</label>
                            <select
                                value={sucursalId}
                                onChange={e => setSucursalId(e.target.value)}
                                disabled={!!idSucursalFija}
                                className="bg-input border border-secondary rounded-lg p-3 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <option value="">Sin asignar</option>
                                {sucursales.map(s => (
                                    <option key={s.id} value={s.id}>{s.nombre}</option>
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