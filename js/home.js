"use strict";

// ============================================================
// Helpers
// ============================================================
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const qs = (sel) => document.querySelector(sel);

// ============================================================
// Imagen helpers
// ============================================================
function normalizeImgPath(input) {
  const fallback = "/assets/img/hero-1.jpg"; // ✅ FIX: antes .png
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;

  if (/^https?:\/\//i.test(raw)) return raw;

  const [pathPart, rest] = raw.split(/(?=[?#])/);
  let p = pathPart.replaceAll("\\", "/");

  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) return p + (rest || "");
  if (p.startsWith("assets/img/")) return "/" + p + (rest || "");
  if (p.startsWith("img/")) return "/assets/" + p + (rest || "");

  return "/assets/img/" + p + (rest || "");
}

function safeCssUrl(url) {
  return String(url ?? "")
    .replaceAll("'", "%27")
    .replaceAll('"', "%22")
    .replaceAll(")", "%29")
    .trim();
}

// ============================================================
// Data mapping
// ============================================================
function toUiEvent(ev) {
  const dates = (ev?.dates || []).map((d) => d?.label).filter(Boolean);
  const seats =
    window.ECN && typeof ECN.totalSeats === "function" ? ECN.totalSeats(ev) : 0;

  return {
    id: ev?.id || "",
    type: ev?.type || "Experiencia",
    monthKey: String(ev?.monthKey || "—").toUpperCase(),
    dates,
    title: ev?.title || "Evento",
    desc: ev?.desc || "",
    seats,
    img: normalizeImgPath(ev?.img),
  };
}

function getEvents() {
  if (window.ECN?.getEvents) {
    const list = ECN.getEvents();
    return Array.isArray(list) ? list.map(toUiEvent) : [];
  }

  if (window.ECN?.getUpcomingEvents) {
    const list = ECN.getUpcomingEvents();
    return Array.isArray(list) ? list.map(toUiEvent) : [];
  }

  return [];
}

// ============================================================
// Toasts
// ============================================================
const toastsEl = qs("#toasts");

function toast(title, msg, timeout = 3800) {
  if (!toastsEl) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div>
      <p class="tTitle">${escapeHtml(title)}</p>
      <p class="tMsg">${escapeHtml(msg)}</p>
    </div>
    <button class="close" aria-label="Cerrar">✕</button>
  `;
  toastsEl.appendChild(el);

  const kill = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 180);
  };

  el.querySelector(".close")?.addEventListener("click", kill);
  setTimeout(kill, timeout);
}

// ============================================================
// Nav helpers (rutas)
// ============================================================
function goEvent(id) {
  window.location.href = `./event.html?event=${encodeURIComponent(id)}`;
}

function goRegister(id, soldOut) {
  if (soldOut) {
    toast("Evento agotado", "Este evento no tiene cupos.");
    return;
  }
  window.location.href = `./register.html?event=${encodeURIComponent(id)}`;
}

// ============================================================
// Carousel
// ============================================================
const slidesEl = qs("#slides");
const dotsEl = qs("#dots");

let idx = 0;
let autoTimer = null;
const AUTO_MS = 7000;
let EVENTS = [];

function getDefaultHero() {
  try {
    const media = window.ECN?.getMedia?.();
    return normalizeImgPath(media?.defaultHero || "/assets/img/hero-1.jpg"); // ✅ FIX
  } catch {
    return "/assets/img/hero-1.jpg"; // ✅ FIX
  }
}

function renderEmptyState() {
  if (!slidesEl) return;

  const heroImg = getDefaultHero();
  slidesEl.innerHTML = `
    <article class="slide" style="--bgimg:url('${safeCssUrl(heroImg)}')">
      <div class="container heroCard">
        <div class="heroInner">
          <div class="heroMeta">
            <span class="pill">Experiencias</span>
          </div>
          <h1 class="heroTitle">No hay eventos disponibles</h1>
          <p class="heroDesc">Pronto publicaremos nuevas fechas.</p>
        </div>
      </div>
    </article>
  `;
  if (dotsEl) dotsEl.innerHTML = "";
}

function renderSlides() {
  if (!slidesEl || !dotsEl) return;

  slidesEl.innerHTML = "";
  dotsEl.innerHTML = "";

  if (!EVENTS.length) {
    renderEmptyState();
    return;
  }

  idx = Math.min(idx, EVENTS.length - 1);

  EVENTS.forEach((ev, i) => {
    const soldOut = ev.seats <= 0;

    const slide = document.createElement("article");
    slide.className = "slide";
    slide.style.setProperty(
      "--bgimg",
      `url('${safeCssUrl(ev.img || getDefaultHero())}')`
    );

    // ✅ SOLO 1 pill:
    // - si agotado: AGOTADO
    // - si no: tipo (Cata de vino / Coctelería / etc.)
    const pillText = soldOut ? "AGOTADO" : (ev.type || "Experiencia");

    slide.innerHTML = `
      <div class="container heroCard">
        <div class="heroInner">
          <div class="heroMeta">
            <span class="pill">${escapeHtml(pillText)}</span>
          </div>

          <h1 class="heroTitle">${escapeHtml(ev.title)}</h1>
          <p class="heroDesc">${escapeHtml(ev.desc)}</p>

          <!-- ✅ SOLO botón Inscribirme -->
          <div class="heroActions">
            <button class="btn primary" data-action="register" data-id="${ev.id}"
              ${soldOut ? "disabled style='opacity:.55'" : ""}>
              Inscribirme
            </button>
          </div>
        </div>
      </div>
    `;

    slidesEl.appendChild(slide);

    const dot = document.createElement("button");
    dot.className = "dotBtn";
    dot.setAttribute("aria-current", i === idx);
    dot.addEventListener("click", () => goTo(i, true));
    dotsEl.appendChild(dot);
  });

  updateTransform();
}

function updateTransform() {
  slidesEl.style.transform = `translateX(-${idx * 100}%)`;
  [...dotsEl.children].forEach((d, i) => d.setAttribute("aria-current", i === idx));
}

function goTo(next, user) {
  idx = (next + EVENTS.length) % EVENTS.length;
  updateTransform();
  if (user) restartAuto();
}

function restartAuto() {
  clearInterval(autoTimer);
  if (!EVENTS.length) return;
  autoTimer = setInterval(() => goTo(idx + 1), AUTO_MS);
}

// ============================================================
// Months + Grid
// ============================================================
const monthAnchors = qs("#monthAnchors");
const monthGrid = qs("#monthGrid");
let activeMonth = null;

function getThreeMonthWindow() {
  return window.ECN?.getMonths3 ? ECN.getMonths3(new Date()) : ["ENERO", "FEBRERO", "MARZO"];
}

function renderMonths() {
  if (!monthAnchors || !monthGrid) return;

  const months = getThreeMonthWindow();
  activeMonth ||= months[0];
  monthAnchors.innerHTML = "";

  months.forEach((m) => {
    const a = document.createElement("a");
    a.href = "#proximos";
    a.className = "monthBtn";
    a.textContent = m;
    a.setAttribute("aria-current", m === activeMonth);
    a.onclick = (e) => {
      e.preventDefault();
      activeMonth = m;
      renderMonths();
      renderMonthGrid();
      toast("Mes seleccionado", `Mostrando eventos de ${m}.`);
    };
    monthAnchors.appendChild(a);
  });

  renderMonthGrid();
}

function renderMonthGrid() {
  monthGrid.innerHTML = "";
  const list = EVENTS.filter((e) => e.monthKey === activeMonth);

  if (!list.length) {
    monthGrid.innerHTML = `<div class="emptyMonth">No hay eventos para <b>${activeMonth}</b>.</div>`;
    return;
  }

  list.forEach((ev) => {
    const soldOut = ev.seats <= 0;

    const card = document.createElement("article");
    card.className = "eventCard" + (soldOut ? " isSoldOut" : "");
    card.style.setProperty("--cardimg", `url('${safeCssUrl(ev.img)}')`);

    card.innerHTML = `
      ${soldOut ? `<div class="soldOutTag">AGOTADO</div>` : ""}
      <div class="eventBody">
        <p class="eventDate">
          <span class="badge">${escapeHtml(ev.type)}</span>
          ${escapeHtml(ev.dates.join(" • ") || "Por definir")}
        </p>

        <h3 class="eventName">${escapeHtml(ev.title)}</h3>

        <div class="eventActions">
          <!-- ✅ MÁS INFO -> DIRECTO A event.html -->
          <button class="btn" data-action="info" data-id="${ev.id}">Más info</button>

          <button class="btn primary" data-action="register" data-id="${ev.id}"
            ${soldOut ? "disabled style='opacity:.55'" : ""}>
            Inscribirme
          </button>
        </div>
      </div>
    `;

    monthGrid.appendChild(card);
  });
}

// ============================================================
// Delegation (acciones)
// ============================================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const id = btn.dataset.id || "";
  const ev = EVENTS.find((x) => x.id === id);
  if (!ev) return;

  const soldOut = ev.seats <= 0;

  if (btn.dataset.action === "info") {
    // ✅ DIRECTO a event
    goEvent(ev.id);
    return;
  }

  if (btn.dataset.action === "register") {
    goRegister(ev.id, soldOut);
    return;
  }
});

// ============================================================
// ✅ Live refresh when seats/events change
// ============================================================
function refreshFromStore(opts = { keepToast: true }) {
  EVENTS = getEvents();

  renderSlides();
  restartAuto();
  renderMonths();

  if (opts?.keepToast) {
    // opcional
    // toast("Actualizado", "Se actualizaron los cupos.");
  }
}

window.addEventListener("storage", (e) => {
  const key = e?.key || "";
  const eventsKey = window.ECN?.LS?.EVENTS || "ecn_events";
  if (key !== eventsKey) return;
  refreshFromStore({ keepToast: false });
});

window.addEventListener("ecn:events-updated", () => {
  refreshFromStore({ keepToast: false });
});

// ============================================================
// Init
// ============================================================
(function init() {
  if (!window.ECN) {
    console.warn("ECN no cargado: home en modo vacío.");
  }

  EVENTS = getEvents();
  renderSlides();
  restartAuto();
  renderMonths();
  setTimeout(() => toast("Bienvenido", "Revisá los próximos eventos."), 800);
})();
