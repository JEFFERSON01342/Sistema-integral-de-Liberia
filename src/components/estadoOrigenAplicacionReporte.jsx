import React, { useMemo } from 'react';

export default function EstadoOrigenAplicacionReporte({ isLoading, datosActuales, datosAnteriores }) {

    const reporte = useMemo(() => {
        if (!datosActuales || !datosAnteriores) return { lineas: [], totalOrigen: 0, totalAplicacion: 0 };

        const lineas = [];
        let totalOrigen = 0;
        let totalAplicacion = 0;

        // Helper para procesar una cuenta individual
        const procesarCuenta = (nombreCuenta, saldoActual, saldoAnterior, tipo) => {
            // Asegurarnos que sean números
            const act = Number(saldoActual) || 0;
            const ant = Number(saldoAnterior) || 0;
            
            // Importante: Trabajamos con valores ABSOLUTOS (Positivos) para simplificar la lógica financiera.
            // (En tu BD los pasivos son negativos, aquí los volvemos positivos para comparar magnitud)
            const saldoActAbs = Math.abs(act);
            const saldoAntAbs = Math.abs(ant);

            const variacion = saldoActAbs - saldoAntAbs;
            
            // Si no hubo cambio significativo, ignorar para limpiar el reporte
            if (Math.abs(variacion) < 0.01) return;

            let esOrigen = false;
            let esAplicacion = false;

            // --- REGLAS DE ORO FINANCIERAS ---
            if (tipo === 'Activo') {
                // Caso especial: Depreciación Acumulada (Contra-Activo)
                // Si aumenta la depreciación (se vuelve más negativa), es un Origen (ahorro no monetario).
                if (nombreCuenta.toLowerCase().includes('depreciacion') || nombreCuenta.toLowerCase().includes('depreciación')) {
                     if (variacion > 0) esOrigen = true; 
                     else esAplicacion = true;
                } else {
                    // Activo Normal:
                    // Aumento (+) -> Aplicación (Usé dinero para comprar activo)
                    // Disminución (-) -> Origen (Vendí activo y entró dinero)
                    if (variacion > 0) esAplicacion = true;
                    else esOrigen = true;
                }
            } else {
                // Pasivo y Patrimonio:
                // Aumento (+) -> Origen (Me prestaron dinero o gané capital)
                // Disminución (-) -> Aplicación (Pagué deuda o retiré capital)
                if (variacion > 0) esOrigen = true;
                else esAplicacion = true;
            }

            const monto = Math.abs(variacion);

            if (esOrigen) totalOrigen += monto;
            if (esAplicacion) totalAplicacion += monto;

            lineas.push({
                cuenta: nombreCuenta,
                variacion: variacion,
                origen: esOrigen ? monto : 0,
                aplicacion: esAplicacion ? monto : 0
            });
        };

        // --- 1. PROCESAR TODOS LOS ACTIVOS ---
        // Recorremos el objeto 'activosAgrupados' (Activo Corriente, No Corriente, etc.)
        Object.values(datosActuales.activosAgrupados || {}).forEach(grupo => {
            grupo.cuentas.forEach(c => {
                // Buscar el saldo de esta misma cuenta en el periodo anterior
                let saldoAnt = 0;
                // Buscamos en todos los grupos anteriores por si cambió de grupo (raro, pero seguro)
                Object.values(datosAnteriores.activosAgrupados || {}).forEach(gAnt => {
                    const cuentaAnt = gAnt.cuentas.find(ca => ca.id_cuenta === c.id_cuenta);
                    if (cuentaAnt) saldoAnt = cuentaAnt.saldo;
                });
                
                procesarCuenta(c.cuenta, c.saldo, saldoAnt, 'Activo');
            });
        });

        // --- 2. PROCESAR TODOS LOS PASIVOS ---
        Object.values(datosActuales.pasivosAgrupados || {}).forEach(grupo => {
            grupo.cuentas.forEach(c => {
                let saldoAnt = 0;
                Object.values(datosAnteriores.pasivosAgrupados || {}).forEach(gAnt => {
                    const cuentaAnt = gAnt.cuentas.find(ca => ca.id_cuenta === c.id_cuenta);
                    if (cuentaAnt) saldoAnt = cuentaAnt.saldo;
                });

                procesarCuenta(c.cuenta, c.saldo, saldoAnt, 'Pasivo');
            });
        });

        // --- 3. PROCESAR PATRIMONIO ---
        (datosActuales.patrimonio || []).forEach(c => {
            const cuentaAnt = (datosAnteriores.patrimonio || []).find(ca => ca.id_cuenta === c.id_cuenta);
            const saldoAnt = cuentaAnt ? cuentaAnt.saldo : 0;
            procesarCuenta(c.cuenta, c.saldo, saldoAnt, 'Patrimonio');
        });

        // --- 4. PROCESAR UTILIDAD DEL PERÍODO ---
        // La utilidad no es una cuenta física, es calculada, pero es VITAL en este reporte.
        const utilidadActual = datosActuales.utilidadNeta || 0;
        const utilidadAnterior = datosAnteriores.utilidadNeta || 0;
        
        // La utilidad se comporta como Patrimonio (Aumento = Origen)
        procesarCuenta("Utilidad (o Pérdida) del Período", utilidadActual, utilidadAnterior, 'Patrimonio');

        return { lineas, totalOrigen, totalAplicacion };

    }, [datosActuales, datosAnteriores]);

    if (isLoading) return <p className="text-center py-8">Cargando...</p>;

    return (
        <div className="mt-4 rounded-xl border-1 border-secondary p-4 w-full overflow-x-auto">
            <div className="min-w-[700px]">
                <h1 className="text-title font-semibold text-lg mb-4">Estado de Origen y Aplicación de Fondos</h1>
                
                <div className="grid grid-cols-4 font-bold text-right border-b border-secondary pb-2 mb-2 text-title">
                    <span className="text-left pl-2">Cuenta / Rubro</span>
                    <span>Variación Neta</span>
                    <span className="text-green-500">Orígenes (Fuentes)</span>
                    <span className="text-blue-500">Aplicaciones (Usos)</span>
                </div>

                <div className="flex flex-col gap-1">
                    {reporte.lineas.length === 0 ? (
                        <p className="text-center py-4 text-subtitle">No hay variaciones en este período.</p>
                    ) : (
                        reporte.lineas.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-4 text-right py-2 border-b border-secondary hover:bg-secondary/5 transition-colors">
                                <span className="text-left pl-2 text-title font-medium truncate" title={item.cuenta}>{item.cuenta}</span>
                                <span className={`text-sm ${item.variacion >= 0 ? 'text-title' : 'text-red-400'}`}>
                                    C$ {item.variacion.toFixed(2)}
                                </span>
                                <span className={`text-sm ${item.origen ? 'text-green-600 font-bold rounded px-1' : 'text-gray-600'}`}>
                                    {item.origen !== 0 ? `C$ ${item.origen.toFixed(2)}` : '-'}
                                </span>
                                <span className={`text-sm ${item.aplicacion ? 'text-blue-500 font-bold rounded px-1' : 'text-gray-600'}`}>
                                    {item.aplicacion !== 0 ? `C$ ${item.aplicacion.toFixed(2)}` : '-'}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* TOTALES */}
                <div className="grid grid-cols-4 text-right py-4 font-bold text-lg bg-secondary/5 rounded-b-lg">
                    <span className="col-span-2 text-left pl-4 text-title">TOTALES</span>
                    <span className="text-green-500">C$ {reporte.totalOrigen.toFixed(2)}</span>
                    <span className="text-blue-500">C$ {reporte.totalAplicacion.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}