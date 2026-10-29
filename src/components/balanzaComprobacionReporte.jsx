import React, { useMemo } from 'react';

export default function BalanzaComprobacionReporte({ isLoading, datosBalanza }) {
    
    // Calcular totales verticales para asegurar que cuadre
    const totales = useMemo(() => {
        return datosBalanza.reduce((acc, item) => ({
            inicial: acc.inicial + Number(item.saldo_inicial),
            debe: acc.debe + Number(item.mov_debe),
            haber: acc.haber + Number(item.mov_haber),
            final: acc.final + Number(item.saldo_final)
        }), { inicial: 0, debe: 0, haber: 0, final: 0 });
    }, [datosBalanza]);

    const formatMoney = (amount) => `C$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Helper para mostrar saldos negativos como positivos entre paréntesis o rojos, según preferencia
    // Aquí usaremos el estándar: Negativo = Acreedor (Pasivo/Patrimonio/Ingreso)
    const renderSaldo = (valor) => {
        const esNegativo = valor < 0;
        return (
            <span className={esNegativo ? "text-red-400" : "text-title"}>
                {formatMoney(valor)}
            </span>
        );
    };

    if (isLoading) return <p className="text-center py-8 text-subtitle">Cargando Balanza...</p>;
    if (!datosBalanza || datosBalanza.length === 0) return <p className="text-center py-8 text-subtitle">No hay datos para generar la balanza en este rango de fechas.</p>;

    return (
        <div className="mt-4 rounded-xl border-1 border-secondary p-4 w-full overflow-x-auto">
            <div className="min-w-[900px]">
                <h1 className="text-title font-semibold text-lg mb-1">Balanza de Comprobación</h1>
                <p className="text-subtitle text-sm mb-4">Verificación de saldos y movimientos del periodo.</p>

                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-secondary text-subtitle font-bold">
                            <th className="py-2 pl-2">Cuenta</th>
                            <th className="py-2 text-right">Saldo Inicial</th>
                            <th className="py-2 text-right text-green-600">Mov. Debe</th>
                            <th className="py-2 text-right text-red-500">Mov. Haber</th>
                            <th className="py-2 text-right pr-2">Saldo Final</th>
                        </tr>
                    </thead>
                    <tbody>
                        {datosBalanza.map((fila, idx) => (
                            <tr key={idx} className="border-b border-secondary hover:bg-secondary/5 transition-colors">
                                <td className="py-3 pl-2">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-title">{fila.nombre_cuenta}</span>
                                        <span className="text-xs text-subtitle">{fila.tipo} - {fila.subtipo}</span>
                                    </div>
                                </td>
                                <td className="py-3 text-right">{renderSaldo(fila.saldo_inicial)}</td>
                                <td className="py-3 text-right">{formatMoney(fila.mov_debe)}</td>
                                <td className="py-3 text-right">{formatMoney(fila.mov_haber)}</td>
                                <td className="py-3 text-right pr-2 font-semibold">{renderSaldo(fila.saldo_final)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-secondary/20 font-bold text-title border-t-2 border-secondary">
                            <td className="py-3 pl-2">TOTALES</td>
                            <td className="py-3 text-right">{renderSaldo(totales.inicial)}</td>
                            <td className="py-3 text-right">{formatMoney(totales.debe)}</td>
                            <td className="py-3 text-right">{formatMoney(totales.haber)}</td>
                            <td className="py-3 text-right pr-2">{renderSaldo(totales.final)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}