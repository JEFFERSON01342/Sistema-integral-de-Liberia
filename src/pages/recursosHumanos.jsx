import { useState, useMemo, useEffect, useCallback } from "react";
import {
    Users, DollarSign, CircleDollarSign, Calendar, Building2, Plus, Calculator, Save,
    Briefcase, TrendingUp, History, FileText, Plane, HardHat, Scale, ClipboardCheck, Clock, Gift, Trash2
} from "lucide-react";
import StatsCards from "../components/statscards";
import Tabs from "../components/tabs";
import NuevoEmpleado from "../components/nuevoempleado";
import EmpleadosCards from "../components/empleadosCards";
import RRHHCrud from "../components/rrhh/RRHHCrud";
import CatalogosLaborales from "../components/rrhh/CatalogosLaborales";
import MarcoLegalInfo from "../components/rrhh/MarcoLegalInfo";
import ConfiguracionContableNomina from "../components/rrhh/ConfiguracionContableNomina";
import LiquidacionesLaborales from "../components/rrhh/LiquidacionesLaborales";
import {
    CONTRATOS_CFG, VACACIONES_CFG, ASISTENCIAS_CFG, PRESTACIONES_CFG,
    SEGURIDAD_CFG, MARCO_LEGAL_CFG, CUMPLIMIENTO_CFG
} from "../components/rrhh/configsRRHH";
import { useEmpleados } from "../hooks/useEmpleados";
import { useCatalogosLaborales } from "../hooks/useCatalogosLaborales";
import { useEmpresa } from "../contexts/empresacontext";
import { useAuth } from "../contexts/authcontext";
import { supabase } from "../supabase/supabaseclient";
import { registrarAuditoria } from "../utils/auditoria";
import { calcularNominaPorPeriodo, fmtCordoba } from "../utils/nominaNicaragua";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";

const fechaLocal = (fecha) => {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
};

const diasInclusivos = (inicio, fin) => {
    if (!inicio || !fin) return null;
    const inicioUTC = new Date(`${inicio}T00:00:00Z`);
    const finUTC = new Date(`${fin}T00:00:00Z`);
    if (
        Number.isNaN(inicioUTC.getTime())
        || Number.isNaN(finUTC.getTime())
        || inicioUTC.toISOString().slice(0, 10) !== inicio
        || finUTC.toISOString().slice(0, 10) !== fin
        || finUTC < inicioUTC
    ) return null;
    return Math.round((finUTC - inicioUTC) / 86400000) + 1;
};

