import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Plus, Search, Save, X } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import { registrarAuditoria } from "../utils/auditoria";
import StatsCards from "../components/statscards";
import { format } from "date-fns/format";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { useEmpresa } from "../contexts/empresacontext";

const fmt = (v) =>
  new Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO", minimumFractionDigits: 2 })
    .format(v || 0)
    .replace("C$", "C$ ");

export default function Devoluciones() {
  const { perfil } = useAuth();
  const { empresaId } = useEmpresa();
  const [devoluciones, setDevoluciones] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [idSesion, setIdSesion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estado del modal de nueva devolución
  const [ventaId, setVentaId] = useState("");
  const [venta, setVenta] = useState(null);
  const [items, setItems] = useState([]); // { id_producto, nombre, cantidad_max, precio_unitario, cantidad_dev, seleccionado }
  const [motivo, setMotivo] = useState("");
  const [metodoReembolso, setMetodoReembolso] = useState("EFECTIVO");
  const [claveIdempotencia, setClaveIdempotencia] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresaId) {
      setDevoluciones([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data: devolucionesData, error } = await supabase
        .from("devoluciones_venta")
        .select("*")
        .eq("id_empresa", empresaId)
        .order("procesada_en", { ascending: false });
      if (error) throw error;

      const ventasIds = [...new Set((devolucionesData || []).map((devolucion) => devolucion.id_venta))];
      const devolucionesIds = (devolucionesData || []).map((devolucion) => devolucion.id_devolucion);
      const [ventasResponse, detallesResponse] = await Promise.all([
        ventasIds.length
          ? supabase.from("ventas").select("id_venta, numero, id_cliente").eq("id_empresa", empresaId).in("id_venta", ventasIds)
          : Promise.resolve({ data: [], error: null }),
        devolucionesIds.length
          ? supabase.from("detalles_devolucion_venta").select("id_devolucion, cantidad").eq("id_empresa", empresaId).in("id_devolucion", devolucionesIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (ventasResponse.error) throw ventasResponse.error;
      if (detallesResponse.error) throw detallesResponse.error;

      const clientesIds = [...new Set((ventasResponse.data || []).map((venta) => venta.id_cliente).filter(Boolean))];
      const { data: clientes, error: clientesError } = clientesIds.length
        ? await supabase.from("clientes").select("id_cliente, nombre").eq("id_empresa", empresaId).in("id_cliente", clientesIds)
        : { data: [], error: null };
      if (clientesError) throw clientesError;

      const ventasPorId = new Map((ventasResponse.data || []).map((venta) => [venta.id_venta, venta]));
      const clientesPorId = new Map((clientes || []).map((cliente) => [cliente.id_cliente, cliente]));
      const detallesPorId = new Map();
      (detallesResponse.data || []).forEach((detalle) => {
        const actuales = detallesPorId.get(detalle.id_devolucion) || [];
        actuales.push(detalle);
        detallesPorId.set(detalle.id_devolucion, actuales);
      });
      setDevoluciones((devolucionesData || []).map((devolucion) => {
        const venta = ventasPorId.get(devolucion.id_venta);
        return {
          ...devolucion,
          venta: venta ? {
            ...venta,
            cliente: clientesPorId.get(venta.id_cliente) || null,
          } : null,
          detalle: detallesPorId.get(devolucion.id_devolucion) || [],
        };
      }));
    } catch (loadError) {
      console.error("Error cargando devoluciones:", loadError.message);
      toast.error(`Error cargando devoluciones: ${loadError.message}`);
      setDevoluciones([]);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirModal = () => {
    setVentaId("");
    setVenta(null);
    setItems([]);
    setMotivo("");
    setMetodoReembolso("EFECTIVO");
    setClaveIdempotencia(crypto.randomUUID());
    setSesiones([]);
    setIdSesion("");
    setIsModalOpen(true);
  };

  const buscarVenta = async () => {
    if (!ventaId.trim()) return toast.error("Ingrese el ID o número de factura de la venta.");
    setBuscando(true);
    setVenta(null);
    setItems([]);
    let query = supabase
      .from("ventas")
      .select("id_venta, id_empresa, id_sucursal, id_sesion, numero, registrada_en, id_cliente, cliente:clientes(nombre), detalle:detalle_ventas(id_detalle, id_producto, cantidad, precio_unitario, producto:productos(nombre))")
      .eq("id_empresa", empresaId);

    if (/^\d+$/.test(ventaId.trim())) {
      query = query.eq("id_venta", Number(ventaId.trim()));
    } else {
      query = query.eq("numero", ventaId.trim());
    }

    const { data, error } = await query.maybeSingle();
    setBuscando(false);
    if (error) {
      toast.error(`No se pudo buscar la venta: ${error.message}`);
      return;
    }
    if (!data) {
      toast.error("No se encontró la venta.");
      return;
    }

    const { data: sesionesAbiertas, error: sesionesError } = await supabase
      .from("sesiones_caja")
      .select("id_sesion")
      .eq("id_sucursal", data.id_sucursal)
      .eq("estado", "ABIERTA")
      .order("id_sesion", { ascending: false });
    if (sesionesError) {
      toast.error(`No se pudieron cargar las sesiones de caja: ${sesionesError.message}`);
      return;
    }
    setSesiones(sesionesAbiertas || []);
    const sesionVentaActiva = (sesionesAbiertas || []).find((sesion) => sesion.id_sesion === data.id_sesion);
    setIdSesion(String(sesionVentaActiva?.id_sesion || sesionesAbiertas?.[0]?.id_sesion || ""));

    setVenta(data);
    setItems(
      (data.detalle || []).map((d) => ({
        id_detalle_venta: d.id_detalle,
        id_producto: d.id_producto,
        nombre: d.producto?.nombre || `Producto #${d.id_producto}`,
        cantidad_max: d.cantidad,
        precio_unitario: Number(d.precio_unitario),
        cantidad_dev: 0,
        seleccionado: false,
      }))
    );
  };

  const toggleItem = (idx) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, seleccionado: !it.seleccionado, cantidad_dev: !it.seleccionado ? it.cantidad_max : 0 } : it)));
  };

  const cambiarCantidad = (idx, val) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        let c = Number(val);
        if (isNaN(c) || c < 0) c = 0;
        if (c > it.cantidad_max) c = it.cantidad_max;
        return { ...it, cantidad_dev: c };
      })
    );
  };

  const totalDevolucion = items.filter((i) => i.seleccionado).reduce((s, i) => s + i.cantidad_dev * i.precio_unitario, 0);

  const registrar = async () => {
    const seleccionados = items.filter((i) => i.seleccionado && i.cantidad_dev > 0);
    if (!venta) return toast.error("Busque una venta primero.");
    if (seleccionados.length === 0) return toast.error("Seleccione al menos un producto con cantidad a devolver.");
    if (!motivo.trim()) return toast.error("Indique el motivo de la devolución.");

    setGuardando(true);
    try {
      // Registrar devolución vía SP contable (cabecera + detalle + inventario + asiento)
        const { error: rpcError } = await supabase.rpc("procesar_devolucion_venta", {
          p_id_sesion: Number(idSesion),
          p_id_venta: venta.id_venta,
          p_lineas: seleccionados.map((item) => ({
            id_detalle_venta: item.id_detalle_venta,
            cantidad: Number(item.cantidad_dev),
          })),
          p_metodo_reembolso: metodoReembolso,
          p_motivo: motivo,
          p_clave_idempotencia: claveIdempotencia,
        });
      if (rpcError) throw rpcError;

      await registrarAuditoria(supabase, perfil, "CREAR", "Devoluciones", `Registró devolución de venta #${venta.id_venta} por ${fmt(totalDevolucion)}`);
      toast.success("Devolución registrada y stock actualizado.");
      setIsModalOpen(false);
      cargar();
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar la devolución: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const totalDevoluciones = devoluciones.reduce((s, d) => s + Number(d.total || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <StatsCards title={"Total Devoluciones"} icon={<RotateCcw className="text-title" />} value={devoluciones.length} />
        <StatsCards title={"Monto Devuelto"} icon={<RotateCcw className="text-red-400" />} value={fmt(totalDevoluciones)} />
        <StatsCards title={"Devoluciones Hoy"} icon={<RotateCcw className="text-blue-400" />} value={devoluciones.filter((d) => format(new Date(d.procesada_en), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")).length} />
      </div>

      <div className="mt-8 border border-secondary rounded-2xl p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title text-xl font-bold">Devoluciones</h3>
            <p className="text-subtitle text-s">Registra devoluciones de productos y ajusta el inventario</p>
          </div>
          <button className="bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:scale-110 transition" onClick={abrirModal}>
            <Plus /> Nueva Devolución
          </button>
        </div>

        <div className="mt-8 overflow-x-auto">
          {isLoading ? (
            <p className="text-title p-4 text-center">Cargando devoluciones...</p>
          ) : devoluciones.length === 0 ? (
            <p className="text-title p-4 text-center">No hay devoluciones registradas.</p>
          ) : (
            <table className="text-title w-full border-collapse">
              <thead>
                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                  <th className="py-3 px-2 text-left">Fecha</th>
                  <th className="py-3 px-2 text-center">N° Venta</th>
                  <th className="py-3 px-2 text-left">Cliente</th>
                  <th className="py-3 px-2 text-center">Productos</th>
                  <th className="py-3 px-2 text-left">Motivo</th>
                  <th className="py-3 px-2 text-center">Total</th>
                  <th className="py-3 px-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {devoluciones.map((d) => (
                  <tr key={d.id_devolucion} className="border-t border-secondary text-sm hover:bg-secondary transition-colors">
                    <td className="py-3 px-2">{format(new Date(d.procesada_en), "dd/MM/yyyy HH:mm")}</td>
                    <td className="py-3 px-2 text-center font-mono">{d.venta?.numero || d.numero || `#${d.id_venta}`}</td>
                    <td className="py-3 px-2">{d.venta?.cliente?.nombre || "—"}</td>
                    <td className="py-3 px-2 text-center">{(d.detalle || []).reduce((s, x) => s + x.cantidad, 0)}</td>
                    <td className="py-3 px-2 text-subtitle max-w-xs truncate">{d.motivo}</td>
                    <td className="py-3 px-2 text-center font-semibold">{fmt(d.total)}</td>
                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-600/20 text-green-400">Registrada</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm overflow-y-auto py-8">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-2xl shadow-lg border border-secondary my-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold">Nueva Devolución</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-subtitle hover:text-title"><X /></button>
            </div>

            <div className="flex gap-2 items-end mb-4">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium">ID de Venta o N° de Factura</label>
                <input type="text" value={ventaId} onChange={(e) => setVentaId(e.target.value)} placeholder="Ej: 15 o FAC-0001" className="bg-input border border-secondary rounded-lg p-3" />
              </div>
              <button onClick={buscarVenta} disabled={buscando} className="bg-button text-button p-3 rounded-lg flex items-center gap-2 hover:scale-105 transition disabled:opacity-50">
                <Search size={18} /> {buscando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {venta && (
              <div className="mb-4 bg-secondary/40 rounded-xl p-4 border border-secondary">
                <p className="text-sm text-subtitle">Venta #{venta.id_venta} · {venta.numero || "sin número"}</p>
                <p className="text-sm">Cliente: <span className="font-semibold">{venta.cliente?.nombre || "—"}</span> · Fecha: {format(new Date(venta.registrada_en), "dd/MM/yyyy")}</p>
              </div>
            )}

            {items.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="text-title w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-secondary/50 text-subtitle">
                      <th className="py-2 px-2 text-center">Dev.</th>
                      <th className="py-2 px-2 text-left">Producto</th>
                      <th className="py-2 px-2 text-center">Vendido</th>
                      <th className="py-2 px-2 text-center">Precio</th>
                      <th className="py-2 px-2 text-center">Cant. a devolver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t border-secondary">
                        <td className="py-2 px-2 text-center">
                          <input type="checkbox" checked={it.seleccionado} onChange={() => toggleItem(idx)} className="w-4 h-4 accent-blue-600" />
                        </td>
                        <td className="py-2 px-2">{it.nombre}</td>
                        <td className="py-2 px-2 text-center">{it.cantidad_max}</td>
                        <td className="py-2 px-2 text-center">{fmt(it.precio_unitario)}</td>
                        <td className="py-2 px-2 text-center">
                          <input type="number" min="0" max={it.cantidad_max} value={it.cantidad_dev} disabled={!it.seleccionado} onChange={(e) => cambiarCantidad(idx, e.target.value)} className="bg-input border border-secondary rounded-lg p-2 w-20 text-center disabled:opacity-40" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {venta && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Método de reembolso *</label>
                    <select value={metodoReembolso} onChange={(e) => setMetodoReembolso(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Sesión de caja abierta *</label>
                    <select value={idSesion} onChange={(e) => setIdSesion(e.target.value)} className="bg-input border border-secondary rounded-lg p-3" required>
                      <option value="">Seleccione una sesión</option>
                      {sesiones.map((sesion) => (
                        <option key={sesion.id_sesion} value={sesion.id_sesion}>Sesión {sesion.id_sesion}</option>
                      ))}
                    </select>
                    {sesiones.length === 0 && <span className="text-xs text-amber-400">No hay una sesión abierta en la sucursal de la venta.</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 mb-4">
                  <label className="text-sm font-medium">Motivo *</label>
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Producto defectuoso" rows={2} className="bg-input border border-secondary rounded-lg p-3" />
                </div>
                <div className="flex justify-between items-center mb-4 text-lg">
                  <span className="font-semibold">Total a devolver:</span>
                  <span className="font-bold text-red-400">{fmt(totalDevolucion)}</span>
                </div>
              </>
            )}

            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setIsModalOpen(false)} className="cursor-pointer bg-secondary border border-secondary font-semibold py-2 px-6 rounded-lg hover:scale-105 transition">Cancelar</button>
              <button onClick={registrar} disabled={guardando || !venta || !idSesion || sesiones.length === 0} className="cursor-pointer bg-button text-button font-semibold py-2 px-4 rounded-lg hover:scale-105 transition flex gap-2 items-center disabled:opacity-50">
                <Save size={18} /> {guardando ? "Guardando..." : "Registrar Devolución"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
