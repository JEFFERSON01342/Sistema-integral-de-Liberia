import { useState, useEffect, useCallback } from "react";
import {
  Building2, DollarSign, CalendarDays, Package, DoorOpen,
  Users, ShoppingBag, AlertTriangle, X, ArrowRight,
} from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import { useEmpresa } from "../contexts/empresacontext";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";

const fmt = (v) => `C$ ${Number(v || 0).toFixed(2)}`;
const PENDIENTES_WEB = ["PENDIENTE", "LISTO"];

export default function VistaSucursales() {
  const { rol } = useAuth();
  const {
    empresaId,
    sucursalAlcance,
    setSucursalAlcance,
  } = useEmpresa();
  const [sucursales, setSucursales] = useState([]);
  const [kpis, setKpis] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [detalle, setDetalle] = useState(null); // sucursal seleccionada

  const hoy = new Date().toISOString().slice(0, 10);
  const inicioMesStr = `${hoy.slice(0, 8)}01`;

  const cargar = useCallback(async () => {
    if (!empresaId) {
      setSucursales([]);
      setKpis({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const results = await Promise.all([
        supabase
          .from("sucursales")
          .select("id_sucursal, id_empresa, nombre, direccion, telefono")
          .eq("id_empresa", empresaId)
          .eq("activa", true)
          .order("id_sucursal"),
        supabase
          .from("ventas")
          .select("total, fecha_operativa, id_sucursal")
          .eq("id_empresa", empresaId)
          .gte("fecha_operativa", inicioMesStr),
        supabase
          .from("sesiones_caja")
          .select("id_sucursal")
          .eq("id_empresa", empresaId)
          .eq("estado", "ABIERTA"),
        supabase
          .from("perfiles")
          .select("id_sucursal, activo")
          .eq("id_empresa", empresaId)
          .eq("activo", true),
        supabase
          .from("pedidos_web")
          .select("id_sucursal, estado")
          .eq("id_empresa", empresaId),
        supabase
          .from("existencias_producto_sucursal")
          .select("id_sucursal, id_producto, cantidad_disponible, stock_minimo, valor_inventario, estado_stock")
          .eq("id_empresa", empresaId),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      const [sucursalesResult, ventasResult, sesionesResult, perfilesResult, pedidosResult, stockResult] = results;
      const sucs = sucursalesResult.data || [];
      const porSuc = {};
      sucs.forEach((sucursal) => {
        porSuc[sucursal.id_sucursal] = {
          ventasHoy: 0,
          ventasMes: 0,
          valorInv: 0,
          cajasAbiertas: 0,
          personal: 0,
          pedidosPend: 0,
          stockBajo: 0,
        };
      });
      (ventasResult.data || []).forEach((venta) => {
        const kpi = porSuc[venta.id_sucursal];
        if (!kpi) return;
        const monto = Number(venta.total || 0);
        kpi.ventasMes += monto;
        if (venta.fecha_operativa === hoy) kpi.ventasHoy += monto;
      });
      (sesionesResult.data || []).forEach((sesion) => {
        if (porSuc[sesion.id_sucursal]) porSuc[sesion.id_sucursal].cajasAbiertas += 1;
      });
      (perfilesResult.data || []).forEach((perfil) => {
        if (porSuc[perfil.id_sucursal]) porSuc[perfil.id_sucursal].personal += 1;
      });
      (pedidosResult.data || []).forEach((pedido) => {
        if (porSuc[pedido.id_sucursal] && PENDIENTES_WEB.includes(pedido.estado)) {
          porSuc[pedido.id_sucursal].pedidosPend += 1;
        }
      });
      (stockResult.data || []).forEach((existencia) => {
        const kpi = porSuc[existencia.id_sucursal];
        if (!kpi) return;
        kpi.valorInv += Number(existencia.valor_inventario || 0);
        if (["BAJO", "SIN_EXISTENCIA"].includes(existencia.estado_stock)) kpi.stockBajo += 1;
      });

      setSucursales(sucs);
      setKpis(porSuc);
    } catch (error) {
      console.error("Error cargando el resumen global de sucursales:", error);
      toast.error(`No se pudo cargar el resumen de sucursales: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, hoy, inicioMesStr]);

  useEffect(() => { cargar(); }, [cargar]);

  if (rol !== "superadmin") {
    return (
      <div className="erp-card p-8 text-center mt-6">
        <AlertTriangle className="mx-auto text-amber-400 mb-3" size={40} />
        <h3 className="text-title text-lg font-bold">Acceso restringido</h3>
        <p className="text-subtitle">Esta vista global solo está disponible para el super administrador.</p>
      </div>
    );
  }

  // Totales
  const tot = Object.values(kpis).reduce((a, k) => ({
    ventasHoy: a.ventasHoy + k.ventasHoy,
    ventasMes: a.ventasMes + k.ventasMes,
    valorInv: a.valorInv + k.valorInv,
    cajasAbiertas: a.cajasAbiertas + k.cajasAbiertas,
    personal: a.personal + k.personal,
    pedidosPend: a.pedidosPend + k.pedidosPend,
    stockBajo: a.stockBajo + k.stockBajo,
  }), { ventasHoy: 0, ventasMes: 0, valorInv: 0, cajasAbiertas: 0, personal: 0, pedidosPend: 0, stockBajo: 0 });

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mt-2 mb-5">
        <Building2 className="text-title" size={26} />
        <div>
          <h2 className="text-title text-2xl font-bold">Vista de sucursales</h2>
          <p className="text-subtitle text-sm">Resumen consolidado de todas las sucursales de Librería Lisjuashde.</p>
        </div>
      </div>

      <div className="erp-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-title font-semibold">Alcance seleccionado para la sesión</p>
          <p className="text-subtitle text-sm">
            {sucursalAlcance
              ? `Sucursal: ${sucursalAlcance.nombre}`
              : "Toda la empresa"}
            {" · "}Los módulos se conectarán a este filtro por etapas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSucursalAlcance(null)}
          disabled={!sucursalAlcance}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ver toda la empresa
        </button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCards title="Ventas de hoy (total)" icon={<DollarSign className="text-title" />} value={fmt(tot.ventasHoy)} color="green" />
        <StatsCards title="Ventas del mes (total)" icon={<CalendarDays className="text-title" />} value={fmt(tot.ventasMes)} color="blue" />
        <StatsCards title="Valor inventario (total)" icon={<Package className="text-title" />} value={fmt(tot.valorInv)} color="purple" />
        <StatsCards title="Pedidos web pendientes" icon={<ShoppingBag className="text-title" />} value={tot.pedidosPend} color="orange" />
      </div>

      {isLoading ? (
        <p className="text-subtitle text-center py-10">Cargando información de sucursales...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {sucursales.map((s) => {
            const k = kpis[s.id_sucursal] || {};
            return (
              <div key={s.id_sucursal} className="erp-card erp-card-hover p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-input rounded-xl p-2.5"><Building2 className="text-title" /></div>
                    <div>
                      <h3 className="text-title text-lg font-bold">{s.nombre}</h3>
                      <p className="text-subtitle text-xs">{s.direccion || "—"}{s.telefono ? ` · Tel. ${s.telefono}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSucursalAlcance({
                        id: s.id_sucursal,
                        nombre: s.nombre,
                      })}
                      className="btn-primary text-sm whitespace-nowrap"
                    >
                      {sucursalAlcance?.id === s.id_sucursal ? "Alcance activo" : "Usar esta sucursal"}
                    </button>
                    <button onClick={() => setDetalle(s)} className="btn-secondary text-sm whitespace-nowrap">
                      Ver detalle <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Mini label="Ventas hoy" value={fmt(k.ventasHoy)} icon={<DollarSign size={15} />} />
                  <Mini label="Ventas mes" value={fmt(k.ventasMes)} icon={<CalendarDays size={15} />} />
                  <Mini label="Valor inventario" value={fmt(k.valorInv)} icon={<Package size={15} />} />
                  <Mini label="Cajas abiertas" value={k.cajasAbiertas} icon={<DoorOpen size={15} />} />
                  <Mini label="Personal activo" value={k.personal} icon={<Users size={15} />} />
                  <Mini label="Pedidos web pend." value={k.pedidosPend} icon={<ShoppingBag size={15} />} />
                  <Mini label="Stock bajo" value={k.stockBajo} icon={<AlertTriangle size={15} />} alerta={k.stockBajo > 0} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detalle && <DetalleSucursal sucursal={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

const Mini = ({ label, value, icon, alerta }) => (
  <div className={`rounded-xl p-3 border ${alerta ? "border-red-500/40 bg-red-500/10" : "border-secondary bg-input/50"}`}>
    <p className="text-subtitle text-[0.7rem] flex items-center gap-1">{icon} {label}</p>
    <p className={`font-bold mt-0.5 ${alerta ? "text-red-400" : "text-title"}`}>{value}</p>
  </div>
);

// --- Detalle (drill-down) de una sucursal ---
function DetalleSucursal({ sucursal, onClose }) {
  const [ventas, setVentas] = useState([]);
  const [stockBajo, setStockBajo] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const results = await Promise.all([
        supabase
          .from("ventas")
          .select("id_venta, numero, total, fecha_operativa")
          .eq("id_empresa", sucursal.id_empresa)
          .eq("id_sucursal", sucursal.id_sucursal)
          .order("registrada_en", { ascending: false })
          .limit(8),
        supabase
          .from("existencias_producto_sucursal")
          .select("producto, cantidad_disponible, stock_minimo, estado_stock")
          .eq("id_empresa", sucursal.id_empresa)
          .eq("id_sucursal", sucursal.id_sucursal),
        supabase
          .from("perfiles")
          .select("nombre_completo, rol")
          .eq("id_empresa", sucursal.id_empresa)
          .eq("id_sucursal", sucursal.id_sucursal)
          .eq("activo", true),
        supabase
          .from("sesiones_caja")
          .select("id_sesion, id_caja, fondo_inicial, abierta_en")
          .eq("id_empresa", sucursal.id_empresa)
          .eq("id_sucursal", sucursal.id_sucursal)
          .eq("estado", "ABIERTA"),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      if (!active) return;
      const [ventasResult, stockResult, perfilesResult, sesionesResult] = results;
      setVentas(ventasResult.data || []);
      setStockBajo((stockResult.data || [])
        .filter((existencia) => ["BAJO", "SIN_EXISTENCIA"].includes(existencia.estado_stock))
        .slice(0, 10));
      setPersonal(perfilesResult.data || []);
      setCajas(sesionesResult.data || []);
      setLoading(false);
    })().catch((error) => {
      console.error("Error cargando el detalle de sucursal:", error);
      toast.error(`Error cargando el detalle: ${error.message}`);
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [sucursal]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className="relative z-10 bg-card text-title p-7 rounded-2xl w-full max-w-3xl shadow-lg border border-secondary max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2"><Building2 size={20} /> {sucursal.nombre}</h3>
            <p className="text-subtitle text-sm">{sucursal.direccion || "—"}{sucursal.telefono ? ` · Tel. ${sucursal.telefono}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-subtitle hover:text-title"><X /></button>
        </div>

        {loading ? (
          <p className="text-subtitle text-center py-8">Cargando detalle...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="erp-card p-4">
              <h4 className="text-title font-semibold mb-3 flex items-center gap-2"><DollarSign size={16} /> Ventas recientes</h4>
              {ventas.length === 0 ? <p className="text-subtitle text-sm">Sin ventas.</p> : (
                <ul className="flex flex-col gap-2">
                  {ventas.map((v) => (
                    <li key={v.id_venta} className="flex justify-between text-sm border-b border-secondary/40 pb-1.5">
                      <span className="text-subtitle">{v.numero || `#${v.id_venta}`} <span className="text-[0.7rem]">({v.fecha_operativa})</span></span>
                      <span className="text-title font-medium">{fmt(v.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="erp-card p-4">
              <h4 className="text-title font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={16} /> Stock bajo</h4>
              {stockBajo.length === 0 ? <p className="text-subtitle text-sm">Sin productos en stock bajo.</p> : (
                <ul className="flex flex-col gap-2">
                  {stockBajo.map((x, i) => (
                    <li key={i} className="flex justify-between text-sm border-b border-secondary/40 pb-1.5">
                      <span className="text-subtitle truncate pr-2">{x.producto}</span>
                      <span className="text-red-400 font-medium whitespace-nowrap">{x.cantidad_disponible} / {x.stock_minimo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="erp-card p-4">
              <h4 className="text-title font-semibold mb-3 flex items-center gap-2"><Users size={16} /> Personal activo ({personal.length})</h4>
              {personal.length === 0 ? <p className="text-subtitle text-sm">Sin personal asignado.</p> : (
                <ul className="flex flex-col gap-2">
                  {personal.map((p, i) => (
                    <li key={i} className="flex justify-between text-sm border-b border-secondary/40 pb-1.5">
                      <span className="text-subtitle">{p.nombre_completo}</span>
                      <span className="badge badge-neutral">{p.rol}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="erp-card p-4">
              <h4 className="text-title font-semibold mb-3 flex items-center gap-2"><DoorOpen size={16} /> Cajas abiertas ({cajas.length})</h4>
              {cajas.length === 0 ? <p className="text-subtitle text-sm">No hay cajas abiertas.</p> : (
                <ul className="flex flex-col gap-2">
                  {cajas.map((c) => (
                    <li key={c.id_sesion} className="flex justify-between text-sm border-b border-secondary/40 pb-1.5">
                      <span className="text-subtitle">Caja #{c.id_caja} · {new Date(c.abierta_en).toLocaleString("es-NI")}</span>
                      <span className="text-title font-medium">{fmt(c.fondo_inicial)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
