// ============================================================
// Cálculo de nómina según leyes laborales de Nicaragua (2024)
//  - INSS laboral: 7% (régimen integral, a cargo del trabajador)
//  - INSS patronal: 21.5% (a cargo del empleador)
//  - INATEC: 2% (a cargo del empleador)
//  - IR (Impuesto sobre la Renta) según tabla progresiva anual DGI
//  - Aguinaldo (13° mes): provisión = salario bruto / 12
//  - Vacaciones: provisión = salario bruto / 24 (2.5 días/mes)
// ============================================================

export const TASAS = {
    INSS_LABORAL: 0.07,
    INSS_PATRONAL: 0.215,
    INATEC: 0.02,
};

/**
 * Tabla progresiva anual de IR (DGI Nicaragua).
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
    const bruto = Number(salarioBruto) || 0;
    const otrosIngresos = Number(extras.otrosIngresos) || 0;
    const otrosDescuentos = Number(extras.otrosDescuentos) || 0;

    // Deducciones del trabajador
    const inssLaboral = bruto * TASAS.INSS_LABORAL;
    const rentaNetaMensual = bruto - inssLaboral;
    const rentaNetaAnual = rentaNetaMensual * 12;
    const irAnual = calcularIRAnual(rentaNetaAnual);
    const irMensual = irAnual / 12;

    const totalDeducciones = inssLaboral + irMensual + otrosDescuentos;
    const salarioNeto = bruto + otrosIngresos - totalDeducciones;

    // Cargas del empleador
    const inssPatronal = bruto * TASAS.INSS_PATRONAL;
    const inatec = bruto * TASAS.INATEC;
    const aguinaldo = bruto / 12;
    const vacaciones = bruto / 24;
    const costoTotalEmpresa = bruto + otrosIngresos + inssPatronal + inatec + aguinaldo + vacaciones;

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

export const fmtCordoba = (v) => `C$ ${Number(v || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
