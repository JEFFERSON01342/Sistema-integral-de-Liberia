import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Check, CircleDollarSign, FilePlus2, Save, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../../supabase/supabaseclient";
import { fmtCordoba } from "../../utils/nominaNicaragua";

const fechaLocal = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const CAUSAS = [
  ["despido_sin_causa", "Despido sin causa (estimación de indemnización)"],
  ["despido_con_causa", "Despido con causa"],
  ["renuncia", "Renuncia"],
  ["mutuo_acuerdo", "Mutuo acuerdo"],
  ["vencimiento_contrato", "Vencimiento de contrato"],
  ["otro", "Otro"],
];

const FORM_INICIAL = {
  id_empleado: "",
  fecha_terminacion: fechaLocal(),
  causa_terminacion: "despido_sin_causa",
  salario_pendiente: "",
  dias_vacaciones_pendientes: "",
  aguinaldo_estimado: "",
  otros_ingresos: "",
  otros_descuentos: "",
  ajuste_indemnizacion: "0",
  justificacion_ajuste: "",
};

export default function LiquidacionesLaborales({ empresaId, idSucursalFiltro, empleados, rol }) {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [modalPago, setModalPago] = useState(null);
  const [pagoForm, setPagoForm] = useState({ monto: "", metodo: "Efectivo", fecha: fechaLocal(), cuenta: "", concepto: "Pago de liquidación laboral" });
  const [accion, setAccion] = useState(null);
  const esAdmin = ["superadmin", "admin"].includes(rol);
  const empleadosActivos = useMemo(
    () => empleados.filter((empleado) => empleado.estado === "Activo"),
    [empleados]
  );
  const empleadoSeleccionado = empleadosActivos.find(
    (empleado) => String(empleado.id_empleado) === form.id_empleado
  );
  const cuentasPago = cuentas.filter((cuenta) =>
    pagoForm.metodo === "Efectivo" ? cuenta.es_efectivo : cuenta.es_banco
  );

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true);
    const [liquidacionesRes, pagosRes, cuentasRes] = await Promise.all([
      supabase
        .from("liquidaciones_laborales")
        .select("*")
        .eq("id_empresa", empresaId)
        .order("created_at", { ascending: false }),
      supabase
        .from("pagos_liquidacion")
        .select("id_liquidacion, monto, id_comprobante_pago")
        .eq("id_empresa", empresaId),
      supabase
        .from("cuentas_contables")
        .select("id_cuenta, codigo, nombre, es_banco, es_efectivo")
        .eq("id_empresa", empresaId)
        .eq("activa", true)
        .eq("naturaleza", "ACTIVO")
        .eq("es_grupo", false)
        .eq("permite_movimientos", true)
        .or("es_banco.eq.true,es_efectivo.eq.true")
        .order("codigo", { ascending: true }),
    ]);
    const error = liquidacionesRes.error || pagosRes.error || cuentasRes.error;
    if (error) {
      toast.error(`No se pudo cargar el módulo de liquidaciones: ${error.message}`);
    } else {
      let rows = liquidacionesRes.data || [];
      if (idSucursalFiltro) rows = rows.filter((row) => row.id_sucursal === idSucursalFiltro);
      setLiquidaciones(rows);
      setPagos(pagosRes.data || []);
      setCuentas(cuentasRes.data || []);
    }
    setCargando(false);
  }, [empresaId, idSucursalFiltro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPagado = (id) => pagos
    .filter((pago) => pago.id_liquidacion === id)
    .reduce((total, pago) => total + Number(pago.monto), 0);

  const crearBorrador = async (event) => {
    event.preventDefault();
    if (!empleadoSeleccionado?.fecha_ingreso) {
      toast.error("El empleado debe tener registrada su fecha de ingreso.");
      return;
    }
    if (Number(form.ajuste_indemnizacion) !== 0 && !form.justificacion_ajuste.trim()) {
      toast.error("Justifique el ajuste manual de indemnización.");
      return;
    }
    setGuardando(true);
    try {
      const { error } = await supabase.rpc("crear_liquidacion_laboral", {
        p_id_empleado: Number(form.id_empleado),
        p_fecha_terminacion: form.fecha_terminacion,
        p_causa_terminacion: form.causa_terminacion,
        p_salario_pendiente: Number(form.salario_pendiente) || 0,
        p_dias_vacaciones_pendientes: Number(form.dias_vacaciones_pendientes) || 0,
        p_aguinaldo_estimado: Number(form.aguinaldo_estimado) || 0,
        p_otros_ingresos: Number(form.otros_ingresos) || 0,
        p_otros_descuentos: Number(form.otros_descuentos) || 0,
        p_ajuste_indemnizacion: Number(form.ajuste_indemnizacion) || 0,
        p_justificacion_ajuste: form.justificacion_ajuste.trim() || null,
      });
      if (error) throw error;
      toast.success("Borrador de liquidación creado. Revise las cifras y causal antes de aprobar.");
      setForm(FORM_INICIAL);
      setFormAbierto(false);
      await cargar();
    } catch (error) {
      toast.error(`No se pudo crear el borrador: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const ejecutarAccion = async (id, nombre, params = {}) => {
    setAccion({ id, nombre });
    try {
      const { error } = await supabase.rpc(nombre, params);
      if (error) throw error;
      toast.success(nombre === "aprobar_liquidacion_laboral"
        ? "Liquidación aprobada y empleado marcado como terminado."
        : nombre === "contabilizar_liquidacion"
          ? "Devengo de liquidación contabilizado."
          : nombre === "anular_liquidacion_laboral"
            ? "Borrador anulado."
            : "Pagos de liquidación contabilizados.");
      await cargar();
    } catch (error) {
      toast.error(`No se pudo completar la acción: ${error.message}`);
    } finally {
      setAccion(null);
    }
  };

  const registrarPago = async (event) => {
    event.preventDefault();
    if (!modalPago) return;
    setGuardando(true);
    try {
      const saldo = Number(modalPago.total_neto_estimado) - totalPagado(modalPago.id);
      const { error } = await supabase.rpc("registrar_pago_liquidacion", {
        p_id_liquidacion: modalPago.id,
        p_monto: Number(pagoForm.monto),
        p_metodo: pagoForm.metodo,
        p_fecha_pago: pagoForm.fecha,
        p_id_cuenta_pago: Number(pagoForm.cuenta),
        p_concepto: pagoForm.concepto.trim() || "Pago de liquidación laboral",
      });
      if (error) throw error;
      toast.success(`Pago registrado. Saldo anterior: ${fmtCordoba(saldo)}.`);
      setModalPago(null);
      await cargar();
    } catch (error) {
      toast.error(`No se pudo registrar el pago: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const abrirPago = (liquidacion) => {
    setPagoForm({
      monto: Math.max(0, Number(liquidacion.total_neto_estimado) - totalPagado(liquidacion.id)).toFixed(2),
      metodo: "Efectivo",
      fecha: fechaLocal(),
      cuenta: "",
      concepto: "Pago de liquidación laboral",
    });
    setModalPago(liquidacion);
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h3 className="text-xl font-bold text-title">Liquidaciones y finiquitos</h3>
          <p className="text-sm text-subtitle">Borradores estimados; requieren revisión legal y aprobación administrativa.</p>
        </div>
        <button
          onClick={() => setFormAbierto((abierto) => !abierto)}
          className="flex items-center gap-2 rounded-lg bg-button px-4 py-2 text-button"
        >
          {formAbierto ? <X size={16} /> : <FilePlus2 size={16} />}
          {formAbierto ? "Cerrar" : "Nuevo borrador"}
        </button>
      </header>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
        La estimación de indemnización usa una fórmula provisional de antigüedad y salario diario de salario mensual ÷ 30. Vacaciones pendientes y aguinaldo se capturan manualmente. No es asesoría legal ni debe pagarse sin reconciliar nóminas, prestaciones ya pagadas y normativa vigente.
      </div>

      {formAbierto && (
        <form onSubmit={crearBorrador} className="grid gap-4 rounded-xl border border-secondary p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm sm:col-span-2 lg:col-span-3">
            Empleado activo
            <select required value={form.id_empleado} onChange={(e) => setForm({ ...form, id_empleado: e.target.value })} className="rounded-lg border border-secondary bg-input p-3">
              <option value="">Seleccione…</option>
              {empleadosActivos.map((empleado) => (
                <option key={empleado.id_empleado} value={empleado.id_empleado}>
                  {empleado.nombre_completo} — ingreso {empleado.fecha_ingreso || "sin fecha"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Fecha de terminación
            <input required type="date" value={form.fecha_terminacion} onChange={(e) => setForm({ ...form, fecha_terminacion: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            Causal
            <select value={form.causa_terminacion} onChange={(e) => setForm({ ...form, causa_terminacion: e.target.value })} className="rounded-lg border border-secondary bg-input p-3">
              {CAUSAS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Salario pendiente (C$)
            <input type="number" min="0" step="0.01" value={form.salario_pendiente} onChange={(e) => setForm({ ...form, salario_pendiente: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Días de vacaciones pendientes
            <input type="number" min="0" step="0.01" value={form.dias_vacaciones_pendientes} onChange={(e) => setForm({ ...form, dias_vacaciones_pendientes: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Aguinaldo proporcional estimado (C$)
            <input type="number" min="0" step="0.01" value={form.aguinaldo_estimado} onChange={(e) => setForm({ ...form, aguinaldo_estimado: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Otros ingresos (C$)
            <input type="number" min="0" step="0.01" value={form.otros_ingresos} onChange={(e) => setForm({ ...form, otros_ingresos: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Otras deducciones (C$)
            <input type="number" min="0" step="0.01" value={form.otros_descuentos} onChange={(e) => setForm({ ...form, otros_descuentos: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Ajuste de indemnización (+/− C$)
            <input type="number" step="0.01" value={form.ajuste_indemnizacion} onChange={(e) => setForm({ ...form, ajuste_indemnizacion: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm sm:col-span-2 lg:col-span-3">
            Justificación del ajuste
            <textarea value={form.justificacion_ajuste} onChange={(e) => setForm({ ...form, justificacion_ajuste: e.target.value })} rows={2} className="rounded-lg border border-secondary bg-input p-3" />
          </label>
          {empleadoSeleccionado && (
            <p className="text-xs text-subtitle sm:col-span-2 lg:col-span-3">
              Salario mensual de referencia: {fmtCordoba(empleadoSeleccionado.salario_mensual)}. La causal, salario base y montos requieren verificación antes de aprobación.
            </p>
          )}
          <div className="flex justify-end sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={guardando || !empleadoSeleccionado} className="flex items-center gap-2 rounded-lg bg-button px-4 py-2 text-button disabled:opacity-50">
              <Save size={16} /> {guardando ? "Guardando…" : "Crear borrador"}
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p className="p-5 text-center text-subtitle">Cargando liquidaciones…</p>
      ) : liquidaciones.length === 0 ? (
        <p className="p-5 text-center text-subtitle">No hay liquidaciones registradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm text-title">
            <thead className="bg-secondary/10 text-xs text-subtitle">
              <tr>
                <th className="p-3 text-left">Empleado</th>
                <th className="p-3 text-center">Terminación</th>
                <th className="p-3 text-left">Causal</th>
                <th className="p-3 text-right">Bruto estimado</th>
                <th className="p-3 text-right">Neto estimado</th>
                <th className="p-3 text-right">Pagado</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {liquidaciones.map((row) => {
                const empleado = empleados.find((item) => item.id_empleado === row.id_empleado);
                const pagado = totalPagado(row.id);
                return (
                  <tr key={row.id} className="border-t border-secondary">
                    <td className="p-3">{empleado?.nombre_completo || `Empleado #${row.id_empleado}`}</td>
                    <td className="p-3 text-center">{new Date(`${row.fecha_terminacion}T00:00:00`).toLocaleDateString("es-NI")}</td>
                    <td className="p-3">{CAUSAS.find(([value]) => value === row.causa_terminacion)?.[1] || row.causa_terminacion}</td>
                    <td className="p-3 text-right">{fmtCordoba(row.total_bruto_estimado)}</td>
                    <td className="p-3 text-right font-semibold">{fmtCordoba(row.total_neto_estimado)}</td>
                    <td className="p-3 text-right">{fmtCordoba(pagado)}</td>
                    <td className="p-3 text-center capitalize">{row.estado}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-center gap-2">
                        {row.estado === "borrador" && esAdmin && (
                          <>
                            <button
                              onClick={() => ejecutarAccion(row.id, "aprobar_liquidacion_laboral", { p_id_liquidacion: row.id, p_confirmar_revision: true })}
                              disabled={Boolean(accion)}
                              title="Confirmo que revisé y ajusté el cálculo con RR. HH./asesoría"
                              className="inline-flex items-center gap-1 rounded border border-secondary px-2 py-1 text-xs disabled:opacity-50"
                            >
                              <Check size={13} /> Aprobar
                            </button>
                            <button
                              onClick={() => ejecutarAccion(row.id, "anular_liquidacion_laboral", { p_id_liquidacion: row.id })}
                              disabled={Boolean(accion)}
                              className="inline-flex items-center gap-1 rounded border border-secondary px-2 py-1 text-xs disabled:opacity-50"
                            >
                              <X size={13} /> Anular
                            </button>
                          </>
                        )}
                        {["aprobada", "pagada"].includes(row.estado) && !row.id_comprobante_liquidacion && esAdmin && (
                          <button
                            onClick={() => ejecutarAccion(row.id, "contabilizar_liquidacion", { p_id_liquidacion: row.id })}
                            disabled={Boolean(accion)}
                            className="rounded border border-secondary px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {accion?.id === row.id && accion.nombre === "contabilizar_liquidacion" ? "Contabilizando…" : "Contabilizar devengo"}
                          </button>
                        )}
                        {row.id_comprobante_liquidacion && (
                          <span className="text-xs text-subtitle">Devengo #{row.id_comprobante_liquidacion}</span>
                        )}
                        {row.estado === "aprobada" && row.id_comprobante_liquidacion && pagado < Number(row.total_neto_estimado) && (
                          <button onClick={() => abrirPago(row)} className="inline-flex items-center gap-1 rounded border border-secondary px-2 py-1 text-xs">
                            <CircleDollarSign size={13} /> Registrar pago
                          </button>
                        )}
                        {pagado > 0 && row.id_comprobante_liquidacion && esAdmin && (
                          <button
                            onClick={() => ejecutarAccion(row.id, "contabilizar_pagos_liquidacion", { p_id_liquidacion: row.id })}
                            disabled={Boolean(accion)}
                            className="rounded border border-secondary px-2 py-1 text-xs disabled:opacity-50"
                          >
                            Contabilizar pagos
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalPago && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <button aria-label="Cerrar" className="absolute inset-0" onClick={() => setModalPago(null)} />
          <form onSubmit={registrarPago} className="relative grid w-full max-w-lg gap-4 rounded-2xl border border-secondary bg-primary p-6 text-title">
            <h4 className="text-xl font-semibold">Registrar pago de liquidación</h4>
            <p className="text-sm text-subtitle">Saldo pendiente: {fmtCordoba(Number(modalPago.total_neto_estimado) - totalPagado(modalPago.id))}</p>
            <label className="flex flex-col gap-2 text-sm">Monto
              <input required type="number" min="0.01" max={Number(modalPago.total_neto_estimado) - totalPagado(modalPago.id)} step="0.01" value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
            </label>
            <label className="flex flex-col gap-2 text-sm">Método
              <select value={pagoForm.metodo} onChange={(e) => setPagoForm({ ...pagoForm, metodo: e.target.value, cuenta: "" })} className="rounded-lg border border-secondary bg-input p-3">
                <option>Efectivo</option>
                <option>Transferencia</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">Cuenta de salida
              <select required value={pagoForm.cuenta} onChange={(e) => setPagoForm({ ...pagoForm, cuenta: e.target.value })} className="rounded-lg border border-secondary bg-input p-3">
                <option value="">Seleccione…</option>
                {cuentasPago.map((cuenta) => <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>{cuenta.codigo} — {cuenta.nombre}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">Fecha de pago
              <input required type="date" value={pagoForm.fecha} onChange={(e) => setPagoForm({ ...pagoForm, fecha: e.target.value })} className="rounded-lg border border-secondary bg-input p-3" />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setModalPago(null)} className="rounded-lg border border-secondary px-4 py-2">Cancelar</button>
              <button type="submit" disabled={guardando || !cuentasPago.length} className="rounded-lg bg-button px-4 py-2 text-button disabled:opacity-50">
                <Calendar size={14} className="mr-1 inline" />{guardando ? "Registrando…" : "Registrar pago"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
