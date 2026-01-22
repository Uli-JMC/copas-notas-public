import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Body = {
  limit?: number; // opcional: cantidad a procesar
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function esc(v: unknown) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeStr(v: unknown) {
  return String(v ?? "");
}

function pickRegistrationId(payload: any): string {
  return (
    payload?.registration_id ||
    payload?.registrationId ||
    payload?.reservation_id ||
    payload?.reservationId ||
    ""
  );
}

function buildRegistrationEmail(data: {
  personName: string;
  eventTitle: string;
  eventType?: string;
  dateLabel: string;
  location: string;
  timeRange: string;
  duration: string;
  reservationId: string;
}) {
  const subject = `Confirmación de inscripción: ${data.eventTitle}`;

  const wa =
    `https://wa.me/5068845123?text=` +
    encodeURIComponent(`Hola, tengo una consulta sobre mi reserva (${data.reservationId}).`);

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#0b0b0f; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#11121a; border:1px solid rgba(255,255,255,.10); border-radius:16px; overflow:hidden;">
      <div style="padding:20px 22px; border-bottom:1px solid rgba(255,255,255,.10);">
        <div style="color:#fff; font-weight:800; font-size:16px;">Entre Copas &amp; Notas</div>
        <div style="color:rgba(255,255,255,.70); font-size:13px; margin-top:4px;">Confirmación de reserva</div>
      </div>

      <div style="padding:22px;">
        <p style="color:#fff; font-size:15px; margin:0 0 14px;">
          Hola <b>${esc(data.personName)}</b>, tu cupo quedó reservado 🥂
        </p>

        <div style="background:#0f1020; border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:16px;">
          <p style="margin:0; color:#fff; font-weight:700;">${esc(data.eventTitle)}${data.eventType ? ` · ${esc(data.eventType)}` : ""}</p>

          <p style="margin:10px 0 0; color:rgba(255,255,255,.75); font-size:13px;">
            <b style="color:#fff;">Fecha:</b> ${esc(data.dateLabel || "Por confirmar")}
          </p>
          <p style="margin:6px 0 0; color:rgba(255,255,255,.75); font-size:13px;">
            <b style="color:#fff;">Hora:</b> ${esc(data.timeRange || "Por confirmar")}
          </p>
          <p style="margin:6px 0 0; color:rgba(255,255,255,.75); font-size:13px;">
            <b style="color:#fff;">Duración:</b> ${esc(data.duration || "Por confirmar")}
          </p>
          <p style="margin:6px 0 0; color:rgba(255,255,255,.75); font-size:13px;">
            <b style="color:#fff;">Ubicación:</b> ${esc(data.location || "Por confirmar")}
          </p>

          <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,.10); display:flex; justify-content:space-between; gap:12px;">
            <span style="color:rgba(255,255,255,.65); font-size:12px;">Código de reserva</span>
            <span style="color:#fff; font-weight:900; font-size:12px; text-align:right;">${esc(data.reservationId)}</span>
          </div>
        </div>

        <div style="margin-top:14px;">
          <a href="${wa}" style="display:inline-block; background:#6d5efc; color:#fff; text-decoration:none; padding:10px 14px; border-radius:12px; font-weight:800; font-size:13px;">
            WhatsApp para dudas
          </a>
        </div>

        <p style="margin:14px 0 0; font-size:12px; color:rgba(255,255,255,.55);">
          Si no solicitaste esta reserva, podés ignorar este correo.
        </p>
      </div>
    </div>
  </div>
  `;

  return { subject, html };
}

async function sbGet(url: string, key: string) {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  return r;
}

async function sbPatch(url: string, key: string, body: unknown) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return r;
}

async function sendResend(apiKey: string, from: string, to: string, subject: string, html: string) {
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  const body = await resendRes.text();
  if (!resendRes.ok) {
    throw new Error(`Resend error: ${body}`);
  }
  return body;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    // ✅ Seguridad simple para que no quede abierto:
    // Poné CRON_SECRET en secrets y llamá con header x-cron-secret
    const CRON_SECRET = getEnv("CRON_SECRET");
    const gotSecret = req.headers.get("x-cron-secret") || "";
    if (!gotSecret || gotSecret !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = getEnv("RESEND_API_KEY");
    const FROM_EMAIL = getEnv("FROM_EMAIL");

    const body = (await req.json().catch(() => ({}))) as Body;
    const limit = Math.max(1, Math.min(Number(body?.limit || 10), 25));

    // 1) Leer pendientes
    const qUrl =
      `${SB_URL}/rest/v1/email_outbox` +
      `?status=eq.PENDING` +
      `&order=created_at.asc` +
      `&limit=${limit}` +
      `&select=id,kind,to_email,payload,tries,status,created_at`;

    const pendingRes = await sbGet(qUrl, SB_SERVICE_ROLE_KEY);
    if (!pendingRes.ok) return json({ error: "No pude leer email_outbox", details: await pendingRes.text() }, 500);

    const pending = (await pendingRes.json()) as any[];
    if (!Array.isArray(pending) || pending.length === 0) {
      return json({ ok: true, processed: 0, sent: 0, errors: 0 });
    }

    let processed = 0;
    let sent = 0;
    let errors = 0;

    for (const row of pending) {
      processed++;

      const outboxId = row.id;
      const tries = Number(row.tries || 0);

      // 2) LOCK: PENDING -> SENDING (solo si sigue PENDING)
      const lockUrl = `${SB_URL}/rest/v1/email_outbox?id=eq.${encodeURIComponent(outboxId)}&status=eq.PENDING`;
      const lockRes = await sbPatch(lockUrl, SB_SERVICE_ROLE_KEY, {
        status: "SENDING",
        tries: tries + 1,
        last_error: null,
      });

      if (!lockRes.ok) {
        // Otro proceso lo agarró o fallo el lock
        continue;
      }

      const lockedRows = await lockRes.json().catch(() => []);
      const locked = Array.isArray(lockedRows) ? lockedRows[0] : null;
      if (!locked) continue;

      try {
        const kind = safeStr(locked.kind);
        const toEmail = safeStr(locked.to_email).trim();
        const payload = locked.payload || {};

        if (!toEmail) throw new Error("Outbox sin to_email");

        if (kind !== "registration_confirmation") {
          throw new Error(`kind no soportado: ${kind}`);
        }

        // 3) Lookup real desde registrations para no depender del payload
        const registrationId = pickRegistrationId(payload);
        if (!registrationId) throw new Error("payload sin registration_id");

        const regUrl =
          `${SB_URL}/rest/v1/registrations` +
          `?id=eq.${encodeURIComponent(registrationId)}` +
          `&select=id,name,email,phone,marketing_opt_in,created_at,` +
          `event:events(title,type,location,time_range,duration_hours),` +
          `date:event_dates(label)`;

        const regRes = await sbGet(regUrl, SB_SERVICE_ROLE_KEY);
        if (!regRes.ok) throw new Error(`No pude leer registration: ${await regRes.text()}`);

        const regs = await regRes.json().catch(() => []);
        const reg = Array.isArray(regs) ? regs[0] : null;
        if (!reg) throw new Error("Registration no existe");

        const personName = reg?.name ?? payload?.name ?? "Invitado";
        const eventTitle = reg?.event?.title ?? payload?.event_title ?? "Evento";
        const eventType = reg?.event?.type ?? payload?.event_type ?? "";
        const dateLabel = reg?.date?.label ?? payload?.event_date_label ?? "Por confirmar";
        const location = reg?.event?.location ?? payload?.location ?? "Por confirmar";
        const timeRange = reg?.event?.time_range ?? payload?.time_range ?? "Por confirmar";
        const duration = String(reg?.event?.duration_hours ?? payload?.duration_hours ?? "Por confirmar");

        const built = buildRegistrationEmail({
          personName,
          eventTitle,
          eventType,
          dateLabel,
          location,
          timeRange,
          duration,
          reservationId: registrationId,
        });

        await sendResend(RESEND_API_KEY, FROM_EMAIL, toEmail, built.subject, built.html);

        // 4) Marcar SENT
        const sentUrl = `${SB_URL}/rest/v1/email_outbox?id=eq.${encodeURIComponent(outboxId)}`;
        const sentRes = await sbPatch(sentUrl, SB_SERVICE_ROLE_KEY, {
          status: "SENT",
          sent_at: new Date().toISOString(),
          last_error: null,
        });

        if (!sentRes.ok) {
          // Ya enviamos, pero no pudimos marcar sent => lo dejamos error para revisión manual
          throw new Error(`Enviado pero no pude marcar SENT: ${await sentRes.text()}`);
        }

        sent++;
      } catch (e) {
        errors++;
        const msg = safeStr((e as any)?.message || e);

        // Marcar ERROR
        const errUrl = `${SB_URL}/rest/v1/email_outbox?id=eq.${encodeURIComponent(outboxId)}`;
        await sbPatch(errUrl, SB_SERVICE_ROLE_KEY, {
          status: "ERROR",
          last_error: msg.slice(0, 2000),
        }).catch(() => {});
      }
    }

    return json({ ok: true, processed, sent, errors }, 200);
  } catch (err) {
    return json({ ok: false, error: safeStr((err as any)?.message || err) }, 500);
  }
});

