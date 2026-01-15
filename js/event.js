"use strict";

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

function safeCssUrl(url) {
  return String(url ?? "")
    .replaceAll("'", "%27")
    .replaceAll('"', "%22")
    .replaceAll(")", "%29")
    .trim();
}

function normalizeImgPath(input) {
  const fallback = "./assets/img/hero-1.jpg";
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;

  if (/^https?:\/\//i.test(raw)) return raw;

  const [pathPart, rest] = raw.split(/(?=[?#])/);
  let p = pathPart.replaceAll("\\", "/");

  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) return p + (rest || "");
  if (p.startsWith("assets/img/")) return "./" + p + (rest || "");
  if (p.startsWith("img/")) return "./assets/" + p + (rest || "");

  return "./assets/img/" + p + (rest || "");
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

  el.querySelector(".close")?.addEventListener("click", kill);
  setTimeout(kill, timeoutMs);
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function safeText(v, fallback = "Por confirmar") {
  const t = String(v ?? "").trim();
  return t ? t : fallback;
}

function getDefaultHero() {
  try {
    const media = window.ECN && typeof ECN.getMedia === "function" ? ECN.getMedia() : null;
    return normalizeImgPath(media?.defaultHero || "./assets/img/hero-1.jpg");
  } catch (_) {
    return "./assets/img/hero-1.jpg";
  }
}

// ============================================================
// Normalización de evento (soporta varios shapes)
// - Soporta:
//   A) ECN.getEvents() => {dates: string[], seats, _dates:[{label,seats}]}
//   B) getEventsRaw/find raw => {dates:[{label,seats}]}
// ============================================================
function normalizeEvent(ev) {
  const raw = ev || {};
  const id = String(raw.id || "");
  const type = String(raw.type || "Experiencia");
  const monthKey = String(raw.monthKey || "—");
  const title = String(raw.title || "Evento");
  const desc = String(raw.desc || "");
  const img = normalizeImgPath(raw.img || getDefaultHero());

  // Fechas con cupos:
  let datesObj = [];
  if (Array.isArray(raw._dates)) {
    datesObj = raw._dates.map((d) => ({
      label: String(d?.label || "").trim(),
      seats: Math.max(0, Number(d?.seats) || 0),
    }));
  } else if (Array.isArray(raw.dates) && raw.dates.length && typeof raw.dates[0] === "object") {
    datesObj = raw.dates.map((d) => ({
      label: String(d?.label || "").trim(),
      seats: Math.max(0, Number(d?.seats) || 0),
    }));
  } else if (Array.isArray(raw.dates)) {
    datesObj = raw.dates.map((label) => ({
      label: String(label || "").trim(),
      seats: 0,
    }));
  }

  const totalSeats =
    typeof raw.seats === "number"
      ? Math.max(0, raw.seats)
      : window.ECN && typeof ECN.totalSeats === "function"
        ? ECN.totalSeats(raw)
        : datesObj.reduce((a, d) => a + (Number(d.seats) || 0), 0);

  // ✅ Campos nuevos (con fallback legacy)
  const location = safeText(raw.location, "Por confirmar");
  const timeRange = safeText(raw.timeRange || raw.hours || raw.horario || raw.schedule, "Por confirmar");
  const durationHours = safeText(raw.durationHours || raw.duration || raw.duracion, "Por confirmar");

  return {
    id,
    type,
    monthKey,
    title,
    desc,
    img,
    dates: datesObj, // [{label,seats}]
    seats: totalSeats,

    // ✅ nuevos
    location,
    timeRange,
    durationHours,

    // legacy por compat
    duration: safeText(raw.duration, "Por confirmar"),
  };
}

// ============================================================
// Pick event
// ============================================================
function pickEvent() {
  if (!window.ECN) {
    console.error("ECN (data.js) no está cargado.");
    return null;
  }

  const eventId = getParam("event");
  const type = getParam("type"); // vino | cocteles

  // 1) Por ID
  if (eventId) {
    let found = null;

    if (typeof ECN.findEventById === "function") found = ECN.findEventById(eventId);
    else if (typeof ECN.getEventById === "function") found = ECN.getEventById(eventId);

    return found ? normalizeEvent(found) : null;
  }

  // Listado base
  let list = [];
  if (typeof ECN.getUpcomingEvents === "function") list = ECN.getUpcomingEvents() || [];
  else if (typeof ECN.getEvents === "function") list = ECN.getEvents() || [];
  else if (typeof ECN.getEventsRaw === "function") list = ECN.getEventsRaw() || [];

  const events = Array.isArray(list) ? list.map(normalizeEvent) : [];

  // 2) Por type
  if (type) {
    const t = String(type).toLowerCase();
    if (t === "vino") return events.find((e) => (e.type || "").toLowerCase().includes("vino")) || null;
    if (t === "cocteles" || t === "coctel")
      return events.find((e) => (e.type || "").toLowerCase().includes("coctel")) || null;
  }

  // 3) Fallback primer evento
  return events.length ? events[0] : null;
}

// ============================================================
// State + single listener
// ============================================================
let CURRENT = null;

function ensurePickListener() {
  if (ensurePickListener._done) return;
  ensurePickListener._done = true;

  document.addEventListener("click", (e) => {
    const pickBtn = e.target.closest("[data-pick]");
    if (!pickBtn) return;

    const raw = pickBtn.getAttribute("data-pick");
    if (!raw || !CURRENT) return;

    const date = decodeURIComponent(raw);

    if (CURRENT.seats <= 0 || pickBtn.disabled) {
      toast("No disponible", "Esta fecha no tiene cupos.");
      return;
    }

    toast("Fecha seleccionada", `Te inscribiremos para: ${date}`);
    window.location.href =
      `./register.html?event=${encodeURIComponent(CURRENT.id)}&date=${encodeURIComponent(date)}`;
  });
}

// ============================================================
// Render
// ============================================================
function renderEvent(ev) {
  CURRENT = ev;

  if (!ev) {
    toast("Evento no encontrado", "Volviendo a la lista de eventos…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  const soldOutTotal = ev.seats <= 0;

  // Background hero
  const heroBg = $("#heroBg");
  if (heroBg) {
    const bg = normalizeImgPath(ev.img || getDefaultHero());
    heroBg.style.setProperty("--bgimg", `url('${safeCssUrl(bg)}')`);
    heroBg.style.backgroundImage = `url('${safeCssUrl(bg)}')`;
  }

  // Meta pills
  const metaRow = $("#metaRow");
  const datesText = (ev.dates || []).map((d) => d.label).filter(Boolean).join(" • ");

  if (metaRow) {
    metaRow.innerHTML = `
      <span class="pill"><span class="dot"></span> ${escapeHtml(ev.type)}</span>
      <span class="pill">${escapeHtml(datesText || "Por definir")}</span>
      <span class="pill">${escapeHtml(ev.monthKey || "—")}</span>
      ${
        soldOutTotal
          ? `<span class="pill" style="border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.10);">AGOTADO</span>`
          : ``
      }
    `;
  }

  // Title + desc
  const t = $("#evTitle");
  const d = $("#evDesc");
  if (t) t.textContent = ev.title;
  if (d) d.textContent = ev.desc || "";

  // Dates list
  const dateList = $("#dateList");
  if (dateList) {
    dateList.innerHTML = "";

    const dates = Array.isArray(ev.dates) ? ev.dates : [];
    if (!dates.length) {
      dateList.innerHTML = `<div class="emptyMonth">Fechas por confirmar.</div>`;
    } else {
      dates.forEach((x) => {
        const label = String(x?.label || "").trim();
        const seats = Math.max(0, Number(x?.seats) || 0);
        const dateSoldOut = seats <= 0;

        const row = document.createElement("div");
        row.className = "dateItem";
        row.innerHTML = `
          <div class="dateLeft">
            <div class="dateMain">${escapeHtml(label || "Por definir")}</div>
            <div class="dateHint">
              ${
                dateSoldOut
                  ? `<span style="opacity:.8;">Sin cupos para esta fecha.</span>`
                  : `Cupos disponibles: <b>${escapeHtml(seats)}</b>`
              }
            </div>
          </div>

          <button class="datePick" type="button"
            data-pick="${encodeURIComponent(label || "")}"
            ${soldOutTotal || dateSoldOut ? "disabled" : ""}
            style="${soldOutTotal || dateSoldOut ? "opacity:.55; cursor:not-allowed;" : ""}">
            Elegir
          </button>
        `;
        dateList.appendChild(row);
      });
    }
  }

  // ✅ KV (DETALLES): Cupos + Duración + Hora + Ubicación
  const kv = $("#kv");
  if (kv) {
    kv.innerHTML = `
      <div class="kvRow">
        <div class="kvLabel">Cupos</div>
        <div class="kvValue">${soldOutTotal ? "0 (Agotado)" : escapeHtml(ev.seats)}</div>
      </div>

      <div class="kvRow">
        <div class="kvLabel">Duración</div>
        <div class="kvValue">${escapeHtml(safeText(ev.durationHours))}</div>
      </div>

      <div class="kvRow">
        <div class="kvLabel">Hora</div>
        <div class="kvValue">${escapeHtml(safeText(ev.timeRange))}</div>
      </div>

      <div class="kvRow">
        <div class="kvLabel">Ubicación</div>
        <div class="kvValue">${escapeHtml(safeText(ev.location))}</div>
      </div>
    `;
  }

  // Register button (sin fecha seleccionada)
  const btnRegister = $("#btnRegister");
  if (btnRegister) {
    btnRegister.href = `./register.html?event=${encodeURIComponent(ev.id)}`;

    if (soldOutTotal) {
      btnRegister.setAttribute("aria-disabled", "true");
      btnRegister.classList.remove("primary");
      btnRegister.classList.add("btn");
      btnRegister.style.opacity = ".55";
      btnRegister.style.pointerEvents = "none";
    } else {
      btnRegister.removeAttribute("aria-disabled");
      btnRegister.classList.add("primary");
      btnRegister.style.opacity = "1";
      btnRegister.style.pointerEvents = "auto";
    }
  }

  // Sold-out UI
  const soldNotice = $("#soldNotice");
  if (soldNotice) soldNotice.hidden = !soldOutTotal;

  const heroCard = $("#heroCard");
  if (heroCard) heroCard.classList.toggle("isSoldOut", soldOutTotal);

  if (soldOutTotal) {
    toast("Evento agotado", "Este evento no tiene cupos disponibles.");
  }
}

// ============================================================
// Init
// ============================================================
(function init() {
  ensurePickListener();
  const ev = pickEvent();
  renderEvent(ev);
})();
