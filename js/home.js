"use strict";

/* ============================================================
   home.js ✅ PRO (Carrusel tipo Wix: título izquierda + panel derecha)
   - ✅ estructura heroRow: Left(title) + Right(info panel)
   - ✅ panel blanco con bloques negros
   - ✅ SIN flecha
   - ✅ mantiene tu supabase events + dates + gallery + newsletter
============================================================ */

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
// Loading gate (evita flash)
// ============================================================
function setLoading(on) {
  try {
    document.body.classList.toggle("is-loading", !!on);
    const loader = qs("#pageLoader");
    if (loader) loader.setAttribute("aria-hidden", on ? "false" : "true");
  } catch (_) {}
}

// ============================================================
// Imagen helpers
// ============================================================
function normalizeImgPath(input) {
  const fallback = "/assets/img/hero-1.jpg";
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
    try {
      el.style.opacity = "0";
      el.style.transform = "translateY(-6px)";
      setTimeout(() => el.remove(), 180);
    } catch (_) {}
  };

  el.querySelector(".close")?.addEventListener("click", kill, { once: true });
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
    hardFail(
      "APP.supabase no está listo. Revisá el orden: supabase-js CDN -> supabaseClient.js -> home.js"
    );
    return [];
  }

  // 1) Traer eventos
  const evRes = await APP.supabase
    .from("events")
    .select(
      'id,title,type,month_key,"desc",img,location,time_range,duration_hours,created_at,updated_at'
    )
    .order("created_at", { ascending: false });

  if (evRes.error) {
    console.error(evRes.error);
    toast("Error", "No se pudieron cargar los eventos.");
    return [];
  }

  const events = Array.isArray(evRes.data) ? evRes.data : [];
  if (!events.length) return [];

  // 2) Traer fechas
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

  // 3) map para UI
  return events.map((ev) => {
    const evDates = byEvent.get(ev.id) || [];
    const labels = evDates.map((x) => x.label).filter(Boolean);

    const seats = evDates.reduce(
      (acc, x) => acc + (Number(x.seats_available) || 0),
      0
    );

    return {
      id: ev?.id || "",
      type: ev?.type || "Experiencia",
      monthKey: String(ev?.month_key || "—").toUpperCase(),
      dates: labels,
      title: ev?.title || "Evento",
      desc: ev?.desc || "",
      seats,
      img: normalizeImgPath(ev?.img),
      location: ev?.location || "",
      timeRange: ev?.time_range || "",
      durationHours: ev?.duration_hours || "",
    };
  });
}

// ============================================================
// ✅ GALERÍA HOME PREVIEW (8 fotos desde gallery_items)
// ============================================================
async function fetchGalleryPreview(limit = 8) {
  if (!hasSupabase()) return [];

  const sel = "id,type,name,tags,image_url,image_path,created_at,target";
  const res = await APP.supabase
    .from("gallery_items")
    .select(sel)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (res.error) {
    console.warn("[home] gallery_items error:", res.error);
    return [];
  }
  return Array.isArray(res.data) ? res.data : [];
}

function publicUrlFromPath(path) {
  const p = String(path || "").trim();
  if (!p) return "";
  try {
    const bucket = "gallery";
    const out = APP.supabase.storage.from(bucket).getPublicUrl(p);
    return out?.data?.publicUrl || "";
  } catch (_) {
    return "";
  }
}

function resolveGalleryImg(row) {
  const url = String(row?.image_url || "").trim();
  if (url) return url;
  const pub = publicUrlFromPath(row?.image_path);
  return pub || "";
}

function toHashtags(tagsLike, fallbackName) {
  let tags = [];

  if (Array.isArray(tagsLike)) {
    tags = tagsLike;
  } else {
    const raw = String(tagsLike ?? "").trim();
    if (raw) {
      if (raw.startsWith("[") && raw.endsWith("]")) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) tags = parsed;
        } catch (_) {}
      }
      if (!tags.length) {
        tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
  }

  const clean = (t) =>
    String(t ?? "")
      .trim()
      .toLowerCase()
      .replaceAll("á", "a")
      .replaceAll("é", "e")
      .replaceAll("í", "i")
      .replaceAll("ó", "o")
      .replaceAll("ú", "u")
      .replaceAll("ñ", "n")
      .replace(/[^a-z0-9_-]+/g, "")
      .replace(/_{2,}/g, "_")
      .replace(/-{2,}/g, "-");

  const out = tags
    .map(clean)
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => "#" + t)
    .join(" ");

  if (out) return out;

  const base = clean(fallbackName) || "entrecopasynotas";
  return `#${base} #cocteleria #maridaje`;
}

async function renderHomeGalleryPreview() {
  const grid = qs("#homeGalleryGrid");
  if (!grid) return;

  const rows = await fetchGalleryPreview(8);

  if (!rows.length) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = "";

  rows.forEach((r) => {
    const img = resolveGalleryImg(r);
    if (!img) return;

    const name = String(r?.name || r?.type || "Galería").trim();
    const label = toHashtags(r?.tags, name);

    const item = document.createElement("a");
    item.className = "gpItem";
    item.href = "./gallery.html";
    item.style.setProperty("--gpimg", `url('${safeCssUrl(img)}')`);
    item.innerHTML = `<span>${escapeHtml(label)}</span>`;
    grid.appendChild(item);
  });
}

// ============================================================
// ✅ Testimonial rotator
// ============================================================
function initQuoteRotator() {
  const el = qs("#quoteRotator");
  if (!el) return;

  if (el.dataset.mounted === "true") return;
  el.dataset.mounted = "true";

  const raw = el.getAttribute("data-quotes") || "[]";
  const intervalRaw = el.getAttribute("data-interval") || "4500";
  let interval = parseInt(intervalRaw, 10);
  if (!Number.isFinite(interval)) interval = 4500;
  interval = Math.max(2500, interval);

  let quotes = [];
  try {
    quotes = JSON.parse(raw);
  } catch (_) {
    quotes = [];
  }
  if (!Array.isArray(quotes) || quotes.length === 0) return;

  let i = 0;
  const setQuote = (idx) => {
    const q = String(quotes[idx] ?? "").trim();
    if (!q) return;
    el.textContent = "“" + q + "”";
  };

  setQuote(0);

  const t = setInterval(() => {
    i = (i + 1) % quotes.length;
    setQuote(i);
  }, interval);

  window.addEventListener(
    "beforeunload",
    () => {
      try {
        clearInterval(t);
      } catch (_) {}
    },
    { once: true }
  );
}

