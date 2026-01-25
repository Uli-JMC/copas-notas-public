import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReqBody =
  | { registration_id: string; outbox_id?: never; limit?: never }
  | { outbox_id: string; registration_id?: never; limit?: never }
  | { limit: number; registration_id?: never; outbox_id?: never };

function moneyCRC(n: number) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" }).format(n);
}

function waLink(phoneE164NoPlus: string, text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/${phoneE164NoPlus}?text=${msg}`;
}

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeJson<T = any>(txt: string): Promise<T | null> {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    // ============================================================
    // Auth: x-cron-secret
    // ============================================================
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const incoming = req.headers.get("x-cron-secret") || "";
    if (!CRON_SECRET || incoming !== CRON_SECRET) {
      return json({ error: "Unauthorized (cron secret)" }, 401);
    }

    // ============================================================
    // Env
    // ============================================================
    const RESEND_API_KEY = (Deno.env.get("RESEND_API_KEY") || "").trim();
    const SB_URL = (Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "").trim();
    const SB_SERVICE_ROLE_KEY =
      (Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

    const BRAND_NAME = (Deno.env.get("BRAND_NAME") || "Entre Copas").trim();
    const BRAND_LOGO_URL = (Deno.env.get("BRAND_LOGO_URL") || "").trim();
    const EMAIL_HEADER_IMAGE_URL = (Deno.env.get("EMAIL_HEADER_IMAGE_URL") || "").trim();

    // ✅ configurable por secret/env
    const FROM_EMAIL = (Deno.env.get("FROM_EMAIL") || "reservas@reservas.entrecopasynotas.com").trim();

    const WHATSAPP_NUMBER = "50688323801";
    const OUTBOX_TABLE = "email_outbox";

    console.log("step=env", {
      hasResend: Boolean(RESEND_API_KEY),
      hasSbUrl: Boolean(SB_URL),
      hasServiceRole: Boolean(SB_SERVICE_ROLE_KEY),
      hasFromEmail: Boolean(FROM_EMAIL),
    });

    if (!RESEND_API_KEY) return json({ error: "Missing RESEND_API_KEY" }, 500);
    if (!SB_URL) return json({ error: "Missing SB_URL/SUPABASE_URL" }, 500);
    if (!SB_SERVICE_ROLE_KEY)
      return json({ error: "Missing SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY" }, 500);

    // ============================================================
    // Body
    // ============================================================
    const body = (await req.json().catch(() => null)) as ReqBody | null;
    if (!body) return json({ error: "Missing JSON body" }, 400);

    console.log("step=body", body);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // ============================================================
    // Helpers: build HTML
    // ============================================================
    function buildHtml(p: any) {
      const fullName = String(p.fullName || p.name || "Invitado").trim();
      const toEmail = String(p.toEmail || p.email || "").trim();
      const reservationNumber = String(p.reservationNumber || p.reservation_number || p.registration_id || "").trim();

      const eventTitle = String(p.eventTitle || p.event_title || "Evento").trim();
      const location = String(p.location || "Por confirmar").trim();
      const timeRange = String(p.timeRange || p.time_range || "Por confirmar").trim();
      const dateLabel = String(p.dateLabel || p.date_label || "Por confirmar").trim();
      const totalText = String(p.totalText || p.total_text || "Te confirmamos el monto por WhatsApp").trim();

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

      return { html, fullName, toEmail, reservationNumber, eventTitle };
    }

    async function resendSend(toEmail: string, subject: string, html: string) {
      console.log("step=resend_send", { toEmail, from: FROM_EMAIL });

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${BRAND_NAME} <${FROM_EMAIL}>`,
          to: [toEmail],
          subject,
          html,
        }),
      });

      const text = await resp.text();
      console.log("step=resend_resp", { status: resp.status, body: text });

      const js = await safeJson(text);
      return { ok: resp.ok, status: resp.status, text, json: js };
    }

    async function updateOutbox(id: string, status: "SENT" | "FAILED", payload: any) {
      const meta = {
        ...(payload?.meta || {}),
        last_send_at: new Date().toISOString(),
        last_status: status,
      };
      const payloadNew = { ...(payload || {}), meta };

      const { error } = await sb
        .from(OUTBOX_TABLE)
        .update({ status, payload: payloadNew })
        .eq("id", id);

      if (error) console.log("step=outbox_update_error", error);
      else console.log("step=outbox_update_ok", { id, status });
    }

    // ============================================================
    // MODE B1: send ONE outbox row by outbox_id
    // ============================================================
    async function processOutboxId(outboxId: string) {
      const { data: row, error } = await sb
        .from(OUTBOX_TABLE)
        .select("id,to_email,payload,status")
        .eq("id", outboxId)
        .maybeSingle();

      if (error) return json({ error: "email_outbox query failed", details: error }, 500);
      if (!row) return json({ error: "Outbox not found" }, 404);

      const payload = row.payload || {};
      const toEmail = String(row.to_email || payload.toEmail || payload.email || "").trim();
      if (!toEmail) return json({ error: "Outbox row has no to_email" }, 400);

      const { html, reservationNumber, eventTitle } = buildHtml({
        ...payload,
        toEmail,
        reservationNumber: payload.reservationNumber || payload.reservation_number || payload.registration_id || payload.id,
      });

      const subject = `Confirmación de reserva ${reservationNumber} — ${eventTitle}`;
      const r = await resendSend(toEmail, subject, html);

      // guardar meta
      const meta = {
        ...(payload?.meta || {}),
        resend_status: r.status,
        resend_raw: r.text,
        resend_id: r.json?.id || null,
      };

      if (!r.ok) {
        await updateOutbox(row.id, "FAILED", { ...payload, meta });
        return json({ error: "Resend error", status: r.status, body: r.text }, 500);
      }

      await updateOutbox(row.id, "SENT", { ...payload, meta });
      return json({ ok: true, outbox_id: row.id, resend: r.json || r.text }, 200);
    }

    // ============================================================
    // MODE B2: send from registration_id (and sync/insert outbox row)
    // ============================================================
    async function processRegistrationId(registrationId: string) {
      const { data: reg, error: regErr } = await sb
        .from("registrations")
        .select("id,name,email,reservation_number,event_id,event_date_id,created_at")
        .eq("id", registrationId)
        .maybeSingle();

      if (regErr) return json({ error: "registrations query failed", details: regErr }, 500);
      if (!reg) return json({ error: "Registration not found" }, 404);

      const { data: ev } = await sb
        .from("events")
        .select("title,location,time_range,price")
        .eq("id", reg.event_id)
        .maybeSingle();

      const { data: dt } = await sb
        .from("event_dates")
        .select("label")
        .eq("id", reg.event_date_id)
        .maybeSingle();

      const fullName = (reg.name || "Invitado").trim();
      const toEmail = (reg.email || "").trim();
      const reservationNumber = (reg.reservation_number || reg.id || "").trim();

      if (!toEmail) return json({ error: "Registration has no email" }, 400);

      const eventTitle = (ev?.title ?? "Evento").trim();
      const location = (ev?.location ?? "Por confirmar").trim();
      const timeRange = (ev?.time_range ?? "Por confirmar").trim();
      const dateLabel = (dt?.label ?? "Por confirmar").trim();

      const price = Number(ev?.price ?? 0);
      const totalText = price > 0 ? moneyCRC(price) : "Te confirmamos el monto por WhatsApp";

      // Payload para outbox
      const payload = {
        registration_id: reg.id,
        fullName,
        toEmail,
        reservationNumber,
        eventTitle,
        location,
        timeRange,
        dateLabel,
        totalText,
      };

      // Buscar si ya existe outbox para este registration_id (en payload)
      const { data: existing } = await sb
        .from(OUTBOX_TABLE)
        .select("id,to_email,payload,status")
        .eq("payload->>registration_id", reg.id)
        .maybeSingle();

      let outboxId = existing?.id as string | undefined;

      if (!outboxId) {
        const { data: ins, error: insErr } = await sb
          .from(OUTBOX_TABLE)
          .insert({ to_email: toEmail, payload, status: "PENDING" })
          .select("id")
          .maybeSingle();

        if (insErr) return json({ error: "email_outbox insert failed", details: insErr }, 500);
        outboxId = ins?.id;
      } else {
        // refrescar payload si ya existía, y dejar en PENDING para reintento manual
        await sb.from(OUTBOX_TABLE).update({ to_email: toEmail, payload, status: "PENDING" }).eq("id", outboxId);
      }

      // enviar usando el modo outbox (para que quede SENT/FAILED)
      return await processOutboxId(outboxId!);
    }

    // ============================================================
    // MODE B3: batch pending (limit)
    // ============================================================
    async function processBatch(limit: number) {
      const lim = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 10;

      const { data: rows, error } = await sb
        .from(OUTBOX_TABLE)
        .select("id")
        .eq("status", "PENDING")
        .order("created_at", { ascending: true })
        .limit(lim);

      if (error) return json({ error: "email_outbox batch query failed", details: error }, 500);
      if (!rows || rows.length === 0) return json({ ok: true, processed: 0 }, 200);

      let ok = 0;
      let failed = 0;
      const results: any[] = [];

      for (const r of rows) {
        const id = String((r as any).id);
        const resp = await processOutboxId(id);
        const txt = await resp.text();

        // "processOutboxId" devuelve Response; acá re-armo resultado simple
        if (resp.status >= 200 && resp.status < 300) ok++;
        else failed++;

        results.push({ id, status: resp.status, body: await safeJson(txt) || txt });
      }

      return json({ ok: true, processed: rows.length, ok_count: ok, failed_count: failed, results }, 200);
    }

    // ============================================================
    // Router
    // ============================================================
    if ("outbox_id" in body && body.outbox_id) {
      return await processOutboxId(body.outbox_id);
    }

    if ("registration_id" in body && body.registration_id) {
      return await processRegistrationId(body.registration_id);
    }

    if ("limit" in body && typeof body.limit === "number") {
      return await processBatch(body.limit);
    }

    return json({ error: "Provide registration_id OR outbox_id OR limit" }, 400);
  } catch (e) {
    console.log("ERROR:", e?.message ?? String(e));
    return json({ error: "Internal error", details: e?.message ?? String(e) }, 500);
  }
});
