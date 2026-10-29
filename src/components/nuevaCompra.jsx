import { Plus, Save, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { useProductos } from "../hooks/useProductos";
import { toast } from "react-hot-toast";
import { useProveedores } from "../hooks/useProveedores";
import { useCompras } from "../hooks/useCompras";
import { useAuth } from "../contexts/authcontext";
import { useEmpresa } from "../contexts/empresacontext";
import { supabase } from "../supabase/supabaseclient";

export default function NuevaCompra({ onClose }) {
    const { productos, isLoading: isLoadingProductos } = useProductos();
    const { proveedores, isLoading: isLoadingProveedores } = useProveedores();
    const { crearOrdenCompra, isSaving } = useCompras();
    const { perfil, rol } = useAuth();
    const { empresaId } = useEmpresa();
    const esSuperadmin = rol === "superadmin";

    const [sucursales, setSucursales] = useState([]);
    const [idSucursal, setIdSucursal] = useState("");
    const [productosSeleccionados, setProductosSeleccionados] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState("");
    const [cantidadInput, setCantidadInput] = useState("1");
    const [observaciones, setObservaciones] = useState("");

    useEffect(() => {
        let cancelled = false;
        const cargarSucursales = async () => {
            if (!empresaId) return;
            const { data, error } = await supabase
                .from("sucursales")
                .select("id_sucursal, nombre")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .order("nombre");
            if (error) {
                toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
                return;
            }
            if (!cancelled) setSucursales(data || []);
        };
        cargarSucursales();
        return () => { cancelled = true; };
    }, [empresaId]);

    useEffect(() => {
        if (!esSuperadmin && perfil?.id_sucursal) setIdSucursal(String(perfil.id_sucursal));
    }, [esSuperadmin, perfil]);

    const handleAddProduct = () => {
        if (!selectedProductId) {
            toast.error("Selecciona un producto.");
            return;
        }
        const cantidad = Number(cantidadInput);
        if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 1e-8) {
            toast.error("Ingrese una cantidad mayor que cero y con hasta tres decimales.");
            return;
        }
        const product = productos.find((item) => String(item.id_producto) === String(selectedProductId));
        if (!product) {
            toast.error("El producto seleccionado ya no está disponible.");
            return;
        }
        const alreadyAdded = productosSeleccionados.some((item) => item.id_producto === product.id_producto);
        if (!alreadyAdded && productosSeleccionados.length >= 100) {
            toast.error("Una orden no puede tener más de 100 productos.");
            return;
        }
        setProductosSeleccionados((prev) => {
            const existing = prev.find((item) => item.id_producto === product.id_producto);
            if (existing) {
                return prev.map((item) => item.id_producto === product.id_producto
                    ? { ...item, cantidad_solicitada: Number((item.cantidad_solicitada + cantidad).toFixed(3)) }
                    : item);
            }
            return [...prev, {
                id_producto: product.id_producto,
                nombre: product.nombre,
                cantidad_solicitada: cantidad,
            }];
        });
        setSelectedProductId("");
        setCantidadInput("1");
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const idProveedor = formData.get("proveedor");
        if (!idSucursal || !proveedores.some((provider) => String(provider.id) === String(idProveedor))) {
            toast.error("Seleccione una sucursal y un proveedor activo.");
            return;
        }
        if (!productosSeleccionados.length) {
            toast.error("Agregue al menos un producto a la orden.");
            return;
        }
        const resultado = await crearOrdenCompra({
            id_sucursal: Number(idSucursal),
            id_proveedor: Number(idProveedor),
            lineas: productosSeleccionados,
            observaciones,
            clave_idempotencia: `orden-compra-${crypto.randomUUID()}`,
        });
        if (resultado.success) {
            toast.success("Orden de compra creada en estado borrador.");
            onClose();
        }
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-4xl shadow-lg animate-fade-in border border-secondary max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-semibold mb-8">Nueva orden de compra</h3>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="orden-sucursal" className="text-sm font-medium">Sucursal de recepción</label>
                        {esSuperadmin ? (
                            <select id="orden-sucursal" value={idSucursal} onChange={(event) => setIdSucursal(event.target.value)} required className="bg-input border border-secondary rounded-lg p-3">
                                <option value="">Seleccione una sucursal</option>
                                {sucursales.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre}</option>)}
                            </select>
                        ) : (
                            <input id="orden-sucursal" value={sucursales.find((branch) => String(branch.id_sucursal) === idSucursal)?.nombre || "Cargando sucursal..."} readOnly className="bg-input border border-secondary rounded-lg p-3" />
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="orden-proveedor" className="text-sm font-medium">Proveedor</label>
                        <select id="orden-proveedor" name="proveedor" required className="bg-input border border-secondary rounded-lg p-3" disabled={isLoadingProveedores}>
                            <option value="">{isLoadingProveedores ? "Cargando..." : "Seleccione un proveedor"}</option>
                            {proveedores.filter((provider) => provider.estado === 1).map((provider) => (
                                <option key={provider.id} value={provider.id}>{provider.nombre_comercial}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-6 border border-secondary p-4 rounded-lg">
                    <h4 className="text-lg font-semibold">Productos solicitados</h4>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mt-4">
                        <div className="md:col-span-4 flex flex-col gap-2">
                            <label htmlFor="orden-producto" className="text-sm font-medium">Producto</label>
                            <select id="orden-producto" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="bg-input border border-secondary rounded-lg p-3" disabled={isLoadingProductos}>
                                <option value="">{isLoadingProductos ? "Cargando..." : "Seleccione"}</option>
                                {productos.map((product) => <option key={product.id_producto} value={product.id_producto}>{product.nombre}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-1 flex flex-col gap-2">
                            <label htmlFor="orden-cantidad" className="text-sm font-medium">Cantidad</label>
                            <input id="orden-cantidad" type="number" min="0.001" step="0.001" value={cantidadInput} onChange={(event) => setCantidadInput(event.target.value)} className="bg-input border border-secondary rounded-lg p-3" />
                        </div>
                        <button type="button" onClick={handleAddProduct} className="bg-button text-button h-12 flex items-center justify-center rounded-lg" aria-label="Agregar producto">
                            <Plus size={18} />
                        </button>
                    </div>

                    {productosSeleccionados.length > 0 && (
                        <table className="w-full mt-6 border-collapse">
                            <thead className="border-b border-secondary">
                                <tr>
                                    <th className="py-2 text-left">Producto</th>
                                    <th className="py-2 text-center">Cantidad solicitada</th>
                                    <th className="py-2 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productosSeleccionados.map((item) => (
                                    <tr key={item.id_producto} className="border-b border-secondary/50">
                                        <td className="p-2">{item.nombre}</td>
                                        <td className="p-2 text-center">{item.cantidad_solicitada.toFixed(3)}</td>
                                        <td className="p-2 text-center">
                                            <button type="button" onClick={() => setProductosSeleccionados((prev) => prev.filter((line) => line.id_producto !== item.id_producto))} className="text-red-500" aria-label={`Quitar ${item.nombre}`}>
                                                <Trash size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="mt-5 flex flex-col gap-2">
                    <label htmlFor="orden-observaciones" className="text-sm font-medium">Observaciones</label>
                    <textarea id="orden-observaciones" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} maxLength={1000} rows={3} className="bg-input border border-secondary rounded-lg p-3" />
                </div>

                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onClose} className="bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg">Cancelar</button>
                    <button type="submit" disabled={isSaving || isLoadingProductos || isLoadingProveedores || !idSucursal} className="bg-button text-button font-semibold py-2 px-4 rounded-lg flex gap-2 items-center disabled:opacity-60">
                        <Save size={18} />
                        {isSaving ? "Guardando..." : "Crear orden"}
                    </button>
                </div>
            </form>
        </div>
    );
}
