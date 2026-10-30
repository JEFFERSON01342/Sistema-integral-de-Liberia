// ============================================================
// Estimación referencial con tasas heredadas; requiere validación legal y fiscal vigente.
// ============================================================

export const TASAS = {
    INSS_LABORAL: 0.07,
    INSS_PATRONAL: 0.215,
    INATEC: 0.02,
};

const redondearMoneda = (monto) => Math.round((monto + Number.EPSILON) * 100) / 100;

/**
 * Tabla progresiva heredada de IR; no certifica el cálculo vigente de DGI.
 * @param {number} rentaNetaAnual - renta neta gravable anual (C$)
 * @returns {number} IR anual (C$)
 */
export function calcularIRAnual(rentaNetaAnual) {
    const renta = Number(rentaNetaAnual) || 0;
    if (renta <= 100000) return 0;
    if (renta <= 200000) return (renta - 100000) * 0.15;
    if (renta <= 350000) return 15000 + (renta - 200000) * 0.20;
    if (renta <= 500000) return 45000 + (renta - 350000) * 0.25;
    return 82500 + (renta - 500000) * 0.30;
}

/**
 * Calcula la nómina mensual completa de un empleado a partir de su salario bruto.
 * @param {number} salarioBruto - salario bruto mensual (C$)
 * @param {object} [extras] - { otrosIngresos, otrosDescuentos }
 * @returns {object} desglose completo de nómina
 */
export function calcularNomina(salarioBruto, extras = {}) {
    const bruto = redondearMoneda(Number(salarioBruto) || 0);
    const otrosIngresos = redondearMoneda(Number(extras.otrosIngresos) || 0);
    const otrosDescuentos = redondearMoneda(Number(extras.otrosDescuentos) || 0);

    // Deducciones del trabajador
    const inssLaboral = redondearMoneda(bruto * TASAS.INSS_LABORAL);
    const rentaNetaMensual = redondearMoneda(bruto - inssLaboral);
    const rentaNetaAnual = rentaNetaMensual * 12;
    const irAnual = calcularIRAnual(rentaNetaAnual);
    const irMensual = redondearMoneda(irAnual / 12);

    const totalDeducciones = redondearMoneda(inssLaboral + irMensual + otrosDescuentos);
    const salarioNeto = redondearMoneda(bruto + otrosIngresos - totalDeducciones);

    // Cargas del empleador
    const inssPatronal = redondearMoneda(bruto * TASAS.INSS_PATRONAL);
    const inatec = redondearMoneda(bruto * TASAS.INATEC);
    const aguinaldo = redondearMoneda(bruto / 12);
    const vacaciones = redondearMoneda(bruto / 24);
    const costoTotalEmpresa = redondearMoneda(
        bruto + otrosIngresos + inssPatronal + inatec + aguinaldo + vacaciones
    );

    return {
        bruto,
        otrosIngresos,
        otrosDescuentos,
        inssLaboral,
        irMensual,
        totalDeducciones,
        salarioNeto,
        inssPatronal,
        inatec,
        aguinaldo,
        vacaciones,
        costoTotalEmpresa,
    };
}

const parsearFechaISO = (fecha) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return null;
    const [anio, mes, dia] = String(fecha).split("-").map(Number);
    const date = new Date(Date.UTC(anio, mes - 1, dia));
    if (date.toISOString().slice(0, 10) !== fecha) return null;
    return date;
};

function factorQuincenalPorPeriodo(fechaInicio, fechaFin) {
    const inicio = parsearFechaISO(fechaInicio);
    const fin = parsearFechaISO(fechaFin);
    if (!inicio || !fin || fin < inicio) {
        throw new Error("El período quincenal requiere fechas válidas y consecutivas.");
    }
    const diasPeriodo = Math.round((fin - inicio) / 86400000) + 1;
    if (diasPeriodo > 15) {
        throw new Error("El período de empleados no puede exceder quince días consecutivos.");
    }

    let factor = 0;
    for (let cursor = inicio; cursor <= fin; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const diasDelMes = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
        factor += 1 / diasDelMes;
    }
    return factor;
}

export function calcularNominaPorPeriodo(
    salarioMensual,
    tipoPeriodo,
    fechaInicio,
    fechaFin,
    otrosDescuentosPeriodo = 0
) {
    let factor;
    if (tipoPeriodo === "semanal") {
        const inicio = parsearFechaISO(fechaInicio);
        const fin = parsearFechaISO(fechaFin);
        const diasPeriodo = inicio && fin && fin >= inicio
            ? Math.round((fin - inicio) / 86400000) + 1
            : null;
        if (diasPeriodo !== 7) {
            throw new Error("El período semanal debe comprender exactamente siete días consecutivos.");
        }
        factor = 12 / 52;
    } else if (tipoPeriodo === "quincenal") {
        factor = factorQuincenalPorPeriodo(fechaInicio, fechaFin);
    } else {
        throw new Error(`Tipo de período no soportado para cálculo salarial: ${tipoPeriodo}`);
    }

    const mensual = calcularNomina(salarioMensual);
    const otrosDescuentos = redondearMoneda(Number(otrosDescuentosPeriodo) || 0);
    if (otrosDescuentos < 0) {
        throw new Error("Los otros descuentos no pueden ser negativos.");
    }
    const escalar = (monto) => redondearMoneda(monto * factor);
    const bruto = escalar(mensual.bruto);
    const otrosIngresos = escalar(mensual.otrosIngresos);
    const inssLaboral = escalar(mensual.inssLaboral);
    const irMensual = escalar(mensual.irMensual);
    const inssPatronal = escalar(mensual.inssPatronal);
    const inatec = escalar(mensual.inatec);
    const aguinaldo = escalar(mensual.aguinaldo);
    const vacaciones = escalar(mensual.vacaciones);
    const totalDeducciones = redondearMoneda(inssLaboral + irMensual + otrosDescuentos);
    const salarioNeto = redondearMoneda(bruto + otrosIngresos - totalDeducciones);
    const costoTotalEmpresa = redondearMoneda(
        bruto + otrosIngresos + inssPatronal + inatec + aguinaldo + vacaciones
    );

    return {
        ...mensual,
        bruto,
        otrosIngresos,
        otrosDescuentos,
        inssLaboral,
        irMensual,
        totalDeducciones,
        salarioNeto,
        inssPatronal,
        inatec,
        aguinaldo,
        vacaciones,
        costoTotalEmpresa,
    };
}

export const fmtCordoba = (v) => `C$ ${Number(v || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
