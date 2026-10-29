import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const EMPRESA = {
    nombre: "LIBRERÍA LISJUASHDE",
    direccion: "Managua, Nicaragua | Tel: 2222-3333",
    ruc: "RUC: J0310000000000",
};

const fmt = (v) => `C$ ${Number(v || 0).toFixed(2)}`;

/**
 * Genera una factura en PDF.
 * @param {object} datos
 * @param {string} datos.numeroFactura
 * @param {string} datos.fecha - fecha legible
 * @param {string} datos.cliente - nombre del cliente
 * @param {string} [datos.identificacion]
 * @param {string} [datos.tipoPago]
 * @param {Array<{nombre, cantidad, precio, descuento}>} datos.items
 * @param {number} [datos.plazoDias]
 * @param {string} [datos.vencimiento]
 * @param {('save'|'open'|'blob'|'datauristring')} [modo] - acción de salida
 * @returns {jsPDF|Blob|string} el documento o su representación según el modo
 */
export function generarFacturaPDF(datos, modo = "open") {
    const {
        numeroFactura = "N/A",
        fecha = new Date().toLocaleDateString("es-NI"),
        cliente = "Cliente General",
        identificacion = "",
        tipoPago = "",
        items = [],
        plazoDias = 0,
        vencimiento = "",
        sucursal = "",          // nombre de la sucursal
        canal = "sucursal",     // 'sucursal' | 'web'
        pago = "sucursal",      // 'sucursal' | 'web' (dónde/cómo se pagó)
    } = datos || {};

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Encabezado empresa ---
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(EMPRESA.nombre, pageWidth / 2, 18, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(EMPRESA.direccion, pageWidth / 2, 25, { align: "center" });
    doc.text(EMPRESA.ruc, pageWidth / 2, 30, { align: "center" });
    if (sucursal) {
        doc.setFont("helvetica", "bold");
        doc.text(`Sucursal: ${sucursal}`, pageWidth / 2, 35, { align: "center" });
        doc.setFont("helvetica", "normal");
    }

    const lineaY = sucursal ? 39 : 34;
    doc.setDrawColor(200);
    doc.line(14, lineaY, pageWidth - 14, lineaY);

    // --- Origen / forma de pago ---
    const pagoTxt = pago === "web" ? "Pago web" : "Pago en sucursal";
    const origenTxt = canal === "web"
        ? `Pedido web – Retiro en sucursal ${sucursal || ""}`.trim()
        : `Venta en sucursal ${sucursal || ""}`.trim();

    const baseY = lineaY + 6;

    // --- Datos de factura ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("FACTURA", 14, baseY + 4);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`N° Factura: ${numeroFactura}`, 14, baseY + 12);
    doc.text(`Fecha: ${fecha}`, 14, baseY + 18);
    if (tipoPago) doc.text(`Tipo de pago: ${tipoPago}`, 14, baseY + 24);
    doc.text(`${origenTxt} — ${pagoTxt}`, 14, baseY + 30);

    doc.text(`Cliente: ${cliente}`, pageWidth - 14, baseY + 12, { align: "right" });
    if (identificacion) doc.text(`Identificación: ${identificacion}`, pageWidth - 14, baseY + 18, { align: "right" });
    if (plazoDias > 0) {
        doc.text(`Plazo: ${plazoDias} días`, pageWidth - 14, baseY + 24, { align: "right" });
        if (vencimiento) doc.text(`Vence: ${vencimiento}`, pageWidth - 14, baseY + 30, { align: "right" });
    }

    // --- Tabla de productos ---
    let subtotalGeneral = 0;
    const body = (items || []).map((it) => {
        const precio = Number(it.precio || 0);
        const cantidad = Number(it.cantidad || 0);
        const descuento = Number(it.descuento || 0);
        const subtotal = precio * cantidad * (1 - descuento / 100);
        subtotalGeneral += subtotal;
        return [
            it.nombre || "",
            String(cantidad),
            fmt(precio),
            `${descuento}%`,
            fmt(subtotal),
        ];
    });

    autoTable(doc, {
        startY: baseY + 36,
        head: [["Producto", "Cant.", "Precio", "Desc.", "Subtotal"]],
        body,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, halign: "center" },
        bodyStyles: { halign: "center" },
        columnStyles: {
            0: { halign: "left" },
            2: { halign: "right" },
            4: { halign: "right" },
        },
        margin: { left: 14, right: 14 },
    });

    const finalY = (doc.lastAutoTable?.finalY || 90) + 8;

    // --- Totales ---
    const iva = 0; // Librería: productos exentos de IVA en Nicaragua (educativos)
    const total = subtotalGeneral + iva;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", pageWidth - 60, finalY);
    doc.text(fmt(subtotalGeneral), pageWidth - 14, finalY, { align: "right" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", pageWidth - 60, finalY + 9);
    doc.text(fmt(total), pageWidth - 14, finalY + 9, { align: "right" });

    // --- Pie ---
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120);
    doc.text(
        "¡Gracias por su compra! | Documento generado electrónicamente.",
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 12,
        { align: "center" }
    );

    const nombreArchivo = `Factura-${numeroFactura}.pdf`;

    switch (modo) {
        case "save":
            doc.save(nombreArchivo);
            return doc;
        case "blob":
            return doc.output("blob");
        case "datauristring":
            return doc.output("datauristring");
        case "open":
        default:
            doc.output("dataurlnewwindow");
            return doc;
    }
}

export default generarFacturaPDF;
