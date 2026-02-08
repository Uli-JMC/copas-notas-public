"use strict";

/* ============================================================
   home.js ✅ PRO (Carrusel tipo Wix: título izquierda + panel derecha)
   - ✅ Estado correcto: FINALIZADO vs AGOTADO
   - ✅ FINALIZADO: ends_at < now (fallback start_at + duration_hours)
   - ✅ AGOTADO: seats_available <= 0 (solo si NO finalizado)
   - ✅ Botones bloqueados SOLO en finalizado o agotado
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

function nowMs() {
  return Date.now();
}

function toMs(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

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

function goRegister(id, lockedReason) {
  if (lockedReason === "finalizado") {
    toast("Evento finalizado", "Este evento ya terminó.");
    return;
  }
  if (lockedReason === "agotado") {
    toast("Evento agotado", "Este evento no tiene cupos.");
    return;
  }
  window.location.href = `./register.html?event=${encodeURIComponent(id)}`;
}

// ============================================================
// ✅ Drawer / Mobile Menu
// ============================================================
function initMobileDrawer() {
  if (document.documentElement.dataset.drawerBound === "true") return;
  document.documentElement.dataset.drawerBound = "true";

  const fab0 = document.getElementById("hamburgerFab");
  const drawer = document.getElementById("mobileDrawer");
  const backdrop0 = document.getElementById("drawerBackdrop");
  if (!fab0 || !drawer || !backdrop0) return;

  const fab = fab0.cloneNode(true);
  fab0.parentNode.replaceChild(fab, fab0);

  const backdrop = backdrop0.cloneNode(true);
  backdrop0.parentNode.replaceChild(backdrop, backdrop0);

  let isOpen = false;

  const spans = Array.from(fab.querySelectorAll("span"));
  const spanOrigBg = spans.map((s) => s.style.backgroundColor || "");

  const lockScroll = (on) => {
    document.documentElement.style.overflow = on ? "hidden" : "";
    document.body.style.overflow = on ? "hidden" : "";
  };

  const setFabOverDrawer = (on) => {
    if (on) {
      fab.style.position = "fixed";
      fab.style.top = "14px";
      fab.style.right = "14px";
      fab.style.left = "";
      fab.style.zIndex = "2000";
      spans.forEach((s) => (s.style.backgroundColor = "#fff"));
    } else {
      fab.style.position = "";
      fab.style.top = "";
      fab.style.right = "";
      fab.style.left = "";
      fab.style.zIndex = "";
      spans.forEach((s, i) => (s.style.backgroundColor = spanOrigBg[i] || ""));
    }
  };

  const openDrawer = () => {
    if (isOpen) return;
    isOpen = true;
    backdrop.hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    fab.setAttribute("aria-label", "Cerrar menú");
    setFabOverDrawer(true);
    lockScroll(true);
  };

  const closeDrawer = (opts = {}) => {
    const keepBackdrop = !!opts.keepBackdrop;
    const keepScroll = !!opts.keepScroll;
    if (!isOpen) return;
    isOpen = false;

    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-label", "Abrir menú");

    if (!keepScroll) lockScroll(false);
    setFabOverDrawer(false);

    if (!keepBackdrop) {
      setTimeout(() => {
        backdrop.hidden = true;
      }, 260);
    }
  };

  const toggleDrawer = () => (isOpen ? closeDrawer() : openDrawer());

  fab.addEventListener("click", toggleDrawer);
  backdrop.addEventListener("click", () => closeDrawer());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  drawer.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;

    const href = a.getAttribute("href") || "";
    if (!href) return;

    if (href.startsWith("#")) {
      e.preventDefault();
      closeDrawer();
      setTimeout(() => {
        try {
          const target = document.querySelector(href);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", href);
        } catch (_) {}
      }, 280);
      return;
    }

    e.preventDefault();
    closeDrawer({ keepBackdrop: true, keepScroll: true });
    setTimeout(() => {
      window.location.href = href;
    }, 220);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900 && isOpen) closeDrawer();
  });
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

/**
 * ✅ Estado de un evento (finalizado / agotado / activo)
 * - finalizado si: ends_at < now
 * - fallback si ends_at null: start_at + duration_hours
 * - agotado si: NO finalizado y seats_available_total <= 0
 */
