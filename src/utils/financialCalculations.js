// /utils/financialCalculations.js

// Helper para encontrar saldos
const findSaldo = (cuentas, nombres) => {
    const nombresLower = nombres.map(n => n.toLowerCase());
    let total = 0;
    // Maneja tanto los objetos (activosAgrupados) como los arrays (patrimonio)
    if (Array.isArray(cuentas)) {
        cuentas.forEach(cuenta => {
            if (nombresLower.includes(cuenta.cuenta?.toLowerCase())) {
                total += cuenta.saldo;
            }
        });
    } else if (typeof cuentas === 'object' && cuentas !== null) {
        Object.values(cuentas).forEach(subtipo => {
            if (subtipo.cuentas) {
                subtipo.cuentas.forEach(cuenta => {
                    if (nombresLower.includes(cuenta.cuenta?.toLowerCase())) {
                        total += cuenta.saldo;
                    }
                });
            }
        });
    }
    return total;
};

// Helper para sumar Activos Fijos BRUTOS (Ignorando depreciación para ver la inversión real)
const calcularActivoFijoBruto = (agrupados) => {
    let total = 0;
    const grupo = agrupados["Activo No Corriente"];
    if (grupo && grupo.cuentas) {
        grupo.cuentas.forEach(c => {
            // Sumamos todo LO QUE NO SEA depreciación
            if (!c.cuenta.toLowerCase().includes('depreciacion') && !c.cuenta.toLowerCase().includes('depreciación')) {
                total += c.saldo;
            }
        });
    }
    return total;
};

export const calcularFlujoDeEfectivo = (datosActuales, datosAnteriores) => {
    const f = {
        utilidadNeta: 0, gastoDepreciacion: 0,
        cambioClientes: 0, cambioInventario: 0, cambioProveedores: 0,
        f_operacion: 0,
        cambioActivosFijos: 0, f_inversion: 0,
        cambioPrestamos: 0, cambioCapital: 0,
        f_financiacion: 0,
        flujoNetoTotal: 0,
        cajaInicial: 0, cajaFinal: 0,
    };

    if (!datosActuales || !datosAnteriores) return f;

    // --- 1. FLUJO DE OPERACIÓN ---
    f.utilidadNeta = (datosActuales.utilidadNeta || 0) - (datosAnteriores.utilidadNeta || 0);

    // Gasto por Depreciación (Se suma porque no es salida de efectivo)
    const deprecActual = findSaldo(datosActuales.gastosAgrupados || [], ["Gasto por Depreciación"]);
    const deprecAnterior = findSaldo(datosAnteriores.gastosAgrupados || [], ["Gasto por Depreciación"]);
    f.gastoDepreciacion = deprecActual - deprecAnterior;

    // Cambios en Capital de Trabajo
    const clientesActual = findSaldo(datosActuales.activosAgrupados || {}, ["Clientes"]);
    const clientesAnterior = findSaldo(datosAnteriores.activosAgrupados || {}, ["Clientes"]);
    f.cambioClientes = clientesActual - clientesAnterior; 

    const inventarioActual = findSaldo(datosActuales.activosAgrupados || {}, ["Inventario"]);
    const inventarioAnterior = findSaldo(datosAnteriores.activosAgrupados || {}, ["Inventario"]);
    f.cambioInventario = inventarioActual - inventarioAnterior; 

    const proveedoresActual = findSaldo(datosActuales.pasivosAgrupados || {}, ["Proveedores"]);
    const proveedoresAnterior = findSaldo(datosAnteriores.pasivosAgrupados || {}, ["Proveedores"]);
    f.cambioProveedores = proveedoresActual - proveedoresAnterior; 

    // FÓRMULA CORREGIDA:
    // - Aumento de Activos (Clientes/Inventario) RESTA efectivo (-).
    // - Aumento de Pasivos (Proveedores) SUMA efectivo (pero como la variacion es negativa, debemos RESTARLA para que -(-100) = +100)
    f.f_operacion = f.utilidadNeta + f.gastoDepreciacion - f.cambioClientes - f.cambioInventario - f.cambioProveedores;

    // --- 2. FLUJO DE INVERSIÓN ---
    // Usamos el helper para ignorar la depreciación en este cálculo
    const afBrutoActual = calcularActivoFijoBruto(datosActuales.activosAgrupados || {});
    const afBrutoAnterior = calcularActivoFijoBruto(datosAnteriores.activosAgrupados || {});
    
    f.cambioActivosFijos = afBrutoActual - afBrutoAnterior;
    // Aumento de Activo Fijo RESTA efectivo
    f.f_inversion = -f.cambioActivosFijos;

    // --- 3. FLUJO DE FINANCIACIÓN ---
    const prestamosActual = findSaldo(datosActuales.pasivosAgrupados || {}, ["Documentos por pagar largo plazo", "Préstamos Bancarios CP"]);
    const prestamosAnterior = findSaldo(datosAnteriores.pasivosAgrupados || {}, ["Documentos por pagar largo plazo", "Préstamos Bancarios CP"]);
    f.cambioPrestamos = prestamosActual - prestamosAnterior;

    const capitalActual = findSaldo(datosActuales.patrimonio || [], ["Capital Social"]);
    const capitalAnterior = findSaldo(datosAnteriores.patrimonio || [], ["Capital Social"]);
    f.cambioCapital = capitalActual - capitalAnterior; 

    // FÓRMULA CORREGIDA:
    // Aumento de Pasivo/Patrimonio (que es negativo en BD) debe SUMAR efectivo.
    // Como la variación es negativa, restamos para invertir el signo.
    f.f_financiacion = -f.cambioPrestamos - f.cambioCapital;

    // --- 4. TOTALES ---
    f.flujoNetoTotal = f.f_operacion + f.f_inversion + f.f_financiacion;
    
    // Caja Inicial y Final (Efectivo)
    f.cajaInicial = findSaldo(datosAnteriores.activosAgrupados || {}, ["Caja", "Banco"]);
    f.cajaFinal = findSaldo(datosActuales.activosAgrupados || {}, ["Caja", "Banco"]);

    return f;
};