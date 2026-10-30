import { useState, useMemo, useEffect, useCallback } from "react";
import { TrendingUp, Calendar, Percent, Calculator } from "lucide-react";
import { supabase } from "../supabase/supabaseclient";
import { useEmpresa } from "../contexts/empresacontext";
import { toast } from "react-hot-toast";
import SucursalAlcanceFinanciero from "../components/SucursalAlcanceFinanciero";

const getTodayString = () => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
}

export default function Proyecciones() {
    const { empresaId, alcanceSucursalId, alcanceSucursalNombre } = useEmpresa();
    const [fechaBase, setFechaBase] = useState(getTodayString());
    const [porcentajeCrecimiento, setPorcentajeCrecimiento] = useState(10); // 10% por defecto
    const [cuentasBase, setCuentasBase] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // 1. Cargar los datos reales (Base)
    const fetchDatosBase = useCallback(async () => {
        if (!empresaId) return;
        setIsLoading(true);
        setCuentasBase([]);
        try {
            const { data, error } = await supabase.rpc('reporte_balance_general', {
                p_id_empresa: empresaId,
                p_fecha_corte: fechaBase,
                p_id_sucursal: alcanceSucursalId,
            });
            if (error) throw error;
            setCuentasBase((data || []).map((cuenta) => ({
                ...cuenta,
                cuenta: cuenta.nombre,
                tipo: ({
                    ACTIVO: 'Activo',
                    PASIVO: 'Pasivo',
                    PATRIMONIO: 'Patrimonio',
                })[cuenta.naturaleza] || cuenta.naturaleza,
                saldo: (cuenta.naturaleza === 'ACTIVO' ? 1 : -1) * Number(cuenta.saldo || 0),
            })));
        } catch (error) {
            toast.error("Error al cargar datos base: " + error.message);
        } finally {
            setIsLoading(false);
        }
    }, [empresaId, fechaBase, alcanceSucursalId]);

    // Cargar al inicio o cuando cambie la fecha
    useEffect(() => {
        fetchDatosBase();
    }, [fetchDatosBase]);

    // 2. Calcular la Proyección (Lógica Financiera)
    // 2. Calcular la Proyección (Lógica Financiera Avanzada)
    const datosProyectados = useMemo(() => {
        if (cuentasBase.length === 0) return null;

        const factor = 1 + (porcentajeCrecimiento / 100);

        // --- PASO 1: PROYECTAR ACTIVOS Y PASIVOS ---
        const agrupar = (tipo) => cuentasBase
            .filter(c => c.tipo === tipo && c.saldo !== 0)
            .map(c => {
                let saldoProyectado = c.saldo;
                
                // Activos y Pasivos crecen con las ventas
                if (['Activo', 'Pasivo'].includes(c.tipo)) {
                     saldoProyectado = c.saldo * factor;
                }

                return {
                    ...c,
                    saldoBase: c.saldo,
                    saldoProyectado: saldoProyectado
                };
            });

        const activos = agrupar('Activo');
        const pasivos = agrupar('Pasivo');

        // --- PASO 2: PATRIMONIO ---
        const patrimonio = cuentasBase.filter(c => c.tipo === 'Patrimonio').map(c => ({
            ...c,
            saldoBase: c.saldo,
            saldoProyectado: c.saldo // Capital Social se mantiene fijo
        }));

        // --- PASO 3: CALCULAR TOTALES (EN ORDEN) ---
        const totalActivosBase = activos.reduce((sum, c) => sum + c.saldoBase, 0);
        const totalActivosProy = activos.reduce((sum, c) => sum + c.saldoProyectado, 0);

        // Nota: Pasivos y Patrimonio son NEGATIVOS en la BD
        const totalPasivosBase = pasivos.reduce((sum, c) => sum + c.saldoBase, 0);
        const totalPasivosProy = pasivos.reduce((sum, c) => sum + c.saldoProyectado, 0);

        const totalPatrimonioBase = patrimonio.reduce((sum, c) => sum + c.saldoBase, 0);
        
        // --- PASO 4: CÁLCULO DE AJUSTES (CONTABILIDAD PURA) ---
        
        // Ecuación: Activo + Pasivo + Patrimonio = 0
        // Despejamos el Patrimonio Total Necesario:
        // Patrimonio_Proy = -(Activo_Proy + Pasivo_Proy)
        // Ejemplo: -(110 + -40) = -(70) = -70
        const totalPatrimonioProyCalculado = -(totalActivosProy + totalPasivosProy);
        
        // La "Utilidad Requerida" es la diferencia entre lo que necesitamos tener y lo que ya tenemos (Capital)
        // Utilidad = Patrimonio_Necesario - Capital_Base
        const utilidadProyectada = totalPatrimonioProyCalculado - totalPatrimonioBase;
        
        return {
            activos,
            pasivos,
            patrimonio,
            utilidadProyectada, // Este valor será negativo en BD (Haber), pero positivo visualmente
            totales: {
                activosBase: totalActivosBase,
                activosProy: totalActivosProy,
                pasivosBase: totalPasivosBase * -1, // Invertir para visualización
                pasivosProy: totalPasivosProy * -1,
                patrimonioBase: totalPatrimonioBase * -1,
                patrimonioProy: totalPatrimonioProyCalculado * -1 
            }
        };
    }, [cuentasBase, porcentajeCrecimiento]);

    const formatMoney = (val) => `C$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    return (
        <div className="p-1 mt-4">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="flex flex-col gap-1">
                    <h4 className="font-semibold text-xl text-title flex items-center gap-2">
                        <TrendingUp className="text-green-500" /> Proyecciones Financieras
                    </h4>
                    <p className="text-subtitle text-sm">Escenario basado en el balance de {alcanceSucursalNombre.toLowerCase()}.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 bg-secondary p-3 rounded-xl border border-secondary">
                    <SucursalAlcanceFinanciero />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-subtitle uppercase">Fecha Base</label>
                        <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-1.5 border border-secondary">
                            <Calendar size={16} className="text-subtitle" />
                            <input 
                                type="date" 
                                value={fechaBase} 
                                onChange={(e) => setFechaBase(e.target.value)}
                                className="bg-transparent outline-none text-title text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-subtitle uppercase">% Crecimiento</label>
                        <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-1.5 border border-secondary">
                            <Percent size={16} className="text-green-500" />
                            <input 
                                type="number" 
                                value={porcentajeCrecimiento} 
                                onChange={(e) => setPorcentajeCrecimiento(Number(e.target.value))}
                                className="bg-transparent outline-none text-title text-sm w-20 font-bold"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* TABLA DE PROYECCIÓN */}
            <div className="bg-primary border border-secondary rounded-2xl p-6 shadow-lg overflow-x-auto">
                {isLoading ? (
                    <p className="text-center py-10 text-subtitle">Calculando escenario...</p>
                ) : !datosProyectados ? (
                    <p className="text-center py-10 text-subtitle">No hay datos base para proyectar.</p>
                ) : (
                    <div className="min-w-[700px]">
                        <div className="grid grid-cols-4 text-right font-bold text-subtitle border-b border-secondary pb-2 mb-2 uppercase text-xs">
                            <span className="text-left pl-2">Rubro Contable</span>
                            <span>Saldo Actual (Base)</span>
                            <span className="text-green-500">Saldo Proyectado ({porcentajeCrecimiento}%)</span>
                            <span>Diferencia</span>
                        </div>

                        {/* ACTIVOS */}
                        <div className="mb-4">
                            <h5 className="text-green-600 font-bold text-sm mb-2 pl-2">ACTIVOS</h5>
                            {datosProyectados.activos.map(c => (
                                <FilaProyeccion key={c.id_cuenta} label={c.cuenta} base={c.saldoBase} proy={c.saldoProyectado} />
                            ))}
                            <FilaTotal label="TOTAL ACTIVOS" base={datosProyectados.totales.activosBase} proy={datosProyectados.totales.activosProy} />
                        </div>

                        {/* PASIVOS */}
                        <div className="mb-4">
                            <h5 className="text-red-500 font-bold text-sm mb-2 pl-2">PASIVOS</h5>
                            {datosProyectados.pasivos.map(c => (
                                <FilaProyeccion key={c.id_cuenta} label={c.cuenta} base={c.saldoBase * -1} proy={c.saldoProyectado * -1} />
                            ))}
                            <FilaTotal label="TOTAL PASIVOS" base={datosProyectados.totales.pasivosBase} proy={datosProyectados.totales.pasivosProy} />
                        </div>

                        {/* PATRIMONIO */}
                        <div className="mb-4">
                            <h5 className="text-blue-500 font-bold text-sm mb-2 pl-2">PATRIMONIO</h5>
                            {datosProyectados.patrimonio.map(c => (
                                <FilaProyeccion key={c.id_cuenta} label={c.cuenta} base={c.saldoBase * -1} proy={c.saldoProyectado * -1} />
                            ))}
                            {/* Fila especial de ajuste */}
                            <div className="grid grid-cols-4 text-right py-2 border-b border-dashed border-secondary bg-blue-500/5">
                                <span className="text-left pl-4 text-blue-400 font-semibold italic">Utilidad del Ejercicio Proyectada</span>
                                <span className="text-subtitle text-sm">-</span>
                                <span className="text-title font-bold text-sm">C$ {(datosProyectados.utilidadProyectada * -1).toFixed(2)}</span>
                                <span className="text-green-400 text-sm">+ C$ {(datosProyectados.utilidadProyectada * -1).toFixed(2)}</span>
                            </div>
                            
                            <FilaTotal label="TOTAL PATRIMONIO" base={datosProyectados.totales.patrimonioBase} proy={datosProyectados.totales.patrimonioProy} />
                        </div>

                        {/* ECUACIÓN CONTABLE */}
                        <div className="mt-6 p-4 bg-secondary/10 rounded-xl border border-secondary flex justify-between items-center">
                            <span className="font-bold text-title">VERIFICACIÓN (Pasivo + Patrimonio)</span>
                            <div className="flex gap-8">
                                <div className="text-right">
                                    <p className="text-xs text-subtitle uppercase">Actual</p>
                                    <p className="font-mono font-bold text-lg">{formatMoney(datosProyectados.totales.pasivosBase + datosProyectados.totales.patrimonioBase)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-green-500 uppercase font-bold">Proyectado</p>
                                    <p className="font-mono font-bold text-lg text-green-400">{formatMoney(datosProyectados.totales.pasivosProy + datosProyectados.totales.patrimonioProy)}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-6 p-6 bg-gradient-to-br from-secondary/20 to-primary border border-secondary rounded-2xl">
                            <h3 className="text-lg font-bold text-title mb-4 flex items-center gap-2">
                                <Calculator className="text-blue-400" /> Análisis de Financiamiento
                            </h3>
                            <p className="text-subtitle text-sm mb-4">
                                Para lograr un crecimiento del <span className="text-green-400 font-bold">{porcentajeCrecimiento}%</span> en activos, 
                                la empresa necesitará aumentar sus recursos en <span className="font-bold text-title">{formatMoney(datosProyectados.totales.activosProy - datosProyectados.totales.activosBase)}</span>.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-secondary/30 p-4 rounded-xl">
                                    <p className="text-xs text-subtitle uppercase">Financiamiento vía Pasivos</p>
                                    <p className="text-lg font-mono text-red-400 font-bold">
                                        {formatMoney((datosProyectados.totales.pasivosProy - datosProyectados.totales.pasivosBase))}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Proveedores y Deudas que crecen solos</p>
                                </div>
                                
                                <div className="bg-secondary/30 p-4 rounded-xl border border-green-500/30">
                                    <p className="text-xs text-subtitle uppercase">Utilidad Neta Requerida</p>
                                    <p className="text-lg font-mono text-green-400 font-bold">
                                        {formatMoney((datosProyectados.utilidadProyectada * -1))}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Ganancia necesaria para no pedir prestado</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Subcomponentes para limpiar el código
const FilaProyeccion = ({ label, base, proy }) => {
    const diff = proy - base;
    return (
        <div className="grid grid-cols-4 text-right py-2 border-b border-secondary hover:bg-secondary/5 transition-colors">
            <span className="text-left pl-2 text-title font-medium truncate">{label}</span>
            <span className="text-subtitle text-sm">C$ {base.toFixed(2)}</span>
            <span className="text-title font-bold text-sm">C$ {proy.toFixed(2)}</span>
            <span className={`text-xs font-medium ${diff > 0 ? 'text-green-500' : 'text-gray-500'}`}>
                {diff > 0 ? '+' : ''}{diff.toFixed(2)}
            </span>
        </div>
    );
};

const FilaTotal = ({ label, base, proy }) => (
    <div className="grid grid-cols-4 text-right py-2 mt-1 bg-secondary/20 font-bold rounded-lg">
        <span className="text-left pl-2 text-title">{label}</span>
        <span className="text-subtitle text-sm">C$ {base.toFixed(2)}</span>
        <span className="text-green-400 text-sm">C$ {proy.toFixed(2)}</span>
        <span className="text-gray-400 text-xs">{(proy - base).toFixed(2)}</span>
    </div>
);