import { Plus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from "react-hot-toast"
import { useActivosFijos } from "../hooks/useActivosFijos";
import { useEmpleados } from "../hooks/useEmpleados";

export default function NuevoActivoFijo({ onClose, totalActivos }) {
    const { empleados, isLoading: isLoadingEmpleados } = useEmpleados();
    const { 
        addActivoFijo, 
        cuentasActivoFijo, // Para el tipo de activo
        cuentasGasto,      // Para la depreciación
        cuentasPago,       // Para pagar
        isSaving 
    } = useActivosFijos();
    const [idCuentaPago, setIdCuentaPago] = useState("");
    const [idCuentaActivo, setIdCuentaActivo] = useState('');
    const [codigo, setCodigo] = useState('');
    const [nombre, setNombre] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [fechaCompra, setFechaCompra] = useState('');
    const [valorCompra, setValorCompra] = useState(0);
    const [vidaUtil, setVidaUtil] = useState(10);
    const [metodoDepreciacion, setMetodoDepreciacion] = useState('Linea Recta');
    const [ubicacion, setUbicacion] = useState('');
    const [responsable, setResponsable] = useState('');
    const [estado, setEstado] = useState('Activo');
    const [valorResidual, setValorResidual] = useState(0);
    const [idCuentaGasto, setIdCuentaGasto] = useState('');
    const [idCuentaDepAcum, setIdCuentaDepAcum] = useState('');

    useEffect(() => {
        const nuevoNumero = (totalActivos || 0) + 1;
        const codigoGenerado = `AF-${String(nuevoNumero).padStart(3, '0')}`;
        setCodigo(codigoGenerado);

    }, [totalActivos]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!nombre || !fechaCompra || !(valorCompra > 0) || !idCuentaActivo || !idCuentaGasto || !idCuentaDepAcum) {
            toast.error("Por favor, complete todos los campos (Nombre, Fecha, Valor y Cuentas Contables).");
            return;
        }

        const nuevoActivo = {
            codigo,
            nombre,
            descripcion,
            id_cuenta_activo: Number(idCuentaActivo),
            fecha_compra: fechaCompra,
            valor_compra: Number(valorCompra),
            vida_util_anios: Number(vidaUtil),
            metodo_depreciacion: metodoDepreciacion,
            ubicacion,
            responsable: responsable,
            estado,
            valor_residual: Number(valorResidual),
            id_cuenta_gasto_depreciacion: Number(idCuentaGasto),
            id_cuenta_depreciacion_acumulada: Number(idCuentaDepAcum),
            id_cuenta_pago: Number(idCuentaPago)
        };

        const result = await addActivoFijo(nuevoActivo);

        if (result.success) {
            toast.success("✅ Activo fijo agregado correctamente");
            onClose();
        } else {
            toast.error(`⚠️ ${result.message || "Error al agregar activo fijo"}`);
        }
    };

    return (
        <>
            <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-7xl shadow-lg animate-fade-in border-1 border-secondary">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-semibold">Nuevo Activo</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    {/* --- Campos actualizados --- */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 overflow-y-auto max-h-[70vh] pr-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Código</label>
                            <input type="text" readOnly value={codigo} onChange={(e) => setCodigo(e.target.value)} className="bg-input border border-secondary rounded-lg p-3 opacity-70" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Nombre</label>
                            <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del activo" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="md:col-span-2 flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Descripción</label>
                            <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción detallada" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label>Método de Pago (Origen de fondos)</label>
                            <select
                                value={idCuentaPago}
                                onChange={e => setIdCuentaPago(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                                required
                            >
                                <option value="">Seleccione...</option>
                                {cuentasPago.map(c => (
                                    <option key={c.id_cuenta} value={c.id_cuenta}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Cuenta de Activo (Categoría)</label>
                            <select value={idCuentaActivo} onChange={e => setIdCuentaActivo(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" required >

                                <option value="">Seleccione una cuenta contable...</option>

                                {/* --- CAMBIO 2 --- */}
                                {/* Mapea sobre 'cuentasActivo' (del hook), no 'cuentasDeActivo' */}
                                {cuentasActivoFijo && cuentasActivoFijo.map(cuenta => (
                                    <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                        {cuenta.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Cuenta de Gasto (Deprec.)</label>
                            <select value={idCuentaGasto} onChange={e => setIdCuentaGasto(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" required>
                                <option value="">Seleccione cuenta de gasto...</option>
                                {cuentasGasto && cuentasGasto.map(cuenta => (
                                    <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                        {cuenta.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Cuenta de Deprec. Acumulada</label>
                            <select value={idCuentaDepAcum} onChange={e => setIdCuentaDepAcum(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" required>
                                <option value="">Seleccione cuenta de depreciación acumulada...</option>
                                {/* Re-usamos 'cuentasActivo' porque la Dep. Acum. es una cuenta de Activo (Contra-Activo) */}
                                {cuentasActivoFijo && cuentasActivoFijo.map(cuenta => (
                                    <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                        {cuenta.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Fecha de Compra</label>
                            <input type="date" required value={fechaCompra} onChange={e => setFechaCompra(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Valor de Compra</label>
                            <input type="number" required step="0.01" value={valorCompra} onChange={e => setValorCompra(e.target.value)} placeholder="0" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Vida Útil (años)</label>
                            <input type="number" value={vidaUtil} onChange={e => setVidaUtil(e.target.value)} placeholder="10" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Método de Depreciación</label>
                            <select value={metodoDepreciacion} onChange={e => setMetodoDepreciacion(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                <option value="Linea Recta">Línea Recta</option>
                                <option value="Suma de dígitos">Suma de dígitos</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Ubicación</label>
                            <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Planta 1 - Área de producción" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Responsable</label>
                            <select
                                value={responsable}
                                onChange={e => setResponsable(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                                disabled={isLoadingEmpleados} // Deshabilitar mientras cargan
                            >
                                <option value="">{isLoadingEmpleados ? "Cargando..." : "Seleccione un empleado"}</option>
                                {empleados.map(emp => (
                                    <option key={emp.id_empleado} value={emp.nombre_completo}>
                                        {emp.nombre_completo}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Estado</label>
                            <select value={estado} onChange={e => setEstado(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                <option value="Activo">Activo</option>
                                <option value="En Mantenimiento">En Mantenimiento</option>
                                <option value="De Baja">De Baja</option>
                            </select>
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