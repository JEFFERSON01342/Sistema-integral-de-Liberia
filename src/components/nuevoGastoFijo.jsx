// /components/NuevoGastoFijo.jsx
import { Save } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from "react-hot-toast";
import { useCuentasContables } from '../hooks/useCuentasContables';
import { useGastosFijos } from '../hooks/useGastosFijos';

export default function NuevoGastoFijo({ onClose, gasto = null }) {
    const { crearGastoFijo, actualizarGastoFijo, isSaving } = useGastosFijos();
    const { cuentas, isLoading: isLoadingCuentas } = useCuentasContables();

    const [descripcion, setDescripcion] = useState(gasto?.descripcion || '');
    const [montoEstimado, setMontoEstimado] = useState(gasto?.monto_estimado ?? '');
    const [idCuentaGasto, setIdCuentaGasto] = useState(gasto?.id_cuenta_gasto ? String(gasto.id_cuenta_gasto) : '');

    // Filtra solo las cuentas de Gasto
    const cuentasDeGasto = useMemo(() => {
        return cuentas.filter((cuenta) => cuenta.naturaleza === "GASTO");
    }, [cuentas]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!descripcion || !montoEstimado || !idCuentaGasto) {
            toast.error("Por favor complete todos los campos.");
            return;
        }

        const gastoData = {
            descripcion,
            monto_estimado: Number(montoEstimado),
            id_cuenta_gasto: Number(idCuentaGasto)
        };

        const { success } = gasto
            ? await actualizarGastoFijo({ ...gastoData, id_gasto_fijo: gasto.id_gasto_fijo })
            : await crearGastoFijo(gastoData);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-lg shadow-lg">
            <h3 className="text-2xl font-semibold mb-6">{gasto ? "Editar Plantilla de Gasto Fijo" : "Nueva Plantilla de Gasto Fijo"}</h3>
            <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Descripción del Gasto</label>
                        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej. Alquiler de Oficina" className="bg-input border border-secondary rounded-lg p-3" required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Monto Estimado Mensual</label>
                        <input type="number" step="0.01" value={montoEstimado} onChange={e => setMontoEstimado(e.target.value)} placeholder="C$ 500.00" className="bg-input border border-secondary rounded-lg p-3" required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Cuenta de Gasto Afectada</label>
                        <select value={idCuentaGasto} onChange={(e) => setIdCuentaGasto(e.target.value)} className="bg-input border border-secondary w-full rounded-lg p-3" required>
                            <option value="">{isLoadingCuentas ? "Cargando..." : "Seleccione cuenta de gasto..."}</option>
                            {cuentasDeGasto.map((cuenta) => (
                                <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                    {cuenta.codigo} · {cuenta.nombre}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg hover:bg-button-cancel transition-transform duration-200 ease-in-out hover:scale-110">Cancelar</button>
                    <button type="submit" disabled={isSaving || isLoadingCuentas} className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center">
                        <Save />
                        {isSaving ? "Guardando..." : gasto ? "Guardar cambios" : "Guardar Plantilla"}
                    </button>
                </div>
            </form>
        </div>
    );
}