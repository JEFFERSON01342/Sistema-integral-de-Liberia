import { Save } from 'lucide-react';
import { useState, useMemo } from 'react'; // <-- 1. Importa useMemo
import { toast } from "react-hot-toast";
import { useCuentasPorCobrar } from '../hooks/useCuentasPorCobrar';
import { useCuentas } from '../hooks/useCuentas';

export default function RegistrarPagoCliente({ onClose, factura }) {
    const { registrarPago, isSaving } = useCuentasPorCobrar();
    const { catalogoCuentas, isLoading: isLoadingCuentas } = useCuentas();

    const [montoPagado, setMontoPagado] = useState(factura.saldo_pendiente.toFixed(2));
    const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
    const [idCuentaBanco, setIdCuentaBanco] = useState('');

    // --- 2. LÓGICA CORREGIDA PARA ENCONTRAR CUENTAS ---
    const { cuentasDeEfectivo, idCuentaCxC } = useMemo(() => {
        if (!catalogoCuentas) return { cuentasDeEfectivo: [], idCuentaCxC: null };

        // Asume que ID 1 = Activo
        const efectivo = catalogoCuentas.filter(c => c.id_tipo === 1);

        // Encuentra dinámicamente el ID de la cuenta "Clientes"
        const cxc = catalogoCuentas.find(c => c.nombre.toLowerCase() === 'clientes');

        return {
            cuentasDeEfectivo: efectivo,
            idCuentaCxC: cxc ? cxc.id_cuenta : null // <-- ID Dinámico
        };
    }, [catalogoCuentas]);
    // --- FIN DE LA CORRECCIÓN ---

    const handleSubmit = async (e) => {
        e.preventDefault();

        // --- 3. VALIDACIÓN MEJORADA ---
        if (!idCuentaCxC) {
            toast.error("Error: No se pudo encontrar la cuenta 'Clientes' en el catálogo.");
            return;
        }
        if (!idCuentaBanco || !montoPagado || Number(montoPagado) <= 0) {
            toast.error("Seleccione una cuenta de banco y un monto válido.");
            return;
        }
        if (Number(montoPagado) > factura.saldo_pendiente) {
            toast.error("El pago no puede ser mayor al saldo pendiente.");
            return;
        }

        const pago = {
            id_cliente: factura.id_cliente,
            id_venta: factura.id_venta,
            monto_pagado: Number(montoPagado),
            fecha_pago: fechaPago,
            id_cuenta_banco: Number(idCuentaBanco),
            id_cuenta_cxc: idCuentaCxC // <-- 4. USA EL ID DINÁMICO
        };

        const { success } = await registrarPago(pago);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-xl shadow-lg animate-fade-in border-1 border-secondary">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">Registrar Pago</h3>
            </div>
            <div className='mb-4 border border-secondary/30 rounded-lg p-3 text-sm'>
                <p><strong>Cliente:</strong> {factura.nombre_cliente}</p>
                <p><strong>Factura:</strong> {factura.codigo_venta}</p>
                <p><strong>Saldo Pendiente:</strong> <span className='font-bold text-red-400'>C$ {factura.saldo_pendiente.toFixed(2)}</span></p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Monto a Pagar</label>
                        <input
                            type="number"
                            step="0.01"
                            value={montoPagado}
                            onChange={e => setMontoPagado(e.target.value)}
                            className="bg-input border border-secondary rounded-lg p-3"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Fecha de Pago</label>
                        <input
                            type="date"
                            value={fechaPago}
                            onChange={(e) => setFechaPago(e.target.value)}
                            className="bg-input border border-secondary rounded-lg p-3"
                            required
                        />
                    </div>

                    <div className="md:col-span-2 flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Depositar en (Caja/Banco)</label>
                        <select
                            value={idCuentaBanco}
                            onChange={(e) => setIdCuentaBanco(e.target.value)}
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
                        className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center disabled:opacity-70"
                    >
                        <Save />
                        {isSaving ? "Guardando..." : "Guardar Pago"}
                    </button>
                </div>
            </form>
        </div>
    );
}