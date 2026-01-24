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

    // Mantengo RESEND_API_KEY por compatibilidad/visibilidad (pero en Modo B NO se usa aquí)
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
    const SB_SERVICE_ROLE_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const BRAND_NAME = (Deno.env.get("BRAND_NAME") || "Entre Copas").trim();
    const BRAND_LOGO_URL = (Deno.env.get("BRAND_LOGO_URL") || "").trim();
    const EMAIL_HEADER_IMAGE_URL = (Deno.env.get("EMAIL_HEADER_IMAGE_URL") || "").trim();

    // ✅ NUEVO (opcional): configurable por secret/env (Modo B lo guarda para el worker si querés)
    const FROM_EMAIL = (Deno.env.get("FROM_EMAIL") || "reservas@reservas.entrecopasynotas.com").trim();

    const WHATSAPP_NUMBER = "50688323801";

    console.log("step=env", {
      hasResend: Boolean(RESEND_API_KEY),
      hasSbUrl: Boolean(SB_URL),
      hasServiceRole: Boolean(SB_SERVICE_ROLE_KEY),
      hasFromEmail: Boolean(FROM_EMAIL),
      mode: "B_ENQUEUE",
    });

    // Nota: en Modo B no es obligatorio tener RESEND_API_KEY aquí (lo usa el worker),
    // pero lo dejamos logueado.
    if (!SB_URL)
      return new Response(JSON.stringify({ error: "Missing SB_URL/SUPABASE_URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    if (!SB_SERVICE_ROLE_KEY)
      return new Response(
        JSON.stringify({ error: "Missing SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );

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

    // ✅ MODO B: En vez de enviar por Resend aquí, ENCOLAMOS en email_outbox
    // Guardamos lo mínimo (registration_id). El worker arma el HTML y envía.
    const payload = {
      registration_id: reg.id,
      // opcional: si querés, podés guardar hints; el worker puede ignorarlos
      hints: {
        brand_name: BRAND_NAME,
        brand_logo_url: BRAND_LOGO_URL,
        header_image_url: EMAIL_HEADER_IMAGE_URL,
        from_email: FROM_EMAIL,
        whatsapp_url: whatsappUrl,
        total_text: totalText,
        event_title: eventTitle,
        date_label: dateLabel,
        time_range: timeRange,
        location,
      },
    };

    const { error: outErr } = await sb.from("email_outbox").insert({
      to_email: toEmail,
      kind: "registration_confirmation",
      status: "PENDING",
      tries: 0,
      payload,
    });

    if (outErr) {
      console.log("step=outbox_error", outErr);
      return new Response(JSON.stringify({ error: "email_outbox insert failed", details: outErr }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("step=queued", { toEmail, registration_id: reg.id });

    // 202 Accepted porque está en cola
    return new Response(JSON.stringify({ ok: true, queued: true, registration_id: reg.id, to_email: toEmail }), {
      status: 202,
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
