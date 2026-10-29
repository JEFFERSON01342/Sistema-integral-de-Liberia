import { useState, useMemo } from "react";
import { Printer, Clock, CheckCircle2, DollarSign, Phone, Download, FileText, Palette } from "lucide-react";
import { format } from "date-fns/format";
import Swal from "sweetalert2";
import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import { useImpresiones } from "../hooks/useImpresiones";

// IDs de los productos-servicio creados en el catálogo (categoría "Servicios").
const PRODUCTO_IMPRESION_BN = 7;
const PRODUCTO_IMPRESION_COLOR = 8;

const ESTADO_BADGE = {
  Pendiente: "bg-yellow-500/20 text-yellow-500",
  Listo: "bg-green-500/20 text-green-400",
  Entregado: "bg-emerald-600/20 text-emerald-400",
  Rechazado: "bg-red-500/20 text-red-400",
};

export default function Impresiones() {
  const { trabajos, isLoading, error, getDownloadUrl, cambiarEstado, cobrarImpresion } = useImpresiones();
  const [activeTab, setActiveTab] = useState("activos");
  const [busqueda, setBusqueda] = useState("");

  const tabs = [
    { key: "activos", label: "Activos", icon: <Clock size={16} /> },
    { key: "historial", label: "Historial", icon: <CheckCircle2 size={16} /> },
  ];

  const { pendientes, totalImpresiones } = useMemo(() => {
    const pend = trabajos.filter((t) => t.estado === "Pendiente").length;
    const total = trabajos
      .filter((t) => ["Listo", "Entregado"].includes(t.estado))
      .reduce((s, t) => s + Number(t.precio_estimado || 0), 0);
    return { pendientes: pend, totalImpresiones: total };
  }, [trabajos]);

  const visibles = useMemo(() => {
    let base;
    if (activeTab === "activos") base = trabajos.filter((t) => ["Pendiente", "Listo"].includes(t.estado));
    else base = trabajos.filter((t) => ["Entregado", "Rechazado"].includes(t.estado));
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter((t) =>
      (t.numero_orden || "").toLowerCase().includes(q) ||
      (t.nombre_cliente || "").toLowerCase().includes(q) ||
      (t.telefono || "").toLowerCase().includes(q)
    );
  }, [trabajos, activeTab, busqueda]);

  const handleDescargar = async (trabajo) => {
    const url = await getDownloadUrl(trabajo.storage_path);
    if (url) {
      window.open(url, "_blank");
    } else {
      Swal.fire({ title: "Sin archivo", text: "No se pudo generar el enlace de descarga.", icon: "warning" });
    }
  };

  const handleImprimir = async (trabajo) => {
    const confirm = await Swal.fire({
      title: "¿Registrar impresión?",
      html: `Se registrará el cobro de <b>C$${Number(trabajo.precio_estimado || 0).toFixed(2)}</b> (${trabajo.copias} copia(s) ${trabajo.modo_color === "color" ? "a color" : "B/N"}) y el trabajo pasará a <b>Listo</b>.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, registrar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#16a34a",
      cancelButtonColor: "#6b7280",
    });
    if (!confirm.isConfirmed) return;

    const idProducto = trabajo.modo_color === "color" ? PRODUCTO_IMPRESION_COLOR : PRODUCTO_IMPRESION_BN;
    const res = await cobrarImpresion(trabajo, idProducto);
    if (res) {
      Swal.fire({ title: "¡Registrado!", text: "Cobro de impresión registrado.", icon: "success", timer: 1500, showConfirmButton: false });
    } else {
      Swal.fire({ title: "Error", text: error || "No se pudo registrar el cobro.", icon: "error" });
    }
  };

  const handleRechazar = async (trabajo) => {
    const confirm = await Swal.fire({
      title: "¿Rechazar trabajo?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, rechazar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
    });
    if (!confirm.isConfirmed) return;
    await cambiarEstado(trabajo.id_trabajo, "Rechazado");
  };

  const handleEntregar = async (trabajo) => {
    await cambiarEstado(trabajo.id_trabajo, "Entregado");
    Swal.fire({ title: "Entregado", icon: "success", timer: 1200, showConfirmButton: false });
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatsCards title="Trabajos" icon={<Printer className="text-title" />} value={trabajos.length} />
        <StatsCards title="Pendientes" icon={<Clock color="#eab308" />} value={pendientes} />
        <StatsCards title="Ingresos Impresión" icon={<DollarSign className="text-title" />} value={`C$${totalImpresiones.toFixed(2)}`} />
        <StatsCards title="En vista" icon={<FileText className="text-title" />} value={visibles.length} />
      </div>

      <div className="mt-6">
        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
        <div className="mt-8 border border-secondary rounded-2xl p-5">
          <div className="flex flex-col gap-1 mb-6">
            <h3 className="text-title text-xl font-bold">Trabajos de Impresión</h3>
            <p className="text-subtitle text-s">Archivos enviados por los clientes para imprimir o copiar.</p>
          </div>

          <div className="mb-6">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° de orden (I-0001), nombre o teléfono..."
              className="w-full md:max-w-md bg-secondary/40 border border-secondary rounded-lg px-4 py-2 text-title text-sm outline-none focus:border-title/60"
            />
          </div>

          {isLoading ? (
            <p className="text-center text-subtitle p-6">Cargando trabajos...</p>
          ) : visibles.length === 0 ? (
            <p className="text-center text-subtitle p-6">No hay trabajos en esta vista.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {visibles.map((t) => (
                <div key={t.id_trabajo} className="border border-secondary rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-title font-bold">Orden {t.numero_orden || `I-${String(t.id_trabajo).padStart(4, "0")}`}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_BADGE[t.estado] || "bg-secondary text-subtitle"}`}>{t.estado}</span>
                      </div>
                      <span className="text-subtitle text-sm">{t.created_at ? format(new Date(t.created_at), "dd/MM/yyyy HH:mm") : ""}</span>
                    </div>
                    <span className="text-title text-lg font-bold">C${Number(t.precio_estimado || 0).toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-subtitle">
                    <span className="text-title font-medium">{t.nombre_cliente || "Cliente"}</span>
                    <span className="flex items-center gap-1"><Phone size={14} /> {t.telefono || "—"}</span>
                    <span className="flex items-center gap-1">
                      <Palette size={14} /> {t.modo_color === "color" ? "A color" : "Blanco y negro"} · {t.copias} copia(s) · {t.tamano_papel || "Carta"}
                    </span>
                    <span className="flex items-center gap-1"><FileText size={14} /> {t.archivo_nombre || "archivo"}</span>
                  </div>

                  {t.notas && <p className="text-subtitle text-sm italic">Nota: {t.notas}</p>}

                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => handleDescargar(t)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 cursor-pointer flex items-center gap-1">
                      <Download size={14} /> Descargar archivo
                    </button>
                    {t.estado === "Pendiente" && (
                      <>
                        <button onClick={() => handleRechazar(t)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer">Rechazar</button>
                        <button onClick={() => handleImprimir(t)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-600/20 text-green-400 hover:bg-green-600/30 cursor-pointer">Imprimir y cobrar</button>
                      </>
                    )}
                    {t.estado === "Listo" && (
                      <button onClick={() => handleEntregar(t)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 cursor-pointer">Marcar entregado</button>
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
