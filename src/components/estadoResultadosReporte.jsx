import React from 'react';

// --- COMPONENTE DE FILA (7 COLUMNAS) ---
const CuentaRowComparativa = ({ cuenta, tipo, datosAnteriores, baseVerticalActual, baseVerticalAnterior }) => {
    // 1. SALDOS
    const cuentaAnterior = datosAnteriores?.cuentas?.find(c => c.id_cuenta === cuenta.id_cuenta);
    // Los saldos P&L (Ingreso, Costo, Gasto) del periodo anterior son 0 si no se seleccionó rango.
    const saldoActual = (tipo === 'Ingreso' ? (cuenta.saldo * -1) : cuenta.saldo);
    // Si existe cuenta anterior, usa su saldo, si no, 0.
    const saldoAnterior = cuentaAnterior ? (tipo === 'Ingreso' ? (cuentaAnterior.saldo * -1) : cuentaAnterior.saldo) : 0;

    // 2. ANÁLISIS HORIZONTAL
    const varAbsoluta = saldoActual - saldoAnterior;
    const varRelativa = saldoAnterior !== 0 ? (varAbsoluta / saldoAnterior) * 100 : 0;

    // 3. ANÁLISIS VERTICAL
    const verticalActual = baseVerticalActual !== 0 ? (saldoActual / baseVerticalActual) * 100 : 0;
    const verticalAnterior = baseVerticalAnterior !== 0 ? (saldoAnterior / baseVerticalAnterior) * 100 : 0;

    return (
        <div className="grid grid-cols-7 items-center py-1.5 text-right transition-colors">
            <span className="text-sm text-title col-span-1 text-left truncate pr-2" title={cuenta.cuenta}>{cuenta.cuenta}</span>
            <span className="text-sm text-title col-span-1">C$ {saldoActual.toFixed(2)}</span>
            <span className="text-sm text-subtitle col-span-1">{verticalActual.toFixed(1)}%</span>
            <span className="text-sm text-title col-span-1">C$ {saldoAnterior.toFixed(2)}</span>
            <span className="text-sm text-subtitle col-span-1">{verticalAnterior.toFixed(1)}%</span>
            <span className={`text-sm col-span-1 ${varAbsoluta >= 0 ? 'text-green-500' : 'text-red-500'}`}>{varAbsoluta.toFixed(2)}</span>
            <span className={`text-sm col-span-1 ${varRelativa >= 0 ? 'text-green-500' : 'text-red-500'}`}>{varRelativa.toFixed(1)}%</span>
        </div>
    );
};

// --- COMPONENTE DE FILA DE TOTAL (7 COLUMNAS) ---
const TotalRowComparativa = ({ label, totalActual, totalAnterior, tipo = 'Ingreso', baseVerticalActual, baseVerticalAnterior, isMainTotal = false }) => {
    // Ajuste de signos para mostrar positivos en el reporte
    const saldoActual = (tipo === 'Ingreso' || tipo === 'Resultado' ? (totalActual) : totalActual);
    const saldoAnterior = (tipo === 'Ingreso' || tipo === 'Resultado' ? (totalAnterior) : totalAnterior);

    const varAbsoluta = saldoActual - saldoAnterior;
    const varRelativa = saldoAnterior !== 0 ? (varAbsoluta / saldoAnterior) * 100 : 0;

    const verticalActual = baseVerticalActual !== 0 ? (saldoActual / baseVerticalActual) * 100 : 0;
    const verticalAnterior = baseVerticalAnterior !== 0 ? (saldoAnterior / baseVerticalAnterior) * 100 : 0;

    const borderClass = isMainTotal ? 'border-t border-secondary mt-2 pt-2' : 'border-t border-secondary mt-1 pt-1';
    // Lógica de color simple: Positivo = Verde, Negativo = Rojo
    const getColor = (val) => val >= 0 ? 'text-green-500' : 'text-red-500';

    return (
        <div className={`grid grid-cols-7 items-center py-1.5 font-bold text-right ${borderClass}`}>
            <span className="text-sm text-title col-span-1 text-left">{label}</span>
            <span className={`text-sm col-span-1 ${getColor(saldoActual)}`}>C$ {saldoActual.toFixed(2)}</span>
            <span className="text-sm text-title col-span-1">{verticalActual.toFixed(1)}%</span>
            <span className={`text-sm col-span-1 ${getColor(saldoAnterior)}`}>C$ {saldoAnterior.toFixed(2)}</span>
            <span className="text-sm text-title col-span-1">{verticalAnterior.toFixed(1)}%</span>
            <span className={`text-sm col-span-1 ${getColor(varAbsoluta)}`}>{varAbsoluta.toFixed(2)}</span>
            <span className={`text-sm col-span-1 ${getColor(varRelativa)}`}>{varRelativa.toFixed(1)}%</span>
        </div>
    );
};