function computeEventState(ev, evDates) {
  const now = nowMs();

  // 1) buscamos el "mejor" end: el mayor ends_at válido
  const endCandidates = (evDates || [])
    .map((d) => toMs(d?.ends_at))
    .filter((x) => Number.isFinite(x));

  let bestEnd = endCandidates.length ? Math.max(...endCandidates) : NaN;

  // 2) fallback: si no hay ends_at, usamos start_at + duration_hours (si existe)
  if (!Number.isFinite(bestEnd)) {
    const startCandidates = (evDates || [])
      .map((d) => toMs(d?.start_at))
      .filter((x) => Number.isFinite(x));

    const bestStart = startCandidates.length ? Math.max(...startCandidates) : NaN;

    const dh = Number(ev?.durationHours ?? ev?.duration_hours ?? 0);
    const durMs = Number.isFinite(dh) && dh > 0 ? dh * 60 * 60 * 1000 : NaN;

    if (Number.isFinite(bestStart) && Number.isFinite(durMs)) {
      bestEnd = bestStart + durMs;
    }
  }

  const isFinished = Number.isFinite(bestEnd) ? bestEnd < now : false;

  const seatsAvailableTotal = (evDates || []).reduce(
    (acc, d) => acc + (Number(d?.seats_available ?? 0) || 0),
    0
  );

  const isSoldOut = !isFinished && seatsAvailableTotal <= 0;

  // lockedReason: null | "finalizado" | "agotado"
  const lockedReason = isFinished ? "finalizado" : isSoldOut ? "agotado" : null;

  return {
    isFinished,
    isSoldOut,
    lockedReason,
    seatsAvailableTotal,
  };
}

