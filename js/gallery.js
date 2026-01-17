/* ============================================================
   gallery.js ✅ PRO (Maridajes + Cocteles) - 2026 (Supabase)
   - 1 solo JS para ambas páginas
   - Lee window.ECN_PAGE.type: "cocteles" | "maridajes"
   - Galería: Supabase (public) -> gallery_items (preferido) o promos (fallback)
   - Filtros: fecha + búsqueda (debounce)
   - Grid IG: render limpio y quita skeletons
   - Reviews: LocalStorage (por ahora), pero:
     ✅ Select de eventos: Supabase events + event_dates (con fallbacks de joins)
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
  // Page key desde tu config
  // ------------------------------------------------------------
  function getPageKey() {
    const t = window.ECN_PAGE && window.ECN_PAGE.type ? String(window.ECN_PAGE.type).toLowerCase() : "";
    if (t.includes("coct")) return "cocteles";
    if (t.includes("marid")) return "maridajes";
    return "gallery";
  }
  const pageKey = getPageKey();

  // ------------------------------------------------------------
  // Elements (Galería)
  // ------------------------------------------------------------
  const gridEl = $("#galleryGrid");
  if (!gridEl) return;

  const selDate = $("#filterDate");
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
  const reviewEmptyEl = $("#reviewEmpty");

  // ------------------------------------------------------------
  // Supabase availability (PUBLIC client)
  // ------------------------------------------------------------
  function sb() {
    return (window.APP && (APP.supabase || APP.sb)) || null;
  }

  function hasSupabase() {
    const client = sb();
    return !!(client && typeof client.from === "function");
  }

  async function ensureSessionOptional() {
    // Public pages normalmente NO requieren sesión; esto es por si tu RLS pide auth.
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
  // DB config
  // ------------------------------------------------------------
  const DB = {
    GALLERY_PRIMARY: "gallery_items",
    GALLERY_FALLBACK: "promos",
    EVENTS: "events",
    STORAGE_BUCKET: "gallery",
  };

  // ⚠️ Opción A: relaciones normales (events, event_dates)
  const SELECT_GALLERY_A = `
    id,
    type,
    name,
    tags,
    image_url,
    image_path,
    created_at,
    target,
    events ( title ),
    event_dates ( label, date, start_at )
  `;

  // ⚠️ Opción B: relaciones nombradas por FK (fallback)
  // Nota: los nombres exactos pueden variar en tu proyecto.
  // Aun así dejamos fallback robusto para no romper.
  const SELECT_GALLERY_B = `
    id,
    type,
    name,
    tags,
    image_url,
    image_path,
    created_at,
    target,
    events:events!gallery_items_event_id_fkey ( title ),
    event_dates:event_dates!gallery_items_event_date_id_fkey ( label, date, start_at )
  `;

  // promos: lectura flexible
  const SELECT_PROMOS = `
    id,
    type,
    title,
    name,
    tags,
    image_url,
    image_path,
    created_at,
    target,
    events ( title ),
    event_dates ( label, date, start_at )
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
    // Preferimos fecha "real" del event_date si existe
    const d = safeStr(row?.event_dates?.date || row?.event_dates?.start_at || "");
    if (d) return d;

    // Si no hay join, usamos created_at para no romper filtro
    const c = safeStr(row?.created_at || "");
    return c || "";
  }

  function normalizeGalleryRow(r) {
    const row = r || {};
    const t = String(row.type || "").toLowerCase();

    const type =
      t.includes("coct") ? "cocteles" :
      t.includes("marid") ? "maridajes" :
      pageKey;

    const evTitle = cleanSpaces(row?.events?.title || "") || "";
    const dateLabel = cleanSpaces(row?.event_dates?.label || "") || "";

    const title = cleanSpaces(row.name || row.title || evTitle || "Evento") || "Evento";

    const createdAt = safeStr(row.created_at || "");
    const dateISO = pickDateISO(row);

    const img = safeStr(row.image_url || "") || publicUrlFromPath(row.image_path) || "";

    return {
      id: safeStr(row.id || ""),
      type,
      eventName: title,
      dateISO,
      dateLabel,
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

    // 1) gallery_items A
    try {
      const rowsA = await fetchUsing(DB.GALLERY_PRIMARY, SELECT_GALLERY_A);
      return rowsA
        .map(normalizeGalleryRow)
        .filter((x) => x.type === pageKey && x.img && (!x.target || x.target === "home"));
    } catch (eA) {
      const msg = safeStr(eA?.message || "").toLowerCase();
      const looksLikeJoin =
        msg.includes("could not find") ||
        msg.includes("relationship") ||
        msg.includes("embedded") ||
        msg.includes("schema cache") ||
        msg.includes("foreign key");

      if (!looksLikeJoin && !isMissingTable(eA)) {
        if (isRLSError(eA)) toast("Acceso bloqueado (RLS) leyendo gallery_items.");
        else console.warn("[gallery] gallery_items A error:", eA);
      }

      // 1b) gallery_items B (si el join fue el problema)
      try {
        const rowsB = await fetchUsing(DB.GALLERY_PRIMARY, SELECT_GALLERY_B);
        return rowsB
          .map(normalizeGalleryRow)
          .filter((x) => x.type === pageKey && x.img && (!x.target || x.target === "home"));
      } catch (eB) {
        if (!isMissingTable(eB)) {
          if (isRLSError(eB)) toast("Acceso bloqueado (RLS) leyendo gallery_items.");
          else console.warn("[gallery] gallery_items B error:", eB);
        }
      }
    }

    // 2) fallback promos
    try {
      const rowsP = await fetchUsing(DB.GALLERY_FALLBACK, SELECT_PROMOS);
      return rowsP
        .map(normalizeGalleryRow)
        .filter((x) => x.type === pageKey && x.img && (!x.target || x.target === "home"));
    } catch (eP) {
      if (isMissingTable(eP)) {
        toast("No existe tabla gallery_items ni promos.");
      } else if (isRLSError(eP)) {
        toast("Acceso bloqueado (RLS) leyendo promos.");
      } else {
        toast("No pude cargar la galería.");
        console.warn("[gallery] promos error:", eP);
      }
      return [];
    }
  }

  // ------------------------------------------------------------
  // ✅ Events para el SELECT (Supabase) — robusto y simple
  // ------------------------------------------------------------
  // Preferimos: events + event_dates por separado (sin join)
  // porque tu schema real no garantiza event_dates.event_id en lo que pegaste.
  async function fetchEventDatesIndex() {
    const client = sb();
    // Seleccionamos columnas típicas; si alguna no existe, PostgREST lo dirá (y caemos a label-only)
    try {
      const { data, error } = await client
        .from("event_dates")
        .select("id,label,date,start_at,event_id")
        .order("date", { ascending: true })
        .limit(500);

      if (error) throw error;

      const map = new Map();
      (Array.isArray(data) ? data : []).forEach((d) => {
        const id = safeStr(d?.id || "");
        if (!id) return;
        map.set(id, {
          id,
          label: cleanSpaces(d?.label || "") || "",
          date: safeStr(d?.date || d?.start_at || ""),
          event_id: safeStr(d?.event_id || ""),
        });
      });
      return map;
    } catch (e) {
      // fallback sin event_id/date si tu tabla no los tiene
      try {
        const { data, error } = await client
          .from("event_dates")
          .select("id,label")
          .order("label", { ascending: true })
          .limit(500);

        if (error) throw error;

        const map = new Map();
        (Array.isArray(data) ? data : []).forEach((d) => {
          const id = safeStr(d?.id || "");
          if (!id) return;
          map.set(id, { id, label: cleanSpaces(d?.label || "") || "", date: "", event_id: "" });
        });
        return map;
      } catch (e2) {
        console.warn("[events] event_dates fetch fail:", e2);
        return new Map();
      }
    }
  }

  function eventTypeMatches(pageKey, typeText) {
    const t = norm(typeText || "");
    if (pageKey === "cocteles") return t.includes("coct");
    // maridajes: vino / cata / marid
    return t.includes("vino") || t.includes("cata") || t.includes("marid");
  }

  async function fetchEventsForSelect() {
    if (!hasSupabase()) return [];
    await ensureSessionOptional();

    const client = sb();
    const datesById = await fetchEventDatesIndex();

    // Intento principal: events + columnas mínimas
    try {
      const { data, error } = await client
        .from(DB.EVENTS)
        .select("id,title,type,created_at,event_date_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const list = (Array.isArray(data) ? data : [])
        .map((ev) => {
          const id = safeStr(ev?.id || "");
          const title = cleanSpaces(ev?.title || "Evento") || "Evento";
          const type = safeStr(ev?.type || "");
          const ok = !!(id && title && eventTypeMatches(pageKey, type));

          const dateId = safeStr(ev?.event_date_id || "");
          const dateRow = dateId ? datesById.get(dateId) : null;

          const dateLabels = [];
          if (dateRow?.label) dateLabels.push(dateRow.label);
          else if (dateRow?.date) dateLabels.push(fmtShortDate(dateRow.date));

          return { id, title, ok, dates: dateLabels };
        })
        .filter((x) => x.ok);

      return list;
    } catch (eA) {
      // Fallback: events sin event_date_id (por si tu tabla no lo tiene)
      try {
        const { data, error } = await client
          .from(DB.EVENTS)
          .select("id,title,type,created_at")
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) throw error;

        const list = (Array.isArray(data) ? data : [])
          .map((ev) => {
            const id = safeStr(ev?.id || "");
            const title = cleanSpaces(ev?.title || "Evento") || "Evento";
            const type = safeStr(ev?.type || "");
            const ok = !!(id && title && eventTypeMatches(pageKey, type));
            return { id, title, ok, dates: [] };
          })
          .filter((x) => x.ok);

        return list;
      } catch (eB) {
        if (isRLSError(eB) || isRLSError(eA)) toast("Acceso bloqueado (RLS) leyendo eventos.");
        else console.warn("[events] fetch fail:", eA, eB);
        return [];
      }
    }
  }

  async function mountReviewEventSelect() {
    if (!reviewEventSel) return;

    const placeholder = `<option value="" disabled selected>Seleccioná un evento</option>`;

    const events = await fetchEventsForSelect();

    if (!events.length) {
      reviewEventSel.innerHTML =
        placeholder + `<option value="" disabled>(Aún no hay eventos disponibles)</option>`;
      reviewEventSel.disabled = true;
      return;
    }

    reviewEventSel.disabled = false;

    const options = events
      .map((ev) => {
        const dates = ev.dates && ev.dates.length ? ` · ${ev.dates.join(" / ")}` : "";
        const label = `${ev.title}${dates}`;
        return `<option value="${esc(ev.id)}" data-title="${esc(ev.title)}">${esc(label)}</option>`;
      })
      .join("");

    reviewEventSel.innerHTML = placeholder + options;
  }

  // ------------------------------------------------------------
  // LocalStorage keys (reviews/reactions)
  // ------------------------------------------------------------
  const LS = {
    REVIEWS: `ecn_reviews_${pageKey}`,
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

  // ------------------------------------------------------------
  // GALERÍA: render grid
  // ------------------------------------------------------------
  function clearSkeletons() {
    gridEl.innerHTML = "";
  }

  function renderGallery(items) {
    clearSkeletons();

    if (!items || !items.length) {
      gridEl.innerHTML = `
        <div style="opacity:.8; padding:16px;">
          Aún no hay contenido en la galería.
        </div>
      `;
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

      tile.addEventListener(
        "touchstart",
        (e) => {
          const already = tile.classList.contains("isActive");
          $$(".gItem.isActive", gridEl).forEach((x) => x.classList.remove("isActive"));
          if (!already) {
            tile.classList.add("isActive");
            e.preventDefault();
          }
        },
        { passive: false }
      );

      frag.appendChild(tile);
    });

    gridEl.appendChild(frag);
  }

  // ------------------------------------------------------------
  // GALERÍA: filtros
  // ------------------------------------------------------------
  let allItems = [];

  function mountDateFilter() {
    if (!selDate) return;

    const dates = uniq(allItems.map((x) => x.dateISO).filter(Boolean)).sort();
    const base = `<option value="">Todas</option>`;
    const opts = dates
      .map((d) => `<option value="${esc(d)}">${esc(fmtShortDate(d))}</option>`)
      .join("");
    selDate.innerHTML = base + opts;
  }

  function applyGalleryFilters() {
    const fDate = selDate ? String(selDate.value || "") : "";
    const q = inpSearch ? norm(inpSearch.value || "") : "";

    const filtered = allItems.filter((x) => {
      const okDate = !fDate || String(x.dateISO || "") === fDate;
      if (!q) return okDate;

      const hay = norm((x.eventName || "") + " " + (Array.isArray(x.tags) ? x.tags.join(" ") : ""));
      const okSearch = hay.includes(q);

      return okDate && okSearch;
    });

    renderGallery(filtered);
  }

  // ------------------------------------------------------------
  // REVIEWS: estructura header y contenedor interno
  // ------------------------------------------------------------
  function ensureReviewStructure() {
    if (!reviewListEl) return;
    if ($(".reviewHeader", reviewListEl)) return;

    const emptyNode = reviewEmptyEl ? reviewEmptyEl.cloneNode(true) : null;

    reviewListEl.innerHTML = `
      <div class="reviewHeader">
        <h3 class="reviewHeader__title">Comentarios</h3>
        <div class="reviewHeader__meta" id="reviewMeta">0</div>
      </div>
      <div class="reviewDivider"></div>
      <div class="reviewItems" id="reviewItems"></div>
    `;

    const wrap = $("#reviewItems", reviewListEl);
    if (emptyNode) {
      emptyNode.id = "reviewEmpty";
      wrap.appendChild(emptyNode);
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
  // REVIEWS: data model local-first
  // ------------------------------------------------------------
  function loadReviews() {
    const arr = loadJSON(LS.REVIEWS, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveReviews(list) {
    saveJSON(LS.REVIEWS, list);
  }

  function loadReactionState() {
    const st = loadJSON(LS.REACTIONS, {});
    return st && typeof st === "object" ? st : {};
  }

  function saveReactionState(st) {
    saveJSON(LS.REACTIONS, st);
  }

  // ------------------------------------------------------------
  // REVIEWS: render list
  // ------------------------------------------------------------
  function renderReviews(list) {
    if (!reviewListEl) return;

    ensureReviewStructure();

    const itemsWrap = $("#reviewItems", reviewListEl);
    const empty = $("#reviewEmpty", reviewListEl);

    $$(".reviewCard", itemsWrap).forEach((n) => n.remove());

    const sorted = (Array.isArray(list) ? list.slice() : []).sort(
      (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

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

      card.innerHTML = `
        <div class="reviewTop">
          <div class="reviewWho">
            <div class="reviewName">${esc(who)}</div>
            <div class="reviewMeta">${esc(meta)}</div>
          </div>
        </div>

        <p class="reviewText">${esc(text)}</p>

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
  // REVIEWS: submit
  // ------------------------------------------------------------
  function updateCountUI() {
    if (!reviewTextTa || !reviewCountEl) return;
    reviewCountEl.textContent = String(String(reviewTextTa.value || "").length);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!reviewEventSel || !reviewTextTa) return;

    const eventId = String(reviewEventSel.value || "");
    if (!eventId) {
      toast("Seleccioná un evento para comentar.");
      return;
    }

    const selected = reviewEventSel.selectedOptions && reviewEventSel.selectedOptions[0];
    const eventTitle = selected ? String(selected.getAttribute("data-title") || "Evento") : "Evento";
    const eventLabel = eventTitle;

    const name = clampStr(reviewNameInp ? reviewNameInp.value : "", 40);
    const text = clampStr(reviewTextTa.value, 420);

    if (!text || text.length < 2) {
      toast("Escribí una reseña (mínimo 2 caracteres).");
      return;
    }

    const reviews = loadReviews();
    const newReview = {
      id: uid("rev"),
      eventId,
      eventLabel,
      name: name || "Anónimo",
      text,
      createdAt: nowISO(),
      reactions: { heart: 0, up: 0, down: 0 },
    };

    reviews.unshift(newReview);
    saveReviews(reviews);

    reviewTextTa.value = "";
    if (reviewNameInp) reviewNameInp.value = "";
    reviewEventSel.selectedIndex = 0;
    updateCountUI();

    toast("Reseña publicada.");
    renderReviews(reviews);
  }

  // ------------------------------------------------------------
  // REVIEWS: reacciones (delegación)
  // ------------------------------------------------------------
  function toggleReaction(reviewId, kind) {
    const reviews = loadReviews();
    const idx = reviews.findIndex((r) => r.id === reviewId);
    if (idx < 0) return;

    const st = loadReactionState();
    const prev = st[reviewId] || "none";

    const rx = reviews[idx].reactions || { heart: 0, up: 0, down: 0 };
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

    reviews[idx].reactions = rx;

    saveReactionState(st);
    saveReviews(reviews);
    renderReviews(reviews);
  }

  function onReviewListClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest(".reactBtn") : null;
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
      // Quitamos skeletons cuando llegue la respuesta
      allItems = await fetchGallery();

      mountDateFilter();
      renderGallery(allItems);

      if (selDate) selDate.addEventListener("change", applyGalleryFilters);
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
    reviewListEl.addEventListener("click", onReviewListClick);

    renderReviews(loadReviews());

    window.addEventListener("storage", (ev) => {
      if (!ev || !ev.key) return;
      if (ev.key === LS.REVIEWS || ev.key === LS.REACTIONS) {
        renderReviews(loadReviews());
      }
    });
  }

  // Boot
  (async function boot() {
    await initGallery();
    await initReviews();
  })();
})();
