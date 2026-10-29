import { Plus, Save, Trash, ScanLine, Search, UserCheck, X } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { useProductos } from '../hooks/useProductos';
import { toast } from "react-hot-toast";
import { useVenta } from '../hooks/useVenta';
import { useClientes } from '../hooks/useClientes';
import { generarFacturaPDF } from '../utils/generarFacturaPDF';
import { supabase } from '../supabase/supabaseclient';
import { useEmpresa } from '../contexts/empresacontext';
import { useAuth } from '../contexts/authcontext';

const getFormattedDate = () => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${mm}${dd}${yyyy}`;
};

const calcularDias = (fecha, vencimiento) => {
    if (!fecha || !vencimiento) return null;
    try {
        const date1 = new Date(fecha);
        const date2 = new Date(vencimiento);
        const diffTime = Math.abs(date2.getTime() - date1.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (error) {
        console.error("Error calculando días:", error);
        return null;
    }
};

export default function NuevaVenta({ onClose }) {
    const [productosSeleccionados, setProductosSeleccionados] = useState([]);
    const { productos } = useProductos();
    const { clientes } = useClientes();
    const [selectedProductId, setSelectedProductId] = useState('');
    const [cantidadInput, setCantidadInput] = useState(1);
    const [descuentoInput, setDescuentoInput] = useState(0);
    const { crearVenta, ventas } = useVenta();
    const { empresaId } = useEmpresa();
    const { rol, user, perfil } = useAuth();
    const esCajero = rol === 'cajero';
    const [numeroFactura, setNumeroFactura] = useState('Generando...');
    const [codigoBarras, setCodigoBarras] = useState('');
    const [guardando, setGuardando] = useState(false);

    // Caja abierta del cajero (para enlazar la venta)
    const [aperturaCaja, setAperturaCaja] = useState(null);

    // Cliente: por defecto "Cliente de mostrador". Búsqueda para enlazar clientes en línea.
    const clienteMostrador = clientes.find(
        (c) => c.tipo_cliente === 'mostrador' || c.id_cliente === 1 || /mostrador/i.test(c.nombre || '')
    );
    const [clienteSel, setClienteSel] = useState(null); // objeto cliente seleccionado (online)
    const [busqueda, setBusqueda] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);

    // Prefijo de sucursal para numerar facturas (único por sucursal)
    const sucursalPrefix = perfil?.id_sucursal ? `S${perfil.id_sucursal}-` : '';

    useEffect(() => {
        if (ventas && Array.isArray(ventas)) {
            const todayStr = getFormattedDate();
            const ventasDeHoy = ventas.filter(venta =>
                venta.numero_factura && typeof venta.numero_factura === 'string' &&
                venta.numero_factura.includes(todayStr) &&
                (!sucursalPrefix || venta.numero_factura.startsWith(sucursalPrefix))
            );
            const proximoNumero = ventasDeHoy.length + 1;
            setNumeroFactura(`${sucursalPrefix}${todayStr}-${String(proximoNumero).padStart(4, '0')}`);
        } else if (ventas === null || ventas === undefined) {
            setNumeroFactura('Cargando...');
        } else {
            setNumeroFactura(`${sucursalPrefix}${getFormattedDate()}-0001`);
        }
    }, [ventas, sucursalPrefix]);

    // Cargar la caja abierta del cajero logueado
    useEffect(() => {
        if (!user?.id) return;
        supabase
            .from('apertura_caja')
            .select('id')
            .eq('id_cajero', user.id)
            .eq('estado', 'abierta')
            .order('fecha_apertura', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => setAperturaCaja(data || null));
    }, [user]);

    // Búsqueda de clientes en línea por identificación / correo / nombre (pocos resultados)
    const buscarCliente = useCallback(async () => {
        const q = busqueda.trim();
        if (q.length < 2) { setResultados([]); return; }
        setBuscando(true);
        const { data } = await supabase
            .from('clientes')
            .select('id_cliente, nombre, identificacion, correo, telefono')
            .eq('id_empresa', empresaId)
            .or(`identificacion.ilike.%${q}%,correo.ilike.%${q}%,nombre.ilike.%${q}%`)
            .limit(6);
        setResultados(data || []);
        setBuscando(false);
    }, [busqueda, empresaId]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const form = e.target;
        const tipoPago = form["tipo-pago"].value;
        const fecha = form.fecha.value;
        const vencimiento = form.fechavencimiento.value;

        // Cliente: el seleccionado (online) o el de mostrador por defecto
        const clienteObj = clienteSel || clienteMostrador;
        if (!clienteObj) {
            toast.error("No hay un cliente de mostrador configurado. Seleccione un cliente.");
            return;
        }

        if (!tipoPago) { toast.error("Seleccione un tipo de pago"); return; }
        if (productosSeleccionados.length === 0) {
            toast.error("Debes agregar al menos un producto");
            return;
        }
        if (numeroFactura === 'Generando...' || numeroFactura === 'Cargando...') {
            toast.error("Espere a que se genere el número de factura");
            return;
        }
        // El cajero no puede vender sin caja abierta
        if (esCajero && !aperturaCaja) {
            toast.error("Debes abrir la caja antes de registrar ventas.");
            return;
        }

        const ventaData = {
            numero_factura: numeroFactura,
            id_cliente: clienteObj.id_cliente,
            tipo_pago: tipoPago,
            plazo_dias: tipoPago === 'credito' ? calcularDias(fecha, vencimiento) : 0,
            fechavencimiento: tipoPago === 'credito' ? vencimiento : null,
            id_apertura_caja: aperturaCaja?.id || null,
            detalle_items: productosSeleccionados.map(p => ({
                "IdProducto": p.id_producto,
                "Cantidad": p.cantidad
            }))
        };

        setGuardando(true);
        const idVenta = await crearVenta(ventaData);
        setGuardando(false);

        // crearVenta devuelve un número (id) en éxito o { error } en fallo
        if (typeof idVenta === 'number') {
            toast.success(`✅ Venta creada correctamente (ID: ${idVenta})`);

            try {
                const datosFactura = {
                    numeroFactura,
                    fecha: fecha || new Date().toLocaleDateString('es-NI'),
                    cliente: clienteObj?.nombre || 'Cliente de mostrador',
                    identificacion: clienteObj?.identificacion || '',
                    tipoPago,
                    sucursal: perfil?.sucursal_nombre || '',
                    canal: 'sucursal',
                    pago: 'sucursal',
                    items: productosSeleccionados.map(p => ({
                        nombre: p.nombre,
                        cantidad: p.cantidad,
                        precio: p.precio,
                        descuento: p.descuento,
                    })),
                    plazoDias: tipoPago === 'credito' ? calcularDias(fecha, vencimiento) : 0,
                    vencimiento: tipoPago === 'credito' ? vencimiento : '',
                };

                generarFacturaPDF(datosFactura, 'open');

                await supabase.from('facturas').insert({
                    numero_factura: numeroFactura,
                    id_venta: idVenta,
                    id_empresa: empresaId,
                    contenido_json: datosFactura,
                });
            } catch (err) {
                console.error('Error generando factura:', err.message);
                toast.error('La venta se registró, pero no se pudo generar la factura.');
            }

            onClose();
        } else {
            const msg = idVenta?.error || "Error al crear la venta";
            toast.error(`⚠️ ${msg}`);
        }
    };

    const handleEscanear = (codigo) => {
        const valor = (codigo ?? '').trim();
        if (!valor) return;
        const prod = productos.find(p => String(p.codigo_barras || '') === valor);
        if (!prod) {
            toast.error(`No se encontró producto con código ${valor}`);
            return;
        }
        if (productosSeleccionados.some(p => p.id_producto === prod.id_producto)) {
            setProductosSeleccionados(prev => prev.map(p =>
                p.id_producto === prod.id_producto ? { ...p, cantidad: Number(p.cantidad) + 1 } : p
            ));
        } else {
            const precio = prod.precio_venta ?? prod.precio ?? prod.precio_compra ?? 0;
            setProductosSeleccionados(prev => [...prev, {
                id_producto: prod.id_producto,
                nombre: prod.nombre,
                precio,
                cantidad: 1,
                descuento: 0,
            }]);
        }
        toast.success(`➕ ${prod.nombre}`);
        setCodigoBarras('');
    };

    const handleAddProduct = () => {
        if (!selectedProductId) return toast.error("Selecciona un producto");
        const prod = productos.find(p => String(p.id_producto) === String(selectedProductId));
        if (!prod) return toast.error("Producto no encontrado");
        if (productosSeleccionados.some(p => p.id_producto === prod.id_producto)) {
            toast.error("El producto ya fue agregado");
            return;
        }
        const precio = prod.precio_venta ?? prod.precio ?? prod.precio_compra ?? 0;
        setProductosSeleccionados(prev => [...prev, {
            id_producto: prod.id_producto,
            nombre: prod.nombre,
            precio,
            cantidad: Number(cantidadInput),
            descuento: Number(descuentoInput),
        }]);
        setSelectedProductId('');
        setCantidadInput(1);
        setDescuentoInput(0);
    };

    return (
        <div className="bg-card text-title p-7 rounded-2xl w-full max-w-4xl shadow-2xl animate-fade-in border border-secondary max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">Nueva Venta</h3>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="numeroFactura" className="text-sm font-medium text-title">Número de Factura</label>
                        <input id="numeroFactura" name="numeroFactura" type="text" value={numeroFactura} readOnly required className="bg-input border border-secondary rounded-lg p-3" />
                    </div>

                    {/* Cliente: mostrador por defecto + búsqueda */}
                    <div className="flex flex-col gap-2 md:col-span-2">
                        <label className="text-sm font-medium text-title">Cliente</label>
                        {clienteSel ? (
                            <div className="flex items-center justify-between gap-2 bg-input border border-secondary rounded-lg p-3">
                                <span className="flex items-center gap-2 text-title text-sm">
                                    <UserCheck size={16} className="text-green-400" />
                                    {clienteSel.nombre} {clienteSel.identificacion ? `· ${clienteSel.identificacion}` : ''}
                                </span>
                                <button type="button" onClick={() => setClienteSel(null)} className="text-subtitle hover:text-title" title="Usar cliente de mostrador"><X size={16} /></button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtitle" />
                                        <input
                                            type="text"
                                            value={busqueda}
                                            onChange={(e) => setBusqueda(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCliente(); } }}
                                            placeholder="Cliente de mostrador (buscar en línea por código, correo o nombre…)"
                                            className="bg-input border border-secondary rounded-lg p-3 pl-9 w-full text-sm"
                                        />
                                    </div>
                                    <button type="button" onClick={buscarCliente} className="btn-secondary">Buscar</button>
                                </div>
                                {buscando && <p className="text-xs text-subtitle mt-1">Buscando…</p>}
                                {resultados.length > 0 && (
                                    <div className="absolute z-20 mt-1 w-full bg-card border border-secondary rounded-lg shadow-xl overflow-hidden">
                                        {resultados.map((c) => (
                                            <button key={c.id_cliente} type="button"
                                                onClick={() => { setClienteSel(c); setResultados([]); setBusqueda(''); }}
                                                className="w-full text-left px-3 py-2 hover:bg-secondary text-sm">
                                                <span className="text-title font-medium">{c.nombre}</span>
                                                <span className="text-subtitle"> · {c.identificacion || 'sin código'} · {c.correo || 's/correo'}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <label htmlFor="fecha" className="text-sm font-medium text-title">Fecha</label>
                        <input id="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>

                    {!esCajero ? (
                        <div className="flex flex-col gap-2">
                            <label htmlFor="fechavencimiento" className="text-sm font-medium text-title">Fecha de Vencimiento</label>
                            <input id="fechavencimiento" type="date" className="bg-input border border-secondary rounded-lg p-3 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                        </div>
                    ) : (
                        <input id="fechavencimiento" type="hidden" value="" readOnly />
                    )}

                    <div className="flex flex-col gap-2">
                        <label htmlFor="tipo-pago" className="text-sm font-medium text-title">Tipo de Pago</label>
                        <select id="tipo-pago" className="bg-input border border-secondary rounded-lg p-3">
                            <option value="">Seleccione un tipo de pago</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="tarjeta">Tarjeta de Crédito</option>
                            <option value="transferencia">Transferencia Bancaria</option>
                            {!esCajero && <option value="credito">Crédito</option>}
                        </select>
                    </div>

                    <div className='md:col-span-3 flex flex-col border border-secondary p-4 rounded-lg'>
                        <h3 className="text-lg font-semibold text-title">Productos</h3>
                        <p className='text-sm text-subtitle mb-4'>Agrega los productos que deseas vender</p>

                        <div className="flex flex-col gap-2 mb-4">
                            <label htmlFor="codigoBarras" className="text-sm font-medium text-title flex items-center gap-2">
                                <ScanLine size={16} /> Escanear código de barras
                            </label>
                            <input
                                id="codigoBarras"
                                type="text"
                                value={codigoBarras}
                                onChange={(e) => setCodigoBarras(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEscanear(codigoBarras); } }}
                                placeholder="Escanee o escriba el código y presione Enter"
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>

                        <div className={`grid gap-x-4 gap-y-4 items-end ${esCajero ? 'grid-cols-6' : 'grid-cols-8'}`}>
                            <div className="flex flex-col gap-2 col-span-3">
                                <label htmlFor="producto" className="text-sm font-medium text-title">Producto</label>
                                <select id="producto" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                    <option value="">Seleccione un producto</option>
                                    {productos.map(p => (
                                        <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-2 col-span-2">
                                <label htmlFor="cantidad" className="text-sm font-medium text-title">Cantidad</label>
                                <input id="cantidad" type="number" step="0.01" value={cantidadInput} onChange={(e) => setCantidadInput(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" />
                            </div>

                            {!esCajero && (
                                <div className="flex flex-col gap-2 col-span-2">
                                    <label htmlFor="descuento" className="text-sm font-medium text-title">Descuento</label>
                                    <input id="descuento" type="number" step="1" value={descuentoInput} onChange={(e) => setDescuentoInput(e.target.value)} placeholder='15%' className="bg-input border border-secondary rounded-lg p-3" />
                                </div>
                            )}

                            <div className="flex flex-col gap-2 items-end w-full">
                                <button type="button" onClick={handleAddProduct} className="bg-button text-button h-12 cursor-pointer w-full flex items-center justify-center rounded-md hover:opacity-90 transition" aria-label="Agregar producto">
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>

                        {productosSeleccionados.length > 0 && (
                            <table className="w-full mt-6 border-collapse">
                                <thead className='border-b border-secondary'>
                                    <tr>
                                        <th className="text-center text-sm font-medium text-title py-2">Producto</th>
                                        <th className="text-center text-sm font-medium text-title">Precio</th>
                                        <th className="text-center text-sm font-medium text-title">Cantidad</th>
                                        {!esCajero && <th className="text-center text-sm font-medium text-title">Descuento</th>}
                                        <th className="text-center text-sm font-medium text-title">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productosSeleccionados.map((item, index) => (
                                        <tr key={item.id_producto ?? index}>
                                            <td className="p-2 text-center">{item.nombre}</td>
                                            <td className="p-2 text-center">{item.precio}</td>
                                            <td className="p-2 text-center">{item.cantidad}</td>
                                            {!esCajero && <td className="p-2 text-center">{item.descuento}%</td>}
                                            <td className="p-2 text-center">
                                                <button type="button" onClick={() => setProductosSeleccionados(prev => prev.filter((_, i) => i !== index))} className="text-red-500 cursor-pointer hover:text-red-700 flex items-center justify-center w-8 h-8 mx-auto">
                                                    <Trash size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div className="flex justify-end mt-4 text-subtitle text-sm">
                            Productos Seleccionados: {productosSeleccionados.length}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mt-4">
                    <h3 className="text-title font-bold text-2xl">
                        Total: C$ {productosSeleccionados.reduce((acc, item) => acc + (item.precio || 0) * (item.cantidad || 0) * (1 - (item.descuento || 0) / 100), 0).toFixed(2)}
                    </h3>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button type="submit" disabled={guardando} className="btn-primary disabled:opacity-50">
                        <Save size={18} /> {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </form>
        </div>
    );
}