// --- COMPONENTE DE REPORTE PRINCIPAL ---
export default function EstadoResultadosReporte({
    isLoading,
    datosActuales,
    datosAnteriores
}) {

    const {
        ingresosAgrupados = [],
        costosAgrupados = [],
        gastosAgrupados = {},
        totalIngresos = 0,
        totalCostos = 0,
        totalGastos = 0
    } = datosActuales || {};

    const {
        totalIngresos: totalIngresosAnterior = 0,
        totalCostos: totalCostosAnterior = 0,
        totalGastos: totalGastosAnterior = 0,
        ingresosAgrupados: ingresosAnteriores = [],
        costosAgrupados: costosAnteriores = [],
        gastosAgrupados: gastosAnteriores = {}
    } = datosAnteriores || {};

    // --- CÁLCULOS ---
    // Nota: Los ingresos suelen venir negativos de la BD (Haber), los multiplicamos por -1 para mostrar positivo.
    // Los gastos/costos suelen venir positivos (Debe).

    // ACTUAL
    const tIngresos = totalIngresos * -1;
    const tCostos = totalCostos;
    const tGastos = totalGastos;

    const utilidadBruta = tIngresos - tCostos;
    const utilidadAntesDeImpuestos = utilidadBruta - tGastos;
    const impuestoIR = (utilidadAntesDeImpuestos > 0) ? (utilidadAntesDeImpuestos * 0.30) : 0;
    const utilidadNeta = utilidadAntesDeImpuestos - impuestoIR;

    // Base para análisis vertical (Ventas Netas)
    const baseVerticalActual = tIngresos;

    // ANTERIOR
    const tIngresosAnt = totalIngresosAnterior * -1;
    const tCostosAnt = totalCostosAnterior;
    const tGastosAnt = totalGastosAnterior;

    const utilidadBrutaAnterior = tIngresosAnt - tCostosAnt;
    const utilidadAntesDeImpuestosAnterior = utilidadBrutaAnterior - tGastosAnt;
    const impuestoIRAnterior = (utilidadAntesDeImpuestosAnterior > 0) ? (utilidadAntesDeImpuestosAnterior * 0.30) : 0;
    const utilidadNetaAnterior = utilidadAntesDeImpuestosAnterior - impuestoIRAnterior;
    const baseVerticalAnterior = tIngresosAnt;


    // Encabezados
    const Encabezados = () => (
        <div className="grid grid-cols-7 items-center py-2 mt-4 border-b border-secondary text-right min-w-[700px] font-bold text-title">
            <span className="col-span-1 text-left">Cuenta</span>
            <span className="col-span-1">Actual</span>
            <span className="col-span-1">% Act</span>
            <span className="col-span-1">Anterior</span>
            <span className="col-span-1">% Ant</span>
            <span className="col-span-1">Var. Abs</span>
            <span className="col-span-1">Var. %</span>
        </div>
    );

    return (
        <div className="mt-4 rounded-xl border-1 border-secondary p-4 w-full overflow-x-auto">
            <div className="min-w-[800px]"> {/* Contenedor interno para forzar el ancho */}
                <h1 className="text-green-600 font-semibold text-lg">Ingresos</h1>
                <Encabezados />

                <div className="mt-2 mb-4">
                    {isLoading ? <p className="text-center py-4">Cargando datos...</p> : (
                        ingresosAgrupados.map(cuenta => (
                            <CuentaRowComparativa
                                key={cuenta.id_cuenta}
                                cuenta={cuenta}
                                tipo="Ingreso"
                                datosAnteriores={{ cuentas: ingresosAnteriores }}
                                baseVerticalActual={baseVerticalActual}
                                baseVerticalAnterior={baseVerticalAnterior}
                            />
                        ))
                    )}
                    <TotalRowComparativa
                        label="VENTAS NETAS"
                        totalActual={tIngresos}
                        totalAnterior={tIngresosAnt}
                        tipo="Resultado"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                    />
                </div>

                <h1 className="text-title font-semibold text-lg mt-6">Costos de Venta</h1>
                <div className="mt-2 mb-4">
                    {isLoading ? <p>Cargando...</p> : (
                        costosAgrupados.map(cuenta => (
                            <CuentaRowComparativa
                                key={cuenta.id_cuenta}
                                cuenta={cuenta}
                                tipo="Costo"
                                datosAnteriores={{ cuentas: costosAnteriores }}
                                baseVerticalActual={baseVerticalActual}
                                baseVerticalAnterior={baseVerticalAnterior}
                            />
                        ))
                    )}
                    <TotalRowComparativa
                        label="TOTAL COSTOS"
                        totalActual={tCostos}
                        totalAnterior={tCostosAnt}
                        tipo="Gasto"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                    />
                </div>

                <div className="bg-secondary/10 p-2 rounded-lg my-4">
                    <TotalRowComparativa
                        label="UTILIDAD BRUTA"
                        totalActual={utilidadBruta}
                        totalAnterior={utilidadBrutaAnterior}
                        tipo="Resultado"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                        isMainTotal={true}
                    />
                </div>

                <h1 className="text-red-500 font-semibold text-lg ">Gastos Operativos</h1>
                <div className="mt-2 mb-4">
                    {isLoading ? <p>Cargando...</p> : (
                        Object.entries(gastosAgrupados).map(([subtipoNombre, data]) => {
                            const dataAnterior = gastosAnteriores[subtipoNombre] || { cuentas: [], total: 0 };
                            return (
                                <div key={subtipoNombre} className="mb-2">
                                    {data.cuentas.map(cuenta => (
                                        <CuentaRowComparativa
                                            key={cuenta.id_cuenta}
                                            cuenta={cuenta}
                                            tipo="Gasto"
                                            datosAnteriores={{ cuentas: dataAnterior.cuentas }}
                                            baseVerticalActual={baseVerticalActual}
                                            baseVerticalAnterior={baseVerticalAnterior}
                                        />
                                    ))}
                                </div>
                            )
                        })
                    )}
                    <TotalRowComparativa
                        label="TOTAL GASTOS OPERATIVOS"
                        totalActual={tGastos}
                        totalAnterior={tGastosAnt}
                        tipo="Gasto"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                    />
                </div>

                <div className="mt-4">
                    <TotalRowComparativa
                        label="UTILIDAD ANTES DE IMPUESTOS"
                        totalActual={utilidadAntesDeImpuestos}
                        totalAnterior={utilidadAntesDeImpuestosAnterior}
                        tipo="Resultado"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                    />
                    <TotalRowComparativa
                        label="(-) Impuesto Sobre la Renta (30%)"
                        totalActual={impuestoIR}
                        totalAnterior={impuestoIRAnterior}
                        tipo="Gasto"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                    />
                </div>

                <div className="bg-secondary/20 p-4 rounded-xl ">
                    <TotalRowComparativa
                        label="UTILIDAD NETA DEL PERÍODO"
                        totalActual={utilidadNeta}
                        totalAnterior={utilidadNetaAnterior}
                        tipo="Resultado"
                        baseVerticalActual={baseVerticalActual}
                        baseVerticalAnterior={baseVerticalAnterior}
                        isMainTotal={true}
                    />
                </div>

            </div>
        </div>
    );
}