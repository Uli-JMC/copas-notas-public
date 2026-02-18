"use strict";

/* ============================================================
   home.js ✅ PRO (Carrusel tipo Wix: título izquierda + panel derecha)
   - ✅ estructura heroRow: Left(title) + Right(info panel)
   - ✅ panel blanco con bloques negros
   - ✅ SIN flecha
   - ✅ mantiene tu supabase events + dates + gallery + newsletter
   - ✅ FIX 2026-02: Drawer toggle visible (X) + navegación sin flash
   - ✅ Quote rotator: animación moderna + altura estable (CSS)
   - ✅ PATCH 2026-02: Resumen por mes en LISTADO PRO (sin foto, botones derecha)

   ✅ PATCH 2026-02-08: Estados por FECHA (finalizado vs agotado)
   - FINALIZADO (verde) cuando la ÚLTIMA fecha terminó (ends_at efectivo < now)
   - AGOTADO solo cuando hay fechas vigentes pero cupos=0
   - Botones bloqueados si FINALIZADO o AGOTADO
   - Si ends_at es null: se calcula con start_at + duration_hours

   ✅ PATCH 2026-02-14: DB schema rename
   - events.desc  -> events.description

   ✅ PATCH 2026-02-14: HERO MOBILE CTAs
   - Agrega .heroMobileActions dentro de .heroLeft (Inscribirme + Ver más)
   - Respeta finalized/soldOut (usa goRegister + toast)

   ✅ PATCH 2026-02-14: Scroll reveal (animación al bajar)
   - Aplica .reveal a secciones/items (sin romper nada)
   - IntersectionObserver + fallback
   - Respeta prefers-reduced-motion

   ✅ PATCH 2026-02-14: FORCE TOP ON HOME
   - Quita hash (#proximos etc.) al cargar
   - Desactiva scrollRestoration
   - Fuerza scrollTo(0,0) temprano + RAF + load

   ✅ PATCH 2026-02-15: HERO VIDEO (desde media_items)
   - media_items folder: event_video
   - Soporta video de fondo por slide (autoplay muted loop playsinline)
   - Mantiene --bgimg como fallback (no rompe CSS existente)

   ✅ PATCH 2026-02-15.1: HERO VIDEO PERF
   - Solo reproduce el video del slide activo
   - Pausa los demás para ahorrar CPU/batería
   - Pausa cuando la pestaña no está visible

   ✅ PATCH 2026-02-15.2: HERO VIDEO PLAY FIX
   - NO resetea currentTime al pausar (Safari/iOS bug)
   - Fuerza muted/playsinline por JS antes de play()
   - Retry con canplay si play() falla
   - guessVideoMime ignora query/hash

   ✅ PATCH 2026-02-18: MEDIA_ITEMS (alineado a cambios actuales)
   - events ya NO requiere img ni video_url (evita 400)
   - Hero image por evento viene de media_items:
     folders: event_img_desktop | event_img_mobile
   - Hero video por evento viene de media_items:
     folder: event_video
============================================================ */

// ============================================================
// ✅ FORCE TOP ON HOME (evita que cargue en #proximos)
// ============================================================
(function forceTopOnHome() {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    if (location.hash && location.hash.length > 1) {
      history.replaceState(null, "", location.pathname + location.search);
    }

    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));

    window.addEventListener(
      "load",
      () => {
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo(0, 0), 60);
      },
      { once: true }
    );
  } catch (_) {}
})();

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