async function fetchEventsFromSupabase() {
  if (!hasSupabase()) {
    hardFail(
      "APP.supabase no está listo. Revisá el orden: supabase-js CDN -> supabaseClient.js -> home.js"
    );
    return [];
  }

  // 1) Traer eventos (incluimos duration_hours para fallback)
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

  // 2) Traer fechas (incluimos start_at y ends_at ✅)
  const datesRes = await APP.supabase
    .from("event_dates")
    .select("id,event_id,label,seats_total,seats_available,created_at,start_at,ends_at")
    .order("start_at", { ascending: true });

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
      start_at: d?.start_at || null,
      ends_at: d?.ends_at || null,
      created_at: d?.created_at || null,
    });
  });

  // 3) map para UI
  return events.map((ev) => {
    const evDates = byEvent.get(ev.id) || [];
    const labels = evDates.map((x) => x.label).filter(Boolean);

    const state = computeEventState(
      { durationHours: ev?.duration_hours },
      evDates
    );

    return {
      id: ev?.id || "",
      type: ev?.type || "Experiencia",
      monthKey: String(ev?.month_key || "—").toUpperCase(),
      dates: labels,
      title: ev?.title || "Evento",
      desc: ev?.desc || "",
      img: normalizeImgPath(ev?.img),
      location: ev?.location || "",
      timeRange: ev?.time_range || "",
      durationHours: ev?.duration_hours || "",
      // estado
      isFinished: state.isFinished,
      isSoldOut: state.isSoldOut,
      lockedReason: state.lockedReason,
      seatsAvailableTotal: state.seatsAvailableTotal,
      _datesRaw: evDates,
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
  interval = Math.max(2800, interval);

  let quotes = [];
  try {
    quotes = JSON.parse(raw);
  } catch (_) {
    quotes = [];
  }

  quotes = Array.isArray(quotes)
    ? quotes.map((q) => String(q || "").trim()).filter(Boolean)
    : [];
  if (!quotes.length) return;

  let i = 0;

  const setQuote = (idx) => {
    const q = quotes[idx];
    if (!q) return;

    el.classList.remove("is-anim");
    void el.offsetWidth;
    el.textContent = "“" + q + "”";
    el.classList.add("is-anim");
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

function getHeroDayLabel(ev) {
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

function heroStatusLabel(ev) {
  if (ev.isFinished) return "FINALIZADO";
  if (ev.isSoldOut) return "AGOTADO";
  return (ev.type || "EXPERIENCIA");
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
    const labelA = getHeroDayLabel(ev);
    const labelB = String(ev?.timeRange || "").trim().toUpperCase() || "19:00";
    const labelC = String(ev?.location || "").trim().toUpperCase() || "COSTA RICA";

    const status = heroStatusLabel(ev);
    const pillClass =
      ev.isFinished ? "pill pill--ok" :
      ev.isSoldOut ? "pill pill--danger" :
      "pill";

    const btnDisabled = ev.isFinished || ev.isSoldOut;

    const slide = document.createElement("article");
    slide.className = "slide";
    slide.style.setProperty("--bgimg", `url('${safeCssUrl(ev.img || getDefaultHero())}')`);

    slide.innerHTML = `
      <div class="container heroCard">
        <div class="heroInnerPanel">
          <div class="heroRow">
            <div class="heroLeft">
              <div class="heroMeta">
                <span class="${pillClass}">${escapeHtml(status)}</span>
              </div>

              <h1 class="heroTitle heroTitle--wix">${escapeHtml(ev.title)}</h1>
              <p class="heroDesc heroDesc--wix">${escapeHtml(ev.desc)}</p>
            </div>

            <div class="heroRight">
              <div class="heroInfoPanel" role="group" aria-label="Información del evento">
                <div class="heroTag">${escapeHtml(labelA)}</div>
                <div class="heroTag">${escapeHtml(labelB)}</div>
                <div class="heroTag">${escapeHtml(labelC)}</div>

                <button class="heroPanelBtn" data-action="register" data-id="${ev.id}"
                  ${btnDisabled ? "disabled style='opacity:.55'" : ""}>
                  ${ev.isFinished ? "FINALIZADO" : (ev.isSoldOut ? "AGOTADO" : "INSCRIBIRME")}
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
  if (EVENTS.length <= 1) return;
  autoTimer = setInterval(() => goTo(idx + 1), AUTO_MS);
}

// ============================================================
// Months + Listado PRO
// ============================================================
const monthAnchors = qs("#monthAnchors");
const monthGrid = qs("#monthGrid");
const monthEmpty = qs("#monthEmpty");
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
  if (!monthGrid) return;

  monthGrid.innerHTML = "";

  const list = EVENTS.filter((e) => e.monthKey === activeMonth);

  if (!list.length) {
    if (monthEmpty) monthEmpty.hidden = false;
    return;
  }
  if (monthEmpty) monthEmpty.hidden = true;

  list.forEach((ev) => {
    const dateLabel = String(ev?.dates?.[0] || "").trim() || "Por definir";
    const place = String(ev?.location || "").trim() || "Costa Rica";
    const time = String(ev?.timeRange || "").trim() || "Horario por definir";

    const row = document.createElement("div");
    row.className =
      "eventRow" +
      (ev.isSoldOut ? " isSoldOut" : "") +
      (ev.isFinished ? " isFinished" : "");

    row.setAttribute("role", "listitem");

    // pills
    const pillLeft = `<span class="eventPill">${escapeHtml(ev.type || "Experiencia")}</span>`;

    const pillStatus = ev.isFinished
      ? `<span class="eventPill eventPill--ok">FINALIZADO</span>`
      : ev.isSoldOut
        ? `<span class="eventPill eventPill--danger">AGOTADO</span>`
        : "";

    const btnDisabled = ev.isFinished || ev.isSoldOut;

    row.innerHTML = `
      <div class="eventRowMain">
        <div class="eventRowLeft">
          <div class="eventRowTop">
            ${pillLeft}
            ${pillStatus}
          </div>

          <h3 class="eventRowTitle">${escapeHtml(ev.title)}</h3>

          <p class="eventRowMeta">
            ${escapeHtml(place)}
            <span class="dotSep">•</span>
            ${escapeHtml(dateLabel)}
            <span class="dotSep">•</span>
            ${escapeHtml(time)}
          </p>
        </div>

        <div class="eventRowRight">
          <button class="btn" data-action="info" data-id="${ev.id}">
            Más info
          </button>

          <button class="btn primary inviteBlack" data-action="register" data-id="${ev.id}"
            ${btnDisabled ? "disabled" : ""}>
            ${ev.isFinished ? "Finalizado" : (ev.isSoldOut ? "Agotado" : "Inscribirme")}
          </button>
        </div>
      </div>
    `;

    monthGrid.appendChild(row);
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

  if (btn.dataset.action === "info") {
    goEvent(ev.id);
    return;
  }

  if (btn.dataset.action === "register") {
    goRegister(ev.id, ev.lockedReason);
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

window.addEventListener("ecn:events-updated", () => {
  refreshFromSupabase().catch(() => {});
});

// ============================================================
// Init (SIN flash)
// ============================================================
(async function init() {
  setLoading(true);

  try {
    initMobileDrawer();
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