const describirBaseBruto = (salarioMensual, tipoPeriodo, fechaInicio, fechaFin) => {
    if (tipoPeriodo === "semanal") {
        return `${fmtCordoba(salarioMensual)} × 12/52`;
    }

    const cursor = new Date(`${fechaInicio}T00:00:00Z`);
    const fin = new Date(`${fechaFin}T00:00:00Z`);
    const fracciones = [];
    while (cursor <= fin) {
        const anio = cursor.getUTCFullYear();
        const mes = cursor.getUTCMonth();
        const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
        let diasEnMes = 0;
        while (cursor <= fin && cursor.getUTCFullYear() === anio && cursor.getUTCMonth() === mes) {
            diasEnMes += 1;
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        fracciones.push(`${diasEnMes}/${diasMes}`);
    }

    return `${fmtCordoba(salarioMensual)} × (${fracciones.join(" + ")})`;
};

export default function RecursosHumanos() {
    const { rol, perfil } = useAuth();
    const { empresaId } = useEmpresa();

    const tabs = [
        { key: "empleados", label: "Empleados", icon: <Users size={16} /> },
        { key: "puestos", label: "Puestos y departamentos", icon: <Briefcase size={16} /> },
        { key: "contratos", label: "Contratos", icon: <FileText size={16} /> },
        { key: "asistencia", label: "Asistencia", icon: <Clock size={16} /> },
        { key: "vacaciones", label: "Vacaciones y permisos", icon: <Plane size={16} /> },
        { key: "prestaciones", label: "Prestaciones", icon: <Gift size={16} /> },
        { key: "liquidaciones", label: "Liquidaciones", icon: <CircleDollarSign size={16} /> },
        { key: "seguridad", label: "Seguridad e higiene", icon: <HardHat size={16} /> },
        { key: "marco_legal", label: "Marco legal", icon: <Scale size={16} /> },
        { key: "cumplimiento", label: "Cumplimiento", icon: <ClipboardCheck size={16} /> },
        { key: "nomina", label: "Nómina", icon: <Calculator size={16} /> },
        { key: "historial", label: "Historial", icon: <History size={16} /> },
    ];
    const [activeTab, setActiveTab] = useState("empleados");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [configuracionContableAbierta, setConfiguracionContableAbierta] = useState(false);
    const [tipoNomina, setTipoNomina] = useState("quincenal");
    const [deduccionesAdicionales, setDeduccionesAdicionales] = useState({});
    const [sucursalesNomina, setSucursalesNomina] = useState([]);
    const [sucursalesVista, setSucursalesVista] = useState([]);
    const [idSucursalVista, setIdSucursalVista] = useState("todas");
    const [idSucursalNomina, setIdSucursalNomina] = useState(rol === "superadmin" ? "todas" : "");
    const [accionPeriodo, setAccionPeriodo] = useState(null);

    // Admin y gerente solo ven empleados de su sucursal asignada.
    const restringidoPorSucursal = rol === "admin" || rol === "gerente";
    const idSucursalFiltro = restringidoPorSucursal ? (perfil?.id_sucursal || null) : null;
    const idSucursalFiltroVista = restringidoPorSucursal
        ? idSucursalFiltro
        : idSucursalVista === "todas" ? null : Number(idSucursalVista);

    const { empleados, isLoading, fetchEmpleados } = useEmpleados(idSucursalFiltro);
    const { empleados: todosLosEmpleados, fetchEmpleados: fetchTodos } = useEmpleados();
    const {
        departamentos: departamentosLaborales,
        puestos: puestosLaborales,
    } = useCatalogosLaborales({ incluirInactivos: true });
    const refrescarEmpleados = () => { fetchEmpleados(); fetchTodos(); };
    const empleadosVisibles = useMemo(() => idSucursalFiltroVista
        ? empleados.filter((empleado) => Number(empleado.id_sucursal) === Number(idSucursalFiltroVista))
        : empleados, [empleados, idSucursalFiltroVista]);

    const { empleadosActivos, nominaMensual } = useMemo(() => {
        const activos = empleadosVisibles.filter((e) => e.estado === "Activo");
        const nomina = activos.reduce((sum, e) => sum + (Number(e.salario_mensual) || 0), 0);
        return { empleadosActivos: activos.length, nominaMensual: nomina };
    }, [empleadosVisibles]);

    // ---------- NÓMINA ----------
    const hoy = new Date();
    const [periodoInicio, setPeriodoInicio] = useState(fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
    const [periodoFin, setPeriodoFin] = useState(fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 15)));
    const [guardando, setGuardando] = useState(false);
    useEffect(() => {
        setDeduccionesAdicionales({});
    }, [tipoNomina, idSucursalNomina, periodoInicio, periodoFin]);
    const diasPeriodo = diasInclusivos(periodoInicio, periodoFin);
    const periodoValido = tipoNomina === "semanal"
        ? diasPeriodo === 7
        : diasPeriodo !== null && diasPeriodo <= 15;
    const rolesPuedeContabilizar = ["superadmin", "admin"].includes(rol);

    useEffect(() => {
        if (idSucursalFiltro) setIdSucursalNomina(String(idSucursalFiltro));
        if (!empresaId) return;
        const cargarSucursales = async () => {
            let query = supabase
                .from("sucursales")
                .select("id_sucursal, nombre, activa")
                .eq("id_empresa", empresaId)
                .order("nombre", { ascending: true });
            if (idSucursalFiltro) query = query.eq("id_sucursal", idSucursalFiltro);
            const { data, error } = await query;
            if (error) {
                toast.error(`No se pudieron cargar las sucursales para nómina: ${error.message}`);
                return;
            }
            const sucursales = data || [];
            setSucursalesVista(sucursales);
            setSucursalesNomina(sucursales.filter((sucursal) => sucursal.activa));
            if (!idSucursalFiltro && sucursales.filter((sucursal) => sucursal.activa).length === 1) {
                setIdSucursalNomina(String(sucursales.find((sucursal) => sucursal.activa).id_sucursal));
            }
        };
        cargarSucursales();
    }, [empresaId, idSucursalFiltro]);

    useEffect(() => {
        if (idSucursalFiltro) {
            setIdSucursalNomina(String(idSucursalFiltro));
        } else if (idSucursalVista === "todas") {
            setIdSucursalNomina("todas");
        } else if (idSucursalVista !== "todas") {
            const sucursalActiva = sucursalesNomina.some(
                (sucursal) => String(sucursal.id_sucursal) === idSucursalVista
            );
            setIdSucursalNomina(sucursalActiva ? idSucursalVista : "");
        }
    }, [idSucursalFiltro, idSucursalVista, sucursalesNomina]);

    const empleadosNomina = useMemo(() => empleados.filter((empleado) =>
        empleado.estado === "Activo"
        && (idSucursalNomina === "todas"
            || (idSucursalNomina && Number(empleado.id_sucursal) === Number(idSucursalNomina)))
    ), [empleados, idSucursalNomina]);

    const detalleNomina = useMemo(() => empleadosNomina
        .filter((empleado) => empleado.frecuencia_pago === tipoNomina)
        .filter(() => periodoValido)
        .map((empleado) => {
            const lineasDeducciones = deduccionesAdicionales[empleado.id_empleado] || [];
            const otrosDescuentos = Math.round(lineasDeducciones.reduce(
                (total, linea) => total + (Number(linea.monto) || 0),
                0
            ) * 100) / 100;
            return {
                empleado,
                lineasDeducciones,
                calc: calcularNominaPorPeriodo(
                    Number(empleado.salario_mensual) || 0,
                    tipoNomina,
                    periodoInicio,
                    periodoFin,
                    otrosDescuentos
                ),
            };
        }), [empleadosNomina, tipoNomina, periodoInicio, periodoFin, periodoValido, deduccionesAdicionales]);

    const totales = useMemo(() => {
        return detalleNomina.reduce(
            (acc, d) => {
                acc.bruto += d.calc.bruto;
                acc.deducciones += d.calc.totalDeducciones;
                acc.neto += d.calc.salarioNeto;
                acc.costoEmpresa += d.calc.costoTotalEmpresa;
                return acc;
            },
            { bruto: 0, deducciones: 0, neto: 0, costoEmpresa: 0 }
        );
    }, [detalleNomina]);

    const guardarNomina = async () => {
        if (!idSucursalNomina || idSucursalNomina === "todas") {
            toast.error("Seleccione una sucursal para procesar la nómina.");
            return;
        }
        if (!periodoValido) {
            toast.error(tipoNomina === "semanal"
                ? "El período semanal debe comprender exactamente 7 días."
                : "El período quincenal debe comprender de 1 a 15 días consecutivos.");
            return;
        }
        if (detalleNomina.length === 0) {
            toast.error(`No hay empleados activos con frecuencia ${tipoNomina} en esta sucursal.`);
            return;
        }
        const descuentoInvalido = detalleNomina.find(({ calc, lineasDeducciones }) => {
            const lineasConDatos = lineasDeducciones.filter((linea) => (
                linea.concepto.trim() !== "" || linea.monto.trim() !== ""
            ));
            const lineasInvalidas = lineasConDatos.some((linea) => {
                const monto = Number(linea.monto);
                return !linea.concepto.trim()
                    || linea.concepto.trim().length > 120
                    || !Number.isFinite(monto)
                    || monto <= 0
                    || Math.round(monto * 100) / 100 !== monto;
            });
            return lineasInvalidas
                || calc.otrosDescuentos > calc.bruto - calc.inssLaboral - calc.irMensual
                || calc.salarioNeto < 0;
        });
        if (descuentoInvalido) {
            toast.error(`Revise las deducciones de ${descuentoInvalido.empleado.nombre_completo}: cada concepto debe tener título y monto válido, y el neto no puede quedar por debajo de C$0.00.`);
            return;
        }
        const confirm = await Swal.fire({
            title: "¿Procesar nómina?",
            text: `Se generará la nómina de ${detalleNomina.length} empleado(s) del período ${periodoInicio} al ${periodoFin}.`,
            icon: "question",
            background: "#1e1e1e",
            color: "#fff",
            showCancelButton: true,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Sí, procesar",
            cancelButtonText: "Cancelar",
        });
        if (!confirm.isConfirmed) return;

        setGuardando(true);
        try {
            const filas = detalleNomina.map((d) => ({
                id_empleado: d.empleado.id_empleado,
                salario_bruto: d.calc.bruto,
                inss_laboral: d.calc.inssLaboral,
                ir_mensual: d.calc.irMensual,
                otros_descuentos: d.calc.otrosDescuentos,
                deducciones_adicionales: d.lineasDeducciones
                    .filter((linea) => linea.concepto.trim() && linea.monto.trim())
                    .map((linea) => ({
                        concepto: linea.concepto.trim(),
                        monto: Math.round(Number(linea.monto) * 100) / 100,
                    })),
                salario_neto: d.calc.salarioNeto,
                inss_patronal: d.calc.inssPatronal,
                inatec: d.calc.inatec,
                aguinaldo_provisionado: d.calc.aguinaldo,
                vacaciones_provisionadas: d.calc.vacaciones,
                costo_total_empresa: d.calc.costoTotalEmpresa,
            }));
            const { data: idPeriodo, error } = await supabase.rpc("procesar_nomina_con_deducciones", {
                p_datos: {
                    id_empresa: empresaId,
                    id_sucursal: Number(idSucursalNomina),
                    periodo_inicio: periodoInicio,
                    periodo_fin: periodoFin,
                    tipo: tipoNomina,
                    estado: "procesada",
                    total_bruto: totales.bruto,
                    total_deducciones: totales.deducciones,
                    total_neto: totales.neto,
                    total_costo_empresa: totales.costoEmpresa,
                },
                p_detalles: filas,
            });
            if (error) throw error;
            if (!idPeriodo) throw new Error("La base de datos no devolvió el período procesado.");

            await registrarAuditoria(supabase, perfil, "PROCESAR_NOMINA", "Recursos Humanos",
                `Nómina ${periodoInicio} a ${periodoFin} — ${filas.length} empleados, neto ${fmtCordoba(totales.neto)}`);
            toast.success("✅ Nómina procesada correctamente.");
            cargarHistorial();
            setActiveTab("historial");
        } catch (err) {
            console.error("Error procesando nómina:", err.message);
            toast.error("⚠️ Error al procesar nómina: " + err.message);
        } finally {
            setGuardando(false);
        }
    };

    // ---------- HISTORIAL ----------
    const [historial, setHistorial] = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);

    const cargarHistorial = useCallback(async () => {
        if (!empresaId) return;
        setLoadingHist(true);
        let query = supabase
            .from("nomina_periodos")
            .select("*")
            .eq("id_empresa", empresaId)
            .order("created_at", { ascending: false });
        if (idSucursalFiltroVista) query = query.eq("id_sucursal", idSucursalFiltroVista);
        const { data, error } = await query;
        if (error) {
            toast.error(`No se pudo cargar el historial de nómina: ${error.message}`);
        } else {
            setHistorial(data || []);
        }
        setLoadingHist(false);
    }, [empresaId, idSucursalFiltroVista]);

    useEffect(() => {
        cargarHistorial();
    }, [cargarHistorial]);

    const contabilizarPeriodo = async (idPeriodo, pagos = false) => {
        setAccionPeriodo({ id: idPeriodo, pagos });
        try {
            const { data, error } = await supabase.rpc(
                pagos ? "contabilizar_pagos_nomina" : "contabilizar_nomina",
                { p_id_periodo: idPeriodo }
            );
            if (error) throw error;
            toast.success(pagos
                ? (data === 0 ? "No hay pagos pendientes de contabilizar." : `Se contabilizaron ${data} grupo(s) de pago.`)
                : `Nómina contabilizada en el comprobante #${data}.`);
            await cargarHistorial();
        } catch (error) {
            toast.error(`No se pudo contabilizar ${pagos ? "los pagos" : "la nómina"}: ${error.message}`);
        } finally {
            setAccionPeriodo(null);
        }
    };

    return (
        <div>
        {rol === "superadmin" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
                <label htmlFor="rrhh-sucursal-vista" className="text-sm font-medium text-title">
                    Ver información de:
                </label>
                <select
                    id="rrhh-sucursal-vista"
                    value={idSucursalVista}
                    onChange={(event) => setIdSucursalVista(event.target.value)}
                    className="min-w-56 rounded-lg border border-secondary bg-input p-2 text-sm text-title"
                >
                    <option value="todas">Toda la empresa</option>
                    {sucursalesVista.map((sucursal) => (
                        <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>
                            {sucursal.nombre}{!sucursal.activa ? " · Inactiva" : ""}
                        </option>
                    ))}
                </select>
                <span className="text-xs text-subtitle">
                    El filtro aplica a empleados, contratos, asistencias, permisos, prestaciones, liquidaciones, seguridad, cumplimiento e historial. Los puestos y departamentos son catálogos de toda la empresa.
                </span>
            </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatsCards title={"Empleados Activos"} icon={<Users className="text-title" />} value={empleadosActivos} />
                <StatsCards title={"Nómina Bruta Mensual"} icon={<DollarSign className="text-title" />} value={fmtCordoba(nominaMensual)} />
                <StatsCards title={"Costo Empresa del período"} icon={<Briefcase className="text-title" />} value={fmtCordoba(totales.costoEmpresa)} />
                <StatsCards title={"Neto estimado del período"} icon={<TrendingUp className="text-green-400" />} value={fmtCordoba(totales.neto)} />
            </div>

            <div className="mt-6">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

                <div className="mt-8 border border-secondary rounded-2xl p-5">
                    {/* ------- TAB EMPLEADOS ------- */}
                    {activeTab === "empleados" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Gestión de Empleados</h3>
                                    <p className="text-subtitle text-s">Administra el personal de la empresa</p>
                                    {restringidoPorSucursal && (
                                        <span className="inline-flex items-center gap-1 w-fit mt-1 bg-button/20 text-title text-xs font-medium px-2.5 py-1 rounded-full">
                                            <Building2 size={12} /> Tu sucursal: {empleados.length} empleado(s) · {todosLosEmpleados.length} en total
                                        </span>
                                    )}
                                </div>
                                <button className="btn-new bg-button text-button flex flex-row h-10 gap-3 p-2 rounded-xl items-center cursor-pointer hover:opacity-95 hover:scale-110 transition" onClick={() => setIsModalOpen(true)}>
                                    <span className="icon"><Plus /></span> Nuevo Empleado
                                </button>
                            </div>

                            {isLoading ? (
                                <p className="p-4 text-center text-subtitle">Cargando empleados...</p>
                            ) : empleadosVisibles.length === 0 ? (
                                <p className="text-center text-subtitle p-4">No hay empleados registrados</p>
                            ) : (
                                <div className="mt-8 flex flex-col gap-4">
                                    {empleadosVisibles.map((empleado) => (
                                        <EmpleadosCards
                                            key={empleado.id_empleado}
                                            {...empleado}
                                            rol={rol}
                                            rolAccesoPuesto={puestosLaborales.find(
                                                (puesto) => Number(puesto.id_puesto) === Number(empleado.id_puesto)
                                            )?.rol_acceso || null}
                                            departamentosLaborales={departamentosLaborales}
                                            puestosLaborales={puestosLaborales}
                                            onActualizar={refrescarEmpleados}
                                            onPagoRegistrado={cargarHistorial}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === "puestos" && <CatalogosLaborales />}

                    {/* ------- TAB CONTRATOS ------- */}
                    {activeTab === "contratos" && (
                        <RRHHCrud
                            {...CONTRATOS_CFG}
                            empresaId={empresaId}
                            idSucursalFiltro={idSucursalFiltroVista}
                            empleados={empleadosVisibles}
                            puestos={puestosLaborales}
                            departamentos={departamentosLaborales}
                            perfil={perfil}
                        />
                    )}

                    {/* ------- TAB ASISTENCIA ------- */}
                    {activeTab === "asistencia" && (
                        <RRHHCrud {...ASISTENCIAS_CFG} empresaId={empresaId} idSucursalFiltro={idSucursalFiltroVista} empleados={empleadosVisibles} perfil={perfil} />
                    )}

                    {/* ------- TAB VACACIONES Y PERMISOS ------- */}
                    {activeTab === "vacaciones" && (
                        <RRHHCrud {...VACACIONES_CFG} empresaId={empresaId} idSucursalFiltro={idSucursalFiltroVista} empleados={empleadosVisibles} perfil={perfil} />
                    )}

                    {/* ------- TAB PRESTACIONES ------- */}
                    {activeTab === "prestaciones" && (
                        <RRHHCrud {...PRESTACIONES_CFG} empresaId={empresaId} idSucursalFiltro={idSucursalFiltroVista} empleados={empleadosVisibles} perfil={perfil} />
                    )}

                    {activeTab === "liquidaciones" && (
                        <LiquidacionesLaborales
                            empresaId={empresaId}
                            idSucursalFiltro={idSucursalFiltroVista}
                            empleados={empleadosVisibles}
                            rol={rol}
                        />
                    )}

                    {/* ------- TAB SEGURIDAD E HIGIENE ------- */}
                    {activeTab === "seguridad" && (
                        <RRHHCrud {...SEGURIDAD_CFG} empresaId={empresaId} idSucursalFiltro={idSucursalFiltroVista} empleados={empleadosVisibles} perfil={perfil} />
                    )}

                    {/* ------- TAB MARCO LEGAL ------- */}
                    {activeTab === "marco_legal" && (
                        <>
                            <div className="flex flex-col gap-1 mb-5">
                                <h3 className="text-title text-xl font-bold">Marco Legal</h3>
                                <p className="text-subtitle text-s">Normativa laboral y fiscal aplicable en Nicaragua</p>
                            </div>
                            <MarcoLegalInfo />
                            <RRHHCrud {...MARCO_LEGAL_CFG} empresaId={empresaId} empleados={empleadosVisibles} perfil={perfil} />
                        </>
                    )}

                    {/* ------- TAB CUMPLIMIENTO ------- */}
                    {activeTab === "cumplimiento" && (
                        <RRHHCrud {...CUMPLIMIENTO_CFG} empresaId={empresaId} idSucursalFiltro={idSucursalFiltroVista} empleados={empleadosVisibles} perfil={perfil} />
                    )}

                    {/* ------- TAB NÓMINA ------- */}
                    {activeTab === "nomina" && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-title text-xl font-bold">Cálculo de Nómina</h3>
                                    <p className="text-subtitle text-s">Estimación referencial; valide tasas y cálculos vigentes antes de pagar o declarar.</p>
                                </div>
                                <div className="flex flex-wrap gap-3 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-subtitle">Frecuencia</label>
                                        <select value={tipoNomina} onChange={(e) => setTipoNomina(e.target.value)} className="bg-input border border-secondary rounded-lg p-2 text-sm">
                                            <option value="semanal">Semanal</option>
                                            <option value="quincenal">Quincenal</option>
                                        </select>
                                        <span className="text-xs text-subtitle">{tipoNomina === "semanal" ? "Períodos consecutivos de 7 días" : "Períodos consecutivos de hasta 15 días"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-subtitle">Sucursal</label>
                                        <select
                                            value={idSucursalNomina}
                                            onChange={(e) => setIdSucursalNomina(e.target.value)}
                                            disabled={Boolean(idSucursalFiltro)}
                                            className="bg-input border border-secondary rounded-lg p-2 text-sm"
                                        >
                                            <option value="">Seleccione sucursal...</option>
                                            {rol === "superadmin" && (
                                                <option value="todas">Todas las sucursales (vista consolidada)</option>
                                            )}
                                            {sucursalesNomina.map((sucursal) => (
                                                <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-subtitle">Inicio período</label>
                                        <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="bg-input border border-secondary rounded-lg p-2 text-sm [&::-webkit-calendar-picker-indicator]:invert" />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-subtitle">Fin período</label>
                                        <input type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} className="bg-input border border-secondary rounded-lg p-2 text-sm [&::-webkit-calendar-picker-indicator]:invert" />
                                    </div>
                                    <button onClick={guardarNomina} disabled={guardando || !periodoValido || !idSucursalNomina || idSucursalNomina === "todas"} className="bg-button text-button flex h-10 gap-2 px-4 rounded-xl items-center cursor-pointer hover:scale-105 transition disabled:opacity-60">
                                        <Save size={18} /> {guardando ? "Procesando..." : "Procesar Nómina"}
                                    </button>
                                </div>
                            </div>
                            {rol === "superadmin" && idSucursalNomina === "todas" && (
                                <p className="mt-3 text-sm text-subtitle">
                                    La vista consolidada sirve para revisar los importes de todas las sucursales. Para procesar la nómina, seleccione una sucursal específica; cada período se registra por separado.
                                </p>
                            )}
                            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                                Las tasas heredadas de INSS/INATEC y la estimación de IR aún no están verificadas contra instrumentos oficiales vigentes. Revise los importes antes de pagar o declarar; este cálculo no certifica cumplimiento.
                            </div>
                            <p className="mt-3 text-sm text-subtitle">
                                Agregue uno o varios descuentos por empleado, cada uno con concepto y monto. Solo se guardan al procesar esta nómina; no cambian el salario del empleado ni nóminas anteriores.
                            </p>
                            {!periodoValido && (
                                <p className="mt-3 text-sm text-red-400">
                                    {tipoNomina === "semanal"
                                        ? "El período semanal debe comprender exactamente siete días."
                                        : "El período para empleados debe comprender de uno a quince días consecutivos."}
                                </p>
                            )}
                            {!idSucursalNomina && (
                                <p className="mt-3 text-sm text-red-400">Seleccione una sucursal para limitar y contabilizar esta nómina.</p>
                            )}

                            <div className="mt-6 overflow-x-auto">
                                {detalleNomina.length === 0 ? (
                                    <p className="p-4 text-center text-subtitle">No hay empleados activos para procesar.</p>
                                ) : (
                                    <table className="min-w-[1200px] w-full text-title text-sm">
                                        <thead className="bg-secondary/10">
                                            <tr className="border-b border-secondary/50 text-xs font-semibold text-subtitle">
                                                <th className="py-3 px-3 text-left">Empleado</th>
                                                <th className="py-3 px-3 text-right">Bruto</th>
                                                <th className="py-3 px-3 text-right">INSS laboral*</th>
                                                <th className="py-3 px-3 text-right">IR estimado*</th>
                                                <th className="py-3 px-3 text-left">Deducciones adicionales</th>
                                                <th className="py-3 px-3 text-right">Neto</th>
                                                <th className="py-3 px-3 text-right">INSS patronal*</th>
                                                <th className="py-3 px-3 text-right">INATEC*</th>
                                                <th className="py-3 px-3 text-right">Aguinaldo</th>
                                                <th className="py-3 px-3 text-right">Vacac.</th>
                                                <th className="py-3 px-3 text-right">Costo Empresa</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalleNomina.map((d) => (
                                                <tr key={d.empleado.id_empleado} className="border-t border-secondary hover:bg-secondary/10 transition-colors">
                                                    <td className="py-3 px-3 text-left">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{d.empleado.nombre_completo}</span>
                                                            <span className="text-xs text-subtitle">
                                                                {[d.empleado.puesto, d.empleado.departamento].filter(Boolean).join(" · ") || "—"}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-right">
                                                        <div>{fmtCordoba(d.calc.bruto)}</div>
                                                        <div className="whitespace-nowrap text-xs text-subtitle">
                                                            {describirBaseBruto(
                                                                Number(d.empleado.salario_mensual) || 0,
                                                                tipoNomina,
                                                                periodoInicio,
                                                                periodoFin
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-right text-red-400">-{fmtCordoba(d.calc.inssLaboral)}</td>
                                                    <td className="py-3 px-3 text-right text-red-400">-{fmtCordoba(d.calc.irMensual)}</td>
                                                    <td className="min-w-72 px-3 py-2">
                                                        <div className="flex flex-col gap-2">
                                                            {d.lineasDeducciones.map((linea, index) => (
                                                                <div key={`${d.empleado.id_empleado}-${index}`} className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        maxLength={120}
                                                                        value={linea.concepto}
                                                                        onChange={(event) => setDeduccionesAdicionales((actuales) => ({
                                                                            ...actuales,
                                                                            [d.empleado.id_empleado]: actuales[d.empleado.id_empleado].map((actual, i) => (
                                                                                i === index ? { ...actual, concepto: event.target.value } : actual
                                                                            )),
                                                                        }))}
                                                                        aria-label={`Concepto de deducción ${index + 1} para ${d.empleado.nombre_completo}`}
                                                                        placeholder="Concepto"
                                                                        className="min-w-0 flex-1 rounded border border-secondary bg-input px-2 py-1 text-sm text-title"
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max={Math.max(0, d.calc.bruto - d.calc.inssLaboral - d.calc.irMensual)}
                                                                        step="0.01"
                                                                        value={linea.monto}
                                                                        onChange={(event) => setDeduccionesAdicionales((actuales) => ({
                                                                            ...actuales,
                                                                            [d.empleado.id_empleado]: actuales[d.empleado.id_empleado].map((actual, i) => (
                                                                                i === index ? { ...actual, monto: event.target.value } : actual
                                                                            )),
                                                                        }))}
                                                                        aria-label={`Monto de deducción ${index + 1} para ${d.empleado.nombre_completo}`}
                                                                        placeholder="C$"
                                                                        className="w-24 rounded border border-secondary bg-input px-2 py-1 text-right text-sm text-title"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDeduccionesAdicionales((actuales) => ({
                                                                            ...actuales,
                                                                            [d.empleado.id_empleado]: actuales[d.empleado.id_empleado].filter((_, i) => i !== index),
                                                                        }))}
                                                                        aria-label={`Eliminar deducción ${index + 1} de ${d.empleado.nombre_completo}`}
                                                                        className="rounded p-1 text-red-400 hover:bg-red-500/10"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeduccionesAdicionales((actuales) => ({
                                                                    ...actuales,
                                                                    [d.empleado.id_empleado]: [
                                                                        ...(actuales[d.empleado.id_empleado] || []),
                                                                        { concepto: "", monto: "" },
                                                                    ],
                                                                }))}
                                                                className="flex w-fit items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                                                            >
                                                                <Plus size={14} /> Agregar deducción
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-right text-green-400 font-semibold">{fmtCordoba(d.calc.salarioNeto)}</td>
                                                    <td className="py-3 px-3 text-right text-subtitle">{fmtCordoba(d.calc.inssPatronal)}</td>
                                                    <td className="py-3 px-3 text-right text-subtitle">{fmtCordoba(d.calc.inatec)}</td>
                                                    <td className="py-3 px-3 text-right text-subtitle">{fmtCordoba(d.calc.aguinaldo)}</td>
                                                    <td className="py-3 px-3 text-right text-subtitle">{fmtCordoba(d.calc.vacaciones)}</td>
                                                    <td className="py-3 px-3 text-right font-semibold">{fmtCordoba(d.calc.costoTotalEmpresa)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-secondary font-bold text-title">
                                                <td className="py-3 px-3 text-left">TOTALES</td>
                                                <td className="py-3 px-3 text-right">{fmtCordoba(totales.bruto)}</td>
                                                <td className="py-3 px-3 text-right" colSpan={3}>-{fmtCordoba(totales.deducciones)}</td>
                                                <td className="py-3 px-3 text-right text-green-400">{fmtCordoba(totales.neto)}</td>
                                                <td className="py-3 px-3 text-right" colSpan={4}></td>
                                                <td className="py-3 px-3 text-right">{fmtCordoba(totales.costoEmpresa)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>
                        </>
                    )}

                    {/* ------- TAB HISTORIAL ------- */}
                    {activeTab === "historial" && (
                        <>
                            <div className="flex flex-col gap-1 mb-4">
                                <h3 className="text-title text-xl font-bold">Historial de Nóminas</h3>
                                <p className="text-subtitle text-s">Cálculo, desembolso y contabilización son pasos separados.</p>
                                {["superadmin", "admin"].includes(rol) && (
                                    <button
                                        onClick={() => setConfiguracionContableAbierta(true)}
                                        className="mt-2 w-fit rounded-lg border border-secondary px-3 py-2 text-sm text-title hover:bg-secondary/20"
                                    >
                                        Configurar cuentas contables
                                    </button>
                                )}
                            </div>
                            <div className="overflow-x-auto">
                                {loadingHist ? (
                                    <p className="p-4 text-center text-subtitle">Cargando historial...</p>
                                ) : historial.length === 0 ? (
                                    <p className="p-4 text-center text-subtitle">No hay nóminas procesadas aún.</p>
                                ) : (
                                    <table className="min-w-[700px] w-full text-title text-sm">
                                        <thead className="bg-secondary/10">
                                            <tr className="border-b border-secondary/50 text-xs font-semibold text-subtitle">
                                                <th className="py-3 px-3 text-left">Período</th>
                                                <th className="py-3 px-3 text-center">Tipo</th>
                                                <th className="py-3 px-3 text-right">Total Bruto</th>
                                                <th className="py-3 px-3 text-right">Deducciones</th>
                                                <th className="py-3 px-3 text-right">Neto Pagado</th>
                                                <th className="py-3 px-3 text-right">Costo Empresa</th>
                                                <th className="py-3 px-3 text-center">Estado</th>
                                                <th className="py-3 px-3 text-center">Contabilización</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historial.map((h) => (
                                                <tr key={h.id} className="border-t border-secondary hover:bg-secondary/10 transition-colors">
                                                    <td className="py-3 px-3 text-left">
                                                        <span className="flex items-center gap-2"><Calendar size={14} className="text-subtitle" />
                                                            {new Date(h.periodo_inicio).toLocaleDateString("es-NI", { timeZone: "UTC" })} – {new Date(h.periodo_fin).toLocaleDateString("es-NI", { timeZone: "UTC" })}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center capitalize">{h.tipo}</td>
                                                    <td className="py-3 px-3 text-right">{fmtCordoba(h.total_bruto)}</td>
                                                    <td className="py-3 px-3 text-right text-red-400">{fmtCordoba(h.total_deducciones)}</td>
                                                    <td className="py-3 px-3 text-right text-green-400 font-semibold">{fmtCordoba(h.total_neto)}</td>
                                                    <td className="py-3 px-3 text-right">{fmtCordoba(h.total_costo_empresa)}</td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded-full text-xs font-semibold capitalize">{h.estado}</span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <div className="flex justify-center gap-2">
                                                            {rolesPuedeContabilizar && !h.id_comprobante_nomina && h.estado !== "anulada" && (
                                                                <button
                                                                    onClick={() => contabilizarPeriodo(h.id, false)}
                                                                    disabled={Boolean(accionPeriodo)}
                                                                    className="rounded border border-secondary px-2 py-1 text-xs hover:bg-secondary/20 disabled:opacity-50"
                                                                >
                                                                    {accionPeriodo?.id === h.id && !accionPeriodo.pagos ? "Contabilizando..." : "Contabilizar nómina"}
                                                                </button>
                                                            )}
                                                            {rolesPuedeContabilizar && h.id_comprobante_nomina && ["procesada", "pagada"].includes(h.estado) && (
                                                                <button
                                                                    onClick={() => contabilizarPeriodo(h.id, true)}
                                                                    disabled={Boolean(accionPeriodo)}
                                                                    className="rounded border border-secondary px-2 py-1 text-xs hover:bg-secondary/20 disabled:opacity-50"
                                                                >
                                                                    {accionPeriodo?.id === h.id && accionPeriodo.pagos ? "Contabilizando..." : "Contabilizar pagos"}
                                                                </button>
                                                            )}
                                                            {h.id_comprobante_nomina && (
                                                                <span className="text-xs text-subtitle">Nómina #{h.id_comprobante_nomina}</span>
                                                            )}
                                                            {rolesPuedeContabilizar && !h.id_comprobante_nomina && ["procesada", "pagada"].includes(h.estado) && (
                                                                <span className="text-xs text-subtitle">Contabilice la nómina primero</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative z-10 mx-4">
                        <NuevoEmpleado onClose={() => { setIsModalOpen(false); refrescarEmpleados(); }} idSucursalFija={idSucursalFiltro} />
                    </div>
                </div>
            )}
            {configuracionContableAbierta && (
                <ConfiguracionContableNomina
                    empresaId={empresaId}
                    onClose={() => setConfiguracionContableAbierta(false)}
                />
            )}
        </div>
    );
}