function safeAttr(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const qs = (sel) => document.querySelector(sel);

function nowMs() {
  return Date.now();
}

function toMs(v) {
  const s = String(v || "").trim();
  if (!s) return NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

function addHoursMs(startMs, hours) {
  const h = Number(hours || 0);
  if (!Number.isFinite(startMs) || !Number.isFinite(h) || h <= 0) return NaN;
  return startMs + h * 60 * 60 * 1000;
}

function fmtShortDate(iso) {
  try {
    const d = new Date(String(iso));
    if (isNaN(d.getTime())) return "";
    return d
      .toLocaleDateString("es-CR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(".", "");
  } catch (_) {
    return "";
  }
}

// ============================================================
// Loading gate
// ============================================================
function setLoading(on) {
  try {
    document.body.classList.toggle("is-loading", !!on);
    const loader = qs("#pageLoader");
    if (loader) loader.setAttribute("aria-hidden", on ? "false" : "true");
  } catch (_) {}
}

// ============================================================
// Imagen / video helpers
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

function normalizeVideoUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;

  const [pathPart, rest] = raw.split(/(?=[?#])/);
  let p = pathPart.replaceAll("\\", "/");

  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) return p + (rest || "");
  if (p.startsWith("assets/")) return "/" + p + (rest || "");

  return "/assets/" + p + (rest || "");
}

function safeCssUrl(url) {
  return String(url ?? "")
    .replaceAll("'", "%27")
    .replaceAll('"', "%22")
    .replaceAll(")", "%29")
    .trim();
}

function guessVideoMime(url) {
  const u = String(url || "").toLowerCase().split("?")[0].split("#")[0];
  if (u.endsWith(".webm")) return "video/webm";
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".mov")) return "video/quicktime";
  return "";
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
// Nav helpers
// ============================================================
function goEvent(id, finalized) {
  if (finalized) {
    toast("Evento finalizado", "Este evento ya terminó.");
    return;
  }
  window.location.href = `./event.html?event=${encodeURIComponent(id)}`;
}

function goRegister(id, soldOut, finalized) {
  if (finalized) {
    toast("Evento finalizado", "Esta fecha ya terminó. Pronto publicaremos nuevas experiencias.");
    return;
  }
  if (soldOut) {
    toast("Evento agotado", "Este evento no tiene cupos disponibles.");
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

  const fabOrig = {
    position: fab.style.position || "",
    top: fab.style.top || "",
    right: fab.style.right || "",
    left: fab.style.left || "",
    zIndex: fab.style.zIndex || "",
  };

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
      fab.style.position = fabOrig.position;
      fab.style.top = fabOrig.top;
      fab.style.right = fabOrig.right;
      fab.style.left = fabOrig.left;
      fab.style.zIndex = fabOrig.zIndex;
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

  const toggleDrawer = () => {
    if (isOpen) closeDrawer();
    else openDrawer();
  };

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
// ✅ Scroll reveal
// ============================================================
function initScrollReveal() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch (_) {}

  const selectors = ["section", ".heroCard", ".eventRow", ".serviceCard", ".galleryGrid > *", ".footerWide", ".newsWrap"];

  const found = new Set();

  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (!el || el.classList.contains("reveal")) return;
      if (el.closest(".siteHeader") || el.id === "mobileDrawer" || el.id === "drawerBackdrop") return;
      el.classList.add("reveal");
      found.add(el);
    });
  });

  document.querySelectorAll("#monthAnchors a, #monthAnchors .monthBtn").forEach((el) => {
    if (!el || el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    found.add(el);
  });

  const items = Array.from(found);
  if (!items.length) return;

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          if (!ent.isIntersecting) return;
          ent.target.classList.add("is-in");
          io.unobserve(ent.target);
        });
      },
      { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );

    items.forEach((el) => io.observe(el));
    return;
  }

  items.forEach((el) => el.classList.add("is-in"));
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

function computeEventStatus(dates, durationHours) {
  const now = nowMs();

  const parsed = (Array.isArray(dates) ? dates : []).map((d) => {
    const startMs = toMs(d.start_at);
    const endDirect = toMs(d.ends_at);
    const endMs = Number.isFinite(endDirect) ? endDirect : addHoursMs(startMs, durationHours);

    const ended = Number.isFinite(endMs) ? endMs < now : false;
    const upcomingOrLive = Number.isFinite(endMs) ? endMs >= now : true;

    return {
      id: d.id,
      label: String(d.label || "").trim(),
      seats_available: Number(d.seats_available ?? 0),
      seats_total: Number(d.seats_total ?? 0),
      startMs,
      endMs,
      ended,
      upcomingOrLive,
    };
  });

  if (!parsed.length) {
    return { finalized: false, soldOut: false, seatsUpcoming: 0, nextLabel: "", nextIso: "" };
  }

  const ends = parsed.map((x) => x.endMs).filter((x) => Number.isFinite(x));
  const canJudgeFinal = ends.length === parsed.length;
  const maxEnd = ends.length ? Math.max(...ends) : NaN;
  const finalized = canJudgeFinal && Number.isFinite(maxEnd) && maxEnd < now;

  const viable = parsed
    .filter((x) => x.upcomingOrLive && !x.ended)
    .slice()
    .sort((a, b) => {
      const sa = Number.isFinite(a.startMs) ? a.startMs : Infinity;
      const sb = Number.isFinite(b.startMs) ? b.startMs : Infinity;
      return sa - sb;
    });

  const next = viable[0] || null;

  const seatsUpcoming = viable.reduce((acc, x) => acc + (Number(x.seats_available) || 0), 0);
  const hasUpcoming = viable.length > 0;
  const soldOut = !finalized && hasUpcoming && seatsUpcoming <= 0;

  let nextLabel = next ? next.label : "";
  let nextIso = "";
  if (next && Number.isFinite(next.startMs)) nextIso = new Date(next.startMs).toISOString();

  if (!nextLabel) {
    const last = parsed
      .slice()
      .sort((a, b) => {
        const ea = Number.isFinite(a.endMs) ? a.endMs : Number.isFinite(a.startMs) ? a.startMs : -Infinity;
        const eb = Number.isFinite(b.endMs) ? b.endMs : Number.isFinite(b.startMs) ? b.startMs : -Infinity;
        return ea - eb;
      })
      .pop();
    nextLabel = last?.label || "";
    if (last && Number.isFinite(last.startMs)) nextIso = new Date(last.startMs).toISOString();
  }

  return { finalized, soldOut, seatsUpcoming, nextLabel, nextIso };
}

