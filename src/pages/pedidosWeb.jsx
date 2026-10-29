import { useState, useMemo } from "react";
import { ShoppingBag, Clock, CheckCircle2, PackageCheck, DollarSign, Phone, Mail, Truck, Store } from "lucide-react";
import { format } from "date-fns/format";
import Swal from "sweetalert2";
import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import { usePedidosWeb } from "../hooks/usePedidosWeb";
import { useAuth } from "../contexts/authcontext";

const ESTADO_BADGE = {
  PENDIENTE: "bg-yellow-500/20 text-yellow-500",
  LISTO: "bg-green-500/20 text-green-400",
  ENTREGADO: "bg-emerald-600/20 text-emerald-400",
  RECHAZADO: "bg-red-500/20 text-red-400",
};

const PAGO_BADGE = {
  PENDIENTE: "bg-yellow-500/20 text-yellow-500",
  SIMULADO: "bg-blue-500/20 text-blue-400",
  CONFIRMADO: "bg-green-500/20 text-green-400",
};

export default function PedidosWeb() {
  const { pedidos, isLoading, error, aceptarPedido, cambiarEstado } = usePedidosWeb();
  const { rol } = useAuth();
  const esSuperadmin = rol === "superadmin";
  const esDespacho = rol === "despacho";
  const [activeTab, setActiveTab] = useState("activos");
  const [busqueda, setBusqueda] = useState("");

  // El rol despacho sólo gestiona pedidos activos (Pendiente/En preparación/Listo).
  const tabs = esDespacho
    ? [{ key: "activos", label: "Activos", icon: <Clock size={16} /> }]
    : [
        { key: "activos", label: "Activos", icon: <Clock size={16} /> },
        { key: "historial", label: "Historial", icon: <PackageCheck size={16} /> },
      ];

  const { pendientes, listos, totalVentas } = useMemo(() => {
    const pend = pedidos.filter((p) => p.estado === "PENDIENTE").length;
    const list = pedidos.filter((p) => p.estado === "LISTO").length;
    const total = pedidos
      .filter((p) => ["LISTO", "ENTREGADO"].includes(p.estado))
      .reduce((s, p) => s + Number(p.total || 0), 0);
    return { pendientes: pend, listos: list, totalVentas: total };
  }, [pedidos]);

  const visibles = useMemo(() => {
    let base;
    if (activeTab === "activos") {
      base = pedidos.filter((p) => ["PENDIENTE", "LISTO"].includes(p.estado));
    } else {
      base = pedidos.filter((p) => ["ENTREGADO", "RECHAZADO"].includes(p.estado));
    }
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) =>
      (p.numero_orden || "").toLowerCase().includes(q) ||
      (p.nombre_cliente || "").toLowerCase().includes(q) ||
      (p.telefono || "").toLowerCase().includes(q)
    );
  }, [pedidos, activeTab, busqueda]);

  const handleAceptar = async (pedido) => {
    const confirm = await Swal.fire({
      title: "Confirmar cobro y aceptar pedido",
      html: `Se registrará la venta de <b>${pedido.nombre_cliente}</b> por <b>C$${Number(pedido.total).toFixed(2)}</b>, se descontará el inventario y el pedido pasará a <b>Listo para entregar</b>. El pago de tarjeta en la tienda es solo una simulación; confirma el método realmente recibido.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#16a34a",
      cancelButtonColor: "#6b7280",
    });
    if (!confirm.isConfirmed) return;

    const metodoPago = await Swal.fire({
      title: "Método de pago recibido",
      input: "select",
      inputOptions: {
        EFECTIVO: "Efectivo",
        TARJETA: "Tarjeta (cobro real confirmado)",
        TRANSFERENCIA: "Transferencia (confirmada)",
      },
      inputValue: "EFECTIVO",
      inputPlaceholder: "Selecciona un método",
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => value ? undefined : "Selecciona el método recibido.",
    });
    if (!metodoPago.isConfirmed) return;

    let efectivoRecibido = null;
    if (metodoPago.value === "EFECTIVO") {
      const efectivo = await Swal.fire({
        title: "Efectivo recibido",
        input: "number",
        inputValue: Number(pedido.total).toFixed(2),
        inputAttributes: { min: Number(pedido.total), step: "0.01" },
        showCancelButton: true,
        confirmButtonText: "Confirmar cobro",
        cancelButtonText: "Cancelar",
        inputValidator: (value) => Number(value) >= Number(pedido.total)
          ? undefined
          : "El efectivo recibido debe cubrir el total del pedido.",
      });
      if (!efectivo.isConfirmed) return;
      efectivoRecibido = Number(efectivo.value);
    }

    const res = await aceptarPedido(pedido, metodoPago.value, efectivoRecibido);
    if (res.success) {
      Swal.fire({ title: "¡Pedido aceptado!", text: "Venta registrada e inventario actualizado.", icon: "success", timer: 1600, showConfirmButton: false });
    } else {
      Swal.fire({ title: "Error", text: res.error || error || "No se pudo registrar la venta.", icon: "error" });
    }
  };

  const handleRechazar = async (pedido) => {
    const confirm = await Swal.fire({
      title: "¿Rechazar pedido?",
      text: "El pedido se marcará como rechazado. Esta acción no descuenta inventario.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, rechazar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
    });
    if (!confirm.isConfirmed) return;
    const actualizado = await cambiarEstado(pedido.id_pedido, "RECHAZADO");
    if (!actualizado) {
      Swal.fire({ title: "Error", text: error || "No se pudo rechazar el pedido.", icon: "error" });
    }
  };

  const handleEntregar = async (pedido) => {
    const actualizado = await cambiarEstado(pedido.id_pedido, "ENTREGADO");
    if (!actualizado) {
      Swal.fire({ title: "Error", text: error || "No se pudo actualizar el estado.", icon: "error" });
      return;
    }
    Swal.fire({ title: "Entregado", icon: "success", timer: 1200, showConfirmButton: false });
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatsCards title="Pedidos Web" icon={<ShoppingBag className="text-title" />} value={pedidos.length} />
        <StatsCards title="Pendientes" icon={<Clock color="#eab308" />} value={pendientes} />
        <StatsCards title="Listos p/ Entregar" icon={<CheckCircle2 color="#22c55e" />} value={listos} />
        <StatsCards title="Ventas Web" icon={<DollarSign className="text-title" />} value={`C$${totalVentas.toFixed(2)}`} />
      </div>

      <div className="mt-6">
        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
        <div className="mt-8 border border-secondary rounded-2xl p-5">
          <div className="flex flex-col gap-1 mb-6">
            <h3 className="text-title text-xl font-bold">Bandeja de Pedidos en Línea</h3>
            <p className="text-subtitle text-s">Pedidos realizados por los clientes desde la tienda web.</p>
          </div>

          {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

          <div className="mb-6">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° de orden (P-0001), nombre o teléfono..."
              className="w-full md:max-w-md bg-secondary/40 border border-secondary rounded-lg px-4 py-2 text-title text-sm outline-none focus:border-title/60"
            />
          </div>

          {isLoading ? (
            <p className="text-center text-subtitle p-6">Cargando pedidos...</p>
          ) : visibles.length === 0 ? (
            <p className="text-center text-subtitle p-6">No hay pedidos en esta vista.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {visibles.map((p) => (
                <div key={p.id_pedido} className="border border-secondary rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-title font-bold">Orden {p.numero_orden || `P-${String(p.id_pedido).padStart(4, "0")}`}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_BADGE[p.estado] || "bg-secondary text-subtitle"}`}>{p.estado}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAGO_BADGE[p.estado_pago] || "bg-secondary text-subtitle"}`}>Pago: {p.estado_pago || "Pendiente"}</span>
                        {esSuperadmin && p.sucursal?.nombre && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center gap-1"><Store size={12} /> {p.sucursal.nombre}</span>
                        )}
                      </div>
                      <span className="text-subtitle text-sm">{p.creado_en ? format(new Date(p.creado_en), "dd/MM/yyyy HH:mm") : ""}</span>
                    </div>
                    <span className="text-title text-lg font-bold">C${Number(p.total || 0).toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-subtitle">
                    <span className="text-title font-medium">{p.nombre_cliente}</span>
                    <span className="flex items-center gap-1"><Phone size={14} /> {p.telefono || "—"}</span>
                    {p.email && <span className="flex items-center gap-1"><Mail size={14} /> {p.email}</span>}
                    <span className="flex items-center gap-1">
                      {p.tipo_entrega === "DOMICILIO" ? <Truck size={14} /> : <Store size={14} />}
                      {p.tipo_entrega === "DOMICILIO" ? "Domicilio" : "Retiro en tienda"} · {p.metodo_pago_preferido || "—"}
                    </span>
                    {p.direccion_entrega && <span className="sm:col-span-2">{p.direccion_entrega}</span>}
                  </div>

                  {p.notas && <p className="text-subtitle text-sm italic">Nota: {p.notas}</p>}

                  <div className="border-t border-secondary/50 pt-2">
                    <table className="w-full text-sm text-subtitle">
                      <tbody>
                        {(p.detalles_pedido_web || []).map((it) => (
                          <tr key={it.id_detalle_pedido}>
                            <td className="py-1">{it.nombre_snapshot}</td>
                            <td className="py-1 text-center">x{it.cantidad}</td>
                            <td className="py-1 text-right">C${(Number(it.precio_unitario) * Number(it.cantidad)).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end items-center">
                    {p.estado === "PENDIENTE" && (
                      <>
                        <button onClick={() => handleRechazar(p)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer">Rechazar</button>
                        <button onClick={() => handleAceptar(p)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-600/20 text-green-400 hover:bg-green-600/30 cursor-pointer">Aceptar y facturar</button>
                      </>
                    )}
                    {p.estado === "LISTO" && (
                      <button onClick={() => handleEntregar(p)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 cursor-pointer">Marcar entregado</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
