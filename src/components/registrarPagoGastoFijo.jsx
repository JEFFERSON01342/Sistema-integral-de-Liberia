// /components/RegistrarPagoGastoFijo.jsx
import { Save } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from "react-hot-toast";
import { useGastosFijos } from '../hooks/useGastosFijos';
import { useCuentas } from '../hooks/useCuentas';

export default function RegistrarPagoGastoFijo({ onClose, gasto }) {
    const { registrarPagoGastoFijo, isSaving } = useGastosFijos();
    const { catalogoCuentas, isLoading: isLoadingCuentas } = useCuentas();

    // Estados del formulario
    const [montoReal, setMontoReal] = useState(gasto.monto_estimado.toFixed(2));
    const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
    const [idCuentaPago, setIdCuentaPago] = useState('');

    // Filtra solo las cuentas de Activo (Caja/Bancos) para PAGAR
    const cuentasDeEfectivo = useMemo(() => {
        if (!catalogoCuentas) return [];
        return catalogoCuentas.filter(c => c.id_tipo === 1); // Asume ID 1 = Activo
    }, [catalogoCuentas]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!idCuentaPago || !montoReal || Number(montoReal) <= 0) {
            toast.error("Seleccione una cuenta de pago y un monto válido.");
            return;
        }

        const pago = {
            id_gasto_fijo: gasto.id_gasto_fijo,
            monto_real: Number(montoReal),
            fecha_pago: fechaPago,
            id_cuenta_pago: Number(idCuentaPago)
        };

        const { success } = await registrarPagoGastoFijo(pago);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-lg shadow-lg">
            <h3 className="text-2xl font-semibold mb-6">Registrar Pago de Gasto</h3>
            <div className='mb-4 border border-secondary/30 rounded-lg p-3 text-sm'>
                <p><strong>Gasto:</strong> {gasto.descripcion}</p>
                <p><strong>Cuenta Afectada:</strong> {gasto.cuentas_empresa.nombre}</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Monto Real Pagado</label>
                        <input
                            type="number"
                            step="0.01"
                            value={montoReal}
                            onChange={e => setMontoReal(e.target.value)}
                            t className="bg-input border border-secondary rounded-lg p-3"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Fecha de Pago</label>
                        <input
                            type="date"
                            value={fechaPago}
                            onChange={(e) => setFechaPago(e.target.value)}
                            className="bg-input border border-secondary rounded-lg p-3"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Pagar desde (Caja/Banco)</label>
                        <select
                            value={idCuentaPago}
                            onChange={(e) => setIdCuentaPago(e.target.value)}
                            className="bg-input border border-secondary w-full rounded-lg p-3"
                            required
                        >
                            <option value="">{isLoadingCuentas ? "Cargando..." : "Seleccione cuenta..."}</option>
                            {cuentasDeEfectivo.map(c => (
                                <option key={c.id_cuenta} value={c.id_cuenta}>{c.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg hover:bg-button-cancel transition-transform duration-200 ease-in-out hover:scale-110">Cancelar</button>
                    <button
                        type="submit"
                        disabled={isSaving || isLoadingCuentas}
                        className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center"
                    >
                        <Save />
                        {isSaving ? "Guardando..." : "Registrar Pago"}
                    </button>
                </div>
            </form>
        </div>
    );
}