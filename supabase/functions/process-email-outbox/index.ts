import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReqBody = {
  limit?: number;
  outbox_id?: string;
};

// ============================================================
// Helpers
// ============================================================
function escapeHtml(str: any) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normCurrency(cur: any) {
  const c = String(cur || "").trim().toUpperCase();
  if (c === "CRC" || c === "USD") return c;
  return "";
}

function formatMoney(amount: any, currency: any) {
  const cur = normCurrency(currency);
  const n = Number(amount);
  if (!cur || !Number.isFinite(n)) return null;

  const isCRC = cur === "CRC";
  const decimals = isCRC ? 0 : 2;

  try {
    const formatted = n.toLocaleString("es-CR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return isCRC ? `₡${formatted}` : `$${formatted}`;
  } catch {
    const fixed = n.toFixed(decimals);
    return isCRC ? `₡${fixed}` : `$${fixed}`;
  }
}

function moneyTextFromEvent(ev: any) {
  // ✅ FIX BD: price_amount + price_currency
  const t = formatMoney(ev?.price_amount, ev?.price_currency);
  return t;
}

function fmtDateEsCR(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-CR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(d);
  } catch {
    return "";
  }
}

function fmtTimeEsCR(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-CR", {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function parseDurationHours(v: any): number | null {
  // duration_hours en tu schema es text, puede venir "2", "2.5", "2 horas"
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildTimeRange({
  start_at,
  ends_at,
  fallback,
  durationHoursText,
}: {
  start_at?: string | null;
  ends_at?: string | null;
  fallback?: string | null;
  durationHoursText?: any;
}) {
  const sIso = start_at ? String(start_at) : "";
  if (sIso) {
    const s = new Date(sIso);
    if (!Number.isNaN(s.getTime())) {
      let e: Date | null = null;

      if (ends_at) {
        const eTry = new Date(String(ends_at));
        if (!Number.isNaN(eTry.getTime())) e = eTry;
      } else {
        const dh = parseDurationHours(durationHoursText);
        if (dh) e = new Date(s.getTime() + dh * 60 * 60 * 1000);
      }

      const sText = fmtTimeEsCR(s.toISOString());
      if (e) {
        const eText = fmtTimeEsCR(e.toISOString());
        if (sText && eText) return `${sText} – ${eText}`;
      }
      if (sText) return sText;
    }
  }

  const fb = String(fallback ?? "").trim();
  return fb || "Por confirmar";
}

function waLink(phoneE164NoPlus: string, text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/${phoneE164NoPlus}?text=${msg}`;
}

function jsonResp(status: number, payload: any) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRetryableError(message: string) {
  const msg = (message || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("temporarily") ||
    msg.includes("temporary") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("connection") ||
    msg.includes("econnreset") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("internal server error") ||
    msg.includes("service unavailable")
  );
}

function calcBackoffMinutes(tries: number) {
  if (tries <= 1) return 1;
  if (tries === 2) return 2;
  if (tries === 3) return 5;
  if (tries === 4) return 10;
  if (tries <= 7) return 30;
  return 60;
}

function addMinutesToISO(minutes: number) {
  const d = new Date(Date.now() + minutes * 60_000);
  return d.toISOString();
}

Deno.serve(async (req) => {
  try {
    // Solo POST (evita ejecuciones accidentales)
    if (req.method !== "POST") {
      return jsonResp(405, { error: "Method not allowed" });
    }

    // ============================================================
    // Security: Protegido por x-cron-secret (CRON_SECRET)
    // ============================================================
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const incoming = req.headers.get("x-cron-secret") || "";
    if (!CRON_SECRET || incoming !== CRON_SECRET) {
      return jsonResp(401, { error: "Unauthorized (cron secret)" });
    }

    // ============================================================
    // Env
    // ============================================================
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
    const SB_SERVICE_ROLE_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const BRAND_NAME = (Deno.env.get("BRAND_NAME") || "Entre Copas").trim();
    const BRAND_LOGO_URL = (Deno.env.get("BRAND_LOGO_URL") || "").trim();
    const EMAIL_HEADER_IMAGE_URL = (Deno.env.get("EMAIL_HEADER_IMAGE_URL") || "").trim();

    const FROM_EMAIL = (Deno.env.get("FROM_EMAIL") || "reservas@reservas.entrecopasynotas.com").trim();
    const WHATSAPP_NUMBER = "50688323801";

    if (!RESEND_API_KEY) return jsonResp(500, { error: "Missing RESEND_API_KEY" });
    if (!SB_URL) return jsonResp(500, { error: "Missing SB_URL/SUPABASE_URL" });
    if (!SB_SERVICE_ROLE_KEY)
      return jsonResp(500, { error: "Missing SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY" });

    // ============================================================
    // Body
    // ============================================================
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // ============================================================
    // 1) Query pendientes elegibles (next_retry_at null o <= ahora)
    // ============================================================
    const nowIso = new Date().toISOString();

    let q = sb
      .from("email_outbox")
      .select("id,to_email,payload,status,kind,tries,created_at,last_error,next_retry_at")
      .eq("status", "PENDING")
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (body.outbox_id) q = q.eq("id", body.outbox_id);

    const { data: rows, error: qErr } = await q;
    if (qErr) return jsonResp(500, { error: "outbox query failed", details: qErr });

    if (!rows || rows.length === 0) {
      return jsonResp(200, { ok: true, processed: 0, sent: 0, failed: 0, skipped: 0 });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    const SUPPORTED_KINDS = new Set([
      "registration_confirmation",
      "send-confirmation-email",
      "registration-confirmation",
      "registration_email",
    ]);

    const MAX_TRIES = 8;

    // ============================================================
    // Worker loop
    // ============================================================
    for (const row of rows) {
      const outboxId = String(row.id);
      const kind = String(row.kind || "").trim();
      let payload: any = row.payload;

      try {
        // ============================================================
        // LOCK: PENDING -> SENDING (anti doble worker)
        // ============================================================
        const { data: lockData, error: lockErr } = await sb
          .from("email_outbox")
          .update({ status: "SENDING" })
          .eq("id", outboxId)
          .eq("status", "PENDING")
          .select("id,tries")
          .maybeSingle();

        if (lockErr) throw new Error(`lock update failed: ${lockErr.message}`);
        if (!lockData) {
          skipped++;
          continue;
        }

        // tries++ basado en el valor real de DB (lockData.tries)
        const triesNow = Number(lockData.tries ?? row.tries ?? 0) + 1;
        await sb.from("email_outbox").update({ tries: triesNow }).eq("id", outboxId);

        // kind validation
        if (!SUPPORTED_KINDS.has(kind)) throw new Error(`kind no soportado: ${kind}`);

        // payload normalize
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch {}
        }

        const registrationId = String(payload?.registration_id || "").trim();
        if (!registrationId) throw new Error("payload.registration_id faltante (Modo B requiere esto)");

        // ============================================================
        // Data fetch
        // ============================================================
        const { data: reg, error: regErr } = await sb
          .from("registrations")
          .select("id,name,email,reservation_number,event_id,event_date_id,created_at")
          .eq("id", registrationId)
          .maybeSingle();

        if (regErr) throw new Error(`registrations query failed: ${regErr.message}`);
        if (!reg) throw new Error("Registration not found");

        const fullName = (reg.name || "Invitado").trim();
        const toEmail = (reg.email || String(row.to_email || "") || "").trim();
        const reservationNumber = (reg.reservation_number || reg.id || "").trim();
        if (!toEmail) throw new Error("El registro no tiene email (reg.email vacío)");

        // ✅ FIX: tu BD no tiene events.price; tiene price_amount + price_currency
        // ✅ También traemos duration_hours para calcular ends_at cuando falte
        const { data: ev } = await sb
          .from("events")
          .select("title,location,time_range,duration_hours,price_amount,price_currency")
          .eq("id", reg.event_id)
          .maybeSingle();

        // ✅ FIX: si tenés start_at/ends_at esto permite “Hora real”
        const { data: dt } = await sb
          .from("event_dates")
          .select("label,start_at,ends_at")
          .eq("id", reg.event_date_id)
          .maybeSingle();

        const eventTitle = String(ev?.title ?? "Evento").trim() || "Evento";
        const location = String(ev?.location ?? "Por confirmar").trim() || "Por confirmar";

        const dateLabelDb = String(dt?.label ?? "").trim();
        const dateLabel =
          dateLabelDb ||
          (dt?.start_at ? fmtDateEsCR(String(dt.start_at)) : "") ||
          "Por confirmar";

        const timeRange = buildTimeRange({
          start_at: dt?.start_at ? String(dt.start_at) : null,
          ends_at: dt?.ends_at ? String(dt.ends_at) : null,
          fallback: ev?.time_range ? String(ev.time_range) : null,
          durationHoursText: ev?.duration_hours,
        });

        const money = moneyTextFromEvent(ev);
        const totalText = money || "Te confirmamos el monto por WhatsApp";

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
                <img src="${EMAIL_HEADER_IMAGE_URL}" alt="${escapeHtml(BRAND_NAME)}" width="600"
                  style="display:block;width:100%;max-width:600px;height:auto;border-radius:16px 16px 0 0;">
              </td>
            </tr>`
          : "";

        const logoBlock = BRAND_LOGO_URL
          ? `<img src="${BRAND_LOGO_URL}" alt="${escapeHtml(BRAND_NAME)}" width="44" height="44"
               style="display:block;border-radius:12px;object-fit:cover;">`
          : `<div style="width:44px;height:44px;border-radius:12px;background:#111827;"></div>`;

        // ✅ Escape en TODO lo que viene de DB (evita HTML roto / contenido vacío por caracteres raros)
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
                    <div style="font-size:16px;font-weight:700;line-height:1.2">${escapeHtml(BRAND_NAME)}</div>
                    <div style="font-size:12px;color:#6b7280;line-height:1.2">Confirmación de reserva</div>
                  </td>
                </tr>
              </table>
            </td></tr>

            <tr><td style="padding:0 22px 14px 22px;">
              <h2 style="margin:8px 0 10px 0;font-size:20px;">✅ Reserva registrada</h2>
              <p style="margin:0 0 10px 0;color:#374151;">Hola <b>${escapeHtml(fullName)}</b>, ¡gracias por registrarte!</p>

              <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:12px 0;">
                <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Tu número de reserva</div>
                <div style="font-size:18px;font-weight:800;letter-spacing:.3px;">${escapeHtml(reservationNumber)}</div>
              </div>

              <hr style="border:none;border-top:1px solid #eef0f4;margin:16px 0;" />

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#111827;"><b>Evento:</b> ${escapeHtml(eventTitle)}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Fecha:</b> ${escapeHtml(dateLabel)}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Hora:</b> ${escapeHtml(timeRange)}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Lugar:</b> ${escapeHtml(location)}</td></tr>
                <tr><td style="padding:6px 0;color:#111827;"><b>Monto total:</b> ${escapeHtml(totalText)}</td></tr>
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

              <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eef0f4;color:#9ca3af;font-size:12px;">— ${escapeHtml(BRAND_NAME)}</div>
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

        // ============================================================
        // Resend send
        // ============================================================
        const resendResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${BRAND_NAME} <${FROM_EMAIL}>`,
            to: [toEmail],
            subject: `Confirmación de reserva ${reservationNumber} — ${eventTitle}`,
            html,
          }),
        });

        const resendText = await resendResp.text();
        if (!resendResp.ok) throw new Error(`Resend error ${resendResp.status}: ${resendText}`);

        let resendId: string | null = null;
        try {
          const parsed = JSON.parse(resendText);
          resendId = parsed?.id ? String(parsed.id) : null;
        } catch {}

        await sb
          .from("email_outbox")
          .update({
            status: "SENT",
            last_error: null,
            next_retry_at: null,
            payload: { ...(payload || {}), resend_id: resendId },
          } as any)
          .eq("id", outboxId);

        sent++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);

        // tries reales ya incrementados en DB; aproximamos para backoff
        const triesApprox = Number(row.tries ?? 0) + 1;

        const retryable = isRetryableError(msg);
        if (retryable && triesApprox < 8) {
          const backoffMin = calcBackoffMinutes(triesApprox);
          const nextRetry = addMinutesToISO(backoffMin);

          await sb
            .from("email_outbox")
            .update({
              status: "PENDING",
              last_error: msg,
              next_retry_at: nextRetry,
            } as any)
            .eq("id", outboxId);

          failed++;
        } else {
          await sb
            .from("email_outbox")
            .update({
              status: "FAILED",
              last_error: msg,
              next_retry_at: null,
            } as any)
            .eq("id", outboxId);

          failed++;
        }
      }
    }

    return jsonResp(200, { ok: true, processed: rows.length, sent, failed, skipped });
  } catch (e: any) {
    return jsonResp(500, { error: "Internal error", details: e?.message ?? String(e) });
  }
});
