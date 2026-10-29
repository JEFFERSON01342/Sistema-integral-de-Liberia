import React from 'react';

// --- COMPONENTE DE FILA DE CUENTAS (ACTUALIZADO) ---
const CuentaRowComparativa = ({ cuenta, tipo, datosAnteriores, baseVerticalActual, baseVerticalAnterior }) => {
    // 1. SALDOS
    const cuentaAnterior = datosAnteriores?.cuentas?.find(c => c.id_cuenta === cuenta.id_cuenta);
    const saldoAnterior = cuentaAnterior ? (tipo !== 'Activo' ? cuentaAnterior.saldo * -1 : cuentaAnterior.saldo) : 0;
    const saldoActual = (tipo !== 'Activo' ? (cuenta.saldo * -1) : cuenta.saldo);

    // 2. ANÁLISIS HORIZONTAL
    const varAbsoluta = saldoActual - saldoAnterior;
    const varRelativa = saldoAnterior !== 0 ? (varAbsoluta / saldoAnterior) * 100 : 0;

    // 3. ANÁLISIS VERTICAL
    const verticalActual = baseVerticalActual !== 0 ? (saldoActual / baseVerticalActual) * 100 : 0;
    const verticalAnterior = baseVerticalAnterior !== 0 ? (saldoAnterior / baseVerticalAnterior) * 100 : 0;

    return (
        <div className="grid grid-cols-7 items-center py-1.5 text-right">
            <span className="text-sm text-title col-span-1 text-left">{cuenta.cuenta}</span>
            <span className="text-sm text-title col-span-1">C$ {saldoActual.toFixed(2)}</span>
            <span className="text-sm text-title col-span-1">{verticalActual.toFixed(1)}%</span>
            <span className="text-sm text-title col-span-1">C$ {saldoAnterior.toFixed(2)}</span>
            <span className="text-sm text-title col-span-1">{verticalAnterior.toFixed(1)}%</span>
            <span className={`text-sm text-title col-span-1`}>
                {varAbsoluta.toFixed(2)}
            </span>
            <span className={`text-sm text-title col-span-1`}>
                {varRelativa.toFixed(1)}%
            </span>
        </div>
    );
};

// --- COMPONENTE DE FILA DE TOTALES (ACTUALIZADO) ---
const TotalRowComparativa = ({ label, totalActual, totalAnterior, tipo = 'Activo', baseVerticalActual, baseVerticalAnterior, isMainTotal = false }) => {
    // 1. SALDOS
    const saldoActual = (tipo !== 'Activo' ? (totalActual * -1) : totalActual);
    const saldoAnterior = (tipo !== 'Activo' ? (totalAnterior * -1) : totalAnterior);

    // 2. ANÁLISIS HORIZONTAL
    const varAbsoluta = saldoActual - saldoAnterior;
    const varRelativa = saldoAnterior !== 0 ? (varAbsoluta / saldoAnterior) * 100 : 0;

    // 3. ANÁLISIS VERTICAL
    const verticalActual = baseVerticalActual !== 0 ? (saldoActual / baseVerticalActual) * 100 : 0;
    const verticalAnterior = baseVerticalAnterior !== 0 ? (saldoAnterior / baseVerticalAnterior) * 100 : 0;

    const borderClass = isMainTotal ? 'border-t-2 border-secondary' : 'border-t border-secondary';

    return (
        <div className={`grid grid-cols-7 items-center py-1.5 mt-1 font-semibold text-right ${borderClass}`}>
            <span className="text-sm text-title col-span-1 text-left">{label}</span>
            <span className="text-sm text-title col-span-1">C$ {saldoActual.toFixed(2)}</span>
            <span className="text-sm text-title col-span-1">{verticalActual.toFixed(1)}%</span>
            <span className="text-sm text-title col-span-1">C$ {saldoAnterior.toFixed(2)}</span>
            <span className="text-sm text-title col-span-1">{verticalAnterior.toFixed(1)}%</span>
            <span className={`text-sm col-span-1`}>
                {varAbsoluta.toFixed(2)}
            </span>
            <span className={`text-sm col-span-1`}>
                {varRelativa.toFixed(1)}%
            </span>
        </div>
    );
};

