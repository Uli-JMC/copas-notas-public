"use strict";

/* ============================================================
   register.js (Supabase) ✅ ALINEADO + MODAL ÉXITO (Lottie)
   - Mantiene tu lógica intacta
   - En éxito: muestra modal centrado con animación + copy
   - Luego redirige a event.html?event=...

   ✅ Usa Lottie (JSON) del usuario: champagne_13399330.json :contentReference[oaicite:1]{index=1}
============================================================ */

// ============================================================
// Helpers
// ============================================================
const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(title, msg, timeoutMs = 3800) {
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
  return String(v || "").trim();
}

function normalizePhone(raw) {
  const only = String(raw || "").replace(/\D/g, "");
  // CR: 8 dígitos o 506 + 8 dígitos
  if (only.length === 8) return "506" + only;
  if (only.length === 11 && only.startsWith("506")) return only;
  return null;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || "").trim());
}

function setFieldError(fieldId, msg) {
  const field = document.getElementById(fieldId)?.closest(".field");
  if (!field) return;
  field.classList.add("invalid");
  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = msg || "Revisá este campo.";
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId)?.closest(".field");
  if (!field) return;
  field.classList.remove("invalid");
  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = "";
}

function setHiddenDateId(value) {
  const el = $("#dateId");
  if (el) el.value = String(value || "");
}

// ============================================================
// Supabase guard
// ============================================================
function getSb() {
  if (!window.APP || !APP.supabase) return null;
  return APP.supabase;
}

// ============================================================
// ✅ Modal Éxito (Lottie)
// ============================================================

// 👉 Poné el JSON en tu repo y ajustá este path:
const ANIM_URL = "/assets/lottie/champagne_13399330.json"; // :contentReference[oaicite:2]{index=2}

let __successModalEl = null;
let __lottiePlayer = null;
let __redirectTimer = null;

function injectModalStylesOnce() {
  if (document.getElementById("regSuccessModalStyles")) return;
  const css = `
    .regSuccessOverlay{
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0,0,0,.55);
      z-index: 9999;
    }
    .regSuccessOverlay.isOpen{ display:flex; }

    .regSuccessCard{
      width: min(520px, 100%);
      border-radius: 22px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.96);
      box-shadow: 0 28px 90px rgba(0,0,0,.28);
      overflow: hidden;
      transform: translateY(6px);
      opacity: 0;
      transition: transform .18s ease, opacity .18s ease;
    }
    .regSuccessOverlay.isOpen .regSuccessCard{
      transform: translateY(0);
      opacity: 1;
    }

    .regSuccessTop{
      padding: 18px 18px 10px;
      display:flex;
      justify-content:flex-end;
    }
    .regSuccessClose{
      width: 40px;
      height: 40px;
      border-radius: 999px;
      border: 1px solid rgba(18,18,18,.12);
      background: rgba(18,18,18,.04);
      cursor: pointer;
      display:grid;
      place-items:center;
      font-size: 18px;
      line-height: 1;
    }
    .regSuccessClose:hover{ background: rgba(18,18,18,.06); }

    .regSuccessBody{
      padding: 0 22px 22px;
      text-align: center;
    }
    .regSuccessAnim{
      width: 120px;
      height: 120px;
      margin: 2px auto 10px;
    }
    .regSuccessTitle{
      margin: 6px 0 8px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: rgba(18,18,18,.92);
      font-size: 14px;
    }
    .regSuccessMsg{
      margin: 0;
      color: rgba(18,18,18,.70);
      line-height: 1.6;
      font-size: 14px;
    }
    .regSuccessFoot{
      padding: 14px 18px 18px;
      display:flex;
      justify-content:center;
    }
    .regSuccessBtn{
      min-height: 44px;
      padding: 11px 16px;
      border-radius: 14px;
      border: 2px solid #000;
      background: #000;
      color: #fff;
      font-weight: 900;
      letter-spacing: .10em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .regSuccessBtn:hover{ filter: brightness(1.06); }
  `;
  const style = document.createElement("style");
  style.id = "regSuccessModalStyles";
  style.textContent = css;
  document.head.appendChild(style);
}