/**
 * ✅ MEDIA_ITEMS helper: trae imágenes + video por evento
 * folders:
 * - event_img_desktop
 * - event_img_mobile
 * - event_video
 */
async function fetchEventMediaMap(eventIds) {
  const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
  if (!ids.length) return new Map();

  try {
    const res = await APP.supabase
      .from("media_items")
      .select("event_id,folder,public_url,path")
      .eq("target", "event")
      .in("event_id", ids)
      .in("folder", ["event_img_desktop", "event_img_mobile", "event_video"]);

    if (res.error) {
      console.warn("[home] media_items error:", res.error);
      return new Map();
    }

    const map = new Map(); // key: `${event_id}:${folder}` -> url
    (Array.isArray(res.data) ? res.data : []).forEach((r) => {
      const eid = r?.event_id;
      const folder = String(r?.folder || "").trim();
      const url = String(r?.public_url || r?.path || "").trim();
      if (!eid || !folder || !url) return;
      map.set(`${eid}:${folder}`, url);
    });

    return map;
  } catch (e) {
    console.warn("[home] media_items fetch failed:", e);
    return new Map();
  }
}

async function fetchEventsFromSupabase() {
  if (!hasSupabase()) {
    hardFail("APP.supabase no está listo. Revisá el orden: supabase-js CDN -> supabaseClient.js -> home.js");
    return [];
  }

  // ✅ events: solo columnas existentes (evita 400)
  const evRes = await APP.supabase
    .from("events")
    .select("id,title,type,month_key,description,location,time_range,duration_hours,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (evRes.error) {
    console.error(evRes.error);
    toast("Error", "No se pudieron cargar los eventos.");
    return [];
  }

  const events = Array.isArray(evRes.data) ? evRes.data : [];
  if (!events.length) return [];

  const datesRes = await APP.supabase
    .from("event_dates")
    .select("id,event_id,label,seats_total,seats_available,created_at,start_at,ends_at")
    .order("start_at", { ascending: true })
    .limit(1200);

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
      start_at: d?.start_at ?? null,
      ends_at: d?.ends_at ?? null,
      created_at: d?.created_at ?? null,
    });
  });

  // ✅ MEDIA_ITEMS: mapa de imágenes + video por evento
  const ids = events.map((e) => e.id).filter(Boolean);
  const mediaMap = await fetchEventMediaMap(ids);

  return events.map((ev) => {
    const evDates = byEvent.get(ev.id) || [];
    const status = computeEventStatus(evDates, ev?.duration_hours);
    const labels = evDates.map((x) => x.label).filter(Boolean);

    const desktop = mediaMap.get(`${ev.id}:event_img_desktop`) || "";
    const mobile = mediaMap.get(`${ev.id}:event_img_mobile`) || "";
    const heroImg = normalizeImgPath(desktop || mobile || "/assets/img/hero-1.jpg");

    const vraw = mediaMap.get(`${ev.id}:event_video`) || "";
    const videoUrl = normalizeVideoUrl(vraw);

    return {
      id: ev?.id || "",
      type: ev?.type || "Experiencia",
      monthKey: String(ev?.month_key || "—").toUpperCase(),
      dates: labels,
      nextDateLabel: status.nextLabel || "",
      nextDateISO: status.nextIso || "",
      title: ev?.title || "Evento",
      desc: ev?.description || "",
      img: heroImg,
      videoUrl, // ✅ ahora sí viene desde media_items
      location: ev?.location || "",
      timeRange: ev?.time_range || "",
      durationHours: ev?.duration_hours || "",
      finalized: !!status.finalized,
      soldOut: !!status.soldOut,
      seatsUpcoming: Number(status.seatsUpcoming || 0),
    };
  });
}