// --- COMPONENTE DE REPORTE PRINCIPAL ---
export default function BalanceGeneralReporte({
    isLoading,
    datosActuales,
    datosAnteriores
}) {

    const ordenActivos = ["Activo Corriente", "Activo No Corriente", "Otros Activos"];
    const ordenPasivos = ["Pasivo Corriente", "Pasivo No Corriente", "Otros Pasivos"];
    const getSortIndex = (ordenArray, nombreSubtipo) => {
        const index = ordenArray.indexOf(nombreSubtipo);
        return index === -1 ? 99 : index;
    };

    // --- 1. SACA TODAS LAS VARIABLES (CON VALORES POR DEFECTO) ---
    const {
        activosAgrupados = {},
        totalActivos = 0,
        pasivosAgrupados = {},
        patrimonio = [],
        totalPasivos = 0,
        totalPatrimonioCuentas = 0,
        utilidadNeta = 0
    } = datosActuales || {};

    const {
        activosAgrupados: activosAgrupadosAnterior = {},
        pasivosAgrupados: pasivosAgrupadosAnterior = {},
        patrimonio: patrimonioAnterior = [],
        totalActivos: totalActivosAnterior = 0, // <-- Necesario para el vertical
        totalPasivos: totalPasivosAnterior = 0,
        totalPatrimonioCuentas: totalPatrimonioCuentasAnterior = 0,
        utilidadNeta: utilidadNetaAnterior = 0
    } = datosAnteriores || {};

    // --- 2. CÁLCULO DE TOTALES (AHORA SEGURO) ---
    const totalPatrimonioFinal = totalPatrimonioCuentas + utilidadNeta;
    const totalPasivoMasPatrimonio = totalPasivos + totalPatrimonioFinal;
    // Totales Anteriores
    const totalPatrimonioFinalAnterior = totalPatrimonioCuentasAnterior + utilidadNetaAnterior;
    const totalPasivoMasPatrimonioAnterior = totalPasivosAnterior + totalPatrimonioFinalAnterior;

    // Encabezados de Columna (7 COLUMNAS)
    const Encabezados = () => (
        <div className="grid grid-cols-7 items-center py-2 mt-4 border-b border-secondary text-right min-w-[700px]">
            <span className="text-sm font-semibold text-title col-span-1 text-left">Cuenta</span>
            <span className="text-sm font-semibold text-title col-span-1">Actual</span>
            <span className="text-sm font-semibold text-title col-span-1">% Actual</span>
            <span className="text-sm font-semibold text-title col-span-1">Anterior</span>
            <span className="text-sm font-semibold text-title col-span-1">% Anterior</span>
            <span className="text-sm font-semibold text-title col-span-1">Var. Abs.</span>
            <span className="text-sm font-semibold text-title col-span-1">Var. Rel. %</span>
        </div>
    );

    return (
        <div className="mt-4 flex flex-col md:flex-row justify-between gap-4">
            <div className="rounded-xl border-1 border-secondary p-4 w-full">
                <h1 className="text-green-600 font-semibold text-lg">Activos</h1>
                <p className="text-subtitle">Recursos controlados por la empresa</p>
                <Encabezados />
                <div className="mt-2 min-w-[700px]">
                    {isLoading ? <p>Cargando...</p> : (
                        Object.entries(activosAgrupados)
                            .sort(([a], [b]) => getSortIndex(ordenActivos, a) - getSortIndex(ordenActivos, b))
                            .map(([subtipoNombre, data]) => {
                                const dataAnterior = activosAgrupadosAnterior[subtipoNombre] || { cuentas: [], total: 0 };
                                return (
                                    <div key={subtipoNombre} className="mb-3">
                                        <h2 className="text-title font-semibold mt-2 text-left">{subtipoNombre}</h2>
                                        {data.cuentas.map(cuenta => (
                                            <CuentaRowComparativa
                                                key={cuenta.id_cuenta}
                                                cuenta={cuenta}
                                                tipo="Activo"
                                                datosAnteriores={dataAnterior}
                                                baseVerticalActual={totalActivos}
                                                baseVerticalAnterior={totalActivosAnterior}
                                            />
                                        ))}
                                        <TotalRowComparativa
                                            label={`Total ${subtipoNombre}`}
                                            totalActual={data.total}
                                            totalAnterior={dataAnterior.total}
                                            tipo="Activo"
                                            baseVerticalActual={totalActivos}
                                            baseVerticalAnterior={totalActivosAnterior}
                                        />
                                    </div>
                                );
                            })
                    )}
                    <TotalRowComparativa
                        label="TOTAL ACTIVOS"
                        totalActual={totalActivos}
                        totalAnterior={totalActivosAnterior}
                        tipo="Activo"
                        baseVerticalActual={totalActivos}
                        baseVerticalAnterior={totalActivosAnterior}
                        isMainTotal={true}
                    />
                </div>
            </div>

            <div className="rounded-xl border-1 border-secondary p-4 w-full">
                <h1 className="text-red-700 font-semibold text-lg">Pasivos y Patrimonio</h1>
                <p className="text-subtitle">Obligaciones y capital de la empresa</p>
                <Encabezados />
                <div className="mt-2 min-w-[700px]">
                    {isLoading ? <p>Cargando...</p> : (
                        Object.entries(pasivosAgrupados)
                            .sort(([a], [b]) => getSortIndex(ordenPasivos, a) - getSortIndex(ordenPasivos, b))
                            .map(([subtipoNombre, data]) => {
                                const dataAnterior = pasivosAgrupadosAnterior[subtipoNombre] || { cuentas: [], total: 0 };
                                return (
                                    <div key={subtipoNombre} className="mb-3">
                                        <h2 className="text-title font-semibold mt-2 text-left">{subtipoNombre}</h2>
                                        {data.cuentas.map(cuenta => (
                                            <CuentaRowComparativa
                                                key={cuenta.id_cuenta}
                                                cuenta={cuenta}
                                                tipo="Pasivo"
                                                datosAnteriores={dataAnterior}
                                                baseVerticalActual={totalPasivoMasPatrimonio}
                                                baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                                            />
                                        ))}
                                        <TotalRowComparativa
                                            label={`Total ${subtipoNombre}`}
                                            totalActual={data.total}
                                            totalAnterior={dataAnterior.total}
                                            tipo="Pasivo"
                                            baseVerticalActual={totalPasivoMasPatrimonio}
                                            baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                                        />
                                    </div>
                                );
                            })
                    )}
                    <TotalRowComparativa
                        label="Total Pasivos"
                        totalActual={totalPasivos}
                        totalAnterior={totalPasivosAnterior}
                        tipo="Activo"
                        baseVerticalActual={totalPasivoMasPatrimonio}
                        baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                    />

                    <h2 className="text-title font-semibold mt-4 text-left">Patrimonio</h2>
                    {isLoading ? <p>Cargando...</p> : (
                        patrimonio.map(cuenta => (
                            <CuentaRowComparativa
                                key={cuenta.id_cuenta}
                                cuenta={cuenta}
                                tipo="Patrimonio"
                                datosAnteriores={{ cuentas: patrimonioAnterior }}
                                baseVerticalActual={totalPasivoMasPatrimonio}
                                baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                            />
                        ))
                    )}

                    {/* Fila custom para Utilidad del Periodo (no es una cuenta) */}
                    <TotalRowComparativa
                        label="Utilidad (o Pérdida) del Período"
                        totalActual={utilidadNeta}
                        totalAnterior={utilidadNetaAnterior}
                        tipo="Activo"
                        baseVerticalActual={totalPasivoMasPatrimonio}
                        baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                    />

                    <TotalRowComparativa
                        label="Total Patrimonio"
                        totalActual={totalPatrimonioFinal}
                        totalAnterior={totalPatrimonioFinalAnterior}
                        tipo="Activo"
                        baseVerticalActual={totalPasivoMasPatrimonio}
                        baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                    />

                    <TotalRowComparativa
                        label="TOTAL PASIVO + PATRIMONIO"
                        totalActual={totalPasivoMasPatrimonio}
                        totalAnterior={totalPasivoMasPatrimonioAnterior}
                        tipo="Activo"
                        baseVerticalActual={totalPasivoMasPatrimonio}
                        baseVerticalAnterior={totalPasivoMasPatrimonioAnterior}
                        isMainTotal={true}
                    />
                </div>
            </div>
        </div>
    );
}