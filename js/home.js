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
  const fallback = "/assets/img/hero-1.jpg";
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;

  // URL absoluta
  if (/^https?:\/\//i.test(raw)) return raw;

  // conserva query/hash
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
// Supabase helpers
// ============================================================
function hardFail(msg) {
  try {
    console.error(msg);
  } catch (_) {}
}

function hasSupabase() {
  return !!(window.APP && APP.supabase);
}

async function fetchEventsFromSupabase() {
  if (!hasSupabase()) {
    hardFail("APP.supabase no está listo. Revisá el orden: supabase-js CDN -> supabaseClient.js -> home.js");
    return [];
  }

  // 1) Traer eventos
  const evRes = await APP.supabase
    .from("events")
    .select('id,title,type,month_key,"desc",img,location,time_range,duration_hours,created_at,updated_at')
    .order("created_at", { ascending: false });

  if (evRes.error) {
    console.error(evRes.error);
    toast("Error", "No se pudieron cargar los eventos.");
    return [];
  }

  const events = Array.isArray(evRes.data) ? evRes.data : [];
  if (!events.length) return [];

  // 2) Traer fechas (todas) y agregarlas por event_id
  const datesRes = await APP.supabase
    .from("event_dates")
    .select("id,event_id,label,seats_total,seats_available,created_at")
    .order("created_at", { ascending: true });

  if (datesRes.error) {
    console.error(datesRes.error);
    toast("Aviso", "Eventos cargados, pero no se pudieron cargar las fechas.");
  }

  const dates = Array.isArray(datesRes.data) ? datesRes.data : [];
  const byEvent = new Map();

  dates.forEach((d) => {
    const eid = d?.event_id;
    if (!eid) return;
    if (!byEvent.has(eid)) byEvent.set(eid, []);
    byEvent.get(eid).push({
      id: d?.id,
      label: d?.label,
      seats_available: Number(d?.seats_available ?? 0),
      seats_total: Number(d?.seats_total ?? 0),
    });
  });

  // 3) Mapear a UI (tu estructura actual)
  return events.map((ev) => {
    const evDates = byEvent.get(ev.id) || [];
    const labels = evDates.map((x) => x.label).filter(Boolean);

    // seats = suma de seats_available de todas las fechas
    const seats = evDates.reduce((acc, x) => acc + (Number(x.seats_available) || 0), 0);

    return {
      id: ev?.id || "",
      type: ev?.type || "Experiencia",
      monthKey: String(ev?.month_key || "—").toUpperCase(),
      dates: labels,
      title: ev?.title || "Evento",
      desc: ev?.desc || "",
      seats,
      img: normalizeImgPath(ev?.img),
      // extras por si luego los ocupás en event.html
      location: ev?.location || "",
      timeRange: ev?.time_range || "",
      durationHours: ev?.duration_hours || "",
    };
  });
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
    return normalizeImgPath(media?.defaultHero || "/assets/img/hero-1.jpg");
  } catch {
    return "/assets/img/hero-1.jpg";
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
    slide.style.setProperty("--bgimg", `url('${safeCssUrl(ev.img || getDefaultHero())}')`);

    const pillText = soldOut ? "AGOTADO" : (ev.type || "Experiencia");

    slide.innerHTML = `
      <div class="container heroCard">
        <div class="heroInner">
          <div class="heroMeta">
            <span class="pill">${escapeHtml(pillText)}</span>
          </div>

          <h1 class="heroTitle">${escapeHtml(ev.title)}</h1>
          <p class="heroDesc">${escapeHtml(ev.desc)}</p>

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
  if (!slidesEl || !dotsEl) return;
  slidesEl.style.transform = `translateX(-${idx * 100}%)`;
  [...dotsEl.children].forEach((d, i) => d.setAttribute("aria-current", i === idx));
}

function goTo(next, user) {
  if (!EVENTS.length) return;
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
  // Si ECN existe, usamos el helper; si no, fallback fijo
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
  if (!monthGrid) return;

  monthGrid.innerHTML = "";
  const list = EVENTS.filter((e) => e.monthKey === activeMonth);

  if (!list.length) {
    monthGrid.innerHTML = `<div class="emptyMonth">No hay eventos para <b>${escapeHtml(activeMonth)}</b>.</div>`;
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
    goEvent(ev.id);
    return;
  }

  if (btn.dataset.action === "register") {
    goRegister(ev.id, soldOut);
    return;
  }
});

// ============================================================
// Refresh (Supabase)
// ============================================================
async function refreshFromSupabase(opts = { keepToast: true }) {
  EVENTS = await fetchEventsFromSupabase();

  renderSlides();
  restartAuto();
  renderMonths();

  // Si querés activar un toast suave:
  // if (opts?.keepToast) toast("Actualizado", "Eventos sincronizados.");
}

// Hook opcional (si en el futuro disparás eventos custom)
window.addEventListener("ecn:events-updated", () => {
  refreshFromSupabase({ keepToast: false });
});

// ============================================================
// Init
// ============================================================
(async function init() {
  // UI base (vacía) primero
  renderSlides();
  renderMonths();

  // Cargar datos reales
  await refreshFromSupabase({ keepToast: false });

  setTimeout(() => toast("Bienvenido", "Revisá los próximos eventos."), 800);
})();
