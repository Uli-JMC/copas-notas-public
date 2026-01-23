import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReqBody = { registration_id: string };

function moneyCRC(n: number) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" }).format(n);
}

function waLink(phoneE164NoPlus: string, text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/${phoneE164NoPlus}?text=${msg}`;
}

Deno.serve(async (req) => {
  try {
    // Protegido por x-cron-secret (CRON_SECRET)
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const incoming = req.headers.get("x-cron-secret") || "";
    if (!CRON_SECRET || incoming !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized (cron secret)" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
    const SB_SERVICE_ROLE_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const BRAND_NAME = (Deno.env.get("BRAND_NAME") || "Entre Copas").trim();
    const BRAND_LOGO_URL = (Deno.env.get("BRAND_LOGO_URL") || "").trim();
    const EMAIL_HEADER_IMAGE_URL = (Deno.env.get("EMAIL_HEADER_IMAGE_URL") || "").trim();
    const WHATSAPP_NUMBER = "50688323801";

    console.log("step=env", {
      hasResend: Boolean(RESEND_API_KEY),
      hasSbUrl: Boolean(SB_URL),
      hasServiceRole: Boolean(SB_SERVICE_ROLE_KEY),
    });

    if (!RESEND_API_KEY)
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    if (!SB_URL)
      return new Response(JSON.stringify({ error: "Missing SB_URL/SUPABASE_URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    if (!SB_SERVICE_ROLE_KEY)
      return new Response(JSON.stringify({ error: "Missing SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    if (!body?.registration_id) {
      return new Response(JSON.stringify({ error: "Missing registration_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("step=body", body.registration_id);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: reg, error: regErr } = await sb
      .from("registrations")
      .select("id,name,email,reservation_number,event_id,event_date_id,created_at")
      .eq("id", body.registration_id)
      .maybeSingle();

    if (regErr) {
      console.log("step=reg_error", regErr);
      return new Response(JSON.stringify({ error: "registrations query failed", details: regErr }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!reg) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("step=reg_ok", { id: reg.id, email: reg.email });

    const { data: ev, error: evErr } = await sb
      .from("events")
      .select("title,location,time_range,price")
      .eq("id", reg.event_id)
      .maybeSingle();

    if (evErr) console.log("step=events_warn", evErr);

    const { data: dt, error: dtErr } = await sb
      .from("event_dates")
      .select("label")
      .eq("id", reg.event_date_id)
      .maybeSingle();

    if (dtErr) console.log("step=dates_warn", dtErr);

    const fullName = (reg.name || "Invitado").trim();
    const toEmail = (reg.email || "").trim();
    const reservationNumber = (reg.reservation_number || reg.id || "").trim();

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "Registration has no email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const eventTitle = (ev?.title ?? "Evento").trim();
    const location = (ev?.location ?? "Por confirmar").trim();
    const timeRange = (ev?.time_range ?? "Por confirmar").trim();
    const dateLabel = (dt?.label ?? "Por confirmar").trim();

    const price = Number(ev?.price ?? 0);
    const totalText = price > 0 ? moneyCRC(price) : "Te confirmamos el monto por WhatsApp";

    const waText = [
      `Hola, soy ${fullName}.`,
      `Quiero confirmar mi reserva ${reservationNumber}.`,
      `Adjunto comprobante de pago (imagen).`,
      `Correo: ${toEmail}`,
    ].join(" ");

    const whatsappUrl = waLink(WHATSAPP_NUMBER, waText);

    const headerImgBlock = EMAIL_HEADER_IMAGE_URL
      ? `
        <tr>
          <td style="padding:0">
            <img src="${EMAIL_HEADER_IMAGE_URL}" alt="${BRAND_NAME}" width="600"
              style="display:block;width:100%;max-width:600px;height:auto;border-radius:16px 16px 0 0;">
          </td>
        </tr>`
      : "";

    const logoBlock = BRAND_LOGO_URL
      ? `<img src="${BRAND_LOGO_URL}" alt="${BRAND_NAME}" width="44" height="44"
           style="display:block;border-radius:12px;object-fit:cover;">`
      : `<div style="width:44px;height:44px;border-radius:12px;background:#111827;"></div>`;

    const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>Confirmación de reserva</title></head>
  <body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="border-collapse:collapse;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(17,24,39,.08);">
            ${headerImgBlock}
            <tr><td style="padding:18px 22px 8px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="width:52px;vertical-align:middle;">${logoBlock}</td>
                  <td style="vertical-align:middle;padding-left:12px;">
                    <div style="font-size:16px;font-weight:700;line-height:1.2">${BRAND_NAME}</div>
                    <div style="font-size:12px;color:#6b7280;line-height:1.2">Confirmación de reserva</div>
                  </td>
                </tr>
              </table>
            </td></tr>

            <tr><td style="padding:0 22px 14px 22px;">
              <h2 style="margin:8px 0 10px 0;font-size:20px;">✅ Reserva registrada</h2>
              <p style="margin:0 0 10px 0;color:#374151;">Hola <b>${fullName}</b>, ¡gracias por registrarte!</p>

              <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:12px 0;">
                <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Tu número de reserva</div>
                <div style="font-size:18px;font-weight:800;letter-spacing:.3px;">${reservationNumber}</div>
              </div>

              <hr style="border:none;border-top:1px solid #eef0f4;margin:16px 0;" />

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#111827;"><b>Evento:</b> ${eventTitle}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Fecha:</b> ${dateLabel}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Hora:</b> ${timeRange}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Lugar:</b> ${location}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Monto total:</b> ${totalText}</td></tr>
              </table>

              <hr style="border:none;border-top:1px solid #eef0f4;margin:16px 0;" />

              <h3 style="margin:0 0 8px 0;font-size:16px;">⏳ Pago para validar tu reserva</h3>
              <p style="margin:0 0 10px 0;color:#374151;">
                Para <b>validar tu reserva</b>, debés cancelar el <b>monto total</b> dentro de las próximas <b>24 horas</b>.
              </p>
              <p style="margin:0 0 14px 0;color:#6b7280;font-size:13px;">
                Luego enviá una <b>imagen del comprobante</b> por WhatsApp usando el botón de abajo.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 6px 0;">
                <tr><td>
                  <a href="${whatsappUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;
                    padding:12px 16px;border-radius:12px;font-size:14px;">Enviar comprobante por WhatsApp</a>
                </td></tr>
              </table>

              <p style="margin:10px 0 0 0;color:#6b7280;font-size:12px;">
                Si el botón no abre, copiá este enlace: <span style="word-break:break-all;">${whatsappUrl}</span>
              </p>

              <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eef0f4;color:#9ca3af;font-size:12px;">— ${BRAND_NAME}</div>
            </td></tr>
          </table>
          <div style="max-width:600px;margin-top:10px;color:#9ca3af;font-size:12px;text-align:center;">
            Este correo es automático. Si necesitás ayuda, respondé por WhatsApp.
          </div>
        </td></tr>
      </table>
    </div>
  </body>
</html>`;

    console.log("step=resend_send", { toEmail });

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${BRAND_NAME} <onboarding@resend.dev>`,
        to: [toEmail],
        subject: `Confirmación de reserva ${reservationNumber} — ${eventTitle}`,
        html,
      }),
    });

    const resendText = await resendResp.text();
    console.log("step=resend_resp", { status: resendResp.status, body: resendText });

    if (!resendResp.ok) {
      return new Response(JSON.stringify({ error: "Resend error", status: resendResp.status, body: resendText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, resend: resendText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log("ERROR:", e?.message ?? String(e));
    return new Response(JSON.stringify({ error: "Internal error", details: e?.message ?? String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
