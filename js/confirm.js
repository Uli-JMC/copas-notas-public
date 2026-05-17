"use strict";

/* ============================================================
   confirm.js ✅ FIX 2026-02-18.3 (NO REDIRECT) — confirm “limpio”
   - Lee event + date_id (+ reg=ok) desde querystring
   - Fallback: sessionStorage (última reserva)
   - Carga info de events + event_dates desde Supabase
   - Renderiza MetaBox (Tu reserva)
   - ✅ NO redirige nunca
   - ✅ Reserva # debajo de Hora (registrations.reservation_number)
   - ✅ WhatsApp dinámico
   - ✅ Precio formateado es-CR (₡ / $)
   - ✅ Hora: usa start_at/ends_at si existen; sino events.time_range

   ✅ PATCH 2026-02-18.3:
   - events.desc -> events.description (y se mapea a ev.desc para compat)
============================================================ */

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

const ECN_WHATSAPP_NUMBER = "50688323801";

function getStoredRegistrantName() {
  // Orden robusto:
  // 1) querystring: confirm.html?...&name=Nombre
  // 2) sessionStorage: misma pestaña
  // 3) localStorage: funciona si confirm abre en otra pestaña/flujo
  return (
    safeTrim(getParam("name")) ||
    safeTrim(sessionStorage.getItem("ecn_last_name")) ||
    safeTrim(sessionStorage.getItem("ecn_last_registration_name")) ||
    safeTrim(localStorage.getItem("ecn_last_name")) ||
    safeTrim(localStorage.getItem("ecn_last_registration_name")) ||
    ""
  );
}

// -------------------------------
// Money formatting (es-CR)
// -------------------------------
function normCurrency(cur) {
  const c = safeTrim(cur).toUpperCase();
  if (c === "CRC" || c === "USD") return c;
  return "";
}

