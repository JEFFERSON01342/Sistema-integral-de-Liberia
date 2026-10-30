import { useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import { useCajasBancos } from "../hooks/useCajasBancos";
import { useCuentasContables } from "../hooks/useCuentasContables";
import { useSucursalesOperativas } from "../hooks/useSucursalesOperativas";

export default function ModalSaldoInicial({ onClose, onSaved }) {
    const { registrarSaldoInicial, isSaving } = useCajasBancos();
    const { cuentas, isLoading } = useCuentasContables();
    const { sucursales, sucursalId, setSucursalId, isLoading: isLoadingSucursales } = useSucursalesOperativas();
    const [monto, setMonto] = useState("");
    const [idCuenta, setIdCuenta] = useState("");
    const [idCuentaCapital, setIdCuentaCapital] = useState("");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

    const cuentasEfectivo = useMemo(
        () => cuentas.filter((cuenta) => cuenta.naturaleza === "ACTIVO" && (cuenta.es_banco || cuenta.es_efectivo)),
        [cuentas]
    );
    const cuentasCapital = useMemo(
        () => cuentas.filter((cuenta) => cuenta.naturaleza === "PATRIMONIO"),
        [cuentas]
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { success } = await registrarSaldoInicial({
            id_sucursal: sucursalId,
            id_cuenta: idCuenta,
            id_cuenta_capital: idCuentaCapital,
            monto,
            fecha,
            descripcion: "Asiento de Apertura (Saldo Inicial)",
        });
        if (success) {
            await onSaved();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-primary border border-secondary rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-title">Registrar Saldo Inicial</h3>
                    <button onClick={onClose}><X className="text-subtitle" /></button>
                </div>

                <p className="text-subtitle text-sm mb-6">
                    Se registrará el efectivo existente contra una cuenta de patrimonio en un comprobante de apertura.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="text-sm text-title">Sucursal</label>
                        <select
                            className="bg-input border border-secondary w-full p-3 rounded-lg mt-1"
                            value={sucursalId}
                            onChange={(e) => setSucursalId(e.target.value)}
                            required
                            disabled={isLoadingSucursales}
                        >
                            <option value="">{isLoadingSucursales ? "Cargando..." : "Seleccione sucursal..."}</option>
                            {sucursales.map((sucursal) => (
                                <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-title">¿Dónde está el dinero?</label>
                        <select
                            className="bg-input border border-secondary w-full p-3 rounded-lg mt-1"
                            value={idCuenta}
                            onChange={(e) => setIdCuenta(e.target.value)}
                            required
                        >
                            <option value="">{isLoading ? "Cargando..." : "Seleccione Caja o Banco..."}</option>
                            {cuentasEfectivo.map((cuenta) => (
                                <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                    {cuenta.codigo ? `${cuenta.codigo} · ` : ""}{cuenta.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm text-title">Cuenta de patrimonio</label>
                        <select
                            className="bg-input border border-secondary w-full p-3 rounded-lg mt-1"
                            value={idCuentaCapital}
                            onChange={(e) => setIdCuentaCapital(e.target.value)}
                            required
                        >
                            <option value="">Seleccione capital o patrimonio...</option>
                            {cuentasCapital.map((cuenta) => (
                                <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                    {cuenta.codigo ? `${cuenta.codigo} · ` : ""}{cuenta.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm text-title">Monto Actual</label>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="bg-input border border-secondary w-full p-3 rounded-lg mt-1"
                            value={monto}
                            onChange={(e) => setMonto(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label className="text-sm text-title">Fecha de Corte</label>
                        <input
                            type="date"
                            className="bg-input border border-secondary w-full p-3 rounded-lg mt-1"
                            value={fecha}
                            onChange={(e) => setFecha(e.target.value)}
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-subtitle">Cancelar</button>
                        <button
                            type="submit"
                            disabled={isSaving || isLoading || isLoadingSucursales || !sucursalId}
                            className="bg-button text-button px-4 py-2 rounded-lg flex items-center gap-2 font-semibold disabled:opacity-70"
                        >
                            <Save size={18} /> Guardar Saldo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
