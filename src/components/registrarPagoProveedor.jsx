import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useCompras } from "../hooks/useCompras";
import { useEmpresa } from "../contexts/empresacontext";
import { supabase } from "../supabase/supabaseclient";

export default function RegistrarPagoProveedor({ onClose, cuentaPorPagar }) {
    const { registrarPagoProveedor, isSaving } = useCompras();
    const { empresaId } = useEmpresa();
    const [metodoPago, setMetodoPago] = useState("TRANSFERENCIA");
    const [monto, setMonto] = useState(String(Number(cuentaPorPagar.saldo_pendiente).toFixed(2)));
    const [referencia, setReferencia] = useState("");
    const [idCuentaPago, setIdCuentaPago] = useState("");
    const [idSesion, setIdSesion] = useState("");
    const [cuentasBancarias, setCuentasBancarias] = useState([]);
    const [sesionesAbiertas, setSesionesAbiertas] = useState([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const cargarMediosPago = async () => {
            if (!empresaId) {
                setCargando(false);
                return;
            }
            const [cuentasResult, sesionesResult] = await Promise.all([
                supabase
                    .from("cuentas_contables")
                    .select("id_cuenta, codigo, nombre")
                    .eq("id_empresa", empresaId)
                    .eq("activa", true)
                    .eq("es_grupo", false)
                    .eq("permite_movimientos", true)
                    .or("codigo.eq.1.1.04,codigo.like.1.1.04.%")
                    .order("codigo"),
                supabase
                    .from("sesiones_caja")
                    .select("id_sesion, id_caja, id_sucursal, abierta_en")
                    .eq("id_empresa", empresaId)
                    .eq("id_sucursal", cuentaPorPagar.id_sucursal)
                    .eq("estado", "ABIERTA")
                    .order("abierta_en", { ascending: false }),
            ]);
            if (cuentasResult.error) {
                toast.error(`No se pudieron cargar las cuentas bancarias: ${cuentasResult.error.message}`);
            }
            if (sesionesResult.error) {
                toast.error(`No se pudieron cargar las sesiones de caja: ${sesionesResult.error.message}`);
            }
            if (!cancelled) {
                setCuentasBancarias(cuentasResult.data || []);
                setSesionesAbiertas(sesionesResult.data || []);
                setCargando(false);
            }
        };
        cargarMediosPago();
        return () => { cancelled = true; };
    }, [empresaId, cuentaPorPagar.id_sucursal]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const valor = Number(monto);
        const saldoPendiente = Number(cuentaPorPagar.saldo_pendiente);
        if (!Number.isFinite(valor) || valor <= 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-8) {
            toast.error("Ingrese un monto mayor que cero con hasta dos decimales.");
            return;
        }
        if (valor > saldoPendiente) {
            toast.error("El pago no puede superar el saldo pendiente.");
            return;
        }
        if (metodoPago === "EFECTIVO" && !idSesion) {
            toast.error("Seleccione una sesión de caja abierta de la sucursal.");
            return;
        }
        if (metodoPago === "TRANSFERENCIA" && !idCuentaPago) {
            toast.error("Seleccione la cuenta bancaria de origen.");
            return;
        }

        const resultado = await registrarPagoProveedor({
            id_cuenta_por_pagar: cuentaPorPagar.id_cuenta_por_pagar,
            monto: Number(valor.toFixed(2)),
            metodo_pago: metodoPago,
            id_sesion: metodoPago === "EFECTIVO" ? Number(idSesion) : null,
            id_cuenta_pago: metodoPago === "TRANSFERENCIA" ? Number(idCuentaPago) : null,
            referencia,
            clave_idempotencia: `pago-proveedor-${crypto.randomUUID()}`,
        });
        if (resultado.success) {
            toast.success("Pago registrado correctamente.");
            onClose();
        }
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-xl shadow-lg border border-secondary max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-semibold mb-6">Registrar pago a proveedor</h3>
            <div className="mb-5 border border-secondary/30 rounded-lg p-3 text-sm">
                <p><strong>Proveedor:</strong> {cuentaPorPagar.nombre_proveedor}</p>
                <p><strong>CxP:</strong> {cuentaPorPagar.id_cuenta_por_pagar}</p>
                <p><strong>Recepción:</strong> {cuentaPorPagar.id_recepcion}</p>
                <p><strong>Vencimiento:</strong> {cuentaPorPagar.fecha_vencimiento}</p>
                <p><strong>Saldo:</strong> <span className="font-bold text-red-400">C$ {Number(cuentaPorPagar.saldo_pendiente).toFixed(2)}</span></p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 gap-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="pago-monto" className="text-sm font-medium">Monto a pagar</label>
                        <input id="pago-monto" type="number" min="0.01" max={cuentaPorPagar.saldo_pendiente} step="0.01" value={monto} onChange={(event) => setMonto(event.target.value)} required className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="pago-metodo" className="text-sm font-medium">Método de pago</label>
                        <select id="pago-metodo" value={metodoPago} onChange={(event) => setMetodoPago(event.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                            <option value="TRANSFERENCIA">Transferencia bancaria</option>
                            <option value="EFECTIVO">Efectivo</option>
                        </select>
                    </div>
                    {metodoPago === "TRANSFERENCIA" ? (
                        <div className="flex flex-col gap-2">
                            <label htmlFor="pago-cuenta" className="text-sm font-medium">Cuenta bancaria de origen</label>
                            <select id="pago-cuenta" value={idCuentaPago} onChange={(event) => setIdCuentaPago(event.target.value)} required className="bg-input border border-secondary rounded-lg p-3">
                                <option value="">{cargando ? "Cargando..." : "Seleccione una cuenta"}</option>
                                {cuentasBancarias.map((account) => <option key={account.id_cuenta} value={account.id_cuenta}>{account.codigo} — {account.nombre}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <label htmlFor="pago-sesion" className="text-sm font-medium">Sesión de caja abierta</label>
                            <select id="pago-sesion" value={idSesion} onChange={(event) => setIdSesion(event.target.value)} required className="bg-input border border-secondary rounded-lg p-3">
                                <option value="">{cargando ? "Cargando..." : "Seleccione una sesión"}</option>
                                {sesionesAbiertas.map((session) => <option key={session.id_sesion} value={session.id_sesion}>Caja {session.id_caja} — sesión {session.id_sesion}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <label htmlFor="pago-referencia" className="text-sm font-medium">Referencia (opcional)</label>
                        <input id="pago-referencia" value={referencia} onChange={(event) => setReferencia(event.target.value)} maxLength={120} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                </div>
                <p className="text-xs text-subtitle mt-3">La fecha contable y el período se determinan automáticamente al registrar el pago.</p>
                <div className="flex justify-end gap-4 mt-7">
                    <button type="button" onClick={onClose} className="bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg">Cancelar</button>
                    <button type="submit" disabled={isSaving || cargando} className="bg-button text-button font-semibold py-2 px-4 rounded-lg flex gap-2 items-center disabled:opacity-60">
                        <Save size={18} />
                        {isSaving ? "Guardando..." : "Registrar pago"}
                    </button>
                </div>
            </form>
        </div>
    );
}
