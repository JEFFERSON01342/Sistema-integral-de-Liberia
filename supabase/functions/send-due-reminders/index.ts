import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

serve(async (req) => {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    try {
        const { data: facturas, error } = await supabase.rpc('sp_get_reminders_for_today');
        if (error) throw error;

        if (facturas.length === 0) {
            return new Response(JSON.stringify({ message: "No hay recordatorios para enviar hoy." }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        for (const factura of facturas) {
            await resend.emails.send({
                from: "financeerpsystem@gmail.com",
                to: factura.cliente_email,
                subject: `Recordatorio de Pago - Factura #${factura.id_venta}`,
                html: `
                    <h1>Hola ${factura.cliente_nombre},</h1>
                    <p>Este es un recordatorio amigable de que tu factura N° <strong>${factura.id_venta}</strong> está por vencer.</p>
                    <p><strong>Fecha de Vencimiento:</strong> ${new Date(factura.fecha_vencimiento).toLocaleDateString()}</p>
                    <p><strong>Saldo Pendiente:</strong> C$ ${factura.saldo_pendiente.toFixed(2)}</p>
                    <p>¡Gracias por tu negocio!</p>
                    <p>- El Equipo de Finance ERP</p>
                `,
            });
        }

        return new Response(JSON.stringify({ message: `Se enviaron ${facturas.length} recordatorios.` }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});