"use strict";

/* ============================================================
   register.js ✅ PRO (Supabase) — 2026-02-18.3
   ✅ ALINEADO A TU DB ACTUAL:
   - events.desc -> events.description (mantiene EVENT.desc para compat)
   - ❌ events.img eliminado (ya no existe)
   - ✅ Imagen del evento ahora viene de media_items (target='event')
     * Soporta tus folders actuales: desktop_event | mobile_event | event_more
     * Soporta folders “nuevo estándar” también: event_img_desktop | event_img_mobile | event_more_img
   - ✅ Si media_items trae solo path (storage path), lo convierte a publicUrl
   - ✅ No rompe tu modal éxito, validación, RPC, etc.
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
  if (only.length === 8) return "506" + only;
  if (only.length === 11 && only.startsWith("506")) return only;
  return null;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || "").trim());
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
// ✅ UI helpers: estados visuales de campos (invalid/valid)
// ============================================================
function setFieldError(fieldId, msg) {
  const input = document.getElementById(fieldId);
  const field = input?.closest(".field");
  if (!field) return;

  field.classList.remove("valid");
  field.classList.add("invalid");

  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = msg || "Revisá este campo.";
}

function setFieldValid(fieldId) {
  const input = document.getElementById(fieldId);
  const field = input?.closest(".field");
  if (!field) return;

  field.classList.remove("invalid");
  field.classList.add("valid");

  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = "";
}

function clearFieldState(fieldId) {
  const input = document.getElementById(fieldId);
  const field = input?.closest(".field");
  if (!field) return;

  field.classList.remove("invalid");
  field.classList.remove("valid");

  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = "";
}

// ============================================================
// ✅ Inyecta estilos PRO de validación (sin tocar register.css)
// ============================================================
function ensureValidationStylesOnce() {
  if (document.getElementById("ecnValidationStyles")) return;

  const style = document.createElement("style");
  style.id = "ecnValidationStyles";
  style.textContent = `
    .field.invalid input,
    .field.invalid select,
    .field.invalid textarea{
      border-color: rgba(211,51,51,.85) !important;
      box-shadow: 0 0 0 3px rgba(211,51,51,.10) !important;
    }

    .field.valid input,
    .field.valid select,
    .field.valid textarea{
      border-color: rgba(26,127,55,.85) !important;
      box-shadow: 0 0 0 3px rgba(26,127,55,.10) !important;
    }

    .field .err{
      color: rgba(211,51,51,.95);
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// ✅ MODAL ÉXITO (Lottie JSON) — SIN TIMER
// ============================================================
const SUCCESS = {
  overlayId: "ecnSuccessOverlay",
  lottieJsonUrl: "./assets/img/lottie/champagne_13399330.json",
  lottieLib: "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js",
};

function ensureSuccessModalStylesOnce() {
  if (document.getElementById("ecnSuccessModalStyles")) return;

  const style = document.createElement("style");
  style.id = "ecnSuccessModalStyles";
  style.textContent = `
    .ecnModalOverlay{
      position: fixed;
      inset: 0;
      display: none;
      place-items: center;
      padding: 18px;
      background: rgba(0,0,0,.55);
      z-index: 9999;
    }
    .ecnModalOverlay[aria-hidden="false"]{ display: grid; }

    .ecnModal{
      width: min(520px, 100%);
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.96);
      box-shadow: 0 28px 90px rgba(0,0,0,.35);
      overflow: hidden;
      transform: translateY(6px);
      opacity: 0;
      transition: transform .18s ease, opacity .18s ease;
    }
    .ecnModalOverlay[aria-hidden="false"] .ecnModal{
      transform: translateY(0);
      opacity: 1;
    }

    .ecnModalTop{
      padding: 14px 16px 0;
      display:flex;
      justify-content:flex-end;
    }
    .ecnCloseX{
      width: 44px;
      height: 44px;
      border-radius: 999px;
      border: 1px solid rgba(18,18,18,.12);
      background: rgba(18,18,18,.04);
      cursor:pointer;
      display:grid;
      place-items:center;
      font-size: 16px;
      transition: background .15s ease, border-color .15s ease, transform .10s ease;
    }
    .ecnCloseX:hover{
      background: rgba(18,18,18,.06);
      border-color: rgba(18,18,18,.18);
    }
    .ecnCloseX:active{ transform: translateY(1px); }

    .ecnModalBody{
      padding: 0 18px 18px;
      text-align: center;
    }

    .ecnAnim{
      width: 96px;
      height: 96px;
      margin: 4px auto 10px;
    }

    .ecnTitle{
      margin: 0;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
      font-size: 14px;
      color: rgba(18,18,18,.92);
    }

    .ecnMsg{
      margin: 10px auto 0;
      color: rgba(18,18,18,.68);
      line-height: 1.7;
      font-size: 14px;
      max-width: 46ch;
    }

    .ecnActions{
      margin-top: 14px;
      display:flex;
      gap: 10px;
      justify-content:center;
      flex-wrap: wrap;
    }

    .ecnBtn{
      min-height: 44px;
      padding: 11px 16px;
      border-radius: 14px;
      border: 1px solid rgba(18,18,18,.14);
      background: rgba(18,18,18,.04);
      cursor:pointer;
      font-weight: 900;
      letter-spacing: .10em;
      text-transform: uppercase;
      font-size: 12px;
      color: rgba(18,18,18,.88);
      transition: background .15s ease, border-color .15s ease;
    }
    .ecnBtn:hover{
      background: rgba(18,18,18,.06);
      border-color: rgba(18,18,18,.20);
    }
    .ecnBtn--primary{
      background: #000;
      border-color: #000;
      color:#fff;
    }
    .ecnBtn--primary:hover{ filter: brightness(1.06); }

    @media (max-width: 420px){
      .ecnModalBody{ padding: 0 14px 16px; }
    }
  `;
  document.head.appendChild(style);
}

async function ensureLottieLoaded() {
  if (window.lottie && typeof window.lottie.loadAnimation === "function") return;

  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SUCCESS.lottieLib;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Lottie."));
    document.head.appendChild(s);
  });
}

function ensureSuccessModalDOM() {
  ensureSuccessModalStylesOnce();

  let overlay = document.getElementById(SUCCESS.overlayId);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = SUCCESS.overlayId;
  overlay.className = "ecnModalOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-hidden", "true");

  overlay.innerHTML = `
    <div class="ecnModal" role="document">
      <div class="ecnModalTop">
        <button class="ecnCloseX" type="button" aria-label="Cerrar">✕</button>
      </div>
      <div class="ecnModalBody">
        <div class="ecnAnim" id="ecnSuccessAnim" aria-hidden="true"></div>
        <h3 class="ecnTitle">Tu reserva ha sido realizada con éxito</h3>
        <p class="ecnMsg">
          Pronto te llegará un correo con los detalles.
        </p>
        <div class="ecnActions">
          <button class="ecnBtn" type="button" data-act="close">Cerrar</button>
          <button class="ecnBtn ecnBtn--primary" type="button" data-act="go">Confirmación</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".ecnCloseX")?.addEventListener("click", () => hideSuccessModal());
  overlay.querySelector('[data-act="close"]')?.addEventListener("click", () => hideSuccessModal());

  overlay.querySelector('[data-act="go"]')?.addEventListener("click", () => {
    const evId = window.__ECN_LAST_EVENT_ID ? String(window.__ECN_LAST_EVENT_ID) : "";
    const dtId = window.__ECN_LAST_DATE_ID ? String(window.__ECN_LAST_DATE_ID) : "";

    if (evId && dtId) {
      window.location.href =
        `./confirm.html?event=${encodeURIComponent(evId)}&date_id=${encodeURIComponent(dtId)}&reg=ok`;
      return;
    }
    if (evId) {
      window.location.href = `./event.html?event=${encodeURIComponent(evId)}`;
      return;
    }
    window.location.href = "./home.html#proximos";
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideSuccessModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const o = document.getElementById(SUCCESS.overlayId);
      if (o && o.getAttribute("aria-hidden") === "false") hideSuccessModal();
    }
  });

  return overlay;
}

let __successAnimInstance = null;

async function showSuccessModal() {
  const overlay = ensureSuccessModalDOM();
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  try {
    await ensureLottieLoaded();
    const holder = document.getElementById("ecnSuccessAnim");
    if (holder && !__successAnimInstance) {
      __successAnimInstance = window.lottie.loadAnimation({
        container: holder,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: SUCCESS.lottieJsonUrl,
      });
    }
    __successAnimInstance?.goToAndPlay?.(0, true);
  } catch (e) {
    console.warn("[modal] lottie fail:", e);
  }
}

function hideSuccessModal() {
  const overlay = document.getElementById(SUCCESS.overlayId);
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

// ============================================================
// ✅ Media helpers (media_items target=event)
// ============================================================

// tus folders actuales + compat con los “estándar”
const MEDIA_FOLDERS_EVENT = [
  "desktop_event",
  "mobile_event",
  "event_more",
  "event_img_desktop",
  "event_img_mobile",
  "event_more_img",
];

const MEDIA_ALIAS = {
  desktop_event: "event_img_desktop",
  mobile_event: "event_img_mobile",
  event_more: "event_more_img",
};

function resolveBucketPublicUrlFromPath(path) {
  const sb = getSb();
  const p = String(path || "").trim();
  if (!sb || !p) return "";

  // path típico: "events/archivo.webp"
  // bucket típico (según tus urls): "media"
  try {
    const out = sb.storage.from("media").getPublicUrl(p);
    return out?.data?.publicUrl || "";
  } catch (_) {
    return "";
  }
}

async function fetchEventMediaMap(eventId) {
  const sb = getSb();
  const eid = String(eventId || "").trim();
  if (!sb || !eid) return {};

  const { data, error } = await sb
    .from("media_items")
    .select("folder,public_url,path,updated_at")
    .eq("target", "event")
    .eq("event_id", eid)
    .in("folder", MEDIA_FOLDERS_EVENT)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("[register] media_items error:", error);
    return {};
  }

  // toma el más nuevo por folder (ya viene ordenado desc)
  const map = {};
  (Array.isArray(data) ? data : []).forEach((r) => {
    const folderRaw = String(r?.folder || "").trim();
    const folder = MEDIA_ALIAS[folderRaw] || folderRaw;

    let url = String(r?.public_url || "").trim();
    if (!url) {
      const p = String(r?.path || "").trim();
      url = resolveBucketPublicUrlFromPath(p);
    }

    if (folder && url && !map[folder]) map[folder] = url;
  });

  return map;
}

// ============================================================
// State
// ============================================================
let EVENT_ID = "";
let EVENT = null;
let DATES = [];
let SELECTED_DATE_ID = "";
let SELECTED_DATE_LABEL = "";
let IS_SUBMITTING = false;

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

  if (IS_SUBMITTING) return;

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

  const eid = String(eventId ?? "").trim();
  if (!eid) return { event: null, dates: [] };

  // ✅ FIX: quitamos img (ya no existe)
  const { data: ev, error: evErr } = await sb
    .from("events")
    .select("id, title, description, type, month_key, location, time_range, duration_hours")
    .eq("id", eid)
    .maybeSingle();

  if (evErr) throw evErr;
  if (!ev) return { event: null, dates: [] };

  // ✅ media del evento (hero + more)
  const media = await fetchEventMediaMap(eid);

  // guardamos por si más adelante querés pintar imagen en register
  const event_img_desktop = String(media.event_img_desktop || "").trim();
  const event_img_mobile = String(media.event_img_mobile || "").trim();
  const event_more_img = String(media.event_more_img || "").trim();

  let ds = null;
  let dErr = null;

  const tryCreatedAt = await sb
    .from("event_dates")
    .select("id, event_id, label, seats_total, seats_available, created_at")
    .eq("event_id", eid)
    .order("created_at", { ascending: true });

  if (tryCreatedAt.error) {
    const fallback = await sb
      .from("event_dates")
      .select("id, event_id, label, seats_total, seats_available")
      .eq("event_id", eid)
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

  // ✅ mantener compat: el resto del archivo usa EVENT.desc
  const event = {
    ...ev,
    desc: String(ev.description || ""),
    media: {
      event_img_desktop,
      event_img_mobile,
      event_more_img,
    },
  };

  return { event, dates };
}

// ============================================================
// Validation
// ============================================================
function validateFieldById(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return true;

  const v = (el.value || "").trim();

  if (fieldId === "firstName") {
    if (!v) return setFieldError(fieldId, "Ingresá tu nombre."), false;
    return setFieldValid(fieldId), true;
  }

  if (fieldId === "lastName") {
    if (!v) return setFieldError(fieldId, "Ingresá tus apellidos."), false;
    return setFieldValid(fieldId), true;
  }

  if (fieldId === "email") {
    if (!v || !validEmail(v)) return setFieldError(fieldId, "Ingresá un correo válido."), false;
    return setFieldValid(fieldId), true;
  }

  if (fieldId === "phone") {
    const normalized = normalizePhone(v);
    if (!v || !normalized) return setFieldError(fieldId, "Ingresá un teléfono válido (8 dígitos o 506 + 8)."), false;
    return setFieldValid(fieldId), true;
  }

  if (fieldId === "eventDate") {
    const eventDateId = el.value || "";
    if (!eventDateId) return setFieldError(fieldId, "Seleccioná una fecha del evento."), false;

    const d = getDateById(eventDateId);
    if (!d) return setFieldError(fieldId, "Fecha inválida. Elegí otra."), false;
    if ((Number(d.seats_available) || 0) <= 0) return setFieldError(fieldId, "Esa fecha está agotada. Elegí otra."), false;

    return setFieldValid(fieldId), true;
  }

  if (fieldId === "allergies") {
    const raw = el.value || "";
    if (raw && !raw.trim()) return setFieldError(fieldId, "Si lo completás, escribí un detalle."), false;
    if (raw && raw.length > 120) return setFieldError(fieldId, "Máximo 120 caracteres."), false;

    if (!raw) {
      clearFieldState(fieldId);
      return true;
    }
    return setFieldValid(fieldId), true;
  }

  return true;
}

function validateForm() {
  let ok = true;

  ["firstName", "lastName", "email", "phone", "eventDate", "allergies"].forEach(clearFieldState);

  ok = validateFieldById("firstName") && ok;
  ok = validateFieldById("lastName") && ok;
  ok = validateFieldById("email") && ok;
  ok = validateFieldById("phone") && ok;
  ok = validateFieldById("eventDate") && ok;
  ok = validateFieldById("allergies") && ok;

  const normalizedPhone = normalizePhone(($("#phone")?.value || "").trim());
  return { ok, normalizedPhone };
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
    IS_SUBMITTING = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";
  }

  try {
    const { data, error } = await sb.rpc("register_for_event", payload);
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : null;

    if (row?.reservation_number) {
      sessionStorage.setItem("ecn_last_reservation_number", String(row.reservation_number));
    }
    if (row?.registration_id) {
      sessionStorage.setItem("ecn_last_registration_id", String(row.registration_id));
    }

    const emailLower = String(payload.p_email || "").toLowerCase();
    if (emailLower) sessionStorage.setItem("ecn_last_email", emailLower);

    let regId = "";
    let rn = "";

    if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
      regId = data[0].registration_id ? String(data[0].registration_id) : "";
      rn = data[0].reservation_number ? String(data[0].reservation_number) : "";
    } else if (typeof data === "string") {
      regId = data;
    } else if (data && typeof data === "object") {
      regId = data.registration_id ? String(data.registration_id) : data.id ? String(data.id) : "";
      rn = data.reservation_number ? String(data.reservation_number) : "";
    }

    if (regId) sessionStorage.setItem("ecn_last_registration_id", regId);
    if (rn) sessionStorage.setItem("ecn_last_reservation_number", rn);

    if (submitBtn) {
      submitBtn.textContent = "Enviado ✓";
      submitBtn.classList.add("isSuccess");
    }

    window.__ECN_LAST_EVENT_ID = String(EVENT_ID);
    window.__ECN_LAST_DATE_ID = String(dateId);

    const fresh = await fetchEventAndDates(EVENT_ID);
    EVENT = fresh.event;
    DATES = fresh.dates;

    SELECTED_DATE_ID = "";
    SELECTED_DATE_LABEL = "";
    setHiddenDateId("");

    $("#regForm")?.reset();
    const countEl = $("#count");
    if (countEl) countEl.textContent = "0";

    renderDatesSelect("");
    renderHeader();
    syncSubmitAvailability();

    await showSuccessModal();
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
    } else if (msg.includes("no seats") || msg.includes("agotado") || msg.includes("sold out") || msg.includes("sold")) {
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
    } else if (msg.includes("invalid date") || msg.includes("fecha no existe") || msg.includes("invalid") || msg.includes("fecha")) {
      toast("Fecha inválida", "La fecha seleccionada no pertenece a este evento.");
      setFieldError("eventDate", "Fecha inválida. Elegí otra.");
    } else {
      toast("Error", "No se pudo completar la inscripción. Intentá nuevamente.");
    }

    IS_SUBMITTING = false;

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = oldLabel || "Inscribirme";
      submitBtn.classList.remove("isSuccess");
    }

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
  ensureValidationStylesOnce();

  const sb = getSb();
  if (!sb) {
    toast("Error", "Supabase no está cargado. Revisá scripts.");
    return;
  }

  EVENT_ID = String(getParam("event") || "").trim();
  const dateIdFromUrl = String(getParam("date_id") || "").trim();
  const dateLabelFromUrl = String(getParam("date_label") || "").trim();

  if (!EVENT_ID) {
    toast("Falta evento", "Volviendo a Home…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  const backBtn = $("#backBtn");
  if (backBtn) backBtn.href = `./event.html?event=${encodeURIComponent(EVENT_ID)}`;

  const allergiesEl = $("#allergies");
  const countEl = $("#count");
  const syncCount = () => {
    if (!countEl || !allergiesEl) return;
    countEl.textContent = String(allergiesEl.value.length);
  };
  allergiesEl?.addEventListener("input", syncCount);
  syncCount();

  const liveIds = ["firstName", "lastName", "email", "phone", "eventDate", "allergies"];
  liveIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    const run = () => {
      if (IS_SUBMITTING) return;
      validateFieldById(id);
    };

    el.addEventListener("input", run);
    el.addEventListener("change", run);
    el.addEventListener("blur", run);
  });

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

  const dateSel = $("#eventDate");
  dateSel?.addEventListener("change", () => {
    if (IS_SUBMITTING) return;

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
    } else {
      validateFieldById("eventDate");
    }
  });

  const form = $("#regForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (sumAvailableSeatsFromDates(DATES) <= 0) {
      toast("Agotado", "No hay cupos para este evento.");
      return;
    }

    await submitRegistration();
  });
});