// ============================================================
// ✅ GALERÍA HOME PREVIEW
// ============================================================
async function fetchGalleryPreview(limit = 8) {
  if (!hasSupabase()) return [];

  const sel = "id,type,name,tags,image_url,image_path,created_at,target";
  const res = await APP.supabase.from("gallery_items").select(sel).order("created_at", { ascending: false }).limit(limit);

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
      if (!tags.length) tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
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

  try {
    requestAnimationFrame(() => initScrollReveal());
  } catch (_) {}
}

// ============================================================
// ✅ Quote rotator
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

  quotes = Array.isArray(quotes) ? quotes.map((q) => String(q || "").trim()).filter(Boolean) : [];
  if (!quotes.length) return;

  let i = 0;

  const setQuote = (idx0) => {
    const q = quotes[idx0];
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

// ✅ Control de videos para performance
function pauseAllHeroVideos() {
  if (!slidesEl) return;
  slidesEl.querySelectorAll("video.heroBgVideo").forEach((v) => {
    try {
      v.pause();
    } catch (_) {}
  });
}

function playActiveHeroVideo() {
  if (!slidesEl) return;
  const slide = slidesEl.children?.[idx];
  if (!slide) return;

  const v = slide.querySelector("video.heroBgVideo");
  if (!v) return;

  try {
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");

    if (v.readyState < 2) {
      v.preload = "metadata";
      try {
        v.load();
      } catch (_) {}
    }

    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        const once = () => {
          v.removeEventListener("canplay", once);
          try {
            v.play().catch(() => {});
          } catch (_) {}
        };
        v.addEventListener("canplay", once, { once: true });
      });
    }
  } catch (_) {}
}

function syncHeroVideos() {
  pauseAllHeroVideos();
  playActiveHeroVideo();
}

document.addEventListener("visibilitychange", () => {
  try {
    if (document.hidden) pauseAllHeroVideos();
    else playActiveHeroVideo();
  } catch (_) {}
});

function getDefaultHero() {
  try {
    const media = window.ECN?.getMedia?.();
    return normalizeImgPath(media?.defaultHero || "/assets/img/hero-1.jpg");
  } catch {
    return "/assets/img/hero-1.jpg";
  }
}