function ensureModal() {
  injectModalStylesOnce();
  if (__successModalEl) return __successModalEl;

  const overlay = document.createElement("div");
  overlay.className = "regSuccessOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Confirmación de reserva");
  overlay.innerHTML = `
    <div class="regSuccessCard" role="document">
      <div class="regSuccessTop">
        <button class="regSuccessClose" type="button" aria-label="Cerrar">✕</button>
      </div>

      <div class="regSuccessBody">
        <div class="regSuccessAnim" id="regSuccessAnim" aria-hidden="true"></div>
        <div class="regSuccessTitle">Tu reserva ha sido realizada con éxito</div>
        <p class="regSuccessMsg">Pronto te llegará un correo con los detalles.</p>
      </div>

      <div class="regSuccessFoot">
        <button class="regSuccessBtn" type="button">Ver evento</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  __successModalEl = overlay;

  const close = () => closeSuccessModal();
  overlay.addEventListener("click", (e) => {
    // cerrar si clic fuera de la card
    if (e.target === overlay) close();
  });

  overlay.querySelector(".regSuccessClose")?.addEventListener("click", close);
  overlay.querySelector(".regSuccessBtn")?.addEventListener("click", () => {
    closeSuccessModal(true);
  });

  // ESC para cerrar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("isOpen")) close();
  });

  return overlay;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const exists = [...document.scripts].some((s) => s.src === src);
    if (exists) return resolve(true);

    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("No se pudo cargar script: " + src));
    document.head.appendChild(s);
  });
}

async function ensureLottie() {
  // CDN estable para lottie-web
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js");
  if (!window.lottie) throw new Error("Lottie no está disponible.");
  return window.lottie;
}

async function playSuccessAnim() {
  const overlay = ensureModal();
  const target = overlay.querySelector("#regSuccessAnim");
  if (!target) return;

  // Limpia anim previa (por si re-abren)
  try {
    if (__lottiePlayer) __lottiePlayer.destroy();
  } catch (_) {}
  __lottiePlayer = null;

  const lottie = await ensureLottie();
  __lottiePlayer = lottie.loadAnimation({
    container: target,
    renderer: "svg",
    loop: true,
    autoplay: true,
    path: ANIM_URL,
  });
}

async function openSuccessModal({ redirectUrl, autoRedirectMs = 1800 } = {}) {
  const overlay = ensureModal();
  overlay.classList.add("isOpen");

  // Bloquea scroll de fondo
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // Animación
  try {
    await playSuccessAnim();
  } catch (e) {
    console.warn("No se pudo cargar animación Lottie:", e);
  }

  // Auto redirect
  if (__redirectTimer) clearTimeout(__redirectTimer);
  if (redirectUrl) {
    __redirectTimer = setTimeout(() => {
      window.location.href = redirectUrl;
    }, Math.max(600, Number(autoRedirectMs) || 1800));
  }
}

function closeSuccessModal(goNow = false) {
  const overlay = __successModalEl;
  if (!overlay) return;

  overlay.classList.remove("isOpen");

  // Desbloquea scroll
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  if (__redirectTimer) {
    if (goNow) {
      const fn = __redirectTimer;
      clearTimeout(fn);
      __redirectTimer = null;

      // si ya hay redirect programado, ejecutamos manualmente:
      // (guardamos el url en dataset cuando abrimos)
      const url = overlay.dataset.redirectUrl || "";
      if (url) window.location.href = url;
    } else {
      clearTimeout(__redirectTimer);
      __redirectTimer = null;
    }
  }

  // No destruimos el modal, solo pausamos anim para ahorrar
  try {
    if (__lottiePlayer) __lottiePlayer.pause();
  } catch (_) {}
}

// ============================================================
// State
// ============================================================
let EVENT_ID = "";
let EVENT = null; // {id,title,desc,type,month_key,location,time_range,duration_hours, img}
let DATES = []; // [{id,label,seats_available,seats_total}]
let SELECTED_DATE_ID = "";
let SELECTED_DATE_LABEL = "";

// ============================================================
// UI: counters + badges
// ============================================================
function setAvailableBadge(text) {
  const badge = $("#availableSeats");
  if (badge) badge.textContent = text;
}

function sumAvailableSeatsFromDates(dates) {
  return (dates || []).reduce((a, d) => a + Math.max(0, Number(d?.seats_available) || 0), 0);
}

function getDateById(dateId) {
  const id = String(dateId || "");
  return (DATES || []).find((d) => String(d.id) === id) || null;
}

function getDateByLabel(label) {
  const l = safeTrim(label);
  if (!l) return null;
  return (DATES || []).find((d) => safeTrim(d.label) === l) || null;
}

function renderMetaBox() {
  const metaBox = $("#metaBox");
  if (!metaBox) return;

  const datesText = (DATES || []).map((d) => d.label).filter(Boolean).join(" • ");

  const type = safeTrim(EVENT?.type) || "—";
  const location = safeTrim(EVENT?.location) || "Por confirmar";
  const duration = safeTrim(EVENT?.duration_hours) || "Por confirmar";
  const timeRange = safeTrim(EVENT?.time_range) || "Por confirmar";

  metaBox.innerHTML = `
    <div class="mHead">
      <div class="mLabel">Tipo</div>
      <div class="mValue">${escapeHtml(type)}</div>
    </div>

    <div class="mBody">
      <div class="mRow">
        <div class="mLabel">Fechas disponibles</div>
        <div class="mValue">${escapeHtml(datesText || "—")}</div>
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
    </div>
  `;
}

function renderHeader() {
  const titleEl = $("#eventTitle");
  const descEl = $("#eventDesc");

  if (titleEl) titleEl.textContent = EVENT?.title || "Evento";
  if (descEl) descEl.textContent = EVENT?.desc || "Completá tus datos para reservar tu cupo.";

  renderMetaBox();

  if (SELECTED_DATE_ID) {
    const d = getDateById(SELECTED_DATE_ID);
    const s = d ? Math.max(0, Number(d.seats_available) || 0) : 0;
    setAvailableBadge(`CUPOS DISP.: ${s}`);
  } else {
    const total = sumAvailableSeatsFromDates(DATES);
    setAvailableBadge(`CUPOS DISP.: ${Math.max(0, total)}`);
  }
}

function renderDatesSelect(preselectDateId = "", preselectLabel = "") {
  const select = $("#eventDate");
  if (!select) return;

  select.innerHTML = "";

  if (!Array.isArray(DATES) || !DATES.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin fechas disponibles";
    select.appendChild(opt);
    return;
  }

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Seleccioná una fecha";
  select.appendChild(ph);

  DATES.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = String(d.id);
    opt.textContent = String(d.label || "Por definir");
    if ((Number(d.seats_available) || 0) <= 0) opt.disabled = true;
    select.appendChild(opt);
  });

  // ✅ Preselect por ID
  if (preselectDateId) {
    const match = DATES.find((x) => String(x.id) === String(preselectDateId));
    if (match && (Number(match.seats_available) || 0) > 0) {
      select.value = String(preselectDateId);
      SELECTED_DATE_ID = String(preselectDateId);
      SELECTED_DATE_LABEL = String(match.label || "");
      setHiddenDateId(SELECTED_DATE_ID);
      return;
    }
  }

  // ✅ Fallback por label
  if (preselectLabel) {
    const match = getDateByLabel(preselectLabel);
    if (match && (Number(match.seats_available) || 0) > 0) {
      select.value = String(match.id);
      SELECTED_DATE_ID = String(match.id);
      SELECTED_DATE_LABEL = String(match.label || "");
      setHiddenDateId(SELECTED_DATE_ID);
    }
  }
}

function syncSubmitAvailability() {
  const submitBtn = $("#submitBtn");
  const select = $("#eventDate");
  if (!submitBtn || !select) return;

  const totalAvail = sumAvailableSeatsFromDates(DATES);
  if (totalAvail <= 0) {
    submitBtn.disabled = true;
    return;
  }

  const picked = select.value || "";
  if (!picked) {
    submitBtn.disabled = true;
    return;
  }

  const d = getDateById(picked);
  const seats = d ? (Number(d.seats_available) || 0) : 0;
  submitBtn.disabled = seats <= 0;
}

// ============================================================
// Data loaders (Supabase)
// ============================================================
async function fetchEventAndDates(eventId) {
  const sb = getSb();
  if (!sb) throw new Error("APP.supabase no existe. Revisá el orden de scripts.");

  const { data: ev, error: evErr } = await sb
    .from("events")
    .select("id, title, desc, type, month_key, img, location, time_range, duration_hours")
    .eq("id", eventId)
    .maybeSingle();

  if (evErr) throw evErr;
  if (!ev) return { event: null, dates: [] };

  let ds = null;
  let dErr = null;

  const tryCreatedAt = await sb
    .from("event_dates")
    .select("id, event_id, label, seats_total, seats_available, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (tryCreatedAt.error) {
    const fallback = await sb
      .from("event_dates")
      .select("id, event_id, label, seats_total, seats_available")
      .eq("event_id", eventId)
      .order("label", { ascending: true });

    ds = fallback.data;
    dErr = fallback.error;
  } else {
    ds = tryCreatedAt.data;
    dErr = null;
  }

  if (dErr) throw dErr;

  const dates = Array.isArray(ds)
    ? ds.map((x) => ({
        id: x.id,
        label: safeTrim(x.label),
        seats_total: Math.max(0, Number(x.seats_total) || 0),
        seats_available: Math.max(0, Number(x.seats_available) || 0),
      }))
    : [];

  return { event: ev, dates };
}

// ============================================================
// Validation
// ============================================================
function validateForm() {
  let ok = true;

  const firstName = ($("#firstName")?.value || "").trim();
  const lastName = ($("#lastName")?.value || "").trim();
  const email = ($("#email")?.value || "").trim();
  const phone = ($("#phone")?.value || "").trim();
  const eventDateId = $("#eventDate")?.value || "";

  ["firstName", "lastName", "email", "phone", "eventDate", "allergies"].forEach(clearFieldError);

  if (!firstName) {
    ok = false;
    setFieldError("firstName", "Ingresá tu nombre.");
  }
  if (!lastName) {
    ok = false;
    setFieldError("lastName", "Ingresá tus apellidos.");
  }

  if (!email || !validEmail(email)) {
    ok = false;
    setFieldError("email", "Ingresá un correo válido.");
  }

  const normalized = normalizePhone(phone);
  if (!phone || !normalized) {
    ok = false;
    setFieldError("phone", "Ingresá un teléfono válido (8 dígitos o 506 + 8).");
  }

  if (!eventDateId) {
    ok = false;
    setFieldError("eventDate", "Seleccioná una fecha del evento.");
  } else {
    const d = getDateById(eventDateId);
    if (!d) {
      ok = false;
      setFieldError("eventDate", "Fecha inválida. Elegí otra.");
    } else if ((Number(d.seats_available) || 0) <= 0) {
      ok = false;
      setFieldError("eventDate", "Esa fecha está agotada. Elegí otra.");
    }
  }

  const allergies = $("#allergies")?.value || "";
  if (allergies && !allergies.trim()) {
    ok = false;
    setFieldError("allergies", "Si lo completás, escribí un detalle.");
  }
  if (allergies && allergies.length > 120) {
    ok = false;
    setFieldError("allergies", "Máximo 120 caracteres.");
  }

  return { ok, normalizedPhone: normalized };
}

// ============================================================
// Submit (RPC seguro)
// ============================================================
async function submitRegistration() {
  const sb = getSb();
  if (!sb) throw new Error("APP.supabase no existe.");

  const { ok, normalizedPhone } = validateForm();
  if (!ok) {
    toast("Revisá el formulario", "Hay campos pendientes o inválidos.");
    return;
  }

  const dateId = $("#eventDate")?.value || "";
  const d = getDateById(dateId);
  if (!d || (Number(d.seats_available) || 0) <= 0) {
    toast("Agotado", "Esa fecha ya no tiene cupos.");
    syncSubmitAvailability();
    renderHeader();
    return;
  }

  setHiddenDateId(dateId);

  const firstName = ($("#firstName")?.value || "").trim();
  const lastName = ($("#lastName")?.value || "").trim();
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  const allergiesText = ($("#allergies")?.value || "").trim();
  const allergiesSafe = allergiesText ? allergiesText.slice(0, 120) : null;

  const payload = {
    p_event_id: String(EVENT_ID),
    p_event_date_id: String(dateId),
    p_name: fullName,
    p_email: ($("#email")?.value || "").trim().toLowerCase(),
    p_phone: normalizedPhone,
    p_marketing_opt_in: !!$("#marketingOptIn")?.checked,
    p_allergies: allergiesSafe,
  };

  const submitBtn = $("#submitBtn");
  const oldLabel = submitBtn ? submitBtn.textContent : "";

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";
  }

  try {
    const { error } = await sb.rpc("register_for_event", payload);
    if (error) throw error;

    // Re-cargar cupos actualizados
    const fresh = await fetchEventAndDates(EVENT_ID);
    EVENT = fresh.event;
    DATES = fresh.dates;

    // Reset selección
    SELECTED_DATE_ID = "";
    SELECTED_DATE_LABEL = "";
    setHiddenDateId("");

    // UI
    $("#regForm")?.reset();
    const countEl = $("#count");
    if (countEl) countEl.textContent = "0";

    renderDatesSelect("");
    renderHeader();
    syncSubmitAvailability();

    // ✅ Modal éxito (centrado)
    const redirectUrl = `./event.html?event=${encodeURIComponent(EVENT_ID)}`;
    const modal = ensureModal();
    modal.dataset.redirectUrl = redirectUrl;
    await openSuccessModal({ redirectUrl, autoRedirectMs: 1800 });

  } catch (err) {
    console.error(err);

    const rawMsg = String(err?.message || err?.details || "");
    const msg = rawMsg.toLowerCase();

    if (msg.includes("does not exist") && msg.includes("register_for_event")) {
      toast(
        "RPC no alineado",
        "La función register_for_event no coincide con la firma esperada (7 parámetros incluyendo p_allergies)."
      );
    } else if (
      msg.includes("permission") ||
      msg.includes("rls") ||
      msg.includes("not allowed") ||
      msg.includes("42501")
    ) {
      toast("Permisos", "La base de datos bloqueó la inscripción. Revisemos RLS o SECURITY DEFINER.");
    } else if (
      msg.includes("no seats") ||
      msg.includes("agotado") ||
      msg.includes("sold out") ||
      msg.includes("sold")
    ) {
      toast("Agotado", "Esa fecha ya no tiene cupos disponibles. Elegí otra.");
    } else if (
      msg.includes("duplicate registration") ||
      msg.includes("registrations_unique_eventdate_email") ||
      msg.includes("duplicate key value") ||
      msg.includes("unique constraint") ||
      msg.includes("already exists") ||
      msg.includes("already registered")
    ) {
      toast("Ya estás inscrito", "Ese correo ya está inscrito para esta fecha.");
      setFieldError("email", "Este correo ya está inscrito para la fecha seleccionada.");
    } else if (
      msg.includes("invalid date") ||
      msg.includes("fecha no existe") ||
      msg.includes("invalid") ||
      msg.includes("fecha")
    ) {
      toast("Fecha inválida", "La fecha seleccionada no pertenece a este evento.");
      setFieldError("eventDate", "Fecha inválida. Elegí otra.");
    } else {
      toast("Error", "No se pudo completar la inscripción. Intentá nuevamente.");
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = oldLabel || "Inscribirme";
    }

    // Refresca cupos
    try {
      const fresh = await fetchEventAndDates(EVENT_ID);
      EVENT = fresh.event;
      DATES = fresh.dates;
      renderHeader();
      syncSubmitAvailability();
    } catch (_) {}
  }
}

// ============================================================
// Init
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  const sb = getSb();
  if (!sb) {
    toast("Error", "Supabase no está cargado. Revisá scripts.");
    return;
  }

  EVENT_ID = getParam("event") || "";
  const dateIdFromUrl = getParam("date_id") || "";
  const dateLabelFromUrl = getParam("date_label") || "";

  if (!EVENT_ID) {
    toast("Falta evento", "Volviendo a Home…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  // Back button
  const backBtn = $("#backBtn");
  if (backBtn) backBtn.href = `./event.html?event=${encodeURIComponent(EVENT_ID)}`;

  // Counter allergies
  const allergiesEl = $("#allergies");
  const countEl = $("#count");
  const syncCount = () => {
    if (!countEl || !allergiesEl) return;
    countEl.textContent = String(allergiesEl.value.length);
  };
  allergiesEl?.addEventListener("input", syncCount);
  syncCount();

  // Live clear on input
  ["firstName", "lastName", "email", "phone", "eventDate", "allergies"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => clearFieldError(id));
    el.addEventListener("change", () => clearFieldError(id));
  });

  // Load data
  try {
    const { event, dates } = await fetchEventAndDates(EVENT_ID);

    if (!event) {
      toast("No encontrado", "Ese evento no existe. Volviendo a Home…");
      setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
      return;
    }

    EVENT = event;
    DATES = dates;

    renderDatesSelect(dateIdFromUrl, dateLabelFromUrl);
    renderHeader();
    syncSubmitAvailability();

    if (sumAvailableSeatsFromDates(DATES) <= 0) {
      toast("Evento agotado", "Este evento no tiene cupos disponibles.");
    }
  } catch (err) {
    console.error(err);
    toast("Error", "No se pudo cargar el evento. Probá recargar.");
    return;
  }

  // Date change
  const dateSel = $("#eventDate");
  dateSel?.addEventListener("change", () => {
    const picked = dateSel.value || "";
    SELECTED_DATE_ID = picked;

    const d = getDateById(picked);
    SELECTED_DATE_LABEL = d ? String(d.label || "") : "";

    setHiddenDateId(SELECTED_DATE_ID);

    renderHeader();
    syncSubmitAvailability();

    if (picked && d && (Number(d.seats_available) || 0) <= 0) {
      toast("Agotado", "Esa fecha está agotada. Elegí otra.");
      setFieldError("eventDate", "Esa fecha está agotada. Elegí otra.");
    }
  });

  // Submit
  const form = $("#regForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (sumAvailableSeatsFromDates(DATES) <= 0) {
      toast("Agotado", "No hay cupos para este evento.");
      return;
    }

    await submitRegistration();
  });

  // Pre-carga del modal (opcional, para que se sienta instantáneo)
  ensureModal();
});
