import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useEmpresa } from "../contexts/empresacontext";
import { useCompras } from "../hooks/useCompras";
import { supabase } from "../supabase/supabaseclient";

export default function RecibirOrdenCompra({ orden, onClose }) {
    const { empresaId } = useEmpresa();
    const { recibirOrdenCompra, isSaving } = useCompras();
    const [ubicaciones, setUbicaciones] = useState([]);
    const [idUbicacion, setIdUbicacion] = useState("");
    const [lineas, setLineas] = useState({});
    const [cargandoUbicaciones, setCargandoUbicaciones] = useState(true);

    useEffect(() => {
        setLineas(Object.fromEntries((orden.lineas || []).map((linea) => [
            linea.id_detalle_orden,
            {
                cantidad_aceptada: "",
                cantidad_rechazada: "",
                costo_unitario: "",
                lote_proveedor: "",
                fecha_vencimiento: "",
            },
        ])));
    }, [orden]);

    useEffect(() => {
        let cancelled = false;
        const cargarUbicaciones = async () => {
            if (!empresaId) {
                setUbicaciones([]);
                setCargandoUbicaciones(false);
                return;
            }
            const { data, error } = await supabase
                .from("ubicaciones_bodega")
                .select("id_ubicacion, codigo, nombre, tipo_area")
                .eq("id_empresa", empresaId)
                .eq("id_sucursal", orden.id_sucursal)
                .eq("activa", true)
                .neq("tipo_area", "PICKING")
                .order("codigo");
            if (error) {
                toast.error(`No se pudieron cargar las ubicaciones: ${error.message}`);
            } else if (!cancelled) {
                setUbicaciones(data || []);
                setIdUbicacion(String(data?.[0]?.id_ubicacion || ""));
            }
            if (!cancelled) setCargandoUbicaciones(false);
        };
        cargarUbicaciones();
        return () => { cancelled = true; };
    }, [empresaId, orden.id_sucursal]);

    const actualizarLinea = (idDetalle, campo, valor) => {
        setLineas((prev) => ({
            ...prev,
            [idDetalle]: { ...prev[idDetalle], [campo]: valor },
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const lineasRecepcion = [];
        const lotes = [];
        for (const linea of orden.lineas || []) {
            const valores = lineas[linea.id_detalle_orden];
            const aceptada = Number(valores?.cantidad_aceptada || 0);
            const rechazada = Number(valores?.cantidad_rechazada || 0);
            const costo = Number(valores?.costo_unitario);
            if (aceptada === 0 && rechazada === 0) continue;
            if (!Number.isFinite(aceptada) || aceptada < 0 || !Number.isFinite(rechazada) || rechazada < 0) {
                toast.error(`Verifique las cantidades de ${linea.nombre_producto}.`);
                return;
            }
            if (aceptada + rechazada > linea.cantidad_pendiente + 1e-8) {
                toast.error(`La cantidad recibida supera el saldo solicitado de ${linea.nombre_producto}.`);
                return;
            }
            if (Math.abs(aceptada * 1000 - Math.round(aceptada * 1000)) > 1e-8
                || Math.abs(rechazada * 1000 - Math.round(rechazada * 1000)) > 1e-8) {
                toast.error(`Las cantidades de ${linea.nombre_producto} admiten hasta tres decimales.`);
                return;
            }
            if (!Number.isFinite(costo) || costo <= 0) {
                toast.error(`Ingrese un costo unitario válido para ${linea.nombre_producto}.`);
                return;
            }
            lineasRecepcion.push({
                id_detalle_orden: Number(linea.id_detalle_orden),
                cantidad_aceptada: Number(aceptada.toFixed(3)),
                cantidad_rechazada: Number(rechazada.toFixed(3)),
                costo_unitario: Number(costo.toFixed(4)),
            });
            if (aceptada > 0) {
                lotes.push({
                    id_detalle_orden: Number(linea.id_detalle_orden),
                    lote_proveedor: valores.lote_proveedor.trim() || null,
                    fecha_vencimiento: valores.fecha_vencimiento || null,
                });
            }
        }

        if (!idUbicacion || !lineasRecepcion.length) {
            toast.error("Seleccione ubicación y registre al menos una línea recibida.");
            return;
        }
        if (!lineasRecepcion.some((linea) => linea.cantidad_aceptada > 0)) {
            toast.error("La recepción debe aceptar al menos una unidad para registrar el valor contable.");
            return;
        }
        const resultado = await recibirOrdenCompra({
            id_orden_compra: orden.id_orden_compra,
            id_ubicacion: Number(idUbicacion),
            lineas: lineasRecepcion,
            lotes,
            clave_idempotencia: `recepcion-compra-${crypto.randomUUID()}`,
            documento_proveedor: formData.get("documento_proveedor"),
            observaciones: formData.get("observaciones"),
        });
        if (resultado.success) {
            toast.success("Recepción registrada y existencias actualizadas.");
            onClose();
        }
    };

    return (
        <div className="bg-primary text-title p-6 md:p-8 rounded-2xl w-full max-w-5xl shadow-lg border border-secondary max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-semibold mb-2">Recibir {orden.numero}</h3>
            <p className="text-subtitle mb-6">Proveedor: {orden.nombre_proveedor}. Indique cantidades aceptadas/rechazadas y el costo de las unidades aceptadas.</p>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="recepcion-ubicacion" className="text-sm font-medium">Ubicación</label>
                        <select id="recepcion-ubicacion" value={idUbicacion} onChange={(event) => setIdUbicacion(event.target.value)} required disabled={cargandoUbicaciones} className="bg-input border border-secondary rounded-lg p-3">
                            <option value="">{cargandoUbicaciones ? "Cargando..." : "Seleccione ubicación"}</option>
                            {ubicaciones.map((location) => <option key={location.id_ubicacion} value={location.id_ubicacion}>{location.codigo} — {location.nombre}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="recepcion-documento" className="text-sm font-medium">Documento del proveedor (opcional)</label>
                        <input id="recepcion-documento" name="documento_proveedor" maxLength={120} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-secondary text-subtitle">
                                <th className="py-2 text-left">Producto</th>
                                <th className="py-2 text-center">Pendiente</th>
                                <th className="py-2 text-center">Aceptada</th>
                                <th className="py-2 text-center">Rechazada</th>
                                <th className="py-2 text-center">Costo unitario</th>
                                <th className="py-2 text-left">Lote proveedor</th>
                                <th className="py-2 text-left">Vencimiento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(orden.lineas || []).filter((linea) => linea.cantidad_pendiente > 0).map((linea) => (
                                <tr key={linea.id_detalle_orden} className="border-b border-secondary/50">
                                    <td className="py-3">{linea.nombre_producto}</td>
                                    <td className="py-3 text-center">{Number(linea.cantidad_pendiente).toFixed(3)}</td>
                                    <td className="py-3">
                                        <input aria-label={`Aceptada ${linea.nombre_producto}`} type="number" min="0" max={linea.cantidad_pendiente} step="0.001" value={lineas[linea.id_detalle_orden]?.cantidad_aceptada || ""} onChange={(event) => actualizarLinea(linea.id_detalle_orden, "cantidad_aceptada", event.target.value)} className="bg-input border border-secondary rounded-lg p-2 w-28" />
                                    </td>
                                    <td className="py-3">
                                        <input aria-label={`Rechazada ${linea.nombre_producto}`} type="number" min="0" max={linea.cantidad_pendiente} step="0.001" value={lineas[linea.id_detalle_orden]?.cantidad_rechazada || ""} onChange={(event) => actualizarLinea(linea.id_detalle_orden, "cantidad_rechazada", event.target.value)} className="bg-input border border-secondary rounded-lg p-2 w-28" />
                                    </td>
                                    <td className="py-3">
                                        <input aria-label={`Costo unitario ${linea.nombre_producto}`} type="number" min="0.0001" step="0.0001" value={lineas[linea.id_detalle_orden]?.costo_unitario || ""} onChange={(event) => actualizarLinea(linea.id_detalle_orden, "costo_unitario", event.target.value)} className="bg-input border border-secondary rounded-lg p-2 w-32" />
                                    </td>
                                    <td className="py-3">
                                        <input aria-label={`Lote proveedor ${linea.nombre_producto}`} type="text" maxLength={120} value={lineas[linea.id_detalle_orden]?.lote_proveedor || ""} onChange={(event) => actualizarLinea(linea.id_detalle_orden, "lote_proveedor", event.target.value)} className="bg-input border border-secondary rounded-lg p-2 w-36" />
                                    </td>
                                    <td className="py-3">
                                        <input aria-label={`Vencimiento ${linea.nombre_producto}`} type="date" value={lineas[linea.id_detalle_orden]?.fecha_vencimiento || ""} onChange={(event) => actualizarLinea(linea.id_detalle_orden, "fecha_vencimiento", event.target.value)} className="bg-input border border-secondary rounded-lg p-2" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                    <label htmlFor="recepcion-observaciones" className="text-sm font-medium">Observaciones</label>
                    <textarea id="recepcion-observaciones" name="observaciones" maxLength={1000} rows={2} className="bg-input border border-secondary rounded-lg p-3" />
                </div>
                <div className="flex justify-end gap-4 mt-7">
                    <button type="button" onClick={onClose} className="bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg">Cancelar</button>
                    <button type="submit" disabled={isSaving || cargandoUbicaciones || !ubicaciones.length} className="bg-button text-button font-semibold py-2 px-4 rounded-lg flex gap-2 items-center disabled:opacity-60">
                        <Save size={18} />
                        {isSaving ? "Guardando..." : "Registrar recepción"}
                    </button>
                </div>
            </form>
        </div>
    );
}
