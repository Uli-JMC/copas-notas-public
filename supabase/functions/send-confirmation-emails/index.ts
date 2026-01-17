import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Payload = {
  registration_id: string; // UUID
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

Deno.serve(async (req) => {
  // CORS (por si lo llamás desde Netlify/front)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const { registration_id } = (await req.json()) as Payload;

    if (!registration_id || typeof registration_id !== "string") {
      return json({ error: "registration_id requerido" }, 400);
    }

    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = getEnv("RESEND_API_KEY");
    const FROM_EMAIL = getEnv("FROM_EMAIL");

    // 1) Leer registro + evento + fecha desde DB (service role)
    const regRes = await fetch(`${SB_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(registration_id)}&select=id,name,email,phone,marketing_opt_in,created_at,event:events(id,title,desc,type,location,time_range,duration_hours),date:event_dates(id,label)`, {
      method: "GET",
      headers: {
        apikey: SB_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!regRes.ok) {
      const t = await regRes.text();
      return json({ error: "No se pudo leer registration", details: t }, 500);
    }

    const rows = await regRes.json();
    const reg = Array.isArray(rows) ? rows[0] : null;

    if (!reg) return json({ error: "Registration no existe" }, 404);

    const toEmail = String(reg.email || "").trim();
    if (!toEmail) return json({ error: "Registration sin email" }, 400);

    const eventTitle = reg?.event?.title ?? "Evento";
    const eventType = reg?.event?.type ?? "";
    const dateLabel = reg?.date?.label ?? "";
    const location = reg?.event?.location ?? "Por confirmar";
    const timeRange = reg?.event?.time_range ?? "Por confirmar";
    const duration = reg?.event?.duration_hours ?? "Por confirmar";
    const personName = reg?.name ?? "Hola";

    // 2) Enviar email con Resend
    const subject = `Confirmación de inscripción: ${eventTitle}`;
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.5; color:#111;">
        <h2 style="margin:0 0 8px;">¡Inscripción confirmada! 🥂</h2>
        <p style="margin:0 0 12px;">Hola <b>${escapeHtml(personName)}</b>, tu cupo quedó reservado.</p>

        <div style="padding:12px 14px; border:1px solid #e5e7eb; border-radius:12px; background:#fafafa;">
          <p style="margin:0;"><b>${escapeHtml(eventTitle)}</b>${eventType ? ` · ${escapeHtml(eventType)}` : ""}</p>
          <p style="margin:6px 0 0;"><b>Fecha:</b> ${escapeHtml(dateLabel || "Por confirmar")}</p>
          <p style="margin:6px 0 0;"><b>Hora:</b> ${escapeHtml(timeRange)}</p>
          <p style="margin:6px 0 0;"><b>Duración:</b> ${escapeHtml(String(duration))}</p>
          <p style="margin:6px 0 0;"><b>Ubicación:</b> ${escapeHtml(location)}</p>
        </div>

        <p style="margin:14px 0 0; font-size:14px; color:#374151;">
          Si tenés preguntas, respondé este correo o escribinos por WhatsApp.
        </p>

        <p style="margin:14px 0 0; font-size:12px; color:#6b7280;">
          Entre Copas &amp; Notas
        </p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject,
        html,
      }),
    });

    const resendBody = await resendRes.text();

    if (!resendRes.ok) {
      return json({ error: "Resend falló", details: resendBody }, 500);
    }

    // (Opcional) Podés guardar un log en DB, pero por ahora devolvemos ok
    return new Response(resendBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    console.error(err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

function escapeHtml(str: string) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
