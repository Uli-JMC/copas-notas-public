/* ============================================================
   gallery.js ✅ PRO (Maridajes + Cocteles) - 2026 (Supabase)
   - 1 solo JS para ambas páginas
   - Lee window.ECN_PAGE.type: "cocteles" | "maridajes" | "all"
   - Galería: Supabase (public) -> gallery_items (preferido) o promos (fallback)
   - Filtros: fecha + tipo + búsqueda (debounce)
   - Grid IG: render limpio y quita skeletons

   REVIEWS ✅ (2026-02-10):
   - Reseñas en Supabase table: public.event_reviews  ✅ cross-device
   - Sin login: ownership por token local + hash en DB (NO se expone token)
   - Editar/Borrar solo tus reseñas (token hash coincide via RPC)
   - RPCs: create_event_review, update_event_review, delete_event_review
   - Gating: solo eventos finalizados (última fecha terminó)

   Reactions:
   - Se mantienen LocalStorage (por ahora) por review.id

============================================================ */

(function () {
  "use strict";

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
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

  function nowISO() {
    return new Date().toISOString();
  }

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

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function clampStr(s, max) {
    const v = String(s || "").trim();
    if (!v) return "";
    return v.length > max ? v.slice(0, max) : v;
  }

  function safeStr(x) {
    return String(x ?? "");
  }

  function cleanSpaces(s) {
    return safeStr(s).replace(/\s+/g, " ").trim();
  }

  function isMissingTable(err) {
    const m = safeStr(err?.message || "").toLowerCase();
    return m.includes("does not exist") || (m.includes("relation") && m.includes("does not exist"));
  }

  function isRLSError(err) {
    const m = safeStr(err?.message || "").toLowerCase();
    return (
      m.includes("rls") ||
      m.includes("permission") ||
      m.includes("not allowed") ||
      m.includes("row level security") ||
      m.includes("violates row-level security")
    );
  }

  function prettyErr(err) {
    const msg = safeStr(err?.message || err || "");
    return msg || "Ocurrió un error.";
  }

  // Toasts (si existe un sistema global, lo usa; si no, fallback simple)
  function toast(msg) {
    try {
      if (window.APP && typeof APP.notify === "function") return APP.notify(msg);
    } catch (_) {}
    const box = $("#toasts");
    if (!box) return;
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "border:1px solid rgba(18,19,22,.10);background:#fff;border-radius:12px;padding:10px 12px;margin:8px;max-width:420px;";
    box.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ------------------------------------------------------------
  // Page key desde tu config  ✅ soporta "all"
  // ------------------------------------------------------------
  function getPageKey() {
    const t = window.ECN_PAGE && window.ECN_PAGE.type ? String(window.ECN_PAGE.type).toLowerCase() : "";
    if (t.includes("coct")) return "cocteles";
    if (t.includes("marid")) return "maridajes";
    if (t.includes("all")) return "all";
    return "gallery";
  }
  const pageKey = getPageKey();

  // ------------------------------------------------------------
  // Elements (Galería)
  // ------------------------------------------------------------
  const gridEl = $("#galleryGrid");
  if (!gridEl) return;

  const selDate = $("#filterDate");
  const selType = $("#filterType");
  const inpSearch = $("#filterSearch");

  // ------------------------------------------------------------
  // Elements (Reviews)
  // ------------------------------------------------------------
  const formEl = $("#reviewForm");
  const reviewEventSel = $("#reviewEvent");
  const reviewNameInp = $("#reviewName");
  const reviewTextTa = $("#reviewText");
  const reviewCountEl = $("#reviewCount");
  const reviewListEl = $("#reviewList");

  // ------------------------------------------------------------
  // Supabase availability (PUBLIC client)
  // ------------------------------------------------------------
  function sb() {
    try {
      if (window.APP && APP.publicSb) return APP.publicSb;
      if (window.APP && (APP.supabase || APP.sb)) return APP.supabase || APP.sb;
      return null;
    } catch (_) {
      return null;
    }
  }

  function hasSupabase() {
    const client = sb();
    return !!(client && typeof client.from === "function");
  }

  async function ensureSessionOptional() {
    try {
      const client = sb();
      if (!client?.auth?.getSession) return null;
      const res = await client.auth.getSession();
      return res?.data?.session || null;
    } catch (_) {
      return null;
    }
  }

  // ------------------------------------------------------------
  // Token local (sin login) + hash para ownership UI
  // - token NO se guarda en DB, solo su hash
  // ------------------------------------------------------------
  const LS_AUTH = {
    TOKEN: "ecn_author_token_v1",
  };

  function getOrCreateAuthorToken() {
    try {
      const existing = localStorage.getItem(LS_AUTH.TOKEN);
      if (existing && existing.length >= 24) return existing;
      let token = "";
      try {
        // token random fuerte (si hay crypto)
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch (_) {
        token = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
      }
      localStorage.setItem(LS_AUTH.TOKEN, token);
      return token;
    } catch (_) {
      // sin localStorage: token volatile (igual permite escribir pero ownership no persiste)
      return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    }
  }

  async function sha256Hex(str) {
    // Para comparar con author_hash (sha256 hex) sin exponer token
    try {
      if (!crypto?.subtle) return "";
      const enc = new TextEncoder();
      const data = enc.encode(String(str));
      const hash = await crypto.subtle.digest("SHA-256", data);
      const bytes = Array.from(new Uint8Array(hash));
      return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      return "";
    }
  }

  const AUTHOR_TOKEN = getOrCreateAuthorToken();
  let AUTHOR_HASH = ""; // se llena async

  // ------------------------------------------------------------
  // DB config
  // ------------------------------------------------------------
  const DB = {
    GALLERY_PRIMARY: "gallery_items",
    GALLERY_FALLBACK: "promos",
    EVENTS: "events",
    EVENT_DATES: "event_dates",
    REVIEWS: "event_reviews",
    STORAGE_BUCKET: "gallery",
  };

  // ------------------------------------------------------------
  // SELECTS
  // ------------------------------------------------------------
  const SELECT_GALLERY_BASE = `
    id,
    type,
    name,
    tags,
    image_url,
    image_path,
    created_at,
    target
  `;

  const SELECT_PROMOS_BASE = `
    id,
    type,
    title,
    name,
    tags,
    image_url,
    image_path,
    created_at,
    target
  `;

  const SELECT_REVIEWS_BASE = `
    id,
    event_id,
    author_hash,
    author_name,
    body,
    created_at,
    updated_at
  `;

  function publicUrlFromPath(path) {
    const p = safeStr(path).trim();
    if (!p) return "";
    try {
      const client = sb();
      const res = client.storage.from(DB.STORAGE_BUCKET).getPublicUrl(p);
      return res?.data?.publicUrl || "";
    } catch (_) {
      return "";
    }
  }

  function normalizeTags(x) {
    if (Array.isArray(x)) return x.map((t) => safeStr(t)).filter(Boolean).slice(0, 12);
    if (typeof x === "string" && x.trim()) {
      return x
        .split(/[,;]+/g)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
    }
    return [];
  }

  function pickDateISO(row) {
    const c = safeStr(row?.created_at || "");
    return c || "";
  }

  function normalizeGalleryRow(r) {
    const row = r || {};
    const t = String(row.type || "").toLowerCase();

    const type = t.includes("coct")
      ? "cocteles"
      : t.includes("marid")
      ? "maridajes"
      : "all";

    const title = cleanSpaces(row.name || row.title || "Evento") || "Evento";
    const createdAt = safeStr(row.created_at || "");
    const dateISO = pickDateISO(row);

    const img = safeStr(row.image_url || "") || publicUrlFromPath(row.image_path) || "";

    return {
      id: safeStr(row.id || ""),
      type,
      eventName: title,
      dateISO,
      dateLabel: dateISO ? fmtShortDate(dateISO) : "",
      img,
      tags: normalizeTags(row.tags),
      createdAt,
    };
  }

  async function fetchUsing(table, selectStr) {
    const client = sb();
    const { data, error } = await client.from(table).select(selectStr).order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function fetchGallery() {
    if (!hasSupabase()) {
      toast("Falta Supabase en esta página (revisá scripts).");
      return [];
    }

    await ensureSessionOptional();

    try {
      const rows = await fetchUsing(DB.GALLERY_PRIMARY, SELECT_GALLERY_BASE);
      return rows.map(normalizeGalleryRow).filter((x) => x.img && (!x.target || x.target === "home"));
    } catch (e1) {
      if (!isMissingTable(e1)) {
        if (isRLSError(e1)) toast("Acceso bloqueado (RLS) leyendo gallery_items.");
        else console.warn("[gallery] gallery_items base error:", e1);
      }
    }

    try {
      const rowsP = await fetchUsing(DB.GALLERY_FALLBACK, SELECT_PROMOS_BASE);
      return rowsP.map(normalizeGalleryRow).filter((x) => x.img && (!x.target || x.target === "home"));
    } catch (eP) {
      if (isMissingTable(eP)) toast("No existe tabla gallery_items ni promos.");
      else if (isRLSError(eP)) toast("Acceso bloqueado (RLS) leyendo promos.");
      else toast("No pude cargar la galería.");
      console.warn("[gallery] promos base error:", eP);
      return [];
    }
  }

  // ------------------------------------------------------------
  // ✅ Reseñas: gating por evento FINALIZADO (última fecha terminó)
  // ------------------------------------------------------------
  let REVIEW_EVENTS = [];
  let REVIEW_ELIGIBLE = new Map(); // eventId -> { eligible, reason, endedAtMs, nextEndMs }
  let EVENT_TITLE_BY_ID = new Map();

  function eventTypeMatches(pageKeyForMatch, typeText) {
    const t = norm(typeText || "");

    if (pageKeyForMatch === "all") {
      return t.includes("coct") || t.includes("vino") || t.includes("cata") || t.includes("marid");
    }
    if (pageKeyForMatch === "cocteles") return t.includes("coct");
    return t.includes("vino") || t.includes("cata") || t.includes("marid");
  }

  async function fetchEventDatesByEvent() {
    const client = sb();

    try {
      const { data, error } = await client
        .from(DB.EVENT_DATES)
        .select("id,event_id,label,start_at,ends_at,created_at")
        .order("start_at", { ascending: true })
        .limit(800);

      if (error) throw error;

      const byEvent = new Map();
      (Array.isArray(data) ? data : []).forEach((d) => {
        const eventId = safeStr(d?.event_id || "");
        const id = safeStr(d?.id || "");
        if (!eventId || !id) return;

        const label = cleanSpaces(d?.label || "") || "";
        const startAt = safeStr(d?.start_at || "");
        const endsAt = safeStr(d?.ends_at || "");
        const createdAt = safeStr(d?.created_at || "");

        if (!byEvent.has(eventId)) byEvent.set(eventId, []);
        byEvent.get(eventId).push({ id, eventId, label, startAt, endsAt, createdAt });
      });

      byEvent.forEach((arr) => {
        arr.sort((a, b) => {
          const ta = Number.isFinite(toMs(a.startAt)) ? toMs(a.startAt) : toMs(a.createdAt);
          const tb = Number.isFinite(toMs(b.startAt)) ? toMs(b.startAt) : toMs(b.createdAt);
          if (ta !== tb) return ta - tb;
          return String(a.label).localeCompare(String(b.label), "es");
        });
      });

      return byEvent;
    } catch (e) {
      console.warn("[reviews] event_dates fetch fail:", e);
      return new Map();
    }
  }

  function computeEligibilityForEvent(dates, durationHours) {
    const now = nowMs();

    const parsed = (Array.isArray(dates) ? dates : []).map((d) => {
      const startMs = toMs(d.startAt) || toMs(d.createdAt);
      const endDirect = toMs(d.endsAt);
      const endMs = Number.isFinite(endDirect) ? endDirect : addHoursMs(startMs, durationHours);
      return { ...d, startMs, endMs };
    });

    if (!parsed.length) {
      return { eligible: false, reason: "Aún no hay fechas para este evento.", endedAtMs: NaN, nextEndMs: NaN };
    }

    const ends = parsed.map((x) => x.endMs).filter((x) => Number.isFinite(x));
    const canJudgeFinal = ends.length === parsed.length;

    const future = parsed
      .filter((x) => Number.isFinite(x.endMs) && x.endMs >= now)
      .sort((a, b) => a.endMs - b.endMs);

    if (future.length) {
      return { eligible: false, reason: "Las reseñas se habilitan cuando el evento finaliza.", endedAtMs: NaN, nextEndMs: future[0].endMs };
    }

    if (!canJudgeFinal) {
      return {
        eligible: false,
        reason: "Este evento no tiene una fecha/hora válida de finalización. Configurá start_at/ends_at o duration_hours.",
        endedAtMs: NaN,
        nextEndMs: NaN,
      };
    }

    const maxEnd = Math.max(...ends);
    if (Number.isFinite(maxEnd) && maxEnd < now) {
      return { eligible: true, reason: "", endedAtMs: maxEnd, nextEndMs: NaN };
    }

    return { eligible: false, reason: "Las reseñas se habilitan cuando el evento finaliza.", endedAtMs: NaN, nextEndMs: NaN };
  }

  async function fetchEventsForSelect() {
    if (!hasSupabase()) return [];
    await ensureSessionOptional();

    const client = sb();
    const datesByEvent = await fetchEventDatesByEvent();

    try {
      const { data, error } = await client
        .from(DB.EVENTS)
        .select("id,title,type,duration_hours,created_at")
        .order("created_at", { ascending: false })
        .limit(250);

      if (error) throw error;

      const list = (Array.isArray(data) ? data : [])
        .map((ev) => {
          const id = safeStr(ev?.id || "");
          const title = cleanSpaces(ev?.title || "Evento") || "Evento";
          const type = safeStr(ev?.type || "");
          const durationHours = Number(ev?.duration_hours || 0);

          const ok = !!(id && title && eventTypeMatches(pageKey, type));

          const dates = datesByEvent.get(id) || [];
          const labels = dates.map((d) => d?.label).filter(Boolean).slice(0, 3);

          const eligibility = computeEligibilityForEvent(dates, durationHours);
          REVIEW_ELIGIBLE.set(id, eligibility);

          return {
            id,
            title,
            ok,
            dates: labels,
            eligible: !!eligibility.eligible,
            reason: eligibility.reason || "",
            nextEndMs: eligibility.nextEndMs,
          };
        })
        .filter((x) => x.ok);

      REVIEW_EVENTS = list;
      EVENT_TITLE_BY_ID = new Map(list.map((x) => [x.id, x.title]));
      return list;
    } catch (e) {
      if (isRLSError(e)) toast("Acceso bloqueado (RLS) leyendo eventos.");
      else console.warn("[reviews] fetchEventsForSelect fail:", e);
      REVIEW_EVENTS = [];
      REVIEW_ELIGIBLE = new Map();
      EVENT_TITLE_BY_ID = new Map();
      return [];
    }
  }

  async function mountReviewEventSelect() {
    if (!reviewEventSel) return;

    const placeholder = `<option value="" disabled selected>Seleccioná un evento</option>`;
    const events = await fetchEventsForSelect();

    if (!events.length) {
      reviewEventSel.innerHTML = placeholder + `<option value="" disabled>(Aún no hay eventos disponibles)</option>`;
      reviewEventSel.disabled = true;
      return;
    }

    const anyEligible = events.some((e) => e.eligible);

    const options = events
      .map((ev) => {
        const dates = ev.dates && ev.dates.length ? ` · ${ev.dates.join(" / ")}` : "";
        const label = `${ev.title}${dates}`;

        const disabled = ev.eligible ? "" : "disabled";
        let hint = "";
        if (!ev.eligible) {
          if (Number.isFinite(ev.nextEndMs)) {
            hint = ` (Disponible después de ${fmtShortDate(new Date(ev.nextEndMs).toISOString())})`;
          } else {
            hint = " (Disponible al finalizar)";
          }
        }

        return `<option value="${esc(ev.id)}" data-title="${esc(ev.title)}" data-eligible="${ev.eligible ? "1" : "0"}" ${disabled}>${esc(label + hint)}</option>`;
      })
      .join("");

    reviewEventSel.innerHTML = placeholder + options;
    reviewEventSel.disabled = !anyEligible;

    if (!anyEligible) toast("Las reseñas se habilitan cuando el evento finaliza.");
  }

  function isSelectedEventEligible(eventId) {
    const id = String(eventId || "");
    const st = REVIEW_ELIGIBLE.get(id);
    if (!st) return { eligible: false, reason: "No pude validar el evento. Recargá la página." };
    if (st.eligible) return { eligible: true, reason: "" };
    return { eligible: false, reason: st.reason || "Las reseñas se habilitan cuando el evento finaliza." };
  }

  // ------------------------------------------------------------
  // LocalStorage keys (reactions only)
  // ------------------------------------------------------------
  const LS = {
    REACTIONS: `ecn_reactions_${pageKey}`,
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function loadReactionState() {
    const st = loadJSON(LS.REACTIONS, {});
    return st && typeof st === "object" ? st : {};
  }

  function saveReactionState(st) {
    saveJSON(LS.REACTIONS, st);
  }

  // ------------------------------------------------------------
  // GALERÍA: render grid
  // ------------------------------------------------------------
  function clearSkeletons() {
    gridEl.innerHTML = "";
  }

  function renderGallery(items) {
    clearSkeletons();

    if (!items || !items.length) {
      gridEl.innerHTML = `<div style="opacity:.8; padding:16px;">Aún no hay contenido en la galería.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();

    items.forEach((it) => {
      const tags = Array.isArray(it.tags) ? it.tags : [];
      const title = it.eventName ? String(it.eventName) : "Evento";
      const dateLabel = it.dateLabel ? String(it.dateLabel) : (it.dateISO ? fmtShortDate(it.dateISO) : "");

      const tile = document.createElement("article");
      tile.className = "gItem";
      tile.tabIndex = 0;

      tile.innerHTML = `
        <img class="gMedia" src="${esc(it.img)}" alt="${esc(title)}" loading="lazy" />
        <div class="gOverlay" aria-hidden="true">
          <p class="gTitle">${esc(title)}${dateLabel ? ` · ${esc(dateLabel)}` : ""}</p>
          <div class="gTags">
            ${tags.slice(0, 8).map((t) => `<span class="gTag">${esc(t)}</span>`).join("")}
          </div>
        </div>
      `;

      tile.addEventListener("click", () => {
        const already = tile.classList.contains("isActive");
        $$(".gItem.isActive", gridEl).forEach((x) => x.classList.remove("isActive"));
        if (!already) tile.classList.add("isActive");
      });

      frag.appendChild(tile);
    });

    gridEl.appendChild(frag);
  }

  document.addEventListener("click", (e) => {
    if (!gridEl) return;
    const inside = e.target && e.target.closest ? e.target.closest(".gItem") : null;
    if (!inside) $$(".gItem.isActive", gridEl).forEach((x) => x.classList.remove("isActive"));
  });

  // ------------------------------------------------------------
  // GALERÍA: filtros
  // ------------------------------------------------------------
  let allItems = [];

  function getTypeFromUI() {
    const v = selType ? String(selType.value || "") : "";
    if (!v) return pageKey;
    if (v === "all") return "all";
    if (v.includes("coct")) return "cocteles";
    if (v.includes("marid")) return "maridajes";
    return "all";
  }

  function mountTypeFilter() {
    if (!selType) return;
    if (selType.options && selType.options.length >= 3) return;

    selType.innerHTML = `
      <option value="all">Todo</option>
      <option value="cocteles">Cocteles</option>
      <option value="maridajes">Maridajes</option>
    `;

    selType.value = pageKey === "cocteles" ? "cocteles" : pageKey === "maridajes" ? "maridajes" : "all";
  }

  function mountDateFilter(itemsForDate) {
    if (!selDate) return;

    const dates = uniq((itemsForDate || []).map((x) => x.dateISO).filter(Boolean)).sort();
    const base = `<option value="">Todas</option>`;
    const opts = dates.map((d) => `<option value="${esc(d)}">${esc(fmtShortDate(d))}</option>`).join("");
    selDate.innerHTML = base + opts;
  }

  function applyGalleryFilters() {
    const fDate = selDate ? String(selDate.value || "") : "";
    const q = inpSearch ? norm(inpSearch.value || "") : "";
    const typeWanted = getTypeFromUI();

    const filtered = allItems.filter((x) => {
      const okType =
        typeWanted === "all"
          ? (x.type === "cocteles" || x.type === "maridajes")
          : x.type === typeWanted;

      const okDate = !fDate || String(x.dateISO || "") === fDate;

      if (!q) return okType && okDate;

      const hay = norm((x.eventName || "") + " " + (Array.isArray(x.tags) ? x.tags.join(" ") : ""));
      const okSearch = hay.includes(q);

      return okType && okDate && okSearch;
    });

    renderGallery(filtered);
  }

  function onTypeChange() {
    if (!selDate) {
      applyGalleryFilters();
      return;
    }
    const typeWanted = getTypeFromUI();
    const pool =
      typeWanted === "all"
        ? allItems.filter((x) => x.type === "cocteles" || x.type === "maridajes")
        : allItems.filter((x) => x.type === typeWanted);

    const current = String(selDate.value || "");
    mountDateFilter(pool);
    if (current && !pool.some((x) => String(x.dateISO || "") === current)) {
      selDate.value = "";
    }
    applyGalleryFilters();
  }

  // ------------------------------------------------------------
  // REVIEWS: UI structure
  // ------------------------------------------------------------
  function ensureReviewStructure() {
    if (!reviewListEl) return;

    if ($("#reviewItems", reviewListEl) && $("#reviewMeta")) return;

    const prevEmpty = $("#reviewEmpty") ? $("#reviewEmpty").cloneNode(true) : null;

    reviewListEl.innerHTML = `
      <div class="reviewHeader">
        <div class="reviewHeader__title">Comentarios</div>
        <div class="reviewHeader__meta" id="reviewMeta">0 comentarios</div>
      </div>
      <div class="reviewDivider"></div>
      <div class="reviewItems" id="reviewItems"></div>
    `;

    const wrap = $("#reviewItems", reviewListEl);
    if (prevEmpty) {
      prevEmpty.id = "reviewEmpty";
      prevEmpty.classList.add("reviewEmpty");
      wrap.appendChild(prevEmpty);
    } else {
      const d = document.createElement("div");
      d.id = "reviewEmpty";
      d.className = "reviewEmpty";
      d.textContent = "Aún no hay reseñas. Sé la primera persona en comentar 🙌";
      wrap.appendChild(d);
    }
  }

  function setReviewMeta(n) {
    const meta = $("#reviewMeta");
    if (meta) meta.textContent = `${n} comentario${n === 1 ? "" : "s"}`;
  }

  // ------------------------------------------------------------
  // REVIEWS: Supabase fetch
  // ------------------------------------------------------------
  let REVIEWS_CACHE = []; // lista actual renderizada (para editar/borrar rápido)

  function isOwnerReview(row) {
    const h = safeStr(row?.author_hash || "");
    return !!(AUTHOR_HASH && h && h === AUTHOR_HASH);
  }

  async function fetchReviewsForAllowedEvents() {
    if (!hasSupabase()) return [];
    await ensureSessionOptional();

    const client = sb();

    // Solo eventos del pageKey
    const allowedIds = (REVIEW_EVENTS || []).map((x) => x.id).filter(Boolean);
    if (!allowedIds.length) return [];

    try {
      const { data, error } = await client
        .from(DB.REVIEWS)
        .select(SELECT_REVIEWS_BASE)
        .in("event_id", allowedIds)
        .order("created_at", { ascending: false })
        .limit(250);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      return rows.map((r) => ({
        id: safeStr(r.id || ""),
        eventId: safeStr(r.event_id || ""),
        eventLabel: EVENT_TITLE_BY_ID.get(safeStr(r.event_id || "")) || "Evento",
        name: cleanSpaces(r.author_name || "") || "Anónimo",
        text: safeStr(r.body || ""),
        createdAt: safeStr(r.created_at || ""),
        updatedAt: safeStr(r.updated_at || ""),
        author_hash: safeStr(r.author_hash || ""),
      }));
    } catch (e) {
      if (isMissingTable(e)) toast("No existe la tabla event_reviews. Ejecutá el SQL primero.");
      else if (isRLSError(e)) toast("Acceso bloqueado (RLS) leyendo event_reviews.");
      else console.warn("[reviews] fetchReviewsForAllowedEvents fail:", e);
      return [];
    }
  }

  // ------------------------------------------------------------
  // REVIEWS: render list (con acciones Editar/Borrar solo dueño)
  // ------------------------------------------------------------
  function renderReviews(list) {
    if (!reviewListEl) return;

    ensureReviewStructure();

    const itemsWrap = $("#reviewItems", reviewListEl);
    const empty = $("#reviewEmpty", reviewListEl);

    if (!itemsWrap) return;

    $$(".reviewCard", itemsWrap).forEach((n) => n.remove());

    const sorted = (Array.isArray(list) ? list.slice() : []).sort(
      (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

    REVIEWS_CACHE = sorted;

    if (!sorted.length) {
      if (empty) empty.style.display = "";
      setReviewMeta(0);
      return;
    }

    if (empty) empty.style.display = "none";
    setReviewMeta(sorted.length);

    const reactionState = loadReactionState();
    const frag = document.createDocumentFragment();

    for (const r of sorted) {
      const card = document.createElement("div");
      card.className = "reviewCard";
      card.dataset.reviewId = r.id;

      const who = r.name ? String(r.name) : "Anónimo";
      const meta = `${r.eventLabel || "Evento"}`;
      const text = String(r.text || "");

      const rc = r.reactions || { heart: 0, up: 0, down: 0 };
      const my = reactionState[r.id] || "none";
      const canEdit = isOwnerReview(r);

      // Nota visual si fue editado
      const edited = r.updatedAt && r.createdAt && r.updatedAt !== r.createdAt ? " · editado" : "";

      card.innerHTML = `
        <div class="reviewTop">
          <div class="reviewWho">
            <div class="reviewName">${esc(who)}</div>
            <div class="reviewMeta">${esc(meta)}${esc(edited)}</div>
          </div>

          ${canEdit ? `
          <div class="reviewActions" style="display:flex; gap:8px; align-items:center;">
            <button class="btn ghost" type="button" data-action="edit" style="padding:8px 10px; border-radius:12px;">Editar</button>
            <button class="btn ghost" type="button" data-action="delete" style="padding:8px 10px; border-radius:12px;">Borrar</button>
          </div>` : ""}
        </div>

        <p class="reviewText" data-role="text">${esc(text)}</p>

        <div class="reactions" aria-label="Reacciones">
          <button class="reactBtn" type="button" data-react="heart" aria-pressed="${my === "heart" ? "true" : "false"}" aria-label="Me encanta">
            <span class="reactIcon">❤️</span>
            <span class="reactCount">${esc(String(rc.heart || 0))}</span>
          </button>

          <button class="reactBtn" type="button" data-react="up" aria-pressed="${my === "up" ? "true" : "false"}" aria-label="Me gusta">
            <span class="reactIcon">👍</span>
            <span class="reactCount">${esc(String(rc.up || 0))}</span>
          </button>

          <button class="reactBtn" type="button" data-react="down" aria-pressed="${my === "down" ? "true" : "false"}" aria-label="No me gustó">
            <span class="reactIcon">👎</span>
            <span class="reactCount">${esc(String(rc.down || 0))}</span>
          </button>
        </div>
      `;

      frag.appendChild(card);
    }

    itemsWrap.appendChild(frag);
  }

  // ------------------------------------------------------------
  // REVIEWS: submit via RPC (con gating)
  // ------------------------------------------------------------
  function updateCountUI() {
    if (!reviewTextTa || !reviewCountEl) return;
    reviewCountEl.textContent = String(String(reviewTextTa.value || "").length);
  }

  async function rpcCreateReview({ eventId, name, text }) {
    const client = sb();
    const { data, error } = await client.rpc("create_event_review", {
      p_event_id: eventId,
      p_author_token: AUTHOR_TOKEN,
      p_author_name: name || null,
      p_body: text,
    });
    if (error) throw error;
    return data;
  }

  async function rpcUpdateReview({ reviewId, text, name }) {
    const client = sb();
    const { data, error } = await client.rpc("update_event_review", {
      p_review_id: reviewId,
      p_author_token: AUTHOR_TOKEN,
      p_body: text,
      p_author_name: name || null,
    });
    if (error) throw error;
    return data;
  }

  async function rpcDeleteReview({ reviewId }) {
    const client = sb();
    const { data, error } = await client.rpc("delete_event_review", {
      p_review_id: reviewId,
      p_author_token: AUTHOR_TOKEN,
    });
    if (error) throw error;
    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reviewEventSel || !reviewTextTa) return;

    const eventId = String(reviewEventSel.value || "");
    if (!eventId) {
      toast("Seleccioná un evento para comentar.");
      return;
    }

    const gate = isSelectedEventEligible(eventId);
    if (!gate.eligible) {
      toast(gate.reason || "Las reseñas se habilitan cuando el evento finaliza.");
      return;
    }

    const name = clampStr(reviewNameInp ? reviewNameInp.value : "", 40);
    const text = clampStr(reviewTextTa.value, 420);

    if (!text || text.length < 2) {
      toast("Escribí una reseña (mínimo 2 caracteres).");
      return;
    }

    try {
      await rpcCreateReview({ eventId, name: name || "Anónimo", text });

      // reset
      reviewTextTa.value = "";
      if (reviewNameInp) reviewNameInp.value = "";
      reviewEventSel.selectedIndex = 0;
      updateCountUI();

      toast("Reseña publicada.");

      // recarga de DB para quedar 100% consistente
      const list = await fetchReviewsForAllowedEvents();
      renderReviews(list);
    } catch (err) {
      console.warn("[reviews] create fail:", err);
      toast(prettyErr(err));
    }
  }

  // ------------------------------------------------------------
  // REVIEWS: Edit/Borrar (delegación) + Reacciones
  // ------------------------------------------------------------
  function toggleReaction(reviewId, kind) {
    // Reacciones siguen local
    const st = loadReactionState();
    const prev = st[reviewId] || "none";

    // Mantenemos counts en memoria solo para UI local (sin DB)
    // Si querés persistencia real cross-device, luego lo pasamos a DB.
    const list = REVIEWS_CACHE.slice();
    const idx = list.findIndex((r) => r.id === reviewId);
    if (idx < 0) return;

    const rx = list[idx].reactions || { heart: 0, up: 0, down: 0 };
    rx.heart = Number(rx.heart || 0);
    rx.up = Number(rx.up || 0);
    rx.down = Number(rx.down || 0);

    if (prev === kind) {
      if (kind === "heart" && rx.heart > 0) rx.heart--;
      if (kind === "up" && rx.up > 0) rx.up--;
      if (kind === "down" && rx.down > 0) rx.down--;
      st[reviewId] = "none";
    } else {
      if (prev === "heart" && rx.heart > 0) rx.heart--;
      if (prev === "up" && rx.up > 0) rx.up--;
      if (prev === "down" && rx.down > 0) rx.down--;

      if (kind === "heart") rx.heart++;
      if (kind === "up") rx.up++;
      if (kind === "down") rx.down++;

      st[reviewId] = kind;
    }

    list[idx].reactions = rx;
    saveReactionState(st);
    renderReviews(list);
  }

  function enterEditMode(card, row) {
    const p = $(`[data-role="text"]`, card);
    if (!p) return;

    const current = safeStr(row.text || "");
    const ta = document.createElement("textarea");
    ta.className = "textarea";
    ta.value = current;
    ta.maxLength = 420;
    ta.style.marginTop = "10px";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:10px; margin-top:10px; align-items:center; flex-wrap:wrap;";

    const btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "btn primary";
    btnSave.textContent = "Guardar";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "btn ghost";
    btnCancel.textContent = "Cancelar";

    p.replaceWith(ta);
    ta.insertAdjacentElement("afterend", actions);
    actions.appendChild(btnSave);
    actions.appendChild(btnCancel);

    btnCancel.addEventListener("click", async () => {
      const list = await fetchReviewsForAllowedEvents();
      renderReviews(list);
    });

    btnSave.addEventListener("click", async () => {
      const next = clampStr(ta.value, 420);
      if (!next || next.length < 2) {
        toast("Escribí un comentario válido (mínimo 2 caracteres).");
        return;
      }

      try {
        await rpcUpdateReview({ reviewId: row.id, text: next, name: row.name });
        toast("Comentario actualizado.");
        const list = await fetchReviewsForAllowedEvents();
        renderReviews(list);
      } catch (err) {
        console.warn("[reviews] update fail:", err);
        toast(prettyErr(err));
      }
    });

    // UX: foco directo
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  async function handleDelete(card, row) {
    const ok = confirm("¿Querés borrar tu comentario? Esta acción no se puede deshacer.");
    if (!ok) return;

    try {
      await rpcDeleteReview({ reviewId: row.id });
      toast("Comentario borrado.");
      const list = await fetchReviewsForAllowedEvents();
      renderReviews(list);
    } catch (err) {
      console.warn("[reviews] delete fail:", err);
      toast(prettyErr(err));
    }
  }

  async function onReviewListClick(e) {
    const t = e.target;

    // acciones Edit/Borrar
    const actionBtn = t && t.closest ? t.closest("[data-action]") : null;
    if (actionBtn) {
      const card = actionBtn.closest(".reviewCard");
      if (!card) return;

      const reviewId = String(card.dataset.reviewId || "");
      const row = REVIEWS_CACHE.find((x) => x.id === reviewId);
      if (!row) return;

      // seguridad UI extra
      if (!isOwnerReview(row)) {
        toast("Solo podés editar/borrar tus propios comentarios.");
        return;
      }

      const action = String(actionBtn.getAttribute("data-action") || "");
      if (action === "edit") enterEditMode(card, row);
      if (action === "delete") await handleDelete(card, row);
      return;
    }

    // reacciones
    const btn = t && t.closest ? t.closest(".reactBtn") : null;
    if (!btn) return;

    const card = btn.closest(".reviewCard");
    if (!card) return;

    const reviewId = String(card.dataset.reviewId || "");
    const kind = String(btn.dataset.react || "");
    if (!reviewId || !kind) return;

    toggleReaction(reviewId, kind);
  }

  // ------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------
  async function initGallery() {
    try {
      allItems = await fetchGallery();

      mountTypeFilter();

      const typeWanted = getTypeFromUI();
      const pool =
        typeWanted === "all"
          ? allItems.filter((x) => x.type === "cocteles" || x.type === "maridajes")
          : allItems.filter((x) => x.type === typeWanted);

      mountDateFilter(pool);

      applyGalleryFilters();

      if (selDate) selDate.addEventListener("change", applyGalleryFilters);
      if (selType) selType.addEventListener("change", onTypeChange);
      if (inpSearch) inpSearch.addEventListener("input", debounce(applyGalleryFilters, 130));
    } catch (e) {
      console.warn("[gallery] initGallery fail:", e);
      clearSkeletons();
      gridEl.innerHTML = `<div style="opacity:.8; padding:16px;">${esc(prettyErr(e))}</div>`;
    }
  }

  async function initReviews() {
    if (!reviewListEl) return;

    ensureReviewStructure();

    // hash para ownership UI (si el browser soporta crypto.subtle)
    AUTHOR_HASH = await sha256Hex(AUTHOR_TOKEN);

    try {
      await mountReviewEventSelect();
    } catch (e) {
      console.warn("[gallery] mountReviewEventSelect fail:", e);
      if (reviewEventSel) {
        reviewEventSel.innerHTML =
          `<option value="" disabled selected>Seleccioná un evento</option>` +
          `<option value="" disabled>(No pude cargar eventos)</option>`;
        reviewEventSel.disabled = true;
      }
    }

    if (reviewTextTa) {
      updateCountUI();
      reviewTextTa.addEventListener("input", updateCountUI);
    }

    if (formEl) formEl.addEventListener("submit", handleSubmit);
    if (reviewListEl) reviewListEl.addEventListener("click", onReviewListClick);

    // Cargar desde DB para que sea cross-device
    const list = await fetchReviewsForAllowedEvents();
    renderReviews(list);

    // refresh suave cuando se vuelve a la pestaña (para ver comentarios nuevos)
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible") {
        const list2 = await fetchReviewsForAllowedEvents();
        renderReviews(list2);
      }
    });
  }

  // Boot
  (async function boot() {
    await initGallery();
    await initReviews();
  })();
})();
