import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../../supabase/supabaseclient";

const CAMPOS_CUENTAS = [
  { name: "cuenta_gasto_salarios", label: "Gasto por salarios y otros ingresos", naturaleza: "GASTO" },
  { name: "cuenta_gasto_inss_patronal", label: "Gasto por INSS patronal", naturaleza: "GASTO" },
  { name: "cuenta_gasto_inatec", label: "Gasto por INATEC", naturaleza: "GASTO" },
  { name: "cuenta_gasto_aguinaldo", label: "Gasto por provisión de aguinaldo", naturaleza: "GASTO" },
  { name: "cuenta_gasto_vacaciones", label: "Gasto por provisión de vacaciones", naturaleza: "GASTO" },
  { name: "cuenta_gasto_indemnizacion", label: "Gasto por indemnización laboral", naturaleza: "GASTO" },
  { name: "cuenta_pasivo_salarios", label: "Salarios netos por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_inss_laboral", label: "INSS laboral retenido por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_ir", label: "IR retenido por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_otras_deducciones", label: "Otras deducciones por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_inss_patronal", label: "INSS patronal por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_inatec", label: "INATEC por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_aguinaldo", label: "Aguinaldo provisionado por pagar", naturaleza: "PASIVO" },
  { name: "cuenta_pasivo_vacaciones", label: "Vacaciones provisionadas por pagar", naturaleza: "PASIVO" },
];

export default function ConfiguracionContableNomina({ empresaId, onClose }) {
  const [cuentas, setCuentas] = useState([]);
  const [form, setForm] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      const [cuentasRes, configRes] = await Promise.all([
        supabase
          .from("cuentas_contables")
          .select("id_cuenta, codigo, nombre, naturaleza")
          .eq("id_empresa", empresaId)
          .eq("activa", true)
          .eq("es_grupo", false)
          .eq("permite_movimientos", true)
          .order("codigo", { ascending: true }),
        supabase
          .from("configuracion_nomina_contable")
          .select("*")
          .eq("id_empresa", empresaId)
          .maybeSingle(),
      ]);
      if (cuentasRes.error || configRes.error) {
        const error = cuentasRes.error || configRes.error;
        toast.error(`No se pudo cargar la configuración contable: ${error.message}`);
      } else {
        setCuentas(cuentasRes.data || []);
        setForm(Object.fromEntries(
          CAMPOS_CUENTAS.map((campo) => [campo.name, configRes.data?.[campo.name] || ""])
        ));
      }
      setCargando(false);
    };
    cargar();
  }, [empresaId]);

  const cuentasPorNaturaleza = useMemo(() => ({
    GASTO: cuentas.filter((cuenta) => cuenta.naturaleza === "GASTO"),
    PASIVO: cuentas.filter((cuenta) => cuenta.naturaleza === "PASIVO"),
  }), [cuentas]);

  const guardar = async (e) => {
    e.preventDefault();
    const faltante = CAMPOS_CUENTAS.find((campo) => !form[campo.name]);
    if (faltante) {
      toast.error(`Seleccione la cuenta: ${faltante.label}.`);
      return;
    }

    setGuardando(true);
    try {
      const { error } = await supabase
        .from("configuracion_nomina_contable")
        .upsert({
          id_empresa: empresaId,
          ...Object.fromEntries(CAMPOS_CUENTAS.map((campo) => [campo.name, Number(form[campo.name])])),
        }, { onConflict: "id_empresa" });
      if (error) throw error;
      toast.success("Configuración contable de nómina guardada.");
      onClose();
    } catch (error) {
      toast.error(`No se pudo guardar la configuración: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <button aria-label="Cerrar" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-secondary bg-primary p-6 text-title shadow-lg">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Cuentas contables de nómina</h3>
            <p className="mt-1 text-sm text-subtitle">Se usan al contabilizar salarios, retenciones, obligaciones y provisiones.</p>
          </div>
          <button onClick={onClose} className="text-subtitle hover:text-title" aria-label="Cerrar"><X /></button>
        </div>
        {cargando ? (
          <p className="py-8 text-center text-subtitle">Cargando cuentas...</p>
        ) : (
          <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
            {CAMPOS_CUENTAS.map((campo) => (
              <label key={campo.name} className="flex flex-col gap-2 text-sm">
                <span>{campo.label}</span>
                <select
                  required
                  value={form[campo.name] || ""}
                  onChange={(e) => setForm((current) => ({ ...current, [campo.name]: e.target.value }))}
                  className="rounded-lg border border-secondary bg-input p-3"
                >
                  <option value="">Seleccione una cuenta {campo.naturaleza.toLowerCase()}...</option>
                  {cuentasPorNaturaleza[campo.naturaleza].map((cuenta) => (
                    <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                      {cuenta.codigo} — {cuenta.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="mt-2 flex justify-end gap-3 sm:col-span-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-secondary bg-secondary px-5 py-2">Cancelar</button>
              <button type="submit" disabled={guardando} className="flex items-center gap-2 rounded-lg bg-button px-5 py-2 text-button disabled:opacity-60">
                <Save size={16} /> {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}
