/* ============================================================
   gallery.js ✅ PRO (Maridajes + Cocteles) - 2026
   - 1 solo JS para ambas páginas
   - Lee window.ECN_PAGE.type: "cocteles" | "maridajes"
   - Filtros: fecha + búsqueda (debounce)
   - Grid IG: render limpio y quita skeletons
   - Hover: lo maneja el CSS (oscurecer + tags)
   - Reviews: form arriba + comments abajo (header "Comentarios" + reacciones)
   - ✅ Select de eventos: carga desde data.js (ECN.getEventsRaw) SOLO para el form
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

  // Toasts opcional (si existe en tu proyecto)
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
    const t =
      window.ECN_PAGE && window.ECN_PAGE.type
        ? String(window.ECN_PAGE.type).toLowerCase()
        : "";
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
  // Demo data (galería) — se queda así por ahora (NO usa eventos admin)
  // ------------------------------------------------------------
  const DEMO = {
    cocteles: [
      { id: "c-1", eventName: "Presentación y garnish", dateISO: "2026-02-02", img: "./assets/img/gallery/cocteles-1.jpg", tags: ["#coctel", "#presentacion", "#autor"] },
      { id: "c-2", eventName: "Bar vibes", dateISO: "2026-02-02", img: "./assets/img/gallery/cocteles-2.jpg", tags: ["#bar", "#vibes"] },
      { id: "c-3", eventName: "Cítricos & frescura", dateISO: "2026-02-14", img: "./assets/img/gallery/cocteles-3.jpg", tags: ["#gin", "#citricos", "#fresh"] },
      { id: "c-4", eventName: "Clásicos con flow", dateISO: "2026-03-01", img: "./assets/img/gallery/cocteles-4.jpg", tags: ["#clasicos", "#mixologia"] },
      { id: "c-5", eventName: "Colores del trópico", dateISO: "2026-03-02", img: "./assets/img/gallery/cocteles-5.jpg", tags: ["#coctel", "#color", "#tropical"] },
      { id: "c-6", eventName: "Tónicos y especies", dateISO: "2026-03-02", img: "./assets/img/gallery/cocteles-6.jpg", tags: ["#bar", "#vibes"] },
      { id: "c-7", eventName: "Amaretto mood", dateISO: "2026-03-08", img: "./assets/img/gallery/cocteles-7.jpg", tags: ["#sweet", "#night"] },
      { id: "c-8", eventName: "Frescura de verano", dateISO: "2026-03-15", img: "./assets/img/gallery/cocteles-8.jpg", tags: ["#clasicos", "#mixologia"] }
    ],
    maridajes: [
      { id: "m-1", eventName: "Notas & maridajes", dateISO: "2026-01-10", img: "./assets/img/gallery/maridaje-1.jpg", tags: ["#vino", "#maridaje", "#notas"] },
      { id: "m-2", eventName: "Quesos & blancos", dateISO: "2026-01-18", img: "./assets/img/gallery/maridaje-2.jpg", tags: ["#queso", "#vinoblanco"] },
      { id: "m-3", eventName: "Pasta night", dateISO: "2026-01-05", img: "./assets/img/gallery/maridaje-3.jpg", tags: ["#pasta", "#tinto", "#pairing"] },
      { id: "m-4", eventName: "Dulces & espumante", dateISO: "2026-02-21", img: "./assets/img/gallery/maridaje-4.jpg", tags: ["#postre", "#espumante"] },
      { id: "m-5", eventName: "Notas y tintes", dateISO: "2026-02-22", img: "./assets/img/gallery/maridaje-5.jpg", tags: ["#vino", "#maridaje", "#notas"] },
      { id: "m-6", eventName: "Fiambres que mezclan", dateISO: "2026-02-26", img: "./assets/img/gallery/maridaje-6.jpg", tags: ["#tabla", "#vino"] },
      { id: "m-7", eventName: "Italia en la mesa", dateISO: "2026-03-01", img: "./assets/img/gallery/maridaje-7.jpg", tags: ["#pasta", "#tinto", "#pairing"] },
      { id: "m-8", eventName: "Argentina en un sorbo", dateISO: "2026-03-12", img: "./assets/img/gallery/maridaje-8.jpg", tags: ["#asado", "#malbec"] }
    ]
  };

  // ------------------------------------------------------------
  // Source: ECN.getGalleryItems(type) si existe, si no DEMO
  // ------------------------------------------------------------
  function getItems() {
    try {
      if (window.ECN && typeof ECN.getGalleryItems === "function") {
        const items = ECN.getGalleryItems(pageKey);
        if (Array.isArray(items)) return items;
      }
    } catch (_) {}
    return (DEMO[pageKey] || []).slice();
  }

  let allItems = getItems();

  // ------------------------------------------------------------
  // ✅ Events para el SELECT (desde data.js)
  // - NO toca la galería
  // ------------------------------------------------------------
  function getEventsForSelect() {
    try {
      if (!window.ECN || typeof ECN.getEventsRaw !== "function") return [];
      const raw = ECN.getEventsRaw();
      if (!Array.isArray(raw)) return [];

      const wantCoct = pageKey === "cocteles";

      return raw
        .filter((ev) => {
          const t = norm(ev?.type || "");
          if (wantCoct) return t.includes("coct"); // "coctelería"
          return t.includes("vino") || t.includes("cata"); // maridajes (vino/cata)
        })
        .map((ev) => {
          const title = String(ev?.title || "Evento").trim();
          const monthKey = String(ev?.monthKey || "").trim().toUpperCase();
          // label de fechas viene así: "18-19 enero", "09 febrero"
          const dates = Array.isArray(ev?.dates) ? ev.dates : [];
          const dateLabels = dates
            .map((d) => String(d?.label || "").trim())
            .filter(Boolean);

          // el select necesita "evento" y opcionalmente la(s) fechas
          return {
            id: String(ev?.id || ""),
            title,
            monthKey,
            dates: dateLabels,
          };
        })
        .filter((x) => x.id && x.title);
    } catch (_) {
      return [];
    }
  }

  function mountReviewEventSelect() {
    if (!reviewEventSel) return;

    const events = getEventsForSelect();

    const placeholder = `<option value="" disabled selected>Seleccioná un evento</option>`;

    // Si no hay eventos aún, dejamos solo placeholder + deshabilitamos
    if (!events.length) {
      reviewEventSel.innerHTML =
        placeholder + `<option value="" disabled>(Aún no hay eventos creados)</option>`;
      reviewEventSel.disabled = true;
      return;
    }

    reviewEventSel.disabled = false;

    // Render options:
    // value = eventId
    // label = "Título · (fechas…)" si hay
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

    const frag = document.createDocumentFragment();

    items.forEach((it) => {
      const tags = Array.isArray(it.tags) ? it.tags : [];
      const title = it.eventName ? String(it.eventName) : "Evento";
      const dateLabel = it.dateISO ? fmtShortDate(it.dateISO) : "";

      const tile = document.createElement("article");
      tile.className = "gItem";
      tile.tabIndex = 0;

      tile.innerHTML = `
        <img class="gMedia" src="${esc(it.img)}" alt="${esc(title)}" loading="lazy" />
        <div class="gOverlay" aria-hidden="true">
          <p class="gTitle">${esc(title)}${dateLabel ? ` · ${esc(dateLabel)}` : ""}</p>
          <div class="gTags">
            ${tags.slice(0, 8).map(t => `<span class="gTag">${esc(t)}</span>`).join("")}
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

      const hay = norm(
        (x.eventName || "") + " " + (Array.isArray(x.tags) ? x.tags.join(" ") : "")
      );
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
  function initGallery() {
    mountDateFilter();
    renderGallery(allItems);

    if (selDate) selDate.addEventListener("change", applyGalleryFilters);
    if (inpSearch) inpSearch.addEventListener("input", debounce(applyGalleryFilters, 130));
  }

  function initReviews() {
    if (!reviewListEl) return;

    ensureReviewStructure();

    // ✅ cargar eventos desde data.js para el select
    mountReviewEventSelect();

    if (reviewTextTa) {
      updateCountUI();
      reviewTextTa.addEventListener("input", updateCountUI);
    }

    if (formEl) formEl.addEventListener("submit", handleSubmit);
    reviewListEl.addEventListener("click", onReviewListClick);

    renderReviews(loadReviews());

    // refrescar si admin cambia eventos o si otra pestaña cambia reseñas
    window.addEventListener("storage", (ev) => {
      if (!ev || !ev.key) return;

      // si admin cambia eventos
      if (window.ECN && ECN.LS && ev.key === ECN.LS.EVENTS) {
        mountReviewEventSelect();
      }

      // reseñas / reacciones
      if (ev.key === LS.REVIEWS || ev.key === LS.REACTIONS) {
        renderReviews(loadReviews());
      }
    });
  }

  initGallery();
  initReviews();
})();
