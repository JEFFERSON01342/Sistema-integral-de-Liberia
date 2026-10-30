import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeftRight, Barcode, Plus, X, Trash2, PackageSearch } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useAuth } from "../contexts/authcontext";
import { useEmpresa } from "../contexts/empresacontext";
import StatsCards from "../components/statscards";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const fmtFecha = (fecha) => {
  if (!fecha) return "—";
  const parsed = new Date(fecha);
  return Number.isNaN(parsed.getTime())
    ? fecha
    : parsed.toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" });
};

export default function Transferencias() {
  const { perfil, rol } = useAuth();
  const { empresaId } = useEmpresa();
  const [transferencias, setTransferencias] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [lotesOrigen, setLotesOrigen] = useState([]);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [form, setForm] = useState({
    origenSucursal: "",
    destinoSucursal: "",
    origenUbicacion: "",
    destinoUbicacion: "",
    motivo: "",
  });
  const [lineas, setLineas] = useState([]);
  const [idLoteSel, setIdLoteSel] = useState("");
  const [codigoLoteSel, setCodigoLoteSel] = useState("");
  const [cantSel, setCantSel] = useState("1");

  const esSuperadmin = rol === "superadmin";
  const sucursalNombres = useMemo(
    () => new Map(sucursales.map((sucursal) => [sucursal.id_sucursal, sucursal.nombre])),
    [sucursales]
  );
  const ubicacionNombres = useMemo(
    () => new Map(
      [...ubicaciones, ...ubicacionesOrigen, ...ubicacionesDestino]
        .map((ubicacion) => [ubicacion.id_ubicacion, `${ubicacion.codigo} — ${ubicacion.nombre}`])
    ),
    [ubicaciones, ubicacionesOrigen, ubicacionesDestino]
  );
  const lotesDisponibles = useMemo(() => lotesOrigen.flatMap((lote) => {
    const ubicacion = (lote.ubicaciones_actuales || []).find(
      (item) => Number(item.id_ubicacion) === Number(form.origenUbicacion)
    );
    const cantidadDisponible = Number(ubicacion?.cantidad || 0);
    return cantidadDisponible > 0 ? [{ ...lote, cantidad_disponible: cantidadDisponible }] : [];
  }), [form.origenUbicacion, lotesOrigen]);

  const cargar = useCallback(async () => {
    if (!empresaId) {
      setTransferencias([]);
      setDetalles([]);
      setSucursales([]);
      return;
    }

    setIsLoading(true);
    try {
      const sucursalesQuery = supabase
        .from("sucursales")
        .select("id_sucursal, nombre, activa")
        .eq("id_empresa", empresaId)
        .eq("activa", true)
        .order("nombre");
      if (!esSuperadmin && perfil?.id_sucursal) {
        sucursalesQuery.eq("id_sucursal", perfil.id_sucursal);
      }

      const [transferenciasResult, sucursalesResult] = await Promise.all([
        supabase
          .from("transferencias_inventario")
          .select("*")
          .eq("id_empresa", empresaId)
          .order("transferida_en", { ascending: false })
          .limit(100),
        sucursalesQuery,
      ]);
      if (transferenciasResult.error) throw transferenciasResult.error;
      if (sucursalesResult.error) throw sucursalesResult.error;

      const rows = transferenciasResult.data || [];
      const ids = rows.map((transferencia) => transferencia.id_transferencia);
      const ubicacionIds = [...new Set(rows.flatMap((transferencia) => [
        transferencia.id_ubicacion_origen,
        transferencia.id_ubicacion_destino,
      ]))];

      const [detallesResult, ubicacionesResult] = await Promise.all([
        ids.length
          ? supabase
            .from("detalles_transferencia_inventario")
            .select("id_transferencia, id_producto, id_lote, cantidad, costo_total")
            .in("id_transferencia", ids)
          : Promise.resolve({ data: [], error: null }),
        ubicacionIds.length
          ? supabase
            .from("ubicaciones_bodega")
            .select("id_ubicacion, codigo, nombre, id_sucursal")
            .eq("id_empresa", empresaId)
            .in("id_ubicacion", ubicacionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (detallesResult.error) throw detallesResult.error;
      if (ubicacionesResult.error) throw ubicacionesResult.error;

      setTransferencias(rows);
      setDetalles(detallesResult.data || []);
      setSucursales(sucursalesResult.data || []);
      setUbicaciones(ubicacionesResult.data || []);
    } catch (error) {
      console.error("Error cargando transferencias:", error);
      toast.error(`No se pudieron cargar las transferencias: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, esSuperadmin, perfil?.id_sucursal]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarUbicaciones = useCallback(async (idSucursal, setUbicaciones) => {
    if (!empresaId || !idSucursal) {
      setUbicaciones([]);
      return;
    }
    const { data, error } = await supabase
      .from("ubicaciones_bodega")
      .select("id_ubicacion, codigo, nombre, id_sucursal")
      .eq("id_empresa", empresaId)
      .eq("id_sucursal", Number(idSucursal))
      .eq("activa", true)
      .order("codigo");
    if (error) {
      toast.error(`No se pudieron cargar las ubicaciones: ${error.message}`);
      setUbicaciones([]);
      return;
    }
    setUbicaciones(data || []);
  }, [empresaId]);

  useEffect(() => {
    cargarUbicaciones(form.origenSucursal, setUbicacionesOrigen);
    setForm((prev) => ({ ...prev, origenUbicacion: "" }));
  }, [form.origenSucursal, cargarUbicaciones]);

  useEffect(() => {
    cargarUbicaciones(form.destinoSucursal, setUbicacionesDestino);
    setForm((prev) => ({ ...prev, destinoUbicacion: "" }));
  }, [form.destinoSucursal, cargarUbicaciones]);

  useEffect(() => {
    let cancelled = false;
    const cargarLotesOrigen = async () => {
      setLotesOrigen([]);
      setIdLoteSel("");
      setCodigoLoteSel("");
      if (!isModalOpen || !empresaId || !form.origenSucursal || !form.origenUbicacion) {
        setCargandoLotes(false);
        return;
      }

      setCargandoLotes(true);
      const { data, error } = await supabase
        .from("lotes_trazabilidad_bodega")
        .select("id_lote,codigo_lote,id_sucursal,id_producto,producto,sku,lote_proveedor,fecha_vencimiento,estado_revision,ubicaciones_actuales")
        .eq("id_empresa", empresaId)
        .eq("id_sucursal", Number(form.origenSucursal))
        .order("recibida_en", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error(`No se pudieron cargar los lotes de origen: ${error.message}`);
      } else {
        setLotesOrigen(data || []);
      }
      setCargandoLotes(false);
    };
    cargarLotesOrigen();
    return () => { cancelled = true; };
  }, [empresaId, form.origenSucursal, form.origenUbicacion, isModalOpen]);

  const abrirModal = () => {
    const sucursalInicial = perfil?.id_sucursal
      ? String(perfil.id_sucursal)
      : "";
    setForm({
      origenSucursal: sucursalInicial,
      destinoSucursal: sucursalInicial,
      origenUbicacion: "",
      destinoUbicacion: "",
      motivo: "",
    });
    setLineas([]);
    setLotesOrigen([]);
    setIdLoteSel("");
    setCodigoLoteSel("");
    setCantSel("1");
    setIsModalOpen(true);
  };

  const seleccionarLotePorCodigo = () => {
    const codigo = codigoLoteSel.trim().toUpperCase();
    if (!codigo) return;
    const lote = lotesDisponibles.find((item) => item.codigo_lote.toUpperCase() === codigo);
    if (!lote) {
      toast.error(`No hay existencias del lote ${codigo} en la ubicación de origen.`);
      return;
    }
    setIdLoteSel(String(lote.id_lote));
  };

  const agregarLinea = () => {
    const cantidad = Number(cantSel);
    if (!idLoteSel) return toast.error("Escanee o seleccione un lote.");
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad !== Number(cantidad.toFixed(3))) {
      return toast.error("La cantidad debe ser positiva y tener como máximo tres decimales.");
    }
    const lote = lotesDisponibles.find((item) => String(item.id_lote) === idLoteSel);
    if (!lote) return toast.error("El lote ya no está disponible en la ubicación de origen.");
    if (cantidad > lote.cantidad_disponible) {
      return toast.error(`La cantidad supera las existencias del lote (${lote.cantidad_disponible.toFixed(3)}).`);
    }
    if (lineas.some((linea) => linea.id_lote === lote.id_lote)) {
      return toast.error("El lote ya está en la lista.");
    }
    setLineas((prev) => [...prev, {
      id_producto: lote.id_producto,
      id_lote: lote.id_lote,
      codigo_lote: lote.codigo_lote,
      lote_proveedor: lote.lote_proveedor,
      fecha_vencimiento: lote.fecha_vencimiento,
      cantidad_disponible: lote.cantidad_disponible,
      sku: lote.sku,
      nombre: lote.producto,
      cantidad,
    }]);
    setIdLoteSel("");
    setCodigoLoteSel("");
    setCantSel("1");
  };

  const guardar = async () => {
    if (!form.origenSucursal || !form.destinoSucursal) {
      return toast.error("Seleccione las sucursales de origen y destino.");
    }
    if (!form.origenUbicacion || !form.destinoUbicacion) {
      return toast.error("Seleccione las ubicaciones de origen y destino.");
    }
    if (form.origenUbicacion === form.destinoUbicacion) {
      return toast.error("El origen y el destino deben ser diferentes.");
    }
    if (form.motivo.trim().length < 3) {
      return toast.error("Indique un motivo de al menos tres caracteres.");
    }
    if (lineas.length === 0) return toast.error("Agregue al menos un producto.");

    setGuardando(true);
    try {
      const { data: idTransferencia, error } = await supabase.rpc("transferir_inventario", {
        p_id_ubicacion_origen: Number(form.origenUbicacion),
        p_id_ubicacion_destino: Number(form.destinoUbicacion),
        p_lineas: lineas.map(({ id_producto, id_lote, cantidad }) => ({ id_producto, id_lote, cantidad })),
        p_motivo: form.motivo.trim(),
        p_clave_idempotencia: globalThis.crypto.randomUUID(),
      });
      if (error) throw error;

      toast.success(`Transferencia TR-${idTransferencia} completada y stock actualizado.`);
      setIsModalOpen(false);
      await cargar();
    } catch (error) {
      console.error("Error registrando transferencia:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo transferir",
        text: error.message,
        background: "#152235",
        color: "#fff",
      });
    } finally {
      setGuardando(false);
    }
  };

  const lineasPorTransferencia = useMemo(() => {
    const grupos = new Map();
    for (const detalle of detalles) {
      const grupo = grupos.get(detalle.id_transferencia) || [];
      grupo.push(detalle);
      grupos.set(detalle.id_transferencia, grupo);
    }
    return grupos;
  }, [detalles]);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <StatsCards
          title="Transferencias recientes"
          icon={<ArrowLeftRight className="text-title" />}
          value={transferencias.length}
        />
        <StatsCards
          title="Productos trasladados"
          icon={<PackageSearch className="text-title" />}
          value={detalles.reduce((total, detalle) => total + Number(detalle.cantidad || 0), 0).toFixed(3)}
        />
      </div>

      <div className="mt-8 border border-secondary rounded-2xl p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title text-xl font-bold">Transferencias de inventario</h3>
            <p className="text-subtitle text-sm">
              Traslada existencias entre ubicaciones de bodegas de la empresa.
            </p>
          </div>
          <button
            className="bg-button text-button flex h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:opacity-90 transition"
            onClick={abrirModal}
          >
            <Plus /> Nueva transferencia
          </button>
        </div>

        <div className="mt-8 overflow-x-auto">
          {isLoading ? (
            <p className="text-title p-4 text-center">Cargando transferencias...</p>
          ) : transferencias.length === 0 ? (
            <p className="text-title p-4 text-center">No hay transferencias registradas.</p>
          ) : (
            <table className="text-title w-full border-collapse">
              <thead>
                <tr className="border-b border-secondary/50 text-sm font-semibold text-subtitle">
                  <th className="py-3 px-2 text-left">Fecha</th>
                  <th className="py-3 px-2 text-left">Origen</th>
                  <th className="py-3 px-2 text-left">Destino</th>
                  <th className="py-3 px-2 text-center">Productos</th>
                  <th className="py-3 px-2 text-left">Motivo</th>
                  <th className="py-3 px-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map((transferencia) => {
                  const lineasTransferidas = lineasPorTransferencia.get(transferencia.id_transferencia) || [];
                  const nombreSucursalOrigen = sucursalNombres.get(transferencia.id_sucursal);
                  const nombreSucursalDestino = sucursalNombres.get(transferencia.id_sucursal_destino);
                  const nombreUbicacionOrigen = ubicacionNombres.get(transferencia.id_ubicacion_origen);
                  const nombreUbicacionDestino = ubicacionNombres.get(transferencia.id_ubicacion_destino);
                  return (
                    <tr
                      key={transferencia.id_transferencia}
                      className="border-t border-secondary text-sm hover:bg-secondary transition-colors"
                    >
                      <td className="py-3 px-2 whitespace-nowrap">{fmtFecha(transferencia.transferida_en)}</td>
                      <td className="py-3 px-2">
                        {nombreSucursalOrigen || `Sucursal #${transferencia.id_sucursal}`}
                        <span className="block text-xs text-subtitle">
                          {nombreUbicacionOrigen || `Ubicación #${transferencia.id_ubicacion_origen}`}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {nombreSucursalDestino || `Sucursal #${transferencia.id_sucursal_destino}`}
                        <span className="block text-xs text-subtitle">
                          {nombreUbicacionDestino || `Ubicación #${transferencia.id_ubicacion_destino}`}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {lineasTransferidas.reduce((total, linea) => total + Number(linea.cantidad), 0).toFixed(3)}
                        {lineasTransferidas.length > 0 && (
                          <span className="block text-xs text-subtitle">
                            {lineasTransferidas
                              .map((linea) => linea.id_lote ? `LT-${linea.id_lote}` : "Sin lote")
                              .join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-subtitle max-w-xs truncate">{transferencia.motivo}</td>
                      <td className="py-3 px-2 text-center">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-600/20 text-green-400">
                          Completada
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm overflow-y-auto py-8">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative z-10 mx-4 bg-primary text-title p-8 rounded-2xl w-full max-w-3xl shadow-lg border border-secondary my-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-semibold">Nueva transferencia</h3>
                <p className="text-subtitle text-sm">
                  La operación se registra completa y mueve el costo FIFO de origen a destino.
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-subtitle hover:text-title">
                <X />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <SelectorUbicacion
                label="Sucursal de origen"
                sucursales={sucursales}
                ubicaciones={ubicacionesOrigen}
                sucursal={form.origenSucursal}
                ubicacion={form.origenUbicacion}
                onSucursalChange={(value) => {
                  setForm((prev) => ({ ...prev, origenSucursal: value, origenUbicacion: "" }));
                  setLineas([]);
                }}
                onUbicacionChange={(value) => {
                  setForm((prev) => ({ ...prev, origenUbicacion: value }));
                  setLineas([]);
                }}
                disabled={!esSuperadmin && Boolean(perfil?.id_sucursal)}
              />
              <SelectorUbicacion
                label="Sucursal de destino"
                sucursales={sucursales}
                ubicaciones={ubicacionesDestino}
                sucursal={form.destinoSucursal}
                ubicacion={form.destinoUbicacion}
                onSucursalChange={(value) => setForm((prev) => ({ ...prev, destinoSucursal: value, destinoUbicacion: "" }))}
                onUbicacionChange={(value) => setForm((prev) => ({ ...prev, destinoUbicacion: value }))}
                disabled={!esSuperadmin && Boolean(perfil?.id_sucursal)}
              />
            </div>

            {!esSuperadmin && (
              <p className="text-xs text-subtitle mb-4">
                Tu perfil está limitado a su sucursal; los traslados entre sucursales requieren acceso de superadmin.
              </p>
            )}

            <div className="flex flex-col gap-2 mb-4">
              <label className="text-sm font-medium" htmlFor="motivo-transferencia">Motivo *</label>
              <input
                id="motivo-transferencia"
                type="text"
                minLength={3}
                value={form.motivo}
                onChange={(event) => setForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Ej.: Reabastecimiento de sucursal"
                className="bg-input border border-secondary rounded-lg p-3"
              />
            </div>

            <div className="flex flex-col gap-3 mb-4 bg-secondary/30 p-4 rounded-xl border border-secondary">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="codigo-lote-transferencia">
                  <Barcode size={16} className="inline mr-1" /> Escanear código de lote
                </label>
                <input
                  id="codigo-lote-transferencia"
                  type="text"
                  value={codigoLoteSel}
                  onChange={(event) => {
                    setCodigoLoteSel(event.target.value);
                    setIdLoteSel("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      seleccionarLotePorCodigo();
                    }
                  }}
                  placeholder="Ej.: LT-123"
                  disabled={!form.origenUbicacion || cargandoLotes}
                  className="bg-input border border-secondary rounded-lg p-2"
                />
              </div>
              <div className="flex flex-col md:flex-row gap-2 items-end">
                <div className="flex flex-col gap-2 flex-1 w-full">
                  <label className="text-sm font-medium flex items-center gap-1" htmlFor="lote-transferencia">
                    <PackageSearch size={16} /> Lote disponible
                  </label>
                  <select
                    id="lote-transferencia"
                    value={idLoteSel}
                    onChange={(event) => {
                      const lote = lotesDisponibles.find((item) => String(item.id_lote) === event.target.value);
                      setIdLoteSel(event.target.value);
                      setCodigoLoteSel(lote?.codigo_lote || "");
                    }}
                    disabled={!form.origenUbicacion || cargandoLotes}
                    className="bg-input border border-secondary rounded-lg p-2"
                  >
                    <option value="">
                      {!form.origenUbicacion
                        ? "Seleccione primero la ubicación de origen"
                        : cargandoLotes
                          ? "Cargando lotes..."
                          : lotesDisponibles.length
                            ? "Seleccione un lote"
                            : "No hay lotes con existencias en esta ubicación"}
                    </option>
                    {lotesDisponibles.map((lote) => (
                      <option key={lote.id_lote} value={lote.id_lote}>
                        {lote.codigo_lote} — {lote.sku} {lote.producto} ({lote.cantidad_disponible.toFixed(3)} disp.)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-32">
                  <label className="text-sm font-medium" htmlFor="cantidad-transferencia">Cantidad</label>
                  <input
                    id="cantidad-transferencia"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={cantSel}
                    onChange={(event) => setCantSel(event.target.value)}
                    className="bg-input border border-secondary rounded-lg p-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={agregarLinea}
                  disabled={cargandoLotes || !idLoteSel}
                  className="bg-button text-button p-2 rounded-lg flex items-center gap-1 hover:opacity-90 transition h-10 disabled:opacity-50"
                >
                  <Plus size={18} /> Agregar
                </button>
              </div>
            </div>

            {lineas.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="text-title w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-secondary/50 text-subtitle">
                      <th className="py-2 px-2 text-left">Producto</th>
                      <th className="py-2 px-2 text-left">Lote</th>
                      <th className="py-2 px-2 text-center">Disponible</th>
                      <th className="py-2 px-2 text-center">Cantidad</th>
                      <th className="py-2 px-2 text-center">Quitar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((linea) => (
                      <tr key={linea.id_lote} className="border-t border-secondary">
                        <td className="py-2 px-2">{linea.sku} — {linea.nombre}</td>
                        <td className="py-2 px-2">
                          {linea.codigo_lote}
                          {linea.lote_proveedor ? <span className="block text-xs text-subtitle">Proveedor: {linea.lote_proveedor}</span> : null}
                          {linea.fecha_vencimiento ? <span className="block text-xs text-subtitle">Vence: {linea.fecha_vencimiento}</span> : null}
                        </td>
                        <td className="py-2 px-2 text-center">{linea.cantidad_disponible.toFixed(3)}</td>
                        <td className="py-2 px-2 text-center">{linea.cantidad.toFixed(3)}</td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => setLineas((prev) => prev.filter((item) => item.id_lote !== linea.id_lote))}
                            className="text-red-400 hover:text-red-300"
                            aria-label={`Quitar lote ${linea.codigo_lote}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="cursor-pointer bg-secondary border border-secondary font-semibold py-2 px-6 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="cursor-pointer bg-button text-button font-semibold py-2 px-4 rounded-lg flex gap-2 items-center disabled:opacity-50"
              >
                {guardando ? "Registrando..." : "Registrar transferencia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectorUbicacion({
  label,
  sucursales,
  ubicaciones,
  sucursal,
  ubicacion,
  onSucursalChange,
  onUbicacionChange,
  disabled = false,
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium">{label} *</label>
      <select
        value={sucursal}
        onChange={(event) => onSucursalChange(event.target.value)}
        disabled={disabled}
        className="bg-input border border-secondary rounded-lg p-3 disabled:opacity-60"
      >
        <option value="">Seleccione sucursal</option>
        {sucursales.map((item) => (
          <option key={item.id_sucursal} value={item.id_sucursal}>{item.nombre}</option>
        ))}
      </select>
      <select
        value={ubicacion}
        onChange={(event) => onUbicacionChange(event.target.value)}
        disabled={!sucursal || ubicaciones.length === 0}
        className="bg-input border border-secondary rounded-lg p-3 disabled:opacity-60"
      >
        <option value="">Seleccione ubicación</option>
        {ubicaciones.map((item) => (
          <option key={item.id_ubicacion} value={item.id_ubicacion}>
            {item.codigo} — {item.nombre}
          </option>
        ))}
      </select>
      {sucursal && ubicaciones.length === 0 && (
        <span className="text-xs text-subtitle">Esta sucursal no tiene ubicaciones activas disponibles.</span>
      )}
    </div>
  );
}
