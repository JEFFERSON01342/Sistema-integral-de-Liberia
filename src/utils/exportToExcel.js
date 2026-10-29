import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { calcularFlujoDeEfectivo } from './financialCalculations';

// --- Funciones de Estilo ---
const addTitle = (ws, title, subtitle) => {
    ws.addRow([title]).font = { size: 16, bold: true };
    ws.addRow([subtitle]);
    ws.addRow([]); // Espacio
    ws.mergeCells('A1:C1');
    ws.mergeCells('A2:C2');
};

const setHeaders = (ws, columns) => {
    const headerRow = ws.addRow(columns);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } };
        cell.border = { bottom: { style: 'thin' } };
    });
};

const setNumberFormat = (ws, colLetter) => {
    ws.getColumn(colLetter).numFmt = '"C$" #,##0.00;[Red]"C$" -#,##0.00';
};

// --- 1. FUNCIÓN HELPER (AHORA GLOBAL) ---
const findAnterior = (cuentasAnt, cuentaNombre) => {
    // Añadimos una validación por si cuentasAnt es undefined
    if (!cuentasAnt) return 0;
    const cuenta = cuentasAnt.find(c => c.cuenta === cuentaNombre);
    return cuenta ? cuenta.saldo : 0;
};

// --- Función Principal de Exportación ---
export const exportFinancialReports = async (
    datosActuales,
    datosAnteriores,
    empresaInfo,
    fechaInicio,
    fechaCierre,
    datosBalanza
) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "FinanceERP";
    wb.created = new Date();

    generateBalanceSheet(wb, datosActuales, datosAnteriores, empresaInfo, fechaCierre);
    generateEstadoResultadosSheet(wb, datosActuales, datosAnteriores, empresaInfo, fechaInicio, fechaCierre);
    generateFlujoEfectivoSheet(wb, datosActuales, datosAnteriores, empresaInfo, fechaInicio, fechaCierre);
    generateOrigenAplicacionSheet(wb, datosActuales, datosAnteriores, empresaInfo, fechaInicio, fechaCierre);
    if (datosBalanza) {
        generateBalanzaComprobacionSheet(wb, datosBalanza, empresaInfo, fechaInicio, fechaCierre);
    }

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Reportes_Financieros_${empresaInfo.nombre}_${fechaCierre}.xlsx`);
};

// --- HOJA 1: BALANCE GENERAL ---
const generateBalanceSheet = (wb, datos, datosAnt, info, fecha) => {
    const ws = wb.addWorksheet('Balance General');
    addTitle(ws, 'Balance General', `Empresa: ${info.nombre} | Al ${fecha}`);
    setHeaders(ws, ['Cuenta', 'Actual', 'Anterior']);

    // --- 2. LA FUNCIÓN 'findAnterior' YA NO ESTÁ AQUÍ ---

    ws.addRow(['Activos']).font = { bold: true, size: 12 };
    Object.entries(datos.activosAgrupados).forEach(([subtipo, data]) => {
        ws.addRow([`  ${subtipo}`]).font = { bold: true };
        data.cuentas.forEach(c => {
            // 3. Esta llamada ahora usa la función global
            const saldoAnt = findAnterior(datosAnt.activosAgrupados[subtipo]?.cuentas, c.cuenta);
            ws.addRow([`    ${c.cuenta}`, c.saldo, saldoAnt]);
        });
    });
    ws.addRow(['TOTAL ACTIVOS', datos.totalActivos, datosAnt.totalActivos]).font = { bold: true, size: 12 };

    ws.addRow([]); // Espacio

    ws.addRow(['Pasivos y Patrimonio']).font = { bold: true, size: 12 };
    Object.entries(datos.pasivosAgrupados).forEach(([subtipo, data]) => {
        ws.addRow([`  ${subtipo}`]).font = { bold: true };
        data.cuentas.forEach(c => {
            const saldoAnt = findAnterior(datosAnt.pasivosAgrupados[subtipo]?.cuentas, c.cuenta);
            ws.addRow([`    ${c.cuenta}`, c.saldo * -1, saldoAnt * -1]);
        });
    });
    ws.addRow(['Total Pasivos', datos.totalPasivos, datosAnt.totalPasivos]).font = { bold: true };

    ws.addRow([`  Patrimonio`]).font = { bold: true };
    datos.patrimonio.forEach(c => {
        const saldoAnt = findAnterior(datosAnt.patrimonio, c.cuenta);
        ws.addRow([`    ${c.cuenta}`, c.saldo * -1, saldoAnt * -1]);
    });
    ws.addRow(['  Utilidad (o Pérdida) del Período', datos.utilidadNeta, datosAnt.utilidadNeta]).font = { bold: true };
    ws.addRow(['Total Patrimonio', datos.totalPatrimonioCuentas + datos.utilidadNeta, datosAnt.totalPatrimonioCuentas + datosAnt.utilidadNeta]).font = { bold: true };

    ws.addRow(['TOTAL PASIVO + PATRIMONIO', datos.totalPasivos + datos.totalPatrimonioCuentas + datos.utilidadNeta, datosAnt.totalPasivos + datosAnt.totalPatrimonioCuentas + datosAnt.utilidadNeta]).font = { bold: true, size: 12 };

    setNumberFormat(ws, 'B');
    setNumberFormat(ws, 'C');
    // --- 4. CORRECCIÓN DEL ANCHO DE COLUMNA ---
    ws.getColumn('A').width = 40;
    ws.getColumn('B').width = 20;
    ws.getColumn('C').width = 20;
};

// --- HOJA 2: ESTADO DE RESULTADOS ---
const generateEstadoResultadosSheet = (wb, datos, datosAnt, info, fechaInicio, fechaCierre) => {
    const ws = wb.addWorksheet('Estado de Resultados');
    addTitle(ws, 'Estado de Resultados', `Empresa: ${info.nombre} | Del ${fechaInicio} al ${fechaCierre}`);
    setHeaders(ws, ['Cuenta', 'Total Periodo']);

    const pVentas = datos.totalIngresos - datosAnt.totalIngresos;
    const pCostos = datos.totalCostos - datosAnt.totalCostos;
    const pGastos = datos.totalGastos - datosAnt.totalGastos;
    const pUtilidadBruta = (pVentas * -1) - pCostos;
    const pUtilidadNeta = pUtilidadBruta - pGastos;

    ws.addRow(['Ingresos']).font = { bold: true };
    (datos.ingresosAgrupados || []).forEach(c => {
        // 5. Esta llamada AHORA SÍ FUNCIONA
        const saldoAnt = findAnterior(datosAnt.ingresosAgrupados, c.cuenta);
        ws.addRow([`  ${c.cuenta}`, (c.saldo - saldoAnt) * -1]);
    });
    ws.addRow(['Total Ingresos', pVentas * -1]).font = { bold: true };

    ws.addRow(['Costos']).font = { bold: true };
    (datos.costosAgrupados || []).forEach(c => {
        const saldoAnt = findAnterior(datosAnt.costosAgrupados, c.cuenta);
        ws.addRow([`  ${c.cuenta}`, c.saldo - saldoAnt]);
    });
    ws.addRow(['Total Costos', pCostos]).font = { bold: true };

    ws.addRow(['UTILIDAD BRUTA', pUtilidadBruta]).font = { bold: true, size: 12 };

    ws.addRow(['Gastos Operativos']).font = { bold: true };
    Object.entries(datos.gastosAgrupados || {}).forEach(([subtipo, data]) => {
        ws.addRow([`  ${subtipo}`]).font = { bold: true };
        data.cuentas.forEach(c => {
            const saldoAnt = findAnterior(datosAnt.gastosAgrupados[subtipo]?.cuentas, c.cuenta);
            ws.addRow([`    ${c.cuenta}`, c.saldo - saldoAnt]);
        });
    });
    ws.addRow(['Total Gastos', pGastos]).font = { bold: true };

    ws.addRow(['UTILIDAD NETA', pUtilidadNeta]).font = { bold: true, size: 12 };

    setNumberFormat(ws, 'B');
    ws.getColumn('A').width = 40;
    ws.getColumn('B').width = 20;
};

// --- HOJA 3: FLUJO DE EFECTIVO ---
const generateFlujoEfectivoSheet = (wb, datos, datosAnt, info, fechaInicio, fechaCierre) => {
    const ws = wb.addWorksheet('Flujo de Efectivo');
    addTitle(ws, 'Flujo de Efectivo (Indirecto)', `Empresa: ${info.nombre} | Del ${fechaInicio} al ${fechaCierre}`);
    setHeaders(ws, ['Concepto', 'Monto']);

    const f = calcularFlujoDeEfectivo(datos, datosAnt);

    ws.addRow(['Actividades de Operación']).font = { bold: true };
    ws.addRow(['  Utilidad Neta del Período', f.utilidadNeta]);
    ws.addRow(['  Ajustes:']).font = { bold: true };
    ws.addRow(['    Gasto por Depreciación', f.gastoDepreciacion]);
    ws.addRow(['    Ajuste por Cuentas por Cobrar', -f.cambioClientes]);
    ws.addRow(['    Ajuste por Inventario', -f.cambioInventario]);
    ws.addRow(['    Ajuste por Cuentas por Pagar', f.cambioProveedores]);
    ws.addRow(['Efectivo de Actividades de Operación', f.f_operacion]).font = { bold: true };

    ws.addRow([]);
    ws.addRow(['Actividades de Inversión']).font = { bold: true };
    ws.addRow(['  Compra de Activos Fijos', f.f_inversion]);
    ws.addRow(['Efectivo de Actividades de Inversión', f.f_inversion]).font = { bold: true };

    ws.addRow([]);
    ws.addRow(['Actividades de Financiación']).font = { bold: true };
    ws.addRow(['  Aumento (Disminución) de Préstamos', f.cambioPrestamos]);
    ws.addRow(['  Aumento (Disminución) de Capital', f.cambioCapital]);
    ws.addRow(['Efectivo de Actividades de Financiación', f.f_financiacion]).font = { bold: true };

    ws.addRow([]);
    ws.addRow(['Flujo Neto de Efectivo del Período', f.flujoNetoTotal]).font = { bold: true, size: 12 };
    ws.addRow(['Saldo Inicial de Efectivo', f.cajaInicial]).font = { bold: true };
    ws.addRow(['Saldo Final de Efectivo (Calculado)', f.cajaInicial + f.flujoNetoTotal]).font = { bold: true };
    ws.addRow(['Saldo Final en Balance (Real)', f.cajaFinal]).font = { bold: true, color: { argb: 'FF0088FE' } };

    setNumberFormat(ws, 'B');
    ws.getColumn('A').width = 40;
    ws.getColumn('B').width = 20;
};

const generateOrigenAplicacionSheet = (wb, datosActuales, datosAnteriores, info, fechaInicio, fechaCierre) => {
    const ws = wb.addWorksheet('Origen y Aplicación');
    addTitle(ws, 'Estado de Origen y Aplicación de Fondos', `Empresa: ${info.nombre} | Del ${fechaInicio} al ${fechaCierre}`);
    
    // Encabezados con estilo
    const headerRow = ws.addRow(['Cuenta / Rubro', 'Variación Neta', 'Orígenes (Fuentes)', 'Aplicaciones (Usos)']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } }; // Gris oscuro
        cell.alignment = { horizontal: 'center' };
        cell.border = { bottom: { style: 'thin' } };
    });

    let totalOrigen = 0;
    let totalAplicacion = 0;

    // Función auxiliar interna para procesar y escribir la fila
    const procesarFilaExcel = (nombre, saldoActual, saldoAnterior, tipo) => {
        const act = Number(saldoActual) || 0;
        const ant = Number(saldoAnterior) || 0;

        // Usamos valor absoluto para comparar magnitudes (igual que en el componente visual)
        const saldoActAbs = Math.abs(act);
        const saldoAntAbs = Math.abs(ant);

        const variacion = saldoActAbs - saldoAntAbs;

        if (Math.abs(variacion) < 0.01) return; // Ignorar si no hay cambio

        let origen = 0;
        let aplicacion = 0;

        if (tipo === 'Activo') {
            // Caso Depreciación Acumulada
            if (nombre.toLowerCase().includes('depreciacion') || nombre.toLowerCase().includes('depreciación')) {
                if (variacion > 0) origen = Math.abs(variacion);
                else aplicacion = Math.abs(variacion);
            } else {
                // Activo Normal
                if (variacion > 0) aplicacion = Math.abs(variacion);
                else origen = Math.abs(variacion);
            }
        } else {
            // Pasivo / Patrimonio
            if (variacion > 0) origen = Math.abs(variacion);
            else aplicacion = Math.abs(variacion);
        }

        totalOrigen += origen;
        totalAplicacion += aplicacion;

        const row = ws.addRow([
            nombre,
            variacion,
            origen !== 0 ? origen : null,
            aplicacion !== 0 ? aplicacion : null
        ]);

        // Estilos de celda (Colores de texto)
        if (origen) row.getCell(3).font = { color: { argb: 'FF008000' }, bold: true }; // Verde
        if (aplicacion) row.getCell(4).font = { color: { argb: 'FF0000FF' }, bold: true }; // Azul
    };

    // 1. Procesar Activos (Buscando en profundidad en los grupos)
    Object.values(datosActuales.activosAgrupados || {}).forEach(grupo => {
        grupo.cuentas.forEach(c => {
            let saldoAnt = 0;
            Object.values(datosAnteriores.activosAgrupados || {}).forEach(gAnt => {
                const cuentaAnt = gAnt.cuentas.find(ca => ca.id_cuenta === c.id_cuenta);
                if (cuentaAnt) saldoAnt = cuentaAnt.saldo;
            });
            procesarFilaExcel(c.cuenta, c.saldo, saldoAnt, 'Activo');
        });
    });

    // 2. Procesar Pasivos
    Object.values(datosActuales.pasivosAgrupados || {}).forEach(grupo => {
        grupo.cuentas.forEach(c => {
            let saldoAnt = 0;
            Object.values(datosAnteriores.pasivosAgrupados || {}).forEach(gAnt => {
                const cuentaAnt = gAnt.cuentas.find(ca => ca.id_cuenta === c.id_cuenta);
                if (cuentaAnt) saldoAnt = cuentaAnt.saldo;
            });
            procesarFilaExcel(c.cuenta, c.saldo, saldoAnt, 'Pasivo');
        });
    });

    // 3. Procesar Patrimonio
    (datosActuales.patrimonio || []).forEach(c => {
        const cAnt = (datosAnteriores.patrimonio || []).find(ant => ant.id_cuenta === c.id_cuenta);
        const saldoAnt = cAnt ? cAnt.saldo : 0;
        procesarFilaExcel(c.cuenta, c.saldo, saldoAnt, 'Patrimonio');
    });

    // 4. Procesar Utilidad del Período
    procesarFilaExcel("Utilidad (o Pérdida) del Período", datosActuales.utilidadNeta, datosAnteriores.utilidadNeta, 'Patrimonio');

    ws.addRow([]); // Espacio

    // Totales
    const totalRow = ws.addRow(['TOTALES', '', totalOrigen, totalAplicacion]);
    totalRow.font = { bold: true, size: 12 };
    totalRow.getCell(3).font = { color: { argb: 'FF008000' }, bold: true }; // Verde
    totalRow.getCell(4).font = { color: { argb: 'FF0000FF' }, bold: true }; // Azul

    // Verificación de Balance
    const diff = totalOrigen - totalAplicacion;
    ws.addRow([]);
    if (Math.abs(diff) < 1) {
        const okRow = ws.addRow(['✅ Balanceado Correctamente (Diferencia: 0.00)']);
        okRow.font = { color: { argb: 'FF008000' }, bold: true };
        ws.mergeCells(`A${okRow.number}:D${okRow.number}`);
        okRow.getCell(1).alignment = { horizontal: 'center' };
    } else {
        const warnRow = ws.addRow([`⚠️ Desbalanceado (Diferencia: ${diff.toFixed(2)})`]);
        warnRow.font = { color: { argb: 'FFFF0000' }, bold: true };
        ws.mergeCells(`A${warnRow.number}:D${warnRow.number}`);
        warnRow.getCell(1).alignment = { horizontal: 'center' };
    }

    // Formatos de número y anchos
    ws.getColumn('A').width = 50;
    ws.getColumn('B').numFmt = '"C$" #,##0.00;[Red]"C$" -#,##0.00';
    ws.getColumn('C').numFmt = '"C$" #,##0.00;[Red]"C$" -#,##0.00';
    ws.getColumn('D').numFmt = '"C$" #,##0.00;[Red]"C$" -#,##0.00';
    ws.getColumn('B').width = 20;
    ws.getColumn('C').width = 20;
    ws.getColumn('D').width = 20;
};

const generateBalanzaComprobacionSheet = (wb, datos, info, fechaInicio, fechaCierre) => {
    const ws = wb.addWorksheet('Balanza de Comprobación');
    addTitle(ws, 'Balanza de Comprobación', `Empresa: ${info.nombre} | Del ${fechaInicio} al ${fechaCierre}`);
    
    setHeaders(ws, ['Cuenta', 'Tipo', 'Saldo Inicial', 'Movimientos Debe', 'Movimientos Haber', 'Saldo Final']);
    
    ws.columns = [
        { width: 40 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }
    ];

    datos.forEach(d => {
        const row = ws.addRow([
            d.nombre_cuenta,
            d.tipo,
            d.saldo_inicial,
            d.mov_debe,
            d.mov_haber,
            d.saldo_final
        ]);
        
        // Formato condicional simple
        if (d.saldo_final < 0) row.getCell(6).font = { color: { argb: 'FFFF0000' } }; // Rojo si negativo
    });

    // Totales
    const totalInicial = datos.reduce((acc, d) => acc + d.saldo_inicial, 0);
    const totalDebe = datos.reduce((acc, d) => acc + d.mov_debe, 0);
    const totalHaber = datos.reduce((acc, d) => acc + d.mov_haber, 0);
    const totalFinal = datos.reduce((acc, d) => acc + d.saldo_final, 0);

    ws.addRow([]);
    const totalRow = ws.addRow(['TOTALES', '', totalInicial, totalDebe, totalHaber, totalFinal]);
    totalRow.font = { bold: true };
    
    // Formato moneda columnas C, D, E, F
    ['C', 'D', 'E', 'F'].forEach(col => setNumberFormat(ws, col));
};