import { useState, useEffect, useCallback } from "react";
import { Settings, Percent, ListChecks, Save, Landmark, Plus, X } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import Tabs from "../components/tabs";
import { toast } from "react-hot-toast";

const TIPOS_IMPUESTO = ["IVA", "RETENCION", "OTRO"];

const impuestoVacio = (empresaId) => ({
    id_empresa: empresaId,
    codigo: "",
    nombre: "",
    tipo: "IVA",
    tasa_porcentual: "",
    cuenta_impuesto_por_pagar: "",
    cuenta_impuesto_acreditable: "",
    vigente_desde: new Date().toISOString().slice(0, 10),
    vigente_hasta: "",
    solo_simulacion: true,
    activo: true,
});

export default function ConfigContable() {
    const { empresaId } = useEmpresa();
    const { rol } = useAuth();
    const puedeEditar = ["superadmin", "admin", "gerente"].includes(rol);
    const tabs = [
        { key: "reglas", label: "Reglas Contables", icon: <ListChecks size={16} /> },
        { key: "impuestos", label: "Impuestos", icon: <Percent size={16} /> },
    ];
    const [activeTab, setActiveTab] = useState("reglas");
    const [reglas, setReglas] = useState([]);
    const [lineasRegla, setLineasRegla] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [impuestos, setImpuestos] = useState([]);
    const [impuestoEditando, setImpuestoEditando] = useState(null);
    const [loading, setLoading] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        try {
            const [reglasResult, lineasResult, cuentasResult, impuestosResult] = await Promise.all([
                supabase.from("reglas_contables")
                    .select("id_regla, evento, nombre, activa")
                    .eq("id_empresa", empresaId)
                    .order("evento"),
                supabase.from("reglas_contables_lineas")
                    .select("id_linea_regla, id_regla, componente, lado, id_cuenta")
                    .eq("id_empresa", empresaId)
                    .order("id_linea_regla"),
                supabase.from("cuentas_contables")
                    .select("id_cuenta, codigo, nombre, activa")
                    .eq("id_empresa", empresaId)
                    .order("codigo"),
                supabase.from("impuestos_config")
                    .select("*")
                    .eq("id_empresa", empresaId)
                    .order("vigente_desde", { ascending: false }),
            ]);
            const error = reglasResult.error || lineasResult.error || cuentasResult.error || impuestosResult.error;
            if (error) throw error;
            setReglas(reglasResult.data || []);
            setLineasRegla(lineasResult.data || []);
            setCuentas(cuentasResult.data || []);
            setImpuestos(impuestosResult.data || []);
        } catch (error) {
            console.error("Error cargando configuración contable:", error);
            toast.error(`No se pudo cargar la configuración contable: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    const guardarLineaRegla = async (linea, cambios) => {
        if (!puedeEditar) return;
        const { error } = await supabase.from("reglas_contables_lineas")
            .update(cambios)
            .eq("id_empresa", empresaId)
            .eq("id_linea_regla", linea.id_linea_regla);
        if (error) {
            toast.error(`No se pudo actualizar la regla: ${error.message}`);
            return;
        }
        setLineasRegla((actuales) => actuales.map((item) =>
            item.id_linea_regla === linea.id_linea_regla ? { ...item, ...cambios } : item
        ));
        toast.success("Regla contable actualizada.");
    };

    const cambiarEstadoRegla = async (regla) => {
        if (!puedeEditar) return;
        const { error } = await supabase.from("reglas_contables")
            .update({ activa: !regla.activa })
            .eq("id_empresa", empresaId)
            .eq("id_regla", regla.id_regla);
        if (error) {
            toast.error(`No se pudo actualizar el estado: ${error.message}`);
            return;
        }
        setReglas((actuales) => actuales.map((item) =>
            item.id_regla === regla.id_regla ? { ...item, activa: !regla.activa } : item
        ));
    };

    const guardarImpuesto = async (event) => {
        event.preventDefault();
        if (!puedeEditar || !impuestoEditando) return;
        const tasa = Number(impuestoEditando.tasa_porcentual);
        if (!impuestoEditando.codigo.trim() || !impuestoEditando.nombre.trim()) {
            toast.error("El código y nombre del impuesto son obligatorios.");
            return;
        }
        if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
            toast.error("La tasa debe estar entre 0 y 100.");
            return;
        }
        if (!impuestoEditando.vigente_desde) {
            toast.error("Indique desde cuándo está vigente el impuesto.");
            return;
        }
        const payload = {
            id_empresa: empresaId,
            codigo: impuestoEditando.codigo.trim(),
            nombre: impuestoEditando.nombre.trim(),
            tipo: impuestoEditando.tipo,
            tasa_porcentual: tasa,
            cuenta_impuesto_por_pagar: impuestoEditando.cuenta_impuesto_por_pagar
                ? Number(impuestoEditando.cuenta_impuesto_por_pagar) : null,
            cuenta_impuesto_acreditable: impuestoEditando.cuenta_impuesto_acreditable
                ? Number(impuestoEditando.cuenta_impuesto_acreditable) : null,
            vigente_desde: impuestoEditando.vigente_desde,
            vigente_hasta: impuestoEditando.vigente_hasta || null,
            solo_simulacion: Boolean(impuestoEditando.solo_simulacion),
            activo: Boolean(impuestoEditando.activo),
        };
        if (payload.vigente_hasta && payload.vigente_hasta < payload.vigente_desde) {
            toast.error("La fecha final no puede ser anterior a la fecha inicial.");
            return;
        }

        setGuardando(true);
        try {
            const result = impuestoEditando.id_impuesto
                ? await supabase.from("impuestos_config")
                    .update({
                        nombre: payload.nombre,
                        tipo: payload.tipo,
                        tasa_porcentual: payload.tasa_porcentual,
                        cuenta_impuesto_por_pagar: payload.cuenta_impuesto_por_pagar,
                        cuenta_impuesto_acreditable: payload.cuenta_impuesto_acreditable,
                        vigente_desde: payload.vigente_desde,
                        vigente_hasta: payload.vigente_hasta,
                        solo_simulacion: payload.solo_simulacion,
                        activo: payload.activo,
                    })
                    .eq("id_empresa", empresaId)
                    .eq("id_impuesto", impuestoEditando.id_impuesto)
                : await supabase.from("impuestos_config").insert(payload);
            if (result.error) throw result.error;
            toast.success("Impuesto guardado.");
            setImpuestoEditando(null);
            await cargar();
        } catch (error) {
            toast.error(`No se pudo guardar el impuesto: ${error.message}`);
        } finally {
            setGuardando(false);
        }
    };

    const lineasPorRegla = (idRegla) => lineasRegla.filter((linea) => linea.id_regla === idRegla);
    const cuentaNombre = (idCuenta) => {
        const cuenta = cuentas.find((item) => item.id_cuenta === idCuenta);
        return cuenta ? `${cuenta.codigo} · ${cuenta.nombre}` : "Cuenta no disponible";
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <Settings className="text-title" size={26} />
                <div>
                    <h1 className="text-title text-2xl font-bold">Configuración Contable</h1>
                    <p className="text-subtitle text-sm">Reglas para asientos automáticos y parámetros de impuestos.</p>
                </div>
            </div>

            <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

            {!puedeEditar && (
                <div className="erp-card p-3 text-sm text-subtitle">Solo lectura. Tu rol no permite editar la configuración contable.</div>
            )}

            {loading && <p className="text-subtitle">Cargando configuración…</p>}

            {activeTab === "reglas" && (
                <div className="flex flex-col gap-4">
                    {reglas.map((regla) => (
                        <section key={regla.id_regla} className="erp-card p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <div>
                                    <h2 className="text-title font-bold flex items-center gap-2"><Landmark size={16} /> {regla.nombre}</h2>
                                    <p className="text-subtitle text-xs">{regla.evento}</p>
                                </div>
                                {puedeEditar && (
                                    <button
                                        type="button"
                                        onClick={() => cambiarEstadoRegla(regla)}
                                        className="btn-secondary text-xs"
                                    >
                                        {regla.activa ? "Desactivar" : "Activar"}
                                    </button>
                                )}
                            </div>
                            {!regla.activa && <p className="text-xs text-amber-400 mb-2">Regla inactiva.</p>}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-subtitle text-left border-b border-secondary">
                                            <th className="py-2 pr-4">Componente</th>
                                            <th className="py-2 pr-4">Lado</th>
                                            <th className="py-2">Cuenta contable</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineasPorRegla(regla.id_regla).map((linea) => (
                                            <tr key={linea.id_linea_regla} className="border-b border-secondary/50">
                                                <td className="py-2 pr-4 text-title">{linea.componente}</td>
                                                <td className="py-2 pr-4">
                                                    <select
                                                        disabled={!puedeEditar}
                                                        value={linea.lado}
                                                        onChange={(e) => guardarLineaRegla(linea, { lado: e.target.value })}
                                                        className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5"
                                                    >
                                                        <option value="DEBE">Debe</option>
                                                        <option value="HABER">Haber</option>
                                                    </select>
                                                </td>
                                                <td className="py-2">
                                                    <select
                                                        disabled={!puedeEditar}
                                                        value={linea.id_cuenta}
                                                        onChange={(e) => guardarLineaRegla(linea, { id_cuenta: Number(e.target.value) })}
                                                        className="bg-input text-title border border-secondary rounded-lg px-3 py-1.5 min-w-[260px]"
                                                    >
                                                        {cuentas.map((cuenta) => (
                                                            <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>
                                                                {cuenta.codigo} · {cuenta.nombre}{cuenta.activa ? "" : " (inactiva)"}
                                                            </option>
                                                        ))}
                                                        {!cuentas.some((cuenta) => cuenta.id_cuenta === linea.id_cuenta) && (
                                                            <option value={linea.id_cuenta}>{cuentaNombre(linea.id_cuenta)}</option>
                                                        )}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                        {!lineasPorRegla(regla.id_regla).length && (
                                            <tr><td colSpan={3} className="py-3 text-subtitle">La regla no tiene componentes contables.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                    {!loading && reglas.length === 0 && (
                        <div className="erp-card p-6 text-center text-subtitle">
                            No hay reglas contables configuradas para esta empresa.
                        </div>
                    )}
                </div>
            )}

            {activeTab === "impuestos" && (
                <div className="flex flex-col gap-4">
                    <div className="flex justify-end">
                        {puedeEditar && !impuestoEditando && (
                            <button onClick={() => setImpuestoEditando(impuestoVacio(empresaId))} className="btn-primary">
                                <Plus size={16} /> Nuevo impuesto
                            </button>
                        )}
                    </div>
                    {impuestoEditando && (
                        <form onSubmit={guardarImpuesto} className="erp-card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Código
                                <input required disabled={Boolean(impuestoEditando.id_impuesto)} value={impuestoEditando.codigo}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, codigo: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Nombre
                                <input required value={impuestoEditando.nombre}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, nombre: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Tipo
                                <select value={impuestoEditando.tipo}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, tipo: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2">
                                    {TIPOS_IMPUESTO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Tasa (%)
                                <input required type="number" min="0" max="100" step="0.0001" value={impuestoEditando.tasa_porcentual}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, tasa_porcentual: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Cuenta por pagar
                                <select value={impuestoEditando.cuenta_impuesto_por_pagar || ""}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, cuenta_impuesto_por_pagar: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2">
                                    <option value="">Sin asignar</option>
                                    {cuentas.map((cuenta) => <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>{cuenta.codigo} · {cuenta.nombre}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Cuenta acreditable
                                <select value={impuestoEditando.cuenta_impuesto_acreditable || ""}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, cuenta_impuesto_acreditable: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2">
                                    <option value="">Sin asignar</option>
                                    {cuentas.map((cuenta) => <option key={cuenta.id_cuenta} value={cuenta.id_cuenta}>{cuenta.codigo} · {cuenta.nombre}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Vigente desde
                                <input required type="date" value={impuestoEditando.vigente_desde}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, vigente_desde: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                            </label>
                            <label className="flex flex-col gap-1 text-subtitle text-sm">
                                Vigente hasta
                                <input type="date" value={impuestoEditando.vigente_hasta || ""}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, vigente_hasta: e.target.value })}
                                    className="bg-input text-title border border-secondary rounded-lg px-3 py-2" />
                            </label>
                            <label className="flex items-center gap-2 text-title text-sm">
                                <input type="checkbox" checked={Boolean(impuestoEditando.solo_simulacion)}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, solo_simulacion: e.target.checked })} />
                                Solo simulación
                            </label>
                            <label className="flex items-center gap-2 text-title text-sm">
                                <input type="checkbox" checked={Boolean(impuestoEditando.activo)}
                                    onChange={(e) => setImpuestoEditando({ ...impuestoEditando, activo: e.target.checked })} />
                                Activo
                            </label>
                            <div className="md:col-span-2 flex justify-end gap-2">
                                <button type="button" onClick={() => setImpuestoEditando(null)} className="btn-secondary">
                                    <X size={16} /> Cancelar
                                </button>
                                <button type="submit" disabled={guardando} className="btn-primary">
                                    <Save size={16} /> {guardando ? "Guardando…" : "Guardar impuesto"}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="erp-card p-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-subtitle text-left border-b border-secondary">
                                    <th className="py-2 pr-4">Código</th>
                                    <th className="py-2 pr-4">Nombre</th>
                                    <th className="py-2 pr-4">Tipo</th>
                                    <th className="py-2 pr-4 text-right">Tasa</th>
                                    <th className="py-2 pr-4">Vigencia</th>
                                    <th className="py-2 pr-4">Estado</th>
                                    <th className="py-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {impuestos.map((impuesto) => (
                                    <tr key={impuesto.id_impuesto} className="border-b border-secondary/50">
                                        <td className="py-2 pr-4 text-title">{impuesto.codigo}</td>
                                        <td className="py-2 pr-4 text-title">{impuesto.nombre}</td>
                                        <td className="py-2 pr-4 text-subtitle">{impuesto.tipo}</td>
                                        <td className="py-2 pr-4 text-right text-title">{Number(impuesto.tasa_porcentual).toFixed(4)}%</td>
                                        <td className="py-2 pr-4 text-subtitle">{impuesto.vigente_desde} — {impuesto.vigente_hasta || "sin fecha final"}</td>
                                        <td className="py-2 pr-4 text-subtitle">
                                            {impuesto.activo ? "Activo" : "Inactivo"}{impuesto.solo_simulacion ? " · Simulación" : ""}
                                        </td>
                                        <td className="py-2">
                                            {puedeEditar && (
                                                <button onClick={() => setImpuestoEditando({ ...impuesto })} className="btn-secondary text-xs">
                                                    Editar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {!loading && impuestos.length === 0 && (
                                    <tr><td colSpan={7} className="py-4 text-center text-subtitle">No hay impuestos configurados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