function getHeroDayLabel(ev) {
  const label = String(ev?.nextDateLabel || "").trim();
  if (label) return label.toUpperCase();

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
              <p class="heroDesc heroDesc--wix">Muy pronto publicaremos nuevas experiencias.</p>

              <div class="heroMobileActions">
                <a class="btn primary" href="#proximos">Ver más</a>
                <a class="btn" href="./gallery.html">Galería</a>
              </div>
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
    const finalized = !!ev.finalized;
    const soldOut = !!ev.soldOut;
    const blocked = finalized || soldOut;

    const slide = document.createElement("article");
    slide.className = "slide";

    const bgImg = ev.img || getDefaultHero();
    slide.style.setProperty("--bgimg", `url('${safeCssUrl(bgImg)}')`);

    const labelA = getHeroDayLabel(ev);
    const labelB = String(ev?.timeRange || "").trim().toUpperCase() || "19:00";
    const labelC = String(ev?.location || "").trim().toUpperCase() || "COSTA RICA";

    const statusPill = finalized
      ? `<span class="pill pill--success">FINALIZADO</span>`
      : soldOut
      ? `<span class="pill pill--danger">AGOTADO</span>`
      : "";

    const ctaText = finalized ? "EVENTO FINALIZADO" : soldOut ? "AGOTADO" : "INSCRIBIRME";

    const mobilePrimaryText = finalized ? "Finalizado" : soldOut ? "Agotado" : "Inscribirme";
    const mobilePrimaryClass = finalized ? "btn--success" : soldOut ? "btn--danger" : "";
    const mobilePrimaryDisabled = blocked ? "aria-disabled='true'" : "";

    // ✅ HERO VIDEO (opcional) — desde media_items (event_video)
    const v = String(ev?.videoUrl || "").trim();
    const mime = v ? guessVideoMime(v) : "";
    const videoHtml = v
      ? `
        <video class="heroBgVideo" autoplay muted loop playsinline preload="metadata" poster="${safeAttr(bgImg)}">
          <source src="${safeAttr(v)}" ${mime ? `type="${mime}"` : ""} />
        </video>
      `
      : "";

    slide.innerHTML = `
      ${videoHtml}
      <div class="container heroCard">
        <div class="heroInnerPanel">
          <div class="heroRow">

            <div class="heroLeft">
              <div class="heroMeta">
                <span class="pill">${escapeHtml(ev.type || "EXPERIENCIA")}</span>
                ${statusPill}
              </div>

              <h1 class="heroTitle heroTitle--wix">${escapeHtml(ev.title)}</h1>
              <p class="heroDesc heroDesc--wix">${escapeHtml(ev.desc)}</p>

              <div class="heroMobileActions">
                <button class="btn primary ${mobilePrimaryClass}" data-action="register" data-id="${ev.id}" ${mobilePrimaryDisabled}>
                  ${escapeHtml(mobilePrimaryText)}
                </button>
                <a class="btn" href="#proximos">Ver más</a>
              </div>
            </div>

            <div class="heroRight">
              <div class="heroInfoPanel" role="group" aria-label="Información del evento">
                <div class="heroTag">${escapeHtml(labelA)}</div>
                <div class="heroTag">${escapeHtml(labelB)}</div>
                <div class="heroTag">${escapeHtml(labelC)}</div>

                <button class="heroPanelBtn ${finalized ? "btn--success" : soldOut ? "btn--danger" : ""}"
                  data-action="register" data-id="${ev.id}"
                  ${blocked ? "disabled" : ""}>
                  ${escapeHtml(ctaText)}
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

  try {
    requestAnimationFrame(() => {
      syncHeroVideos();
      initScrollReveal();
    });
  } catch (_) {}
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
  syncHeroVideos();
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

  try {
    requestAnimationFrame(() => initScrollReveal());
  } catch (_) {}
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
    const finalized = !!ev.finalized;
    const soldOut = !!ev.soldOut;
    const blocked = finalized || soldOut;

    const dateLabel = String(ev?.nextDateLabel || ev?.dates?.[0] || "").trim() || "Por definir";
    const place = String(ev?.location || "").trim() || "Costa Rica";
    const time = String(ev?.timeRange || "").trim() || "Horario por definir";

    const row = document.createElement("div");
    row.className = "eventRow" + (blocked ? " isSoldOut" : "");
    row.setAttribute("role", "listitem");

    const statusPill = finalized
      ? `<span class="eventPill eventPill--success">FINALIZADO</span>`
      : soldOut
      ? `<span class="eventPill eventPill--danger">AGOTADO</span>`
      : "";

    const regText = finalized ? "Finalizado" : soldOut ? "Agotado" : "Inscribirme";
    const regClass = finalized ? "btn--success" : soldOut ? "btn--danger" : "";

    row.innerHTML = `
      <div class="eventRowMain">
        <div class="eventRowLeft">
          <div class="eventRowTop">
            <span class="eventPill">${escapeHtml(ev.type || "Experiencia")}</span>
            ${statusPill}
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
          <button class="btn" data-action="info" data-id="${ev.id}"
            ${finalized ? "disabled" : ""}>
            Más info
          </button>

          <button class="btn primary inviteBlack ${regClass}" data-action="register" data-id="${ev.id}"
            ${blocked ? "disabled" : ""}>
            ${escapeHtml(regText)}
          </button>
        </div>
      </div>
    `;

    monthGrid.appendChild(row);
  });

  try {
    requestAnimationFrame(() => initScrollReveal());
  } catch (_) {}
}

// ============================================================
// Delegation
// ============================================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  if (btn.getAttribute("aria-disabled") === "true") {
    e.preventDefault();
    return;
  }

  const id = btn.dataset.id || "";
  const ev = EVENTS.find((x) => x.id === id);
  if (!ev) return;

  const finalized = !!ev.finalized;
  const soldOut = !!ev.soldOut;

  if (btn.dataset.action === "info") {
    goEvent(ev.id, finalized);
    return;
  }

  if (btn.dataset.action === "register") {
    goRegister(ev.id, soldOut, finalized);
    return;
  }
});

// ============================================================
// Refresh
// ============================================================
async function refreshFromSupabase() {
  EVENTS = await fetchEventsFromSupabase();
  renderSlides();
  restartAuto();
  renderMonths();

  try {
    requestAnimationFrame(() => syncHeroVideos());
  } catch (_) {}
}

window.addEventListener("ecn:events-updated", () => {
  refreshFromSupabase().catch(() => {});
});

// ============================================================
// Init
// ============================================================
(async function init() {
  setLoading(true);

  try {
    initMobileDrawer();
    initScrollReveal();
    await refreshFromSupabase();
  } finally {
    setLoading(false);
  }

  renderHomeGalleryPreview().catch(() => {});
  initQuoteRotator();
  initNewsletterForm();

  try {
    setTimeout(() => initScrollReveal(), 60);
  } catch (_) {}

  try {
    setTimeout(() => syncHeroVideos(), 120);
  } catch (_) {}

  setTimeout(() => toast("Bienvenido", "Revisá los próximos eventos."), 800);
})();
