import JsBarcode from "jsbarcode";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}[character]));

/**
 * Calcula el dígito verificador EAN-13 a partir de 12 dígitos.
 * @param {string} base12 - cadena de 12 dígitos
 * @returns {number} dígito verificador (0-9)
 */
export function calcularDigitoEAN13(base12) {
    let suma = 0;
    for (let i = 0; i < 12; i++) {
        const n = Number(base12[i]) || 0;
        suma += i % 2 === 0 ? n : n * 3;
    }
    const resto = suma % 10;
    return resto === 0 ? 0 : 10 - resto;
}

/**
 * Genera un código EAN-13 válido (13 dígitos) de forma determinista
 * a partir del id de producto. Prefijo 200 = rango de uso interno/local.
 * @param {number|string} idProducto
 * @returns {string} código EAN-13 de 13 dígitos
 */
export function generarCodigoEAN13(idProducto) {
    const idNum = Math.abs(parseInt(idProducto, 10) || 0);
    // Prefijo "200" (uso interno) + id rellenado a 9 dígitos = 12 dígitos base
    const base12 = ("200" + String(idNum).padStart(9, "0")).slice(0, 12);
    const check = calcularDigitoEAN13(base12);
    return base12 + String(check);
}

/**
 * Valida que una cadena sea un EAN-13 correcto (13 dígitos + verificador válido).
 * @param {string} codigo
 * @returns {boolean}
 */
export function esEAN13Valido(codigo) {
    if (!codigo || !/^\d{13}$/.test(codigo)) return false;
    const base12 = codigo.slice(0, 12);
    return calcularDigitoEAN13(base12) === Number(codigo[12]);
}

/**
 * Dibuja un código de barras en un elemento <svg> o <canvas>.
 * @param {HTMLElement} elemento - nodo svg/canvas destino
 * @param {string} codigo - valor a codificar
 * @param {object} opciones - opciones JsBarcode
 */
export function dibujarCodigoBarras(elemento, codigo, opciones = {}) {
    if (!elemento || !codigo) return false;
    try {
        const formato = esEAN13Valido(codigo) ? "EAN13" : "CODE128";
        JsBarcode(elemento, codigo, {
            format: formato,
            lineColor: "#000000",
            background: "#ffffff",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 10,
            ...opciones,
        });
        return true;
    } catch (err) {
        console.error("Error generando código de barras:", err.message);
        return false;
    }
}

/**
 * Genera un dataURL PNG del código de barras (útil para imprimir o PDF).
 * @param {string} codigo
 * @param {object} opciones
 * @returns {string|null} dataURL o null si falla
 */
export function codigoBarrasDataURL(codigo, opciones = {}) {
    if (!codigo) return null;
    try {
        const canvas = document.createElement("canvas");
        const formato = esEAN13Valido(codigo) ? "EAN13" : "CODE128";
        JsBarcode(canvas, codigo, {
            format: formato,
            lineColor: "#000000",
            background: "#ffffff",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 10,
            ...opciones,
        });
        return canvas.toDataURL("image/png");
    } catch (err) {
        console.error("Error generando dataURL de código de barras:", err.message);
        return null;
    }
}

/**
 * Abre una ventana de impresión con uno o varios códigos de barras.
 * @param {Array<{codigo:string, nombre:string, precio?:number, detalles?:string[]}>} items
 */
export function imprimirCodigosBarras(items = []) {
    const lista = Array.isArray(items) ? items : [items];
    const bloques = lista
        .filter((it) => it && it.codigo)
        .map((it) => {
            const dataUrl = codigoBarrasDataURL(it.codigo);
            if (!dataUrl) return "";
            const precio =
                it.precio != null ? `<div class="precio">C$ ${Number(it.precio).toFixed(2)}</div>` : "";
            const detalles = Array.isArray(it.detalles)
                ? it.detalles.filter(Boolean).map((detalle) => `<div class="detalle">${escapeHtml(detalle)}</div>`).join("")
                : "";
            return `
                <div class="etiqueta">
                    <div class="nombre">${escapeHtml(it.nombre || "")}</div>
                    <img src="${dataUrl}" alt="${escapeHtml(it.codigo)}" />
                    ${detalles}
                    ${precio}
                </div>`;
        })
        .join("");

    const ventana = window.open("", "_blank", "width=800,height=600");
    if (!ventana) return;
    ventana.document.write(`
        <html>
        <head>
            <title>Impresión de códigos de barra</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
                .etiqueta {
                    display: inline-flex; flex-direction: column; align-items: center;
                    border: 1px dashed #999; border-radius: 8px; padding: 10px 14px;
                    margin: 8px; page-break-inside: avoid;
                }
                .nombre { font-size: 12px; font-weight: 600; margin-bottom: 4px; text-align: center; max-width: 220px; }
                .detalle { font-size: 10px; text-align: center; margin-top: 2px; }
                .precio { font-size: 14px; font-weight: 700; margin-top: 2px; }
                img { display: block; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="no-print" style="text-align:center;margin-bottom:12px;">
                <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">Imprimir</button>
            </div>
            ${bloques || "<p>No hay códigos para imprimir.</p>"}
        </body>
        </html>
    `);
    ventana.document.close();
    setTimeout(() => ventana.print(), 400);
}
