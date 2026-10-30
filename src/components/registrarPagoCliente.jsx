import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useCuentasPorCobrar } from "../hooks/useCuentasPorCobrar";
import { supabase } from "../supabase/supabaseclient";

export default function RegistrarPagoCliente({ onClose, factura }) {
    const { registrarPago, isSaving } = useCuentasPorCobrar();
    const [montoPagado, setMontoPagado] = useState(Number(factura.saldo_pendiente).toFixed(2));
    const [metodoPago, setMetodoPago] = useState("TRANSFERENCIA");
    const [referencia, setReferencia] = useState("");
    const [sesiones, setSesiones] = useState([]);
    const [idSesion, setIdSesion] = useState("");
    const [isLoadingSesiones, setIsLoadingSesiones] = useState(false);
    const [claveIdempotencia] = useState(() => crypto.randomUUID());

    useEffect(() => {
        if (metodoPago !== "EFECTIVO" || !factura.id_sucursal) {
            setSesiones([]);
            setIdSesion("");
            return;
        }

        let cancelled = false;
        const cargarSesiones = async () => {
            setIsLoadingSesiones(true);
            const { data: abiertas, error: sesionesError } = await supabase
                .from("sesiones_caja")
                .select("id_sesion, id_caja")
                .eq("id_sucursal", factura.id_sucursal)
                .eq("estado", "ABIERTA")
                .order("id_sesion", { ascending: false });
            if (sesionesError) {
                if (!cancelled) toast.error(`No se pudieron cargar las cajas abiertas: ${sesionesError.message}`);
                if (!cancelled) setSesiones([]);
                if (!cancelled) setIsLoadingSesiones(false);
                return;
            }

            const cajasIds = [...new Set((abiertas || []).map((sesion) => sesion.id_caja))];
            let cajas = [];
            if (cajasIds.length) {
                const { data, error: cajasError } = await supabase
                    .from("cajas")
                    .select("id_caja, nombre")
                    .in("id_caja", cajasIds);
                if (cajasError) {
                    if (!cancelled) toast.error(`No se pudieron cargar las cajas: ${cajasError.message}`);
                    if (!cancelled) setSesiones([]);
                    if (!cancelled) setIsLoadingSesiones(false);
                    return;
                }
                cajas = data || [];
            }
            const nombresPorCaja = new Map(cajas.map((caja) => [caja.id_caja, caja.nombre]));
            if (!cancelled) {
                const opciones = (abiertas || []).map((sesion) => ({
                    ...sesion,
                    nombre_caja: nombresPorCaja.get(sesion.id_caja) || `Caja ${sesion.id_caja}`,
                }));
                setSesiones(opciones);
                setIdSesion((actual) =>
                    opciones.some((sesion) => String(sesion.id_sesion) === actual)
                        ? actual
                        : String(opciones[0]?.id_sesion || "")
                );
                setIsLoadingSesiones(false);
            }
        };
        cargarSesiones();
        return () => {
            cancelled = true;
        };
    }, [factura.id_empresa, factura.id_sucursal, metodoPago]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const monto = Number(montoPagado);
        if (!factura.id_factura || !Number.isFinite(monto) || monto <= 0) {
            toast.error("Ingrese un monto válido.");
            return;
        }
        if (monto > Number(factura.saldo_pendiente)) {
            toast.error("El pago no puede ser mayor al saldo pendiente.");
            return;
        }
        if (metodoPago === "EFECTIVO" && !idSesion) {
            toast.error("Seleccione una sesión de caja abierta en la sucursal de la venta.");
            return;
        }

        const { success } = await registrarPago({
            id_factura: factura.id_factura,
            monto_pagado: monto,
            metodo_pago: metodoPago,
            id_sesion: metodoPago === "EFECTIVO" ? Number(idSesion) : null,
            referencia: referencia.trim(),
            clave_idempotencia: claveIdempotencia,
        });
        if (success) onClose();
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-xl shadow-lg animate-fade-in border-1 border-secondary">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">Registrar Pago</h3>
            </div>
            <div className="mb-4 border border-secondary/30 rounded-lg p-3 text-sm">
                <p><strong>Cliente:</strong> {factura.nombre_cliente}</p>
                <p><strong>Factura:</strong> {factura.numero_factura}</p>
                <p><strong>Saldo Pendiente:</strong> <span className="font-bold text-red-400">C$ {Number(factura.saldo_pendiente).toFixed(2)}</span></p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Monto a pagar</label>
                        <input
                            type="number"
                            min="0.01"
                            max={factura.saldo_pendiente}
                            step="0.01"
                            value={montoPagado}
                            onChange={(e) => setMontoPagado(e.target.value)}
                            className="bg-input border border-secondary rounded-lg p-3"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Método de pago</label>
                        <select
                            value={metodoPago}
                            onChange={(e) => setMetodoPago(e.target.value)}
                            className="bg-input border border-secondary rounded-lg p-3"
                        >
                            <option value="TRANSFERENCIA">Transferencia</option>
                            <option value="EFECTIVO">Efectivo</option>
                        </select>
                    </div>
                    {metodoPago === "EFECTIVO" && (
                        <div className="md:col-span-2 flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Sesión de caja abierta</label>
                            <select
                                value={idSesion}
                                onChange={(e) => setIdSesion(e.target.value)}
                                disabled={isLoadingSesiones || sesiones.length === 0}
                                className="bg-input border border-secondary rounded-lg p-3 disabled:opacity-70"
                                required
                            >
                                <option value="">
                                    {isLoadingSesiones ? "Cargando..." : "No hay sesiones abiertas en esta sucursal"}
                                </option>
                                {sesiones.map((sesion) => (
                                    <option key={sesion.id_sesion} value={sesion.id_sesion}>
                                        {sesion.nombre_caja} · Sesión {sesion.id_sesion}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="md:col-span-2 flex flex-col gap-2">
                        <label className="text-sm font-medium text-title">Referencia (opcional)</label>
                        <input
                            type="text"
                            maxLength="120"
                            value={referencia}
                            onChange={(e) => setReferencia(e.target.value)}
                            className="bg-input border border-secondary rounded-lg p-3"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg">
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving || isLoadingSesiones || (metodoPago === "EFECTIVO" && sesiones.length === 0)}
                        className="cursor-pointer bg-button text-button font-semibold py-2 px-3 rounded-lg flex flex-row gap-2 items-center disabled:opacity-70"
                    >
                        <Save />
                        {isSaving ? "Guardando..." : "Guardar Pago"}
                    </button>
                </div>
            </form>
        </div>
    );
}
