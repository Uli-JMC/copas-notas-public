"use strict";

/* ============================================================
   confirm.js ✅ 2026-02 (NO REDIRECT + RESERVA + WA)
   - Lee event + date_id (+ reg=ok) desde querystring
   - Fallback: sessionStorage (última reserva)
   - Carga events + event_dates desde Supabase
   - Renderiza MetaBox + botones
   - ✅ Agrega "Reserva #" debajo de Hora (si existe en DB)
   - ✅ FIX hover no depende de JS (va por CSS)
============================================================ */

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(title, msg, timeoutMs = 3500) {
  const toastsEl = $("#toasts");
  if (!toastsEl) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div>
      <p class="tTitle">${escapeHtml(title)}</p>
      <p class="tMsg">${escapeHtml(msg)}</p>
    </div>
    <button class="close" aria-label="Cerrar" type="button">✕</button>
  `;
  toastsEl.appendChild(el);

  const kill = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 180);
  };

  el.querySelector(".close")?.addEventListener("click", kill, { once: true });
  setTimeout(kill, timeoutMs);
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function safeTrim(v) {
  return String(v ?? "").trim();
}

function getSb() {
  return window.APP && APP.supabase ? APP.supabase : null;
}

function normalizeCurrency(cur) {
  const c = safeTrim(cur).toUpperCase();
  return c || "USD";
}

function formatPrice(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = normalizeCurrency(currency);
  return `${cur} ${n.toFixed(2)}`;
}

function setUiInfoState(title, desc) {
  const badge = $("#statusBadge");
  const titleEl = $("#eventTitle");
  const descEl = $("#eventDesc");

  if (badge) badge.textContent = "INFO";
  if (titleEl) titleEl.textContent = title || "Confirmación";
  if (descEl) descEl.textContent = desc || "No encontramos datos de la reserva.";
}

function renderMetaBox(event, dateLabel, reservationCode) {
  const metaBox = $("#metaBox");
  if (!metaBox) return;

  const type = safeTrim(event?.type) || "—";
  const location = safeTrim(event?.location) || "Por confirmar";
  const duration = safeTrim(event?.duration_hours) || "Por confirmar";
  const timeRange = safeTrim(event?.time_range) || "Por confirmar";

  const priceText = formatPrice(event?.price_amount, event?.price_currency);

  // ✅ Reserva # (debajo de hora)
  const reserveRow = reservationCode
    ? `<div class="mRow">
         <div class="mLabel">Reserva #</div>
         <div class="mValue">${escapeHtml(reservationCode)}</div>
       </div>`
    : ``;

  metaBox.innerHTML = `
    <div class="mHead">
      <div class="mLabel">Tu reserva</div>
      <div class="mValue">${escapeHtml(dateLabel || "—")}</div>
    </div>

    <div class="mBody">
      <div class="mRow">
        <div class="mLabel">Tipo</div>
        <div class="mValue">${escapeHtml(type)}</div>
      </div>

      <div class="mRow">
        <div class="mLabel">Ubicación</div>
        <div class="mValue">${escapeHtml(location)}</div>
      </div>

      <div class="mRow">
        <div class="mLabel">Duración</div>
        <div class="mValue">${escapeHtml(duration)}</div>
      </div>

      <div class="mRow">
        <div class="mLabel">Hora</div>
        <div class="mValue">${escapeHtml(timeRange)}</div>
      </div>

      ${reserveRow}

      ${
        priceText
          ? `<div class="mRow">
               <div class="mLabel">Precio</div>
               <div class="mValue">${escapeHtml(priceText)}</div>
             </div>`
          : ``
      }
    </div>
  `;
}

/**
 * Intenta obtener un “número de reserva” desde DB.
 * Depende de tu schema, así que:
 * - Primero usa sessionStorage (si register.js lo guardó)
 * - Luego intenta tabla `registrations` por date_id, order created_at desc
 * - No rompe si no existe la tabla o columnas
 */
async function tryGetReservationCode(sb, eventId, dateId) {
  // 1) sessionStorage (lo más confiable)
  const ss = safeTrim(sessionStorage.getItem("ecn_last_reservation_code"));
  if (ss) return ss;

  // 2) DB best-effort (no romper si no existe)
  try {
    const { data, error } = await sb
      .from("registrations")
      .select("id, reservation_code, code, created_at")
      .eq("event_id", eventId)
      .eq("event_date_id", dateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return "";

    // Prioridad: reservation_code -> code -> id
    return String(data.reservation_code || data.code || data.id || "").trim();
  } catch (e) {
    // Silencioso: no todos tienen esa tabla/campos
    return "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const sb = getSb();
  if (!sb) {
    toast("Error", "Supabase no está cargado. Revisá scripts.");
    return;
  }

  // 1) Querystring
  let eventId = getParam("event") || "";
  let dateId = getParam("date_id") || "";
  const regOk = (getParam("reg") || "") === "ok";

  // 2) Fallback: sessionStorage
  if (!eventId || !dateId) {
    const ssEvent = safeTrim(sessionStorage.getItem("ecn_last_event_id"));
    const ssDate = safeTrim(sessionStorage.getItem("ecn_last_date_id"));
    if (!eventId && ssEvent) eventId = ssEvent;
    if (!dateId && ssDate) dateId = ssDate;
  }

  // ✅ NO redirect
  if (!eventId || !dateId) {
    setUiInfoState(
      "Confirmación",
      "No encontramos el ID del evento o la fecha. Volvé al evento y generá la confirmación otra vez."
    );
    toast("Faltan datos", "Abriste la confirmación sin parámetros (event/date_id).");
    console.warn("[confirm] Missing params:", { eventId, dateId, href: window.location.href });
    return;
  }

  // Guardamos para próximas aperturas
  sessionStorage.setItem("ecn_last_event_id", String(eventId));
  sessionStorage.setItem("ecn_last_date_id", String(dateId));

  if (!regOk) {
    const badge = $("#statusBadge");
    if (badge) badge.textContent = "OK";
  }

  try {
    // 1) Event
    const { data: ev, error: evErr } = await sb
      .from("events")
      .select('id, title, "desc", type, location, time_range, duration_hours, price_amount, price_currency')
      .eq("id", eventId)
      .maybeSingle();

    if (evErr) throw evErr;
    if (!ev) throw new Error("Evento no existe");

    // 2) Date
    const { data: d, error: dErr } = await sb
      .from("event_dates")
      .select("id, event_id, label")
      .eq("id", dateId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (dErr) throw dErr;

    const titleEl = $("#eventTitle");
    const descEl = $("#eventDesc");

    if (titleEl) titleEl.textContent = regOk ? "¡Inscripción confirmada!" : (ev.title || "Evento");
    if (descEl) descEl.textContent = ev.title ? `Evento: ${ev.title}` : "Te esperamos.";

    // ✅ Reserva #
    const reservationCode = await tryGetReservationCode(sb, eventId, dateId);

    renderMetaBox(ev, d?.label || "Fecha confirmada", reservationCode);

    // WhatsApp link
    const btnWA = $("#btnWA");
    if (btnWA) {
      const txt = `Hola 👋 me inscribí a "${ev.title || "un evento"}" (${d?.label || "fecha confirmada"}). ¿Me confirman detalles?` +
        (reservationCode ? ` Mi reserva es #${reservationCode}.` : "");
      btnWA.href = `https://wa.me/50688323801?text=${encodeURIComponent(txt)}`;
    }
  } catch (err) {
    console.error(err);
    setUiInfoState("Confirmación", "No se pudo cargar la confirmación. Probá recargar.");
    toast("Error", "No se pudo cargar la confirmación. Probá recargar.");
  }
});
