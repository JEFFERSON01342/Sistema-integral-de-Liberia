import { Banknote, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from "react-hot-toast";
import { supabase } from "../supabase/supabaseclient";
import { useCajasBancos } from "../hooks/useCajasBancos";
import { useCuentasContables } from '../hooks/useCuentasContables';
import { useSucursalesOperativas } from "../hooks/useSucursalesOperativas";
import { useEmpresa } from "../contexts/empresacontext";

export default function NuevomovCaja({ onClose, modo = "movimiento" }) {
    const { agregarMovimiento, depositarEnBanco, isSavingMov } = useCajasBancos();
    const { cuentas, isLoading: isLoadingCuentas } = useCuentasContables();
    const { sucursales, sucursalId, setSucursalId, isLoading: isLoadingSucursales } = useSucursalesOperativas();
    const { empresaId } = useEmpresa();
    const esDeposito = modo === "deposito";

    const [id_cuenta, setIdCuenta] = useState("");
    const [id_contrapartida, setIdContrapartida] = useState("");
    const [sesiones, setSesiones] = useState([]);
    const [idSesion, setIdSesion] = useState("");
    const [isLoadingSesiones, setIsLoadingSesiones] = useState(false);
    const [monto, setMonto] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [fecha, setFecha] = useState(() =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua" }).format(new Date())
    );
    const [tipoMovimiento, setTipoMovimiento] = useState("DEBE");
    const [referencia, setReferencia] = useState("");

    useEffect(() => {
        if (!esDeposito || !empresaId || !sucursalId) {
            setSesiones([]);
            setIdSesion("");
            return;
        }

        let cancelled = false;
        const cargarSesiones = async () => {
            setIsLoadingSesiones(true);
            const { data, error } = await supabase
                .from("sesiones_caja")
                .select("id_sesion, id_caja, caja:cajas(nombre)")
                .eq("id_empresa", empresaId)
                .eq("id_sucursal", Number(sucursalId))
                .eq("estado", "ABIERTA")
                .order("id_sesion", { ascending: false });
            if (cancelled) return;
            if (error) {
                toast.error(`No se pudieron cargar las sesiones abiertas: ${error.message}`);
                setSesiones([]);
                setIsLoadingSesiones(false);
                return;
            }
            setSesiones(data || []);
            setIdSesion("");
            setIsLoadingSesiones(false);
        };
        cargarSesiones();
        return () => {
            cancelled = true;
        };
    }, [empresaId, esDeposito, sucursalId]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (esDeposito) {
            if (!sucursalId || !id_cuenta || !id_contrapartida || !monto || !fecha || !descripcion.trim()) {
                toast.error("Complete la sucursal, las cuentas, el monto, la fecha y la descripción.");
                return;
            }
            const result = await depositarEnBanco({
                id_sucursal: Number(sucursalId),
                id_cuenta_caja: Number(id_cuenta),
                id_cuenta_banco: Number(id_contrapartida),
                id_sesion: idSesion || null,
                monto,
                fecha,
                descripcion,
                referencia,
            });
            if (result) onClose();
            return;
        }

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
    const cuentasEfectivo = cuentas.filter((cuenta) => cuenta.es_efectivo);
    const cuentasBanco = cuentas.filter((cuenta) => cuenta.es_banco);

    return (
            <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-4xl shadow-lg animate-fade-in border-1 border-secondary">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-semibold">{esDeposito ? "Depósito de Caja a Banco" : "Nuevo Movimiento"}</h3>
                </div>
                {esDeposito && (
                    <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-subtitle">
                        El asiento debita la cuenta bancaria y acredita la cuenta de efectivo; no se registra como gasto.
                        Si el retiro sale de una caja POS que sigue abierta, seleccione su sesión para incluirlo en el arqueo.
                    </div>
                )}
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
                                required
                            />
                        </div>

                        {esDeposito ? (
                            <>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Cuenta de efectivo (origen)</label>
                                    <select
                                        value={id_cuenta}
                                        onChange={(e) => setIdCuenta(e.target.value)}
                                        className="bg-input border border-secondary w-full rounded-lg p-3"
                                        required
                                    >
                                        <option value="">{isLoadingCuentas ? "Cargando..." : "Seleccione cuenta de efectivo"}</option>
                                        {cuentasEfectivo.map((cuenta) => (
                                            <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                                {cuenta.codigo ? `${cuenta.codigo} · ` : ""}{cuenta.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-title">Cuenta bancaria (destino)</label>
                                    <select
                                        value={id_contrapartida}
                                        onChange={(e) => setIdContrapartida(e.target.value)}
                                        className="bg-input border border-secondary w-full rounded-lg p-3"
                                        required
                                    >
                                        <option value="">{isLoadingCuentas ? "Cargando..." : "Seleccione cuenta bancaria"}</option>
                                        {cuentasBanco.map((cuenta) => (
                                            <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                                {cuenta.codigo ? `${cuenta.codigo} · ` : ""}{cuenta.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
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
                            </>
                        )}

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

                        {esDeposito && (
                            <div className="md:col-span-3 flex flex-col gap-2">
                                <label className="text-sm font-medium text-title">Sesión POS abierta (opcional)</label>
                                <select
                                    value={idSesion}
                                    onChange={(e) => setIdSesion(e.target.value)}
                                    disabled={isLoadingSesiones}
                                    className="bg-input border border-secondary rounded-lg p-3 disabled:opacity-70"
                                >
                                    <option value="">
                                        {isLoadingSesiones ? "Cargando sesiones..." : "No vincular a una sesión POS"}
                                    </option>
                                    {sesiones.map((sesion) => (
                                        <option key={sesion.id_sesion} value={sesion.id_sesion}>
                                            {sesion.caja?.nombre || `Caja ${sesion.id_caja}`} · Sesión {sesion.id_sesion}
                                        </option>
                                    ))}
                                </select>
                                <span className="text-xs text-subtitle">
                                    Al elegir una sesión, el retiro se incluye en el arqueo y se valida contra su efectivo esperado.
                                </span>
                            </div>
                        )}

                        <div className="md:col-span-3 flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Descripción (Opcional)</label>
                            <input
                                type="text"
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                                placeholder={esDeposito ? "Ej.: Depósito parcial de efectivo del cierre de octubre" : "Descripción del movimiento"}
                                required={esDeposito}
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg hover:bg-button-cancel transition-transform duration-200 ease-in-out hover:scale-110">Cancelar</button>
                        <button
                            type="submit"
                            disabled={isSavingMov || isLoadingCuentas || isLoadingSucursales || isLoadingSesiones || !sucursalId}
                            className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center disabled:opacity-70"
                        >
                            {esDeposito ? <Banknote /> : <Save />}
                            {isSavingMov ? "Guardando..." : esDeposito ? "Registrar Depósito" : "Guardar Movimiento"}
                        </button>
                    </div>
                </form>
            </div>
    );
}
