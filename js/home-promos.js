/* ============================================================
   home-promos.js ✅ PRO (Banner + Modal) — Supabase-first + Fallback local
   - Fuente 1 (preferida): Supabase table "promos" (target=home, active=true)
   - Fuente 2 (fallback):  ECN.getActivePromos("home") desde data.js (localStorage)
   - Banner: muestra 1 promo kind=BANNER
   - Modal:  muestra 1 promo kind=MODAL
   - Dismiss (no molestar): localStorage (por usuario/navegador)

   ✅ PATCH 2026-01-19:
   - Fix: "No molestar" siempre usa la promo MODAL actual (no una vieja por cierre)
   - Opcional: marcar dismiss_once al presionar "No molestar" (setOnceToo = true)

   ✅ UX PATCH (banner + modal) 2026-02:
   - Banner: evita “layout jump” reservando altura (cache) + fade/slide-in
   - Modal: solo se abre si no hay scroll reciente (menos invasivo en mobile)
============================================================ */
(function () {
  "use strict";

  // ✅ Guard global anti doble-evaluación
  if (window.__ecnHomePromosMounted === true) return;
  window.__ecnHomePromosMounted = true;

  const $ = (sel) => document.querySelector(sel);

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  const TABLE = "promos";
  const TARGET = "home";

  // ------------------------------------------------------------
  // Storage keys (local)
  // ------------------------------------------------------------
  const LS = {
    DISMISS_UNTIL: "ecn_promo_dismiss_until",      // timestamp
    DISMISS_ONCE: "ecn_promo_dismiss_once",        // promoId (opcional)
    BANNER_DISMISS: "ecn_banner_dismiss_until",    // timestamp
    BANNER_H: "ecn_banner_height_px"               // cached height px (anti-jump)
  };

  function now() { return Date.now(); }

  function readInt(key, fallback = 0) {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) ? v : fallback;
    } catch (_) { return fallback; }
  }

  function readStr(key, fallback = "") {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : String(v);
    } catch (_) { return fallback; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_) {}
  }

  function safeStr(x) { return String(x ?? ""); }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseTimeMs(iso) {
    const s = safeStr(iso).trim();
    if (!s) return NaN;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  }

  function normalizeKind(v) {
    const k = safeStr(v).trim().toUpperCase();
    return k === "MODAL" ? "MODAL" : "BANNER";
  }

  // ✅ URL sanitizer (anti javascript:, data:, etc.)
  function sanitizeHref(raw) {
    const s = safeStr(raw).trim();
    if (!s) return "#";
    if (s === "#") return "#";
    if (s.startsWith("#")) return s;
    if (/^(mailto:|tel:)/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(wa\.me\/|www\.wa\.me\/)/i.test(s)) return "https://" + s;
    if (/^(javascript:|data:|vbscript:|file:)/i.test(s)) return "#";
    if (/^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(s)) return "https://" + s;
    return "#";
  }

  function stableSortPromos(arr) {
    return (arr || []).slice().sort((a, b) => {
      const pa = Number(a?.priority) || 0;
      const pb = Number(b?.priority) || 0;
      if (pb !== pa) return pb - pa;

      const ca = safeStr(a?.created_at || a?.createdAt || "");
      const cb = safeStr(b?.created_at || b?.createdAt || "");
      const dcmp = cb.localeCompare(ca);
      if (dcmp !== 0) return dcmp;

      return safeStr(a?.id || "").localeCompare(safeStr(b?.id || ""));
    });
  }

  // ------------------------------------------------------------
  // Normalización (Supabase row -> UI promo)
  // ------------------------------------------------------------
  function normalizePromo(p) {
    const kind = normalizeKind(p?.kind);
    const id = safeStr(p?.id || "");

    const desc = safeStr(
      p?.desc ??
      p?.description ??
      ""
    );

    const ctaLabel = safeStr(
      p?.ctaLabel ??
      p?.cta_label ??
      "Conocer"
    );

    const ctaHref = sanitizeHref(
      p?.ctaHref ??
      p?.cta_href ??
      "#"
    );

    const mediaImg = safeStr(
      p?.mediaImg ??
      p?.media_img ??
      ""
    );

    const dismissDays = Math.max(1, Number(
      p?.dismissDays ??
      p?.dismiss_days ??
      7
    ) || 7);

    const startAt = safeStr(p?.startAt ?? p?.start_at ?? "").trim();
    const endAt   = safeStr(p?.endAt   ?? p?.end_at   ?? "").trim();

    return {
      id,
      active: !!p?.active,
      kind,
      target: safeStr(p?.target || TARGET).toLowerCase(),
      priority: Number(p?.priority) || 0,

      badge: safeStr(p?.badge || ""),
      title: safeStr(p?.title || "Promo"),
      desc,
      note: safeStr(p?.note || ""),

      ctaLabel,
      ctaHref,

      mediaImg,
      dismissDays,

      startAt,
      endAt,

      createdAt: safeStr(p?.createdAt ?? p?.created_at ?? ""),
      created_at: safeStr(p?.created_at ?? p?.createdAt ?? ""),
    };
  }

  function withinWindow(p) {
    const ms = now();
    const s = parseTimeMs(p.startAt);
    const e = parseTimeMs(p.endAt);
    if (Number.isFinite(s) && ms < s) return false;
    if (Number.isFinite(e) && ms > e) return false;
    return true;
  }

  // ------------------------------------------------------------
  // Supabase loader (si existe)
  // ------------------------------------------------------------
  function getSB() {
    return (window.APP && (APP.supabase || APP.sb)) ? (APP.supabase || APP.sb) : null;
  }

  async function waitForSupabase(timeoutMs) {
    const t0 = now();
    while (now() - t0 < (timeoutMs || 2200)) {
      const sb = getSB();
      if (sb && sb.from) return sb;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  async function fetchPromosFromSupabase() {
    const sb = await waitForSupabase(2200);
    if (!sb) throw new Error("Supabase no listo");

    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("target", TARGET)
      .eq("active", true)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const arr = Array.isArray(data) ? data : [];
    const normalized = arr.map(normalizePromo)
      .filter((p) => p.active)
      .filter((p) => p.target === TARGET)
      .filter(withinWindow);

    return stableSortPromos(normalized);
  }

  // ------------------------------------------------------------
  // Fallback local (data.js)
  // ------------------------------------------------------------
  function requireECN() {
    return !!(window.ECN && typeof ECN.getActivePromos === "function");
  }

  function fetchPromosFromLocal() {
    if (!requireECN()) return [];
    const active = ECN.getActivePromos(TARGET) || [];
    return stableSortPromos(active.map(normalizePromo)).filter(withinWindow);
  }

  // ------------------------------------------------------------
  // Banner (anti-jump + fade/slide)
  // ------------------------------------------------------------
  function shouldShowBanner() {
    const until = readInt(LS.BANNER_DISMISS, 0);
    return now() > until;
  }

  function ensureMountTransition(mount) {
    if (!mount) return;
    // transición suave del placeholder para evitar “salto” feo
    mount.style.transition = "min-height .22s ease";
    mount.style.willChange = "min-height";
  }

  function reserveBannerSpace(mount) {
    if (!mount) return;
    const cached = readInt(LS.BANNER_H, 64); // valor seguro
    mount.style.minHeight = Math.max(0, cached) + "px";
  }

  function clearBannerSpace(mount) {
    if (!mount) return;
    // baja suave
    mount.style.minHeight = "0px";
  }

  function renderBanner(mount, p) {
    if (!mount) return;
    mount.innerHTML = "";

    if (!p) {
      clearBannerSpace(mount);
      return;
    }
    if (!shouldShowBanner()) {
      clearBannerSpace(mount);
      return;
    }

    ensureMountTransition(mount);
    reserveBannerSpace(mount); // ✅ reserva antes de insertar (reduce jump)

    mount.innerHTML = `
      <div class="pbanner" role="region" aria-label="Anuncio">
        <div class="container">
          <div class="pbannerRow">
            <div class="pbannerText">
              ${p.badge ? `<span class="pbadge">${escapeHtml(p.badge)}</span>` : ``}
              <strong class="pbannerTitle">${escapeHtml(p.title || "")}</strong>
              <span class="pbannerDesc">${escapeHtml(p.desc || "")}</span>
            </div>

            <div class="pbannerActions">
              <a class="pbtn pbtn--primary" href="${escapeHtml(p.ctaHref || "#")}" target="_blank" rel="noopener">
                ${escapeHtml(p.ctaLabel || "Ver")}
              </a>
              <button class="pbtn" type="button" id="pbannerClose" aria-label="Cerrar anuncio">✕</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const banner = mount.querySelector(".pbanner");

    // ✅ Animación suave SIN CSS extra
    if (banner) {
      banner.style.opacity = "0";
      banner.style.transform = "translateY(-6px)";
      banner.style.transition = "opacity .18s ease, transform .18s ease";
      // next frame
      requestAnimationFrame(() => {
        banner.style.opacity = "1";
        banner.style.transform = "translateY(0)";
      });

      // ✅ medir altura real y cachearla
      setTimeout(() => {
        try {
          const h = Math.ceil(banner.getBoundingClientRect().height || 0);
          if (h > 0) {
            write(LS.BANNER_H, h);
            mount.style.minHeight = h + "px";
          }
        } catch (_) {}
      }, 40);
    }

    $("#pbannerClose")?.addEventListener("click", () => {
      const days = Math.max(1, Number(p.dismissDays || 3));
      write(LS.BANNER_DISMISS, now() + days * 86400000);

      // fade out + colapsar placeholder
      try {
        if (banner) {
          banner.style.opacity = "0";
          banner.style.transform = "translateY(-6px)";
        }
      } catch (_) {}

      setTimeout(() => {
        mount.innerHTML = "";
        clearBannerSpace(mount);
      }, 180);
    }, { once: true });
  }

  // ------------------------------------------------------------
  // Modal (solo si no hay scroll reciente)
  // ------------------------------------------------------------
  function canShowModal(promoId) {
    const until = readInt(LS.DISMISS_UNTIL, 0);
    if (now() < until) return false;

    // opcional: "solo una vez por promo"
    const onceId = readStr(LS.DISMISS_ONCE, "");
    if (onceId && onceId === promoId) return false;

    return true;
  }

  // ✅ detecta “scroll activo”: si hubo scroll en los últimos X ms, no abras modal
  let lastScrollAt = now();
  function wireScrollSignal() {
    // 1 sola vez
    if (window.__ecnHomePromosScrollWired) return;
    window.__ecnHomePromosScrollWired = true;

    window.addEventListener("scroll", () => {
      lastScrollAt = now();
    }, { passive: true });
  }

  function isScrollActive(windowMs) {
    const w = Math.max(300, Number(windowMs || 900));
    return (now() - lastScrollAt) < w;
  }

  function openModal(modal, p) {
    if (!modal || !p) return;

    const badge = $("#promoBadge");
    const title = $("#promoTitle");
    const desc  = $("#promoDesc");
    const note  = $("#promoNote");
    const media = $("#promoMedia");
    const cta   = $("#promoCta");

    if (badge) {
      badge.hidden = !p.badge;
      badge.textContent = p.badge || "";
    }
    if (title) title.textContent = p.title || "Promo";
    if (desc)  desc.textContent  = p.desc || "";
    if (note)  note.textContent  = p.note || "";

    if (media) media.style.backgroundImage = p.mediaImg ? `url("${p.mediaImg}")` : "none";

    if (cta) {
      cta.textContent = p.ctaLabel || "Conocer";
      cta.href = sanitizeHref(p.ctaHref || "#");

      const isExternal = /^https?:\/\//i.test(cta.href);
      if (isExternal) {
        cta.target = "_blank";
        cta.rel = "noopener";
      } else {
        cta.removeAttribute("target");
        cta.removeAttribute("rel");
      }
    }

    modal.classList.add("isOpen");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("lockScroll");
    document.body.classList.add("lockScroll");

    $("#promoClose")?.focus?.();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("isOpen");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("lockScroll");
    document.body.classList.remove("lockScroll");
  }

  function dismissForDays(days, promoId, setOnceToo) {
    const d = Math.max(1, Number(days || 7));
    write(LS.DISMISS_UNTIL, now() + d * 86400000);
    if (setOnceToo && promoId) write(LS.DISMISS_ONCE, promoId);
  }

  // ✅ PATCH: evitar usar "p" viejo por closure
  let modalWired = false;
  let currentModalPromo = null; // ✅ promo MODAL actual

  function wireModal(modal) {
    if (modalWired) return;
    modalWired = true;

    $("#promoClose")?.addEventListener("click", () => closeModal(modal));

    // click fuera
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });

    // ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("isOpen")) closeModal(modal);
    });

    // No molestar (usa promo actual)
    $("#promoLater")?.addEventListener("click", () => {
      const p = currentModalPromo;
      if (!p) return closeModal(modal);
      dismissForDays(p.dismissDays || 7, p.id, true); // ✅ setOnceToo=true
      closeModal(modal);
    });
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  let didInit = false;

  async function init() {
    if (didInit) return;
    didInit = true;

    const mount = $("#promoBannerMount");
    const modal = $("#promoModal");
    if (!mount || !modal) return;

    // ✅ scroll signal (para no abrir modal mientras el usuario scrollea)
    wireScrollSignal();

    // 1) Supabase-first
    let promos = [];
    try {
      promos = await fetchPromosFromSupabase();
    } catch (e) {
      // 2) Fallback local
      promos = fetchPromosFromLocal();
    }

    if (!Array.isArray(promos) || !promos.length) {
      mount.innerHTML = "";
      clearBannerSpace(mount);
      return;
    }

    const bannerPromo = promos.find((p) => normalizeKind(p.kind) === "BANNER") || null;
    const modalPromo  = promos.find((p) => normalizeKind(p.kind) === "MODAL")  || null;

    renderBanner(mount, bannerPromo);

    // ✅ Modal: abre solo si NO hay scroll reciente
    if (modalPromo && canShowModal(modalPromo.id)) {
      currentModalPromo = modalPromo;
      wireModal(modal);

      setTimeout(() => {
        // si el usuario está scrolleando o tocando scroll, no lo molestamos
        if (isScrollActive(900)) return;
        openModal(modal, modalPromo);
      }, 650);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
