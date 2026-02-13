"use strict";

/* ============================================================
   confirm.js ✅ FIX 2026-02 (NO REDIRECT) — versión para confirm.html “limpio”
   - Lee event + date_id (+ reg=ok) desde querystring
   - Fallback: si faltan params, intenta sessionStorage (última reserva)
   - Carga info de events + event_dates desde Supabase
   - Renderiza MetaBox (Tu reserva)
   - ✅ NO redirige nunca (se queda en pantalla con mensaje)
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
  const metaBox = $("#metaBox");

  if (badge) badge.textContent = "INFO";
  if (titleEl) titleEl.textContent = title || "Confirmación";
  if (descEl) descEl.textContent = desc || "No encontramos datos de la reserva.";
  if (metaBox) metaBox.innerHTML = "";
}

function renderMetaBox(event, dateLabel) {
  const metaBox = $("#metaBox");
  if (!metaBox) return;

  const type = safeTrim(event?.type) || "—";
  const location = safeTrim(event?.location) || "Por confirmar";
  const duration = safeTrim(event?.duration_hours) || "Por confirmar";
  const timeRange = safeTrim(event?.time_range) || "Por confirmar";

  const priceText = formatPrice(event?.price_amount, event?.price_currency);

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

  // ✅ NO redirect. Si faltan datos, se queda en pantalla.
  if (!eventId || !dateId) {
    setUiInfoState(
      "Confirmación",
      "No encontramos el ID del evento o la fecha. Volvé al evento y generá la confirmación otra vez."
    );
    toast("Faltan datos", "Abriste confirmación sin parámetros (event/date_id).");
    console.warn("[confirm] Missing params:", { eventId, dateId, href: window.location.href });
    return;
  }

  // Badge si no venís del registro
  if (!regOk) {
    const badge = $("#statusBadge");
    if (badge) badge.textContent = "OK";
  }

  try {
    // Event (desc con comillas + precio)
    const { data: ev, error: evErr } = await sb
      .from("events")
      .select('id, title, "desc", type, location, time_range, duration_hours, price_amount, price_currency')
      .eq("id", eventId)
      .maybeSingle();

    if (evErr) throw evErr;
    if (!ev) throw new Error("Evento no existe");

    // Date
    const { data: d, error: dErr } = await sb
      .from("event_dates")
      .select("id, event_id, label")
      .eq("id", dateId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (dErr) throw dErr;

    // Guardamos fallback
    sessionStorage.setItem("ecn_last_event_id", String(eventId));
    sessionStorage.setItem("ecn_last_date_id", String(dateId));

    const titleEl = $("#eventTitle");
    const descEl = $("#eventDesc");

    if (titleEl) titleEl.textContent = regOk ? "¡Inscripción confirmada!" : (ev.title || "Evento");
    if (descEl) descEl.textContent = ev.title ? `Evento: ${ev.title}` : "Te esperamos.";

    renderMetaBox(ev, d?.label || "Fecha confirmada");
  } catch (err) {
    console.error(err);
    setUiInfoState("Confirmación", "No se pudo cargar la confirmación. Probá recargar.");
    toast("Error", "No se pudo cargar la confirmación. Probá recargar.");
  }
});
