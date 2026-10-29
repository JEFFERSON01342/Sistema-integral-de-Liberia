import { Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from "react-hot-toast";
import { useCajasBancos } from "../hooks/useCajasBancos";
import { useCuentasContables } from '../hooks/useCuentasContables';
import { useSucursalesOperativas } from "../hooks/useSucursalesOperativas";

export default function NuevomovCaja({ onClose }) {
    const { agregarMovimiento, isSavingMov } = useCajasBancos();
    const { cuentas, isLoading: isLoadingCuentas } = useCuentasContables();
    const { sucursales, sucursalId, setSucursalId, isLoading: isLoadingSucursales } = useSucursalesOperativas();

    const [id_cuenta, setIdCuenta] = useState("");
    const [id_contrapartida, setIdContrapartida] = useState("");
    const [monto, setMonto] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [tipoMovimiento, setTipoMovimiento] = useState("DEBE");
    const [referencia, setReferencia] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!sucursalId || !id_cuenta || !id_contrapartida || !monto || !tipoMovimiento) {
            toast.error("Complete la sucursal, las cuentas, el monto y el tipo de movimiento.");
            return;
        }
        if (Number(id_cuenta) === Number(id_contrapartida)) {
            toast.error("La cuenta y la contrapartida deben ser diferentes.");
            return;
        }
        if (Number(monto) <= 0) {
            toast.error("El monto debe ser mayor que cero.");
            return;
        }

        const movimiento = {
            id_cuenta: Number(id_cuenta),
            id_contrapartida: Number(id_contrapartida),
            id_sucursal: Number(sucursalId),
            monto: Number(monto),
            tipo: tipoMovimiento,
            fecha: fecha,
            descripcion: descripcion || null,
            referencia: referencia || null
        };

        const result = await agregarMovimiento(movimiento);

        if (result) {
            onClose();
        }
    };

    const cuentasCajaBanco = cuentas.filter((cuenta) => cuenta.es_banco || cuenta.es_efectivo);

    return (
            <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-4xl shadow-lg animate-fade-in border-1 border-secondary">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-semibold">Nuevo Movimiento</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Sucursal</label>
                            <select
                                value={sucursalId}
                                onChange={(e) => setSucursalId(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                                required
                                disabled={isLoadingSucursales}
                            >
                                <option value="">{isLoadingSucursales ? "Cargando..." : "Seleccione sucursal"}</option>
                                {sucursales.map((sucursal) => (
                                    <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="fecha" className="text-sm font-medium text-title">Fecha</label>
                            <input
                                id="fecha"
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Cuenta (Caja/Banco)</label>
                            <div className='flex flex-row gap-2 justify-between items-center'>
                                <select
                                    value={id_cuenta}
                                    onChange={(e) => setIdCuenta(e.target.value)}
                                    className="bg-input border border-secondary w-full rounded-lg p-3 appearance-none"
                                    required
                                >
                                    <option value="">{isLoadingCuentas ? "Cargando..." : "Seleccione cuenta"}</option>
                                    {cuentasCajaBanco.map(c => (
                                        <option key={c.id_cuenta} value={c.id_cuenta}>
                                          {c.codigo ? `${c.codigo} · ` : ""}{c.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <span className="text-xs text-subtitle">Marca las cuentas como banco o efectivo desde el plan de cuentas.</span>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Tipo de Movimiento</label>
                            <select
                                value={tipoMovimiento}
                                onChange={(e) => setTipoMovimiento(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                                required
                            >
                                <option value="DEBE">Ingreso / Entrada (Debe)</option>
                                <option value="HABER">Egreso / Salida (Haber)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Cuenta de Contrapartida</label>
                            <select
                                value={id_contrapartida}
                                onChange={(e) => setIdContrapartida(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3 appearance-none"
                                required
                            >
                                <option value="">{isLoadingCuentas ? "Cargando..." : "Seleccione contrapartida"}</option>
                                {cuentas.filter(c => String(c.id_cuenta) !== String(id_cuenta)).map(c => (
                                    <option key={c.id_cuenta} value={c.id_cuenta}>
                                      {c.codigo ? `${c.codigo} · ` : ""}{c.nombre}
                                    </option>
                                ))}
                            </select>
                            <span className="text-xs text-subtitle">Cuenta de origen/destino del movimiento (ej. Ingresos, Gastos, Proveedores).</span>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Monto</label>
                            <input
                                type="number"
                                step="0.01"
                                value={monto}
                                onChange={e => setMonto(e.target.value)}
                                placeholder="C$ 0.00"
                                className="bg-input border border-secondary rounded-lg p-3"
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label htmlFor="referencia" className="text-sm font-medium text-title">Referencia (Opcional)</label>
                            <input
                                id="referencia"
                                type="text"
                                value={referencia}
                                onChange={(e) => setReferencia(e.target.value)}
                                placeholder="N° cheque, transferencia, etc."
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>

                        <div className="md:col-span-3 flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Descripción (Opcional)</label>
                            <input
                                type="text"
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                                placeholder="Descripción del movimiento"
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg hover:bg-button-cancel transition-transform duration-200 ease-in-out hover:scale-110">Cancelar</button>
                        <button
                            type="submit"
                            disabled={isSavingMov || isLoadingCuentas || isLoadingSucursales || !sucursalId}
                            className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center disabled:opacity-70"
                        >
                            <Save />
                            {isSavingMov ? "Guardando..." : "Guardar Movimiento"}
                        </button>
                    </div>
                </form>
            </div>
    );
}
