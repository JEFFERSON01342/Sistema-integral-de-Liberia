import { Plus, Save, Trash, ScanLine, Search, UserCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useProductos } from "../hooks/useProductos";
import { useVenta } from "../hooks/useVenta";
import { generarFacturaPDF } from "../utils/generarFacturaPDF";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";

const money = (value) => Number(Number(value || 0).toFixed(2));

export default function NuevaVenta({ onClose }) {
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const { productos, isLoading: cargandoProductos } = useProductos();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [cantidadInput, setCantidadInput] = useState("1");
  const { crearVenta } = useVenta();
  const { empresaId } = useEmpresa();
  const { rol, user, perfil } = useAuth();
  const [codigoBarras, setCodigoBarras] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sesionCaja, setSesionCaja] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [errorSesion, setErrorSesion] = useState("");
  const [existencias, setExistencias] = useState({});
  const [errorStock, setErrorStock] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [efectivoRecibido, setEfectivoRecibido] = useState("");
  const [clienteSel, setClienteSel] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const codigoInputRef = useRef(null);
  const claveVentaRef = useRef(null);

  const totalVenta = useMemo(
    () => money(productosSeleccionados.reduce(
      (total, item) => total + money(Number(item.precio) * Number(item.cantidad)),
      0
    )),
    [productosSeleccionados]
  );
  const cambio = metodoPago === "EFECTIVO"
    ? money(Math.max(0, Number(efectivoRecibido || 0) - totalVenta))
    : 0;

  useEffect(() => {
    let activo = true;
    const cargarSesion = async () => {
      setCargandoSesion(true);
      setErrorSesion("");
      setSesionCaja(null);
      if (!empresaId || !user?.id) {
        setCargandoSesion(false);
        return;
      }

      let query = supabase
        .from("sesiones_caja")
        .select("id_sesion,id_sucursal,id_caja,fecha_operativa,estado,abierta_por,caja:cajas(nombre)")
        .eq("id_empresa", empresaId)
        .eq("estado", "ABIERTA")
        .order("abierta_en", { ascending: false })
        .limit(1);
      if (perfil?.id_sucursal) query = query.eq("id_sucursal", perfil.id_sucursal);
      if (rol === "cajero") query = query.eq("abierta_por", user.id);

      const { data, error } = await query.maybeSingle();
      if (!activo) return;
      if (error) {
        setErrorSesion(error.message);
      } else {
        setSesionCaja(data || null);
      }
      setCargandoSesion(false);
    };

    cargarSesion();
    return () => { activo = false; };
  }, [empresaId, perfil?.id_sucursal, rol, user?.id]);

  useEffect(() => {
    let activo = true;
    const cargarExistencias = async () => {
      setErrorStock("");
      setExistencias({});
      if (!empresaId || !sesionCaja?.id_sucursal) {
        setExistencias({});
        return;
      }
      const { data: bodega, error: errorBodega } = await supabase
        .from("bodegas")
        .select("id_bodega")
        .eq("id_empresa", empresaId)
        .eq("id_sucursal", sesionCaja.id_sucursal)
        .eq("activa", true)
        .order("id_bodega")
        .limit(1)
        .maybeSingle();
      if (!activo) return;
      if (errorBodega) {
        setErrorStock(errorBodega.message);
        toast.error(`No se pudo consultar la bodega: ${errorBodega.message}`);
        setExistencias({});
        return;
      }
      if (!bodega) {
        setErrorStock("La sucursal no tiene una bodega activa.");
        setExistencias({});
        return;
      }

      const { data: ubicacionPicking, error: errorUbicacion } = await supabase
        .from("ubicaciones_bodega")
        .select("id_ubicacion")
        .eq("id_empresa", empresaId)
        .eq("id_sucursal", sesionCaja.id_sucursal)
        .eq("id_bodega", bodega.id_bodega)
        .eq("tipo_area", "PICKING")
        .eq("activa", true)
        .order("id_ubicacion")
        .limit(1)
        .maybeSingle();
      if (!activo) return;
      if (errorUbicacion) {
        setErrorStock(errorUbicacion.message);
        toast.error(`No se pudo consultar la ubicación de ventas: ${errorUbicacion.message}`);
        setExistencias({});
        return;
      }
      if (!ubicacionPicking) {
        setErrorStock("La bodega no tiene una ubicación PICKING activa para vender.");
        setExistencias({});
        return;
      }

      const capas = [];
      const tamanoPagina = 500;
      for (let desde = 0; ; desde += tamanoPagina) {
        const { data, error } = await supabase
          .from("capas_inventario_fifo")
          .select("id_capa,id_producto,cantidad_disponible")
          .eq("id_empresa", empresaId)
          .eq("id_sucursal", sesionCaja.id_sucursal)
          .eq("id_ubicacion", ubicacionPicking.id_ubicacion)
          .gt("cantidad_disponible", 0)
          .order("id_capa")
          .range(desde, desde + tamanoPagina - 1);
        if (!activo) return;
        if (error) {
          setErrorStock(error.message);
          toast.error(`No se pudo cargar el stock vendible: ${error.message}`);
          setExistencias({});
          return;
        }
        capas.push(...(data || []));
        if (!data || data.length < tamanoPagina) break;
      }
      const stockPorProducto = {};
      for (const capa of capas) {
        stockPorProducto[capa.id_producto] = (stockPorProducto[capa.id_producto] || 0)
          + Number(capa.cantidad_disponible || 0);
      }
      setExistencias(stockPorProducto);
    };
    cargarExistencias();
    return () => { activo = false; };
  }, [empresaId, sesionCaja?.id_sucursal]);

  const buscarCliente = useCallback(async () => {
    const q = busqueda.trim();
    if (q.length < 2 || !empresaId) {
      setResultados([]);
      return;
    }

    setBuscando(true);
    try {
      const [nombreResult, identificacionResult, emailResult] = await Promise.all([
        supabase.from("clientes").select("id_cliente,nombre,identificacion,email,telefono")
          .eq("id_empresa", empresaId).eq("activo", true).ilike("nombre", `%${q}%`).limit(6),
        supabase.from("clientes").select("id_cliente,nombre,identificacion,email,telefono")
          .eq("id_empresa", empresaId).eq("activo", true).ilike("identificacion", `%${q}%`).limit(6),
        supabase.from("clientes").select("id_cliente,nombre,identificacion,email,telefono")
          .eq("id_empresa", empresaId).eq("activo", true).ilike("email", `%${q}%`).limit(6),
      ]);
      const failed = [nombreResult, identificacionResult, emailResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const unicos = new Map();
      for (const cliente of [...(nombreResult.data || []), ...(identificacionResult.data || []), ...(emailResult.data || [])]) {
        unicos.set(cliente.id_cliente, { ...cliente, correo: cliente.email });
      }
      setResultados([...unicos.values()].slice(0, 6));
    } catch (error) {
      toast.error(`No se pudieron buscar clientes: ${error.message}`);
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, [busqueda, empresaId]);

  const agregarAlCarrito = (producto, cantidad) => {
    const cantidadNueva = Number(cantidad);
    if (!Number.isFinite(cantidadNueva) || cantidadNueva <= 0 || cantidadNueva > 999999) {
      toast.error("La cantidad debe ser mayor que cero.");
      return false;
    }
    if (Math.round(cantidadNueva * 1000) !== cantidadNueva * 1000) {
      toast.error("La cantidad admite máximo tres decimales.");
      return false;
    }
    const stockDisponible = Number(existencias[producto.id_producto] || 0);
    const cantidadEnCarrito = productosSeleccionados
      .filter((item) => item.id_producto === producto.id_producto)
      .reduce((sum, item) => sum + Number(item.cantidad), 0);
    if (cantidadEnCarrito + cantidadNueva > stockDisponible) {
      toast.error(`Stock insuficiente para ${producto.nombre}. Disponible: ${stockDisponible}.`);
      return false;
    }

    const precio = Number(producto.precio_venta);
    if (!Number.isFinite(precio) || precio <= 0) {
      toast.error("El producto no tiene un precio de venta válido.");
      return false;
    }
    setProductosSeleccionados((actuales) => {
      const existente = actuales.find((item) => item.id_producto === producto.id_producto);
      if (existente) {
        return actuales.map((item) => item.id_producto === producto.id_producto
          ? { ...item, cantidad: Number(item.cantidad) + cantidadNueva }
          : item);
      }
      return [...actuales, {
        id_producto: producto.id_producto,
        nombre: producto.nombre,
        sku: producto.sku,
        precio,
        cantidad: cantidadNueva,
      }];
    });
    return true;
  };

  const handleEscanear = (codigo) => {
    const valor = String(codigo || "").trim();
    if (!valor) return;
    const producto = productos.find(
      (item) => String(item.codigo_barras || "") === valor || String(item.sku || "") === valor
    );
    if (!producto) {
      toast.error(`No se encontró un producto con el código ${valor}.`);
    } else if (agregarAlCarrito(producto, 1)) {
      toast.success(`${producto.nombre} agregado.`);
    }
    setCodigoBarras("");
    requestAnimationFrame(() => codigoInputRef.current?.focus());
  };

  const handleAddProduct = () => {
    const producto = productos.find((item) => String(item.id_producto) === String(selectedProductId));
    if (!producto) {
      toast.error("Selecciona un producto válido.");
      return;
    }
    if (agregarAlCarrito(producto, cantidadInput)) {
      setSelectedProductId("");
      setCantidadInput("1");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!sesionCaja) {
      toast.error("Abre una sesión de caja antes de registrar ventas.");
      return;
    }
    if (productosSeleccionados.length === 0) {
      toast.error("Agrega al menos un producto.");
      return;
    }
    if (metodoPago === "EFECTIVO" && Number(efectivoRecibido) < totalVenta) {
      toast.error("El efectivo recibido no cubre el total de la venta.");
      return;
    }

    const pago = {
      metodo_pago: metodoPago,
      monto: totalVenta,
      ...(metodoPago === "EFECTIVO" ? { efectivo_recibido: money(efectivoRecibido) } : {}),
    };
    const items = productosSeleccionados.map((producto) => ({
      id_producto: Number(producto.id_producto),
      cantidad: Number(producto.cantidad),
    }));
    const huellaSolicitud = JSON.stringify({
      id_sesion: sesionCaja.id_sesion,
      id_cliente: clienteSel?.id_cliente || null,
      pagos: [pago],
      items,
    });
    if (claveVentaRef.current?.huella !== huellaSolicitud) {
      claveVentaRef.current = {
        huella: huellaSolicitud,
        clave: globalThis.crypto.randomUUID(),
      };
    }
    setGuardando(true);
    const idVenta = await crearVenta({
      id_sesion: sesionCaja.id_sesion,
      id_cliente: clienteSel?.id_cliente || null,
      idempotencia_key: claveVentaRef.current.clave,
      pagos: [pago],
      detalle_items: items,
    });
    setGuardando(false);

    if (typeof idVenta !== "number" || !Number.isFinite(idVenta)) {
      toast.error(`No se pudo registrar la venta: ${idVenta?.error || "Error desconocido"}`);
      return;
    }

    const numeroVenta = `V-${idVenta}`;
    claveVentaRef.current = null;
    toast.success(`Venta ${numeroVenta} registrada correctamente.`);
    try {
      generarFacturaPDF({
        numeroFactura: numeroVenta,
        fecha: sesionCaja.fecha_operativa,
        cliente: clienteSel?.nombre || "Cliente de mostrador",
        identificacion: clienteSel?.identificacion || "",
        tipoPago: metodoPago,
        sucursal: perfil?.sucursal_nombre || "",
        canal: "sucursal",
        pago: "sucursal",
        items: productosSeleccionados.map((item) => ({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio,
        })),
        plazoDias: 0,
        vencimiento: "",
      }, "open");
    } catch (error) {
      console.error("No se pudo generar la factura:", error);
      toast.error("La venta se registró, pero no se pudo abrir la factura.");
    }
    onClose();
  };

  return (
    <div className="bg-card text-title p-7 rounded-2xl w-full max-w-4xl shadow-2xl animate-fade-in border border-secondary max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-bold">Nueva Venta</h3>
      </div>

      {cargandoSesion ? (
        <p className="text-subtitle">Verificando sesión de caja...</p>
      ) : errorSesion ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          <p>No se pudo verificar la caja: {errorSesion}</p>
        </div>
      ) : !sesionCaja ? (
        <div className="rounded-lg border border-secondary bg-input p-5 space-y-3">
          <p>No hay una sesión de caja abierta disponible para esta sucursal.</p>
          <a href="/dashboard/aperturaCierre" className="btn-primary inline-flex">Abrir caja</a>
        </div>
      ) : errorStock ? (
        <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          No se puede vender: {errorStock}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-5 rounded-lg border border-secondary bg-input p-3 text-sm">
            Caja: <strong>{sesionCaja.caja?.nombre || `#${sesionCaja.id_caja}`}</strong>
            {" · "}Sucursal: <strong>{perfil?.sucursal_nombre || sesionCaja.id_sucursal}</strong>
            {" · "}Fecha operativa: <strong>{sesionCaja.fecha_operativa}</strong>
          </div>

          <div className="flex flex-col gap-2 mb-5">
            <label className="text-sm font-medium text-title">Cliente (opcional)</label>
            {clienteSel ? (
              <div className="flex items-center justify-between gap-2 bg-input border border-secondary rounded-lg p-3">
                <span className="flex items-center gap-2 text-sm">
                  <UserCheck size={16} className="text-green-500" />
                  {clienteSel.nombre} {clienteSel.identificacion ? `· ${clienteSel.identificacion}` : ""}
                </span>
                <button type="button" onClick={() => setClienteSel(null)} className="text-subtitle hover:text-title" aria-label="Quitar cliente">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtitle" />
                    <input
                      type="search"
                      value={busqueda}
                      onChange={(event) => setBusqueda(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); buscarCliente(); } }}
                      placeholder="Buscar por nombre, identificación o correo"
                      className="bg-input border border-secondary rounded-lg p-3 pl-9 w-full text-sm"
                    />
                  </div>
                  <button type="button" onClick={buscarCliente} disabled={buscando} className="btn-secondary">
                    {buscando ? "Buscando..." : "Buscar"}
                  </button>
                </div>
                {resultados.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-card border border-secondary rounded-lg shadow-xl overflow-hidden">
                    {resultados.map((cliente) => (
                      <button key={cliente.id_cliente} type="button"
                        onClick={() => { setClienteSel(cliente); setResultados([]); setBusqueda(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-sm">
                        <span className="font-medium">{cliente.nombre}</span>
                        <span className="text-subtitle"> · {cliente.identificacion || "sin identificación"} · {cliente.correo || "sin correo"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 mb-5">
            <label htmlFor="codigoBarras" className="text-sm font-medium flex items-center gap-2">
              <ScanLine size={16} /> Escanear código de barras
            </label>
            <input
              ref={codigoInputRef}
              id="codigoBarras"
              type="text"
              value={codigoBarras}
              onChange={(event) => setCodigoBarras(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleEscanear(codigoBarras); } }}
              placeholder="Escanea el código y presiona Enter"
              autoComplete="off"
              autoFocus
              className="bg-input border border-secondary rounded-lg p-3"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-3 flex flex-col gap-2">
              <label htmlFor="producto" className="text-sm font-medium">Producto</label>
              <select id="producto" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}
                className="bg-input border border-secondary rounded-lg p-3" disabled={cargandoProductos}>
                <option value="">{cargandoProductos ? "Cargando productos..." : "Selecciona un producto"}</option>
                {productos.filter((producto) => Number(existencias[producto.id_producto] || 0) > 0).map((producto) => (
                  <option key={producto.id_producto} value={producto.id_producto}>
                    {producto.nombre} · {producto.sku} · Stock: {existencias[producto.id_producto]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex flex-col gap-2">
              <label htmlFor="cantidad" className="text-sm font-medium">Cantidad</label>
              <input id="cantidad" type="number" min="0.001" step="0.001" value={cantidadInput}
                onChange={(event) => setCantidadInput(event.target.value)}
                className="bg-input border border-secondary rounded-lg p-3" />
            </div>
            <button type="button" onClick={handleAddProduct} className="bg-button text-button h-12 cursor-pointer w-full flex items-center justify-center rounded-md hover:opacity-90 transition" aria-label="Agregar producto">
              <Plus size={18} />
            </button>
          </div>

          {productosSeleccionados.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full mt-6 border-collapse">
                <thead className="border-b border-secondary">
                  <tr>
                    <th className="text-left text-sm font-medium py-2">Producto</th>
                    <th className="text-right text-sm font-medium">Precio</th>
                    <th className="text-right text-sm font-medium">Cantidad</th>
                    <th className="text-right text-sm font-medium">Subtotal</th>
                    <th className="text-center text-sm font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productosSeleccionados.map((item) => (
                    <tr key={item.id_producto} className="border-b border-secondary/50">
                      <td className="p-2">{item.nombre}</td>
                      <td className="p-2 text-right">C$ {Number(item.precio).toFixed(2)}</td>
                      <td className="p-2 text-right">{item.cantidad}</td>
                      <td className="p-2 text-right">C$ {(item.precio * item.cantidad).toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => setProductosSeleccionados((items) => items.filter((producto) => producto.id_producto !== item.id_producto))}
                          className="text-red-500 hover:text-red-700" aria-label={`Quitar ${item.nombre}`}>
                          <Trash size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="tipo-pago" className="text-sm font-medium">Método de pago</label>
              <select id="tipo-pago" value={metodoPago} onChange={(event) => setMetodoPago(event.target.value)}
                className="bg-input border border-secondary rounded-lg p-3">
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>
            {metodoPago === "EFECTIVO" && (
              <div className="flex flex-col gap-2">
                <label htmlFor="efectivoRecibido" className="text-sm font-medium">Efectivo recibido</label>
                <input id="efectivoRecibido" type="number" min={totalVenta} step="0.01" value={efectivoRecibido}
                  onChange={(event) => setEfectivoRecibido(event.target.value)}
                  className="bg-input border border-secondary rounded-lg p-3" />
              </div>
            )}
          </div>

          <div className="flex flex-col items-end mt-5 gap-1">
            <h3 className="text-title font-bold text-2xl">Total: C$ {totalVenta.toFixed(2)}</h3>
            {metodoPago === "EFECTIVO" && Number(efectivoRecibido) >= totalVenta && (
              <p className="text-subtitle">Cambio: C$ {cambio.toFixed(2)}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={guardando || productosSeleccionados.length === 0}
              className="btn-primary disabled:opacity-50">
              <Save size={18} /> {guardando ? "Registrando..." : "Registrar venta"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