function formatMoney(amount, currency) {
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

// -------------------------------
// Time range helper (optional)
// -------------------------------
function fmtTimeEsCR(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-CR", { hour: "numeric", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

function buildTimeRangeFromDates(start_at, ends_at, fallback) {
  const s = safeTrim(start_at);
  const e = safeTrim(ends_at);
  if (s) {
    const sText = fmtTimeEsCR(s);
    if (e) {
      const eText = fmtTimeEsCR(e);
      if (sText && eText) return `${sText} a ${eText}`;
    }
    if (sText) return sText;
  }
  const fb = safeTrim(fallback);
  return fb || "Por confirmar";
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

/* ✅ Reserva #: usa registrations.reservation_number */
async function getReservationNumber(sb, eventId, dateId) {
  // 1) querystring: confirm.html?...&rn=EC-...
  const fromUrl = safeTrim(getParam("rn"));
  if (fromUrl) return fromUrl;

  // 2) sessionStorage / localStorage
  const ss =
    safeTrim(sessionStorage.getItem("ecn_last_reservation_number")) ||
    safeTrim(localStorage.getItem("ecn_last_reservation_number"));
  if (ss) return ss;

  // 3) buscar último registro de esa fecha/evento
  const { data, error } = await sb
    .from("registrations")
    .select("id, reservation_number, created_at")
    .eq("event_id", eventId)
    .eq("event_date_id", dateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return "";

  const rn = safeTrim(data.reservation_number);
  return rn || safeTrim(data.id) || "";
}

function renderMetaBox(event, dateLabel, reservationNumber, timeRangeText) {
  const metaBox = $("#metaBox");
  if (!metaBox) return;

  const type = safeTrim(event?.type) || "—";
  const location = safeTrim(event?.location) || "Por confirmar";
  const duration = safeTrim(event?.duration_hours) || "Por confirmar";
  const timeRange = safeTrim(timeRangeText || event?.time_range) || "Por confirmar";

  const priceText = formatMoney(event?.price_amount, event?.price_currency);

  const reserveRow = reservationNumber
    ? `<div class="mRow">
         <div class="mLabel">Reserva #</div>
         <div class="mValue">${escapeHtml(reservationNumber)}</div>
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

document.addEventListener("DOMContentLoaded", async () => {
  const sb = getSb();
  if (!sb) {
    toast("Error", "Supabase no está cargado. Revisá scripts.");
    return;
  }

  // Querystring
  let eventId = getParam("event") || "";
  let dateId = getParam("date_id") || "";
  const regOk = (getParam("reg") || "") === "ok";

  // Fallback: sessionStorage
  if (!eventId || !dateId) {
    const ssEvent = safeTrim(sessionStorage.getItem("ecn_last_event_id"));
    const ssDate = safeTrim(sessionStorage.getItem("ecn_last_date_id"));
    if (!eventId && ssEvent) eventId = ssEvent;
    if (!dateId && ssDate) dateId = ssDate;
  }

  if (!eventId || !dateId) {
    setUiInfoState(
      "Confirmación",
      "No encontramos el ID del evento o la fecha. Volvé al evento y generá la confirmación otra vez."
    );
    toast("Faltan datos", "Abriste confirmación sin parámetros (event/date_id).");
    return;
  }

  // Badge
  const badge = $("#statusBadge");
  if (badge) badge.textContent = regOk ? "REGISTRO OK" : "OK";

  try {
    // ✅ FIX: usar description (NO "desc")
    const { data: ev0, error: evErr } = await sb
      .from("events")
      .select("id, title, description, type, location, time_range, duration_hours, price_amount, price_currency")
      .eq("id", eventId)
      .maybeSingle();

    if (evErr) throw evErr;
    if (!ev0) throw new Error("Evento no existe");

    // compat con tu UI anterior (ev.desc)
    const ev = { ...ev0, desc: String(ev0.description || "") };

    const { data: d, error: dErr } = await sb
      .from("event_dates")
      .select("id, event_id, label, start_at, ends_at")
      .eq("id", dateId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (dErr) throw dErr;

    sessionStorage.setItem("ecn_last_event_id", String(eventId));
    sessionStorage.setItem("ecn_last_date_id", String(dateId));

    const titleEl = $("#eventTitle");
    const descEl = $("#eventDesc");

    // ✅ Title
    if (titleEl) titleEl.textContent = regOk ? "¡Inscripción confirmada!" : ev.title || "Confirmación";

    // ✅ Description: usa description
    const descText = safeTrim(ev.description || ev.desc);
    if (descEl) descEl.textContent = descText || "Te esperamos. Guardá estos detalles.";

    // ✅ Reserva #
    let reservationNumber = "";
    try {
      reservationNumber = await getReservationNumber(sb, String(eventId), String(dateId));
      if (reservationNumber) sessionStorage.setItem("ecn_last_reservation_number", reservationNumber);
    } catch (e) {
      console.warn("[confirm] no reservation_number:", e);
    }

    // ✅ Hora: usa start/end si existen, sino time_range de event
    const timeRangeText = buildTimeRangeFromDates(d?.start_at, d?.ends_at, ev?.time_range);

    renderMetaBox(ev, d?.label || "Fecha confirmada", reservationNumber, timeRangeText);

    // ✅ WhatsApp dinámico para enviar comprobante de pago
    const btnWA = $("#btnWA");
    if (btnWA) {
      const registrantName = getStoredRegistrantName() || "Nombre no indicado";
      const reservationText = reservationNumber || "No disponible";
      const eventTitle = safeTrim(ev.title) || "evento";

      const txt =
        `Hola, le estoy enviando el comprobante de pago para el evento: "${eventTitle}". ` +
        `Mi nombre es "${registrantName}". ` +
        `Reservación: "${reservationText}".`;

      btnWA.href = `https://wa.me/${ECN_WHATSAPP_NUMBER}?text=${encodeURIComponent(txt)}`;
      btnWA.setAttribute("aria-label", "Enviar comprobante de pago por WhatsApp");
      btnWA.setAttribute("title", "Enviar comprobante de pago por WhatsApp");
    }
  } catch (err) {
    console.error(err);
    setUiInfoState("Confirmación", "No se pudo cargar la confirmación. Probá recargar.");
    toast("Error", "No se pudo cargar la confirmación. Probá recargar.");
  }
});
