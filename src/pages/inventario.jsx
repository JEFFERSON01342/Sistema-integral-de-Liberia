import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import NuevoProducto from "../components/nuevoProducto";
import EditarProducto from "../components/editarProducto";
import { useState, useEffect, useCallback } from "react";
import { Box, TrendingUp, TrendingDown, CircleAlert, ArrowLeftRight, Plus, ShoppingBasket, Pencil, Trash, Printer, Barcode, SlidersHorizontal, Building2 } from "lucide-react";
import { useProductos } from "../hooks/useProductos";
import { useAuth } from "../contexts/authcontext";
import { useEmpresa } from "../contexts/empresacontext";
import { supabase } from "../supabase/supabaseclient";
import Swal from "sweetalert2";
import { toast } from "react-hot-toast";
import { generarCodigoEAN13, imprimirCodigosBarras } from "../utils/generarCodigoBarras";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}[character]));

export default function Inventario() {
    const { perfil, rol } = useAuth();
    const { empresaId } = useEmpresa();
    const esSuperadmin = rol === "superadmin";

    const [sucursales, setSucursales] = useState([]);
    const [sucursalSel, setSucursalSel] = useState("");
    const [stockMap, setStockMap] = useState({});

    useEffect(() => {
        let cancelled = false;
        const cargarSucursales = async () => {
            if (!empresaId) {
                setSucursales([]);
                return;
            }
            const { data, error } = await supabase
                .from("sucursales")
                .select("id_sucursal, nombre")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .order("id_sucursal");
            if (error) {
                console.error("Error al cargar sucursales del inventario:", error);
                toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
                return;
            }
            if (!cancelled) setSucursales(data || []);
        };
        cargarSucursales();
        return () => { cancelled = true; };
    }, [empresaId]);

    useEffect(() => {
        if (!esSuperadmin && perfil?.id_sucursal) setSucursalSel(String(perfil.id_sucursal));
    }, [esSuperadmin, perfil]);

    const cargarStockSucursal = useCallback(async () => {
        if (!sucursalSel || !empresaId) {
            setStockMap({});
            return;
        }
        const { data, error } = await supabase
            .from("existencias_producto_sucursal")
            .select("id_producto, cantidad_disponible, stock_minimo, valor_inventario, estado_stock")
            .eq("id_empresa", empresaId)
            .eq("id_sucursal", Number(sucursalSel));
        if (error) {
            console.error("Error al cargar existencias de la sucursal:", error);
            toast.error(`No se pudieron cargar las existencias: ${error.message}`);
            return;
        }
        const mapa = {};
        (data || []).forEach((row) => {
            mapa[row.id_producto] = {
                stock: Number(row.cantidad_disponible || 0),
                stock_minimo: Number(row.stock_minimo || 0),
                valor_inventario: Number(row.valor_inventario || 0),
                estado_stock: row.estado_stock,
            };
        });
        setStockMap(mapa);
    }, [empresaId, sucursalSel]);

    useEffect(() => { cargarStockSucursal(); }, [cargarStockSucursal]);

    const verPorSucursal = !!sucursalSel;
    const stockDe = (p) => verPorSucursal ? Number(stockMap[p.id_producto]?.stock ?? 0) : Number(p.stock ?? 0);
    const stockBajoDe = (p) => verPorSucursal
        ? ["BAJO", "SIN_EXISTENCIA"].includes(stockMap[p.id_producto]?.estado_stock)
        : Boolean(p.bajo_stock);
    const valorDe = (p) => verPorSucursal
        ? Number(stockMap[p.id_producto]?.valor_inventario ?? 0)
        : Number(p.valor_inventario ?? 0);

    const ajustarStock = async (p) => {
        if (!verPorSucursal) { toast.error("Seleccione una sucursal para ajustar el stock físico."); return; }
        if (!empresaId) { toast.error("No hay una empresa seleccionada."); return; }

        const idSucursal = Number(sucursalSel);
        const { data: ubicaciones, error: errorUbicaciones } = await supabase
            .from("ubicaciones_bodega")
            .select("id_ubicacion, codigo, nombre")
            .eq("id_empresa", empresaId)
            .eq("id_sucursal", idSucursal)
            .eq("activa", true)
            .order("codigo");
        if (errorUbicaciones) {
            toast.error(`No se pudieron cargar las ubicaciones: ${errorUbicaciones.message}`);
            return;
        }
        if (!ubicaciones?.length) {
            toast.error("La sucursal no tiene ubicaciones activas para ajustar inventario.");
            return;
        }

        const { value: idUbicacion } = await Swal.fire({
            title: "Ubicación del ajuste",
            text: `Seleccione dónde se realizó el conteo de ${p.nombre}.`,
            input: "select",
            inputOptions: Object.fromEntries(ubicaciones.map((ubicacion) => [
                ubicacion.id_ubicacion,
                `${ubicacion.codigo} — ${ubicacion.nombre}`,
            ])),
            inputPlaceholder: "Seleccione una ubicación",
            inputValidator: (value) => value ? undefined : "Seleccione una ubicación.",
            background: "#152235", color: "#fff",
            showCancelButton: true, confirmButtonText: "Continuar", cancelButtonText: "Cancelar",
            confirmButtonColor: "#2563eb",
        });
        if (!idUbicacion) return;

        const [capasResult, cuentasResult] = await Promise.all([
            supabase
                .from("capas_inventario_fifo")
                .select("cantidad_disponible, costo_unitario")
                .eq("id_empresa", empresaId)
                .eq("id_sucursal", idSucursal)
                .eq("id_ubicacion", Number(idUbicacion))
                .eq("id_producto", p.id_producto)
                .gt("cantidad_disponible", 0),
            supabase
                .from("cuentas_contables")
                .select("id_cuenta, codigo, nombre")
                .eq("id_empresa", empresaId)
                .eq("activa", true)
                .eq("es_grupo", false)
                .eq("permite_movimientos", true)
                .neq("codigo", "1.1.06")
                .order("codigo"),
        ]);
        if (capasResult.error) {
            toast.error(`No se pudo consultar el saldo FIFO: ${capasResult.error.message}`);
            return;
        }
        if (cuentasResult.error) {
            toast.error(`No se pudieron cargar las cuentas contables: ${cuentasResult.error.message}`);
            return;
        }
        if (!cuentasResult.data?.length) {
            toast.error("No hay cuentas contables activas que permitan movimientos.");
            return;
        }

        const capas = capasResult.data || [];
        const existenciaActual = capas.reduce((total, capa) => total + Number(capa.cantidad_disponible), 0);
        const valorActual = capas.reduce((total, capa) => (
            total + Number(capa.cantidad_disponible) * Number(capa.costo_unitario)
        ), 0);
        const costoPromedio = existenciaActual > 0 ? valorActual / existenciaActual : 0;
        const opcionesCuentas = cuentasResult.data.map((cuenta) => (
            `<option value="${cuenta.id_cuenta}">${escapeHtml(cuenta.codigo)} — ${escapeHtml(cuenta.nombre)}</option>`
        )).join("");
        const { value: datosAjuste } = await Swal.fire({
            title: "Registrar ajuste de inventario",
            html: `
                <p style="margin-bottom:12px">${escapeHtml(p.nombre)} — existencia en ubicación: ${existenciaActual.toFixed(3)}</p>
                <label for="inventario-contado" style="display:block;text-align:left">Cantidad contada</label>
                <input id="inventario-contado" class="swal2-input" type="number" min="0" step="0.001" value="${existenciaActual.toFixed(3)}">
                <label for="inventario-costo" style="display:block;text-align:left">Costo unitario (para entradas)</label>
                <input id="inventario-costo" class="swal2-input" type="number" min="0.0001" step="0.0001" value="${costoPromedio > 0 ? costoPromedio.toFixed(4) : ""}">
                <label for="inventario-cuenta" style="display:block;text-align:left">Cuenta de contrapartida</label>
                <select id="inventario-cuenta" class="swal2-select"><option value="">Seleccione una cuenta</option>${opcionesCuentas}</select>
                <label for="inventario-motivo" style="display:block;text-align:left">Motivo del ajuste</label>
                <textarea id="inventario-motivo" class="swal2-textarea" placeholder="Explique el motivo del ajuste"></textarea>
            `,
            focusConfirm: false,
            preConfirm: () => {
                const cantidadContada = Number(document.getElementById("inventario-contado").value);
                const costoUnitario = Number(document.getElementById("inventario-costo").value);
                const idCuenta = document.getElementById("inventario-cuenta").value;
                const motivo = document.getElementById("inventario-motivo").value.trim();
                if (document.getElementById("inventario-contado").value === "" || !Number.isFinite(cantidadContada) || cantidadContada < 0) {
                    Swal.showValidationMessage("Ingrese una cantidad contada válida.");
                    return false;
                }
                if (Math.abs(cantidadContada * 1000 - Math.round(cantidadContada * 1000)) > 1e-8) {
                    Swal.showValidationMessage("La cantidad admite hasta tres decimales.");
                    return false;
                }
                if (document.getElementById("inventario-costo").value === "" || !Number.isFinite(costoUnitario) || costoUnitario <= 0) {
                    Swal.showValidationMessage("Ingrese un costo unitario mayor que cero.");
                    return false;
                }
                if (!idCuenta) {
                    Swal.showValidationMessage("Seleccione la cuenta de contrapartida.");
                    return false;
                }
                if (motivo.length < 3) {
                    Swal.showValidationMessage("El motivo debe tener al menos tres caracteres.");
                    return false;
                }
                return { cantidadContada, costoUnitario, idCuenta, motivo };
            },
            background: "#152235", color: "#fff",
            showCancelButton: true, confirmButtonText: "Guardar ajuste", cancelButtonText: "Cancelar",
            confirmButtonColor: "#2563eb",
        });
        if (!datosAjuste) return;

        const cantidadDelta = Number((datosAjuste.cantidadContada - existenciaActual).toFixed(3));
        if (cantidadDelta === 0) {
            toast("El conteo no presenta diferencias; no se registró ningún ajuste.");
            return;
        }

        const { error } = await supabase.rpc("registrar_ajuste_inventario", {
            p_id_sucursal: idSucursal,
            p_id_ubicacion: Number(idUbicacion),
            p_lineas: [{
                id_producto: p.id_producto,
                cantidad_delta: cantidadDelta,
                costo_unitario: Number(datosAjuste.costoUnitario.toFixed(4)),
            }],
            p_motivo: datosAjuste.motivo,
            p_clave_idempotencia: `inventario-${crypto.randomUUID()}`,
            p_id_cuenta_contrapartida: Number(datosAjuste.idCuenta),
        });
        if (error) {
            Swal.fire({ icon: "error", title: "No se pudo ajustar", text: error.message, background: "#152235", color: "#fff" });
            return;
        }
        toast.success("Stock ajustado.");
        await cargarStockSucursal();
    };

    const tabs = [
        { key: "productos", label: "Productos", icon: <ShoppingBasket size={16} /> },
        { key: "movimientos", label: "Movimientos", icon: <ArrowLeftRight size={16} /> }
    ];

    const [activeTab, setActiveTab] = useState("productos");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [productoEditando, setProductoEditando] = useState(null);
    const { productos = [], isLoading, eliminarProducto, agregarProducto, actualizarProducto } = useProductos();

    const valorTotalInventario = productos.reduce((total, producto) => {
        if (!producto) return total;
        return total + valorDe(producto);
    }, 0);

    const codigoDe = (p) => p.codigo_barras || generarCodigoEAN13(p.id_producto);

    const imprimirUno = (p) => {
        imprimirCodigosBarras([{ codigo: codigoDe(p), nombre: p.nombre, precio: p.precio_venta }]);
    };

    const imprimirTodos = () => {
        if (!productos.length) return toast.error("No hay productos para imprimir");
        imprimirCodigosBarras(productos.map(p => ({ codigo: codigoDe(p), nombre: p.nombre, precio: p.precio_venta })));
    };

    const handleEliminarProducto = async (id, nombre) => {
        Swal.fire({
            title: '¿Estás seguro?',
            text: `Se desactivará el producto "${nombre}" para conservar el historial de inventario y ventas.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#262626',
            confirmButtonText: 'Sí, ¡eliminar!',
            cancelButtonText: 'Cancelar',
            background: '#090909',
            color: '#fff',
            customClass: {
                popup: 'border border-secondary rounded-2xl'
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { success, message } = await eliminarProducto(id);

                if (success) {
                    toast.success('✅ Producto eliminado correctamente');
                } else {
                    toast.error(`⚠️ Error al eliminar: ${message}`);
                }
            }
        });
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Total Productos"} icon={<Box className="text-title" />} value={productos.length} />
                <StatsCards title={"Valor Inventario"} icon={<TrendingUp className="text-title" />} value={`C$${valorTotalInventario.toFixed(2)}`} /> {/* Añadido toFixed(2) */}
                <StatsCards title={"Stock Bajo"} icon={<CircleAlert color="red" />} value={productos.filter(stockBajoDe).length} />
                <StatsCards title={"Movimientos hoy"} icon={<TrendingDown className="text-title" />} value={"0"} />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="text-subtitle text-sm flex items-center gap-1.5"><Building2 size={16} /> Sucursal:</span>
                {esSuperadmin ? (
                    <select
                        value={sucursalSel}
                        onChange={(e) => setSucursalSel(e.target.value)}
                        className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5 text-sm"
                    >
                        <option value="">Todas (stock global)</option>
                        {sucursales.map((s) => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                    </select>
                ) : (
                    <span className="badge badge-info">{sucursales.find((s) => String(s.id_sucursal) === sucursalSel)?.nombre || "Mi sucursal"}</span>
                )}
                {verPorSucursal && <span className="text-xs text-subtitle">Mostrando stock de la sucursal seleccionada.</span>}
            </div>

            <div className="mt-4">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    {activeTab === "productos" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Gestión de productos</h3>
                                    <p className="text-subtitle text-s">Administra el catálogo de productos del inventario</p>
                                </div>
                                <div className="flex flex-row gap-4">
                                    <button
                                        onClick={imprimirTodos}
                                        className="bg-secondary/40 text-title border border-secondary px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 hover:opacity-95 hover:scale-110 transition"
                                        title="Imprimir códigos de barra de todos los productos"
                                    >
                                        <Barcode size={18} /> Imprimir Códigos
                                    </button>
                                    <button className="btn-new bg-button text-button flex flex-row h-10 text-s gap-3 p-2 rounded-xl items-center cursor-pointer hover:opacity-95 hover:scale-110 transition" onClick={() => setIsModalOpen(true)}>
                                        <span className="icon"><Plus /></span> Nuevo Producto
                                    </button>
                                </div>

                            </div>

                            <div className="mt-8 overflow-x-auto">
                                {isLoading ? (
                                    <p className="p-4 text-center text-gray-400">Cargando productos...</p>
                                ) : productos.length === 0 ? (
                                    <p className="p-4 text-center text-gray-400">No hay productos registrados. ¡Agrega uno nuevo!</p>
                                ) : (
                                    <div className="inline-block min-w-full align-middle">
                                        <div className="overflow-hidden rounded-lg mb-8">
                                            <table className="min-w-full text-title">
                                                <thead className="bg-secondary/10">
                                                    <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                                                        <th className="py-3 px-4 text-center">SKU</th>
                                                        <th className="py-3 px-4 text-center">Código de Barras</th>
                                                        <th className="py-3 px-4 text-center">Nombre</th>
                                                        <th className="py-3 px-4 text-center">Categoría</th>
                                                        <th className="py-3 px-4 text-center">Valor Existencias</th>
                                                        <th className="py-3 px-4 text-center">Precio Venta</th>
                                                        <th className="py-3 px-4 text-center">Stock</th>
                                                        <th className="py-3 px-4 text-center">Unidad</th>
                                                        <th className="py-3 px-4 text-center">Fecha Registro</th>
                                                        <th className="py-3 px-4 text-center">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {productos.map((p) => (
                                                        <tr key={p.id_producto} className="border-t border-secondary text-sm hover:bg-secondary/10 transition-colors">
                                                            <td className="py-4 px-4 font-mono text-center text-gray-400">{p.sku || "-"}</td>
                                                            <td className="py-4 px-4 text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <span className="font-mono text-xs text-subtitle">{codigoDe(p)}</span>
                                                                    <button title="Imprimir código de barras" onClick={() => imprimirUno(p)} className="text-title hover:text-blue-300 transition-colors transform hover:scale-110 cursor-pointer">
                                                                        <Printer size={16} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-4 font-medium text-center text-title">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <span>{p.nombre}</span>
                                                                    {stockBajoDe(p) && (
                                                                        <span className="inline-flex items-center gap-1 bg-red-600/20 text-red-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                                                            <CircleAlert size={11} /> Stock bajo
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-4 text-center text-subtitle">{p.categorias_producto?.nombre || "N/A"}</td>
                                                            <td className="py-4 px-4 text-center text-subtitle">C${valorDe(p).toFixed(2)}</td>
                                                            <td className="py-4 px-4 text-center text-subtitle">C${Number(p.precio_venta || 0).toFixed(2)}</td>
                                                            <td className="py-4 px-4 text-center">
                                                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${stockBajoDe(p)
                                                                    ? 'bg-green-600/20 text-green-400'
                                                                    : 'bg-red-600/20 text-red-400'
                                                                    }`}>
                                                                    {stockDe(p)}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 px-4 text-center text-subtitle">{p.unidades_medidas?.nombre || "N/A"}</td>
                                                            <td className="py-4 px-4 text-center text-subtitle">{p.fecha_registro ? new Date(p.fecha_registro).toLocaleDateString() : "N/A"}</td>
                                                            <td className="py-4 px-4">
                                                                <div className="flex justify-center gap-6">
                                                                    {verPorSucursal && (
                                                                        <button title="Ajustar stock físico de la sucursal" onClick={() => ajustarStock(p)} className="text-amber-400 hover:text-amber-300 transition-colors transform hover:scale-110 cursor-pointer">
                                                                            <SlidersHorizontal size={18} />
                                                                        </button>
                                                                    )}
                                                                    <button title="Editar Producto" onClick={() => setProductoEditando(p)} className="text-blue-400 hover:text-blue-300 transition-colors transform hover:scale-110 cursor-pointer">
                                                                        <Pencil size={18} />
                                                                    </button>
                                                                    <button title="Eliminar Producto" className="text-red-500 hover:text-red-400 transition-colors transform hover:scale-110 cursor-pointer" onClick={() => handleEliminarProducto(p.id_producto, p.nombre)}>
                                                                        <Trash size={18} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <NuevoProducto onClose={() => setIsModalOpen(false)}
                            onProductoAgregado={agregarProducto} />
                    </div>
                </div>
            )}

            {productoEditando && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setProductoEditando(null)}></div>
                    <div className="relative z-10 mx-4">
                        <EditarProducto
                            producto={productoEditando}
                            onClose={() => setProductoEditando(null)}
                            onGuardar={actualizarProducto}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
