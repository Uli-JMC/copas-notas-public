"use strict";

/* ============================================================
   confirm.js ✅ FIX 2026-02
   - Lee event + date_id (+ reg=ok) desde querystring
   - Carga info de events + event_dates desde Supabase
   - Renderiza MetaBox + botones
   - FIX: WhatsApp link correcto (?text=)
   - FIX: columna "desc" con comillas
   - PLUS: muestra precio si existe (price_amount/currency)
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

  // Mantengo simple y estable (sin Intl para evitar variaciones de locale)
  // Ej: "USD 49.00"
  const cur = normalizeCurrency(currency);
  const fixed = n.toFixed(2);
  return `${cur} ${fixed}`;
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

  const eventId = getParam("event") || "";
  const dateId = getParam("date_id") || "";
  const regOk = (getParam("reg") || "") === "ok";

  // Back buttons
  const backBtn = $("#backBtn");
  if (backBtn) backBtn.href = "./home.html#proximos";

  const btnBackEvent = $("#btnBackEvent");
  if (btnBackEvent && eventId) btnBackEvent.href = `./event.html?event=${encodeURIComponent(eventId)}`;

  if (!eventId || !dateId) {
    $("#statusBadge") && ($("#statusBadge").textContent = "INFO");
    $("#eventTitle") && ($("#eventTitle").textContent = "Detalle del evento");
    $("#eventDesc") && ($("#eventDesc").textContent = "No encontramos el ID del evento o la fecha.");

    toast("Faltan datos", "Volviendo a Home…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  if (!regOk) {
    // Si alguien entra manual sin venir del registro, igual lo dejamos ver.
    $("#statusBadge") && ($("#statusBadge").textContent = "OK");
  }

  try {
    // 1) Event (FIX: "desc" con comillas + agregamos precio)
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

    renderMetaBox(ev, d?.label || "Fecha confirmada");

    // WhatsApp (FIX: ?text=)
    const btnWA = $("#btnWA");
    if (btnWA) {
      const txt = `Hola 👋 me inscribí a "${ev.title || "un evento"}" (${d?.label || "fecha confirmada"}). ¿Me confirman detalles?`;
      btnWA.href = `https://wa.me/50688323801?text=${encodeURIComponent(txt)}`;
    }
  } catch (err) {
    console.error(err);
    toast("Error", "No se pudo cargar la confirmación. Probá recargar.");
  }
});
