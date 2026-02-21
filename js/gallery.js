"use strict";

/* ============================================================
   gallery.js ✅ PRO FINAL 2026 – Entre Copas & Notas
   ✔ Media desde v_media_bindings_latest
   ✔ Compat gallery_items/promos fallback
   ✔ Filtro por pageKey correcto
   ✔ Compatible DB antigua event_dates
   ✔ No rompe admin-media.js ni bindings
============================================================ */

(function () {
  "use strict";

  /* ============================================================
     HELPERS
  ============================================================ */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const esc = s =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const safe = x => String(x ?? "").trim();

  function norm(s) {
    return safe(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function sb() {
    try {
      if (window.APP?.publicSb) return APP.publicSb;
      if (window.APP?.supabase) return APP.supabase;
      return null;
    } catch {
      return null;
    }
  }

  function hasSB() {
    return !!(sb() && typeof sb().from === "function");
  }

  function toast(msg) {
    console.log("[gallery]", msg);
    const box = $("#toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  /* ============================================================
     PAGE KEY
  ============================================================ */

  function getPageKey() {
    const t = safe(window.ECN_PAGE?.type).toLowerCase();
    if (t.includes("coct")) return "cocteles";
    if (t.includes("marid")) return "maridajes";
    return "all";
  }

  const pageKey = getPageKey();

  /* ============================================================
     TARGET FILTER
  ============================================================ */

  function targetMatchesPage(target) {
    const t = norm(target);

    if (!t || t === "all" || t === "gallery") return true;

    if (pageKey === "cocteles") return t.includes("coct");
    if (pageKey === "maridajes") return t.includes("marid");

    return t.includes("coct") || t.includes("marid");
  }

  /* ============================================================
     MEDIA FROM v_media_bindings_latest
  ============================================================ */

  async function fetchBindingsForScope(scope, id) {
    const client = sb();
    if (!client || !id) return {};

    try {
      const { data, error } = await client
        .from("v_media_bindings_latest")
        .select("slot,public_url,path")
        .eq("scope", scope)
        .eq("scope_id", id);

      if (error) {
        console.warn("[gallery] bindings error", error);
        return {};
      }

      const map = {};
      (data || []).forEach(r => {
        const url = safe(r.public_url) || safe(r.path);
        if (!url) return;
        map[r.slot] = url;
      });

      return map;
    } catch (e) {
      console.warn("[gallery] bindings fetch fail", e);
      return {};
    }
  }

  /* ============================================================
     NORMALIZE ROW
  ============================================================ */

  function normalizeRow(r) {
    const row = r || {};

    const type =
      norm(row.type).includes("coct")
        ? "cocteles"
        : norm(row.type).includes("marid")
        ? "maridajes"
        : "all";

    return {
      id: safe(row.id),
      title: safe(row.name || row.title || "Evento"),
      type,
      target: safe(row.target),
      image_url: safe(row.image_url),
      image_path: safe(row.image_path),
      created_at: safe(row.created_at)
    };
  }

  /* ============================================================
     FETCH GALLERY
  ============================================================ */

  async function fetchGallery() {
    if (!hasSB()) {
      toast("Supabase no cargó.");
      return [];
    }

    const client = sb();

    try {
      const { data, error } = await client
        .from("gallery_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      return (data || [])
        .map(normalizeRow)
        .filter(x => targetMatchesPage(x.target));
    } catch (e) {
      console.warn("gallery_items fail", e);
    }

    try {
      const { data } = await client.from("promos").select("*");
      return (data || [])
        .map(normalizeRow)
        .filter(x => targetMatchesPage(x.target));
    } catch (e) {
      toast("No pude cargar la galería.");
      return [];
    }
  }

  /* ============================================================
     RENDER GRID
  ============================================================ */

  const grid = $("#galleryGrid");

  function render(items) {
    if (!grid) return;

    grid.innerHTML = "";

    if (!items.length) {
      grid.innerHTML = `<div style="padding:20px">Aún no hay contenido.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();

    items.forEach(it => {
      const card = document.createElement("article");
      card.className = "gItem";

      const img = it.image_url || it.image_path || "";

      card.innerHTML = `
        <img src="${esc(img)}" loading="lazy" class="gMedia">
        <div class="gOverlay">
          <div class="gTitle">${esc(it.title)}</div>
        </div>
      `;

      frag.appendChild(card);
    });

    grid.appendChild(frag);
  }

  /* ============================================================
     INIT
  ============================================================ */

  async function init() {
    const items = await fetchGallery();

    // buscar bindings por evento
    for (const it of items) {
      if (!it.id) continue;

      const media = await fetchBindingsForScope("gallery", it.id);

      if (media.cover || media.desktop_event) {
        it.image_url = media.cover || media.desktop_event;
      }
    }

    render(items);
  }

  init();
})();