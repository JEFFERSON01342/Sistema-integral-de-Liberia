import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Barcode, Boxes, Clock3, MapPin, PackagePlus, RefreshCw, Search, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { useAuth } from "../contexts/authcontext";
import { useEmpresa } from "../contexts/empresacontext";
import { useCompras } from "../hooks/useCompras";
import { supabase } from "../supabase/supabaseclient";
import { imprimirCodigosBarras } from "../utils/generarCodigoBarras";
import RecibirOrdenCompra from "../components/recibirOrdenCompra";

const MOVEMENT_LABELS = {
  INVENTARIO_INICIAL: "Inventario inicial",
  VENTA: "Venta",
  COMPRA: "Recepción de compra",
  TRANSFERENCIA_ENTRADA: "Transferencia recibida",
  TRANSFERENCIA_SALIDA: "Transferencia enviada",
  AJUSTE_ENTRADA: "Ajuste de entrada",
  AJUSTE_SALIDA: "Ajuste de salida",
};

const LOT_EVENT_LABELS = {
  RECEPCION: "Recepción",
  REVISION: "Revisión de calidad",
  TRASLADO: "Traslado",
  VENTA: "Venta",
  DEVOLUCION: "Devolución",
};

export default function Bodega() {
  const { empresaId } = useEmpresa();
  const { perfil, rol } = useAuth();
  const { ordenes, isLoading: cargandoOrdenes, fetchCompras } = useCompras();
  const [sucursales, setSucursales] = useState([]);
  const [idSucursal, setIdSucursal] = useState("");
  const [bodegas, setBodegas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [existencias, setExistencias] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [productos, setProductos] = useState({});
  const [lotesPendientes, setLotesPendientes] = useState([]);
  const [codigoLote, setCodigoLote] = useState("");
  const [loteEscaneado, setLoteEscaneado] = useState(null);
  const [historialLote, setHistorialLote] = useState([]);
  const [buscandoLote, setBuscandoLote] = useState(false);
  const [revisandoLote, setRevisandoLote] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardandoUbicacion, setGuardandoUbicacion] = useState(false);
  const puedeCrearUbicaciones = ["admin", "superadmin", "bodega"].includes(rol);

  useEffect(() => {
    let activo = true;
    const cargarSucursales = async () => {
      if (!empresaId) {
        setSucursales([]);
        return;
      }
      let query = supabase.from("sucursales")
        .select("id_sucursal,nombre")
        .eq("id_empresa", empresaId)
        .eq("activa", true)
        .order("nombre");
      if (rol !== "superadmin" && perfil?.id_sucursal) {
        query = query.eq("id_sucursal", perfil.id_sucursal);
      }
      const { data, error } = await query;
      if (!activo) return;
      if (error) {
        toast.error(`No se pudieron cargar las sucursales: ${error.message}`);
        return;
      }
      setSucursales(data || []);
      if (perfil?.id_sucursal) setIdSucursal(String(perfil.id_sucursal));
      else if (data?.length) setIdSucursal((actual) => actual || String(data[0].id_sucursal));
    };
    cargarSucursales();
    return () => { activo = false; };
  }, [empresaId, perfil?.id_sucursal, rol]);

  const cargarBodega = useCallback(async () => {
    if (!empresaId || !idSucursal) {
      setBodegas([]);
      setUbicaciones([]);
      setExistencias([]);
      setMovimientos([]);
      setLotesPendientes([]);
      setLoteEscaneado(null);
      setHistorialLote([]);
      return;
    }

    setCargando(true);
    setErrorCarga("");
    setBodegas([]);
    setUbicaciones([]);
    setExistencias([]);
    setMovimientos([]);
    setProductos({});
    try {
      const idSucursalNumero = Number(idSucursal);
      const [bodegasResult, ubicacionesResult, movimientosResult, productosResult, lotesResult] = await Promise.all([
        supabase.from("bodegas")
          .select("id_bodega,id_sucursal,codigo,nombre,descripcion,activa")
          .eq("id_empresa", empresaId).eq("id_sucursal", idSucursalNumero).order("nombre"),
        supabase.from("ubicaciones_bodega")
          .select("id_ubicacion,id_bodega,codigo,nombre,tipo_area,pasillo,estante,nivel,posicion,activa")
          .eq("id_empresa", empresaId).eq("id_sucursal", idSucursalNumero).order("codigo"),
        supabase.from("movimientos_inventario")
          .select("id_movimiento,id_producto,id_ubicacion,tipo,cantidad_delta,descripcion,fecha_operativa,registrado_en")
          .eq("id_empresa", empresaId).eq("id_sucursal", idSucursalNumero)
          .order("registrado_en", { ascending: false }).limit(100),
        supabase.from("productos")
          .select("id_producto,nombre,sku")
          .eq("id_empresa", empresaId),
        supabase.from("lotes_trazabilidad_bodega")
          .select("id_lote,codigo_lote,id_sucursal,producto,sku,lote_proveedor,fecha_vencimiento,estado_revision,numero_recepcion,recibida_en,proveedor,cantidad_aceptada")
          .eq("id_empresa", empresaId).eq("id_sucursal", idSucursalNumero)
          .eq("estado_revision", "PENDIENTE")
          .order("recibida_en", { ascending: false }).limit(100),
      ]);
      for (const result of [bodegasResult, ubicacionesResult, movimientosResult, productosResult, lotesResult]) {
        if (result.error) throw result.error;
      }

      const capas = [];
      const tamanoPagina = 500;
      for (let desde = 0; ; desde += tamanoPagina) {
        const { data, error } = await supabase.from("capas_inventario_fifo")
          .select("id_capa,id_bodega,id_ubicacion,id_producto,cantidad_disponible")
          .eq("id_empresa", empresaId).eq("id_sucursal", idSucursalNumero)
          .gt("cantidad_disponible", 0)
          .order("id_capa")
          .range(desde, desde + tamanoPagina - 1);
        if (error) throw error;
        capas.push(...(data || []));
        if (!data || data.length < tamanoPagina) break;
      }

      setBodegas(bodegasResult.data || []);
      setUbicaciones(ubicacionesResult.data || []);
      setExistencias(capas);
      setMovimientos(movimientosResult.data || []);
      setLotesPendientes(lotesResult.data || []);
      setProductos(Object.fromEntries((productosResult.data || []).map((producto) => [
        producto.id_producto,
        producto,
      ])));
    } catch (error) {
      console.error("Error cargando bodega:", error);
      setErrorCarga(error.message);
      toast.error(`No se pudo cargar la bodega: ${error.message}`);
    } finally {
      setCargando(false);
    }
  }, [empresaId, idSucursal]);

  useEffect(() => { cargarBodega(); }, [cargarBodega]);

  const buscarLote = async (codigo = codigoLote) => {
    const codigoNormalizado = String(codigo || "").trim().toUpperCase();
    if (!codigoNormalizado) return;
    setBuscandoLote(true);
    setLoteEscaneado(null);
    setHistorialLote([]);
    const { data, error } = await supabase
      .from("lotes_trazabilidad_bodega")
      .select("*")
      .eq("id_empresa", empresaId)
      .eq("id_sucursal", Number(idSucursal))
      .eq("codigo_lote", codigoNormalizado)
      .maybeSingle();
    if (error) {
      toast.error(`No se pudo consultar el lote: ${error.message}`);
      setBuscandoLote(false);
      return;
    }
    if (!data) {
      toast.error(`No se encontró el lote ${codigoNormalizado} en esta sucursal.`);
      setBuscandoLote(false);
      return;
    }
    const { data: eventos, error: errorEventos } = await supabase
      .from("historial_lotes_trazabilidad")
      .select("tipo_evento,ubicacion_origen,ubicacion_destino,cantidad,documento_tipo,documento_id,ocurrido_en")
      .eq("id_empresa", empresaId)
      .eq("id_lote", data.id_lote)
      .order("ocurrido_en", { ascending: false });
    if (errorEventos) {
      toast.error(`No se pudo cargar el historial del lote: ${errorEventos.message}`);
      setBuscandoLote(false);
      return;
    }
    setLoteEscaneado(data);
    setHistorialLote(eventos || []);
    setCodigoLote(codigoNormalizado);
    setBuscandoLote(false);
  };

  const aprobarRevisionLote = async () => {
    if (!loteEscaneado) return;
    const { value: detalles, isConfirmed } = await Swal.fire({
      title: "Aprobar revisión del lote",
      text: "Confirma que el lote y su vencimiento fueron revisados antes de habilitarlo para venta.",
      input: "textarea",
      inputLabel: "Detalles de revisión",
      inputPlaceholder: "Estado del empaque, cantidad, calidad u observaciones",
      inputAttributes: { maxlength: 2000 },
      showCancelButton: true,
      confirmButtonText: "Aprobar lote",
      cancelButtonText: "Cancelar",
      background: "#152235",
      color: "#fff",
    });
    if (!isConfirmed) return;
    setRevisandoLote(true);
    const { error } = await supabase.rpc("aprobar_revision_lote", {
      p_codigo_lote: loteEscaneado.codigo_lote,
      p_revision_detalles: detalles || null,
    });
    setRevisandoLote(false);
    if (error) {
      toast.error(`No se pudo aprobar el lote: ${error.message}`);
      return;
    }
    toast.success("Lote aprobado. Ya puede trasladarse al área de venta.");
    await Promise.all([buscarLote(loteEscaneado.codigo_lote), cargarBodega()]);
  };

  const existenciasPorUbicacion = useMemo(() => {
    const agrupadas = new Map();
    for (const capa of existencias) {
      const clave = `${capa.id_ubicacion}:${capa.id_producto}`;
      const actual = agrupadas.get(clave) || {
        id_ubicacion: capa.id_ubicacion,
        id_producto: capa.id_producto,
        cantidad: 0,
      };
      actual.cantidad += Number(capa.cantidad_disponible || 0);
      agrupadas.set(clave, actual);
    }
    return [...agrupadas.values()].sort((a, b) => Number(a.id_ubicacion) - Number(b.id_ubicacion));
  }, [existencias]);

  const cantidadTotal = useMemo(
    () => existenciasPorUbicacion.reduce((total, row) => total + row.cantidad, 0),
    [existenciasPorUbicacion]
  );
  const ordenesPendientes = useMemo(
    () => ordenes.filter((orden) =>
      Number(orden.id_sucursal) === Number(idSucursal)
      && ["ENVIADA", "PARCIAL"].includes(orden.estado)
      && orden.lineas.some((linea) => linea.cantidad_pendiente > 0)
    ),
    [idSucursal, ordenes]
  );
  const ubicacionPorId = useMemo(() => Object.fromEntries(ubicaciones.map((ubicacion) => [
    ubicacion.id_ubicacion,
    ubicacion,
  ])), [ubicaciones]);

  const crearUbicacion = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const bodega = bodegas.find((item) => String(item.id_bodega) === String(formData.get("id_bodega")));
    if (!bodega) {
      toast.error("Selecciona una bodega activa.");
      return;
    }
    setGuardandoUbicacion(true);
    const { error } = await supabase.from("ubicaciones_bodega").insert({
      id_empresa: empresaId,
      id_sucursal: Number(idSucursal),
      id_bodega: Number(bodega.id_bodega),
      codigo: String(formData.get("codigo") || "").trim().toUpperCase(),
      nombre: String(formData.get("nombre") || "").trim(),
      tipo_area: String(formData.get("tipo_area") || "ALMACENAMIENTO"),
      pasillo: String(formData.get("pasillo") || "").trim() || null,
      estante: String(formData.get("estante") || "").trim() || null,
      nivel: String(formData.get("nivel") || "").trim() || null,
      posicion: String(formData.get("posicion") || "").trim() || null,
    });
    setGuardandoUbicacion(false);
    if (error) {
      toast.error(`No se pudo crear la ubicación: ${error.message}`);
      return;
    }
    toast.success("Ubicación creada.");
    setMostrarFormulario(false);
    form.reset();
    await cargarBodega();
  };

  const cerrarRecepcion = async () => {
    setOrdenSeleccionada(null);
    await Promise.all([fetchCompras(), cargarBodega()]);
  };

  const sucursalActual = sucursales.find((sucursal) => String(sucursal.id_sucursal) === String(idSucursal));

  return (
    <div className="p-4 md:p-6 space-y-6">
      {ordenSeleccionada && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 flex items-center justify-center">
          <RecibirOrdenCompra orden={ordenSeleccionada} onClose={cerrarRecepcion} />
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-title">Bodega</h1>
          <p className="text-subtitle">Existencias por ubicación, recepciones y movimientos trazables.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rol !== "bodega" && (
            <Link to="/dashboard/transferencias" className="btn-secondary inline-flex items-center gap-2">
              <ArrowLeftRight size={18} /> Transferencias
            </Link>
          )}
          <button type="button" onClick={() => { cargarBodega(); fetchCompras(); }} disabled={cargando}
            className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw size={17} className={cargando ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>
      </header>

      {sucursales.length > 1 && (
        <label className="flex flex-col gap-2 max-w-sm text-sm font-medium">
          Sucursal
          <select value={idSucursal} onChange={(event) => setIdSucursal(event.target.value)}
            className="bg-input border border-secondary rounded-lg p-3">
            {sucursales.map((sucursal) => (
              <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
            ))}
          </select>
        </label>
      )}

      {errorCarga && (
        <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          Error al cargar la bodega: {errorCarga}
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-secondary bg-card p-4">
          <div className="flex items-center gap-2 text-subtitle"><Boxes size={18} /> Unidades disponibles</div>
          <p className="text-2xl font-bold mt-2">{cantidadTotal.toFixed(3)}</p>
        </div>
        <div className="rounded-xl border border-secondary bg-card p-4">
          <div className="flex items-center gap-2 text-subtitle"><MapPin size={18} /> Ubicaciones activas</div>
          <p className="text-2xl font-bold mt-2">{ubicaciones.filter((ubicacion) => ubicacion.activa).length}</p>
        </div>
        <div className="rounded-xl border border-secondary bg-card p-4">
          <div className="flex items-center gap-2 text-subtitle"><Truck size={18} /> Órdenes por recibir</div>
          <p className="text-2xl font-bold mt-2">{ordenesPendientes.length}</p>
        </div>
      </section>

      <section className="rounded-xl border border-secondary bg-card p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Trazabilidad y revisión de lotes</h2>
          <p className="text-sm text-subtitle">
            Escanea la etiqueta interna del lote para ver proveedor, costo, documento, vencimiento y movimientos.
            El código de producto sigue siendo el que se usa en caja y en la tienda.
          </p>
        </div>
        <form
          className="flex flex-col sm:flex-row gap-2 max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            buscarLote();
          }}
        >
          <label htmlFor="bodega-codigo-lote" className="sr-only">Código de lote</label>
          <input
            id="bodega-codigo-lote"
            autoComplete="off"
            value={codigoLote}
            onChange={(event) => setCodigoLote(event.target.value)}
            placeholder="Escanea o escribe el código, por ejemplo LT-123"
            className="flex-1 bg-input border border-secondary rounded-lg p-3 font-mono"
          />
          <button type="submit" disabled={buscandoLote || !idSucursal} className="btn-primary inline-flex items-center justify-center gap-2">
            <Search size={17} /> {buscandoLote ? "Buscando..." : "Consultar lote"}
          </button>
        </form>

        {loteEscaneado && (
          <div className="rounded-lg border border-secondary p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{loteEscaneado.producto} · {loteEscaneado.codigo_lote}</h3>
                <p className="text-sm text-subtitle">SKU {loteEscaneado.sku} · Recepción {loteEscaneado.numero_recepcion}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-sm ${loteEscaneado.estado_revision === "APROBADO" ? "bg-green-500/15 text-green-300" : "bg-amber-500/15 text-amber-300"}`}>
                  {loteEscaneado.estado_revision === "APROBADO" ? "Revisión aprobada" : "Pendiente de revisión"}
                </span>
                {loteEscaneado.estado_revision === "APROBADO" && (
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-2"
                    onClick={() => imprimirCodigosBarras([{
                      codigo: loteEscaneado.codigo_lote,
                      nombre: loteEscaneado.producto,
                      detalles: [
                        `Lote ${loteEscaneado.codigo_lote}`,
                        `Recepción ${loteEscaneado.numero_recepcion}`,
                        loteEscaneado.proveedor ? `Proveedor ${loteEscaneado.proveedor}` : "",
                        loteEscaneado.documento_proveedor ? `Documento ${loteEscaneado.documento_proveedor}` : "",
                        loteEscaneado.lote_proveedor ? `Lote proveedor ${loteEscaneado.lote_proveedor}` : "",
                        loteEscaneado.fecha_vencimiento ? `Vence ${loteEscaneado.fecha_vencimiento}` : "",
                      ],
                    }])}
                  >
                    <Barcode size={17} /> Imprimir etiqueta
                  </button>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div><dt className="text-subtitle">Proveedor</dt><dd>{loteEscaneado.proveedor}</dd></div>
              <div><dt className="text-subtitle">Costo unitario recibido</dt><dd>C$ {Number(loteEscaneado.costo_unitario).toFixed(4)}</dd></div>
              <div><dt className="text-subtitle">Lote del proveedor</dt><dd>{loteEscaneado.lote_proveedor || "No indicado"}</dd></div>
              <div><dt className="text-subtitle">Documento del proveedor</dt><dd>{loteEscaneado.documento_proveedor || "No indicado"}</dd></div>
              <div><dt className="text-subtitle">Recibido</dt><dd>{new Date(loteEscaneado.recibida_en).toLocaleString()}</dd></div>
              <div><dt className="text-subtitle">Vencimiento</dt><dd>{loteEscaneado.fecha_vencimiento || "No aplica / no indicado"}</dd></div>
              <div><dt className="text-subtitle">Llegada al área de venta</dt><dd>{loteEscaneado.fecha_area_venta ? new Date(loteEscaneado.fecha_area_venta).toLocaleString() : "Aún no trasladado"}</dd></div>
              <div><dt className="text-subtitle">Cantidad actual del lote</dt><dd>{Number(loteEscaneado.cantidad_actual).toFixed(3)}</dd></div>
            </dl>
            <div>
              <h4 className="text-sm font-semibold mb-1">Ubicaciones actuales</h4>
              {loteEscaneado.ubicaciones_actuales?.length ? (
                <ul className="text-sm text-subtitle space-y-1">
                  {loteEscaneado.ubicaciones_actuales.map((ubicacion) => (
                    <li key={`${ubicacion.id_ubicacion}-${ubicacion.cantidad}`}>
                      {ubicacion.codigo} — {ubicacion.nombre} ({ubicacion.tipo_area}): {Number(ubicacion.cantidad).toFixed(3)}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-subtitle">El lote no tiene existencias actuales.</p>}
            </div>
            {loteEscaneado.revision_detalles && (
              <p className="text-sm"><span className="text-subtitle">Revisión: </span>{loteEscaneado.revision_detalles}</p>
            )}
            {loteEscaneado.estado_revision === "PENDIENTE" && ["admin", "superadmin", "bodega"].includes(rol) && (
              <button type="button" onClick={aprobarRevisionLote} disabled={revisandoLote} className="btn-primary disabled:opacity-50">
                {revisandoLote ? "Guardando revisión..." : "Aprobar revisión y habilitar lote"}
              </button>
            )}
            <div className="overflow-x-auto">
              <h4 className="text-sm font-semibold mb-2">Historial del lote</h4>
              {historialLote.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-subtitle">
                    <th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Evento</th>
                    <th className="p-2 text-left">Ubicación</th><th className="p-2 text-left">Documento</th>
                    <th className="p-2 text-right">Cantidad</th>
                  </tr></thead>
                  <tbody>{historialLote.map((evento) => (
                    <tr key={`${evento.tipo_evento}-${evento.documento_id}-${evento.ocurrido_en}`} className="border-t border-secondary/50">
                      <td className="p-2">{new Date(evento.ocurrido_en).toLocaleString()}</td>
                      <td className="p-2">{LOT_EVENT_LABELS[evento.tipo_evento] || evento.tipo_evento}</td>
                      <td className="p-2">{evento.ubicacion_origen || "—"} → {evento.ubicacion_destino || "—"}</td>
                      <td className="p-2">{evento.documento_tipo} {evento.documento_id}</td>
                      <td className="p-2 text-right">{Number(evento.cantidad).toFixed(3)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-sm text-subtitle">No hay eventos de movimiento registrados.</p>}
            </div>
          </div>
        )}

        <div>
          <h3 className="font-semibold mb-2">Lotes pendientes de revisión ({lotesPendientes.length})</h3>
          {lotesPendientes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-subtitle">
                  <th className="p-2 text-left">Lote</th><th className="p-2 text-left">Producto</th>
                  <th className="p-2 text-left">Proveedor / recepción</th><th className="p-2 text-left">Vencimiento</th>
                  <th className="p-2 text-right">Cantidad</th><th className="p-2"></th>
                </tr></thead>
                <tbody>{lotesPendientes.map((lote) => (
                  <tr key={lote.id_lote} className="border-t border-secondary/50">
                    <td className="p-2 font-mono">{lote.codigo_lote}</td>
                    <td className="p-2">{lote.producto}</td>
                    <td className="p-2">{lote.proveedor} · {lote.numero_recepcion}</td>
                    <td className="p-2">{lote.fecha_vencimiento || "—"}</td>
                    <td className="p-2 text-right">{Number(lote.cantidad_aceptada).toFixed(3)}</td>
                    <td className="p-2 text-right">
                      <button type="button" className="btn-secondary" onClick={() => buscarLote(lote.codigo_lote)}>Revisar</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-subtitle">No hay lotes pendientes en esta sucursal.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-secondary bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Ubicaciones de {sucursalActual?.nombre || `sucursal ${idSucursal}`}</h2>
            <p className="text-sm text-subtitle">{bodegas.length} bodega(s) registradas.</p>
          </div>
          {puedeCrearUbicaciones && (
            <button type="button" onClick={() => setMostrarFormulario((visible) => !visible)}
              className="btn-primary inline-flex items-center gap-2">
              <PackagePlus size={18} /> {mostrarFormulario ? "Cancelar" : "Nueva ubicación"}
            </button>
          )}
        </div>

        {mostrarFormulario && (
          <form onSubmit={crearUbicacion} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5 rounded-lg border border-secondary p-4">
            <label className="flex flex-col gap-1 text-sm">Bodega
              <select name="id_bodega" required className="bg-input border border-secondary rounded-lg p-2.5">
                <option value="">Selecciona</option>
                {bodegas.filter((bodega) => bodega.activa).map((bodega) => (
                  <option key={bodega.id_bodega} value={bodega.id_bodega}>{bodega.nombre}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Código
              <input name="codigo" required maxLength={40} className="bg-input border border-secondary rounded-lg p-2.5" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Nombre
              <input name="nombre" required maxLength={120} className="bg-input border border-secondary rounded-lg p-2.5" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Área
              <select name="tipo_area" className="bg-input border border-secondary rounded-lg p-2.5">
                {["RECEPCION", "ALMACENAMIENTO", "PICKING", "DESPACHO", "DEVOLUCIONES"].map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </label>
            {["pasillo", "estante", "nivel", "posicion"].map((campo) => (
              <label key={campo} className="flex flex-col gap-1 text-sm capitalize">{campo}
                <input name={campo} maxLength={40} className="bg-input border border-secondary rounded-lg p-2.5" />
              </label>
            ))}
            <div className="md:col-span-4 flex justify-end">
              <button type="submit" disabled={guardandoUbicacion || bodegas.length === 0} className="btn-primary disabled:opacity-50">
                {guardandoUbicacion ? "Guardando..." : "Crear ubicación"}
              </button>
            </div>
          </form>
        )}

        {cargando ? <p className="text-subtitle">Cargando existencias...</p> : ubicaciones.length === 0 ? (
          <p className="text-subtitle py-4">No hay ubicaciones registradas para esta sucursal.</p>
        ) : (
          <div className="space-y-4">
            {ubicaciones.map((ubicacion) => {
              const items = existenciasPorUbicacion.filter((row) => String(row.id_ubicacion) === String(ubicacion.id_ubicacion));
              const cantidad = items.reduce((total, item) => total + item.cantidad, 0);
              return (
                <details key={ubicacion.id_ubicacion} className="rounded-lg border border-secondary">
                  <summary className="cursor-pointer p-3 flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{ubicacion.codigo} — {ubicacion.nombre}</strong>
                      <span className="text-subtitle"> · {ubicacion.tipo_area} · Bodega {ubicacion.id_bodega}</span></span>
                    <span>{items.length} producto(s) · {cantidad.toFixed(3)} unidades</span>
                  </summary>
                  {items.length > 0 ? (
                    <div className="overflow-x-auto border-t border-secondary">
                      <table className="w-full text-sm">
                        <thead><tr className="text-subtitle">
                          <th className="p-2 text-left">SKU</th><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Disponible</th>
                        </tr></thead>
                        <tbody>{items.map((item) => {
                          const producto = productos[item.id_producto];
                          return <tr key={item.id_producto} className="border-t border-secondary/50">
                            <td className="p-2">{producto?.sku || `#${item.id_producto}`}</td>
                            <td className="p-2">{producto?.nombre || "Producto inactivo o no disponible"}</td>
                            <td className="p-2 text-right">{item.cantidad.toFixed(3)}</td>
                          </tr>;
                        })}</tbody>
                      </table>
                    </div>
                  ) : <p className="p-3 text-sm text-subtitle">Sin existencias.</p>}
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-secondary bg-card p-4">
        <h2 className="text-lg font-semibold mb-3">Recepciones de compras</h2>
        {cargandoOrdenes ? <p className="text-subtitle">Cargando órdenes...</p> : ordenesPendientes.length === 0 ? (
          <p className="text-subtitle">No hay órdenes pendientes de recepción en esta sucursal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-subtitle">
                <th className="p-2 text-left">Orden</th><th className="p-2 text-left">Proveedor</th>
                <th className="p-2 text-left">Estado</th><th className="p-2 text-left">Creada</th><th className="p-2"></th>
              </tr></thead>
              <tbody>{ordenesPendientes.map((orden) => (
                <tr key={orden.id_orden_compra} className="border-t border-secondary/50">
                  <td className="p-2">{orden.numero}</td>
                  <td className="p-2">{orden.nombre_proveedor}</td>
                  <td className="p-2">{orden.estado}</td>
                  <td className="p-2">{orden.creada_en ? new Date(orden.creada_en).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-right">
                    <button type="button" onClick={() => setOrdenSeleccionada(orden)} className="btn-secondary">Recibir</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-secondary bg-card p-4">
        <div className="flex items-center gap-2 mb-3"><Clock3 size={18} /><h2 className="text-lg font-semibold">Movimientos recientes</h2></div>
        {movimientos.length === 0 ? <p className="text-subtitle">Aún no hay movimientos de inventario.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-subtitle">
                <th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-left">Producto</th><th className="p-2 text-left">Ubicación</th>
                <th className="p-2 text-right">Cambio</th><th className="p-2 text-left">Descripción</th>
              </tr></thead>
              <tbody>{movimientos.map((movimiento) => (
                <tr key={movimiento.id_movimiento} className="border-t border-secondary/50">
                  <td className="p-2">{new Date(movimiento.registrado_en).toLocaleString()}</td>
                  <td className="p-2">{MOVEMENT_LABELS[movimiento.tipo] || movimiento.tipo}</td>
                  <td className="p-2">{productos[movimiento.id_producto]?.nombre || `#${movimiento.id_producto}`}</td>
                  <td className="p-2">{ubicacionPorId[movimiento.id_ubicacion]?.codigo || "—"}</td>
                  <td className="p-2 text-right">{Number(movimiento.cantidad_delta).toFixed(3)}</td>
                  <td className="p-2">{movimiento.descripcion || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