// ============================================================
// ✅ Newsletter/Form (temporal)
// ============================================================
function initNewsletterForm() {
  const form = qs(".newsForm");
  if (!form) return;

  if (form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    try {
      const first = (qs("#nfFirst")?.value || "").trim();
      const last = (qs("#nfLast")?.value || "").trim();
      const email = (qs("#nfEmail")?.value || "").trim();
      const msg = (qs("#nfMsg")?.value || "").trim();

      if (!first || !last || !email || !msg) {
        toast("Faltan datos", "Completá todos los campos para enviar el mensaje.");
        return;
      }

      toast("Enviado", "¡Gracias! Pronto te contactamos.");
      form.reset();
    } catch (_) {
      toast("Error", "No se pudo enviar. Intentá de nuevo.");
    }
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

/* ✅ extra: formato “VIERNES 4 ABRIL” si existe fecha */
function getHeroDayLabel(ev) {
  // tu data actual no trae weekday/day/month en hero,
  // pero usamos el 1er label de dates como fallback.
  // Ej: "Viernes 4 Abril • 19:00"
  const first = String(ev?.dates?.[0] || "").trim();
  if (!first) return "PRÓXIMA FECHA";
  return first.toUpperCase();
}

function renderEmptyState() {
  if (!slidesEl) return;

  const heroImg = getDefaultHero();
  slidesEl.innerHTML = `
    <article class="slide" style="--bgimg:url('${safeCssUrl(heroImg)}')">
      <div class="container heroCard">
        <div class="heroInnerPanel">
          <div class="heroRow">
            <div class="heroLeft">
              <h1 class="heroTitle heroTitle--wix">NO HAY EVENTOS</h1>
            </div>
            <div class="heroRight">
              <div class="heroInfoPanel">
                <div class="heroTag">PRONTO</div>
                <div class="heroTag">NUEVAS FECHAS</div>
                <a class="heroPanelBtn" href="#proximos">VER EVENTOS</a>
              </div>
            </div>
          </div>
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

    // Panel derecho: bloques negros (como Wix)
    const labelA = getHeroDayLabel(ev); // ejemplo: VIERNES 4 ABRIL
    const labelB = String(ev?.timeRange || "").trim().toUpperCase() || "19:00";
    const labelC = String(ev?.location || "").trim().toUpperCase() || "COSTA RICA";

    slide.innerHTML = `
      <div class="container heroCard">
        <div class="heroInnerPanel">

          <div class="heroRow">
            <!-- ✅ LEFT -->
            <div class="heroLeft">
              <div class="heroMeta">
                <span class="pill">${escapeHtml(soldOut ? "AGOTADO" : (ev.type || "EXPERIENCIA"))}</span>
              </div>

              <h1 class="heroTitle heroTitle--wix">${escapeHtml(ev.title)}</h1>
              <p class="heroDesc heroDesc--wix">${escapeHtml(ev.desc)}</p>
            </div>

            <!-- ✅ RIGHT panel -->
            <div class="heroRight">
              <div class="heroInfoPanel" role="group" aria-label="Información del evento">
                <div class="heroTag">${escapeHtml(labelA)}</div>
                <div class="heroTag">${escapeHtml(labelB)}</div>
                <div class="heroTag">${escapeHtml(labelC)}</div>

                <button class="heroPanelBtn" data-action="register" data-id="${ev.id}"
                  ${soldOut ? "disabled style='opacity:.55'" : ""}>
                  ENTRADAS
                </button>
              </div>
            </div>
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
  [...dotsEl.children].forEach((d, i) =>
    d.setAttribute("aria-current", i === idx)
  );
}

function goTo(next, user) {
  if (!EVENTS.length) return;
  idx = (next + EVENTS.length) % EVENTS.length;
  updateTransform();
  if (user) restartAuto();
}

function restartAuto() {
  clearInterval(autoTimer);
  if (EVENTS.length <= 1) return;
  autoTimer = setInterval(() => goTo(idx + 1), AUTO_MS);
}

// ============================================================
// Months + Grid
// ============================================================
const monthAnchors = qs("#monthAnchors");
const monthGrid = qs("#monthGrid");
let activeMonth = null;

function getThreeMonthWindow() {
  return window.ECN?.getMonths3
    ? ECN.getMonths3(new Date())
    : ["ENERO", "FEBRERO", "MARZO"];
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
    monthGrid.innerHTML = `<div class="emptyMonth">No hay eventos para <b>${escapeHtml(
      activeMonth
    )}</b>.</div>`;
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
async function refreshFromSupabase() {
  EVENTS = await fetchEventsFromSupabase();
  renderSlides();
  restartAuto();
  renderMonths();
}

// Hook opcional
window.addEventListener("ecn:events-updated", () => {
  refreshFromSupabase().catch(() => {});
});

// ============================================================
// Init (SIN flash)
// ============================================================
(async function init() {
  setLoading(true);

  try {
    await refreshFromSupabase();
  } finally {
    setLoading(false);
  }

  renderHomeGalleryPreview().catch(() => {});
  initQuoteRotator();
  initNewsletterForm();

  setTimeout(() => toast("Bienvenido", "Revisá los próximos eventos."), 800);
})();

// Siempre iniciar arriba al cargar/recargar
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
window.addEventListener("load", () => {
  window.scrollTo(0, 0);
});
