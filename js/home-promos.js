/* ============================================================
   home-promos.js ✅ PRO (Banner + Modal) - Local-first
   - Fuente: ECN.getActivePromos("home") desde data.js
   - Banner: muestra 1 promo kind=BANNER
   - Modal:  muestra 1 promo kind=MODAL
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // ------------------------------------------------------------
  // Storage keys (local)
  // ------------------------------------------------------------
  const LS = {
    DISMISS_UNTIL: "ecn_promo_dismiss_until",      // timestamp
    DISMISS_ONCE: "ecn_promo_dismiss_once",        // promoId (opcional)
    BANNER_DISMISS: "ecn_banner_dismiss_until"     // timestamp
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

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ------------------------------------------------------------
  // Guards
  // ------------------------------------------------------------
  function requireECN() {
    if (!window.ECN || typeof ECN.getActivePromos !== "function") {
      console.warn("[home-promos] ECN.getActivePromos no disponible. ¿data.js cargó antes?");
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------
  // Banner
  // ------------------------------------------------------------
  function shouldShowBanner() {
    const until = readInt(LS.BANNER_DISMISS, 0);
    return now() > until;
  }

  function renderBanner(mount, p) {
    if (!mount || !p) return;
    if (!shouldShowBanner()) return;

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

    $("#pbannerClose")?.addEventListener("click", () => {
      const days = Number(p.dismissDays || 3);
      const ttl = now() + Math.max(1, days) * 86400000;
      write(LS.BANNER_DISMISS, ttl);
      mount.innerHTML = "";
    });
  }

  // ------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------
  function canShowModal(promoId) {
    const until = readInt(LS.DISMISS_UNTIL, 0);
    if (now() < until) return false;

    // opcional: "solo una vez por promo"
    const onceId = readStr(LS.DISMISS_ONCE, "");
    if (onceId && onceId === promoId) return false;

    return true;
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
      cta.href = p.ctaHref || "#";

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

  function dismissForDays(days, promoId, setOnceToo = false) {
    const d = Math.max(1, Number(days || 7));
    write(LS.DISMISS_UNTIL, now() + d * 86400000);
    if (setOnceToo && promoId) write(LS.DISMISS_ONCE, promoId);
  }

  function wireModal(modal, p) {
    $("#promoClose")?.addEventListener("click", () => closeModal(modal));

    // click fuera
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });

    // ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("isOpen")) closeModal(modal);
    });

    // No molestar
    $("#promoLater")?.addEventListener("click", () => {
      dismissForDays(p.dismissDays || 7, p.id, false);
      closeModal(modal);
    });
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  function init() {
    const mount = $("#promoBannerMount");
    const modal = $("#promoModal");
    if (!mount || !modal) return;
    if (!requireECN()) return;

    const active = ECN.getActivePromos("home") || [];
    const bannerPromo = active.find(p => String(p.kind).toUpperCase() === "BANNER") || null;
    const modalPromo  = active.find(p => String(p.kind).toUpperCase() === "MODAL")  || null;

    renderBanner(mount, bannerPromo);

    if (modalPromo && canShowModal(modalPromo.id)) {
      wireModal(modal, modalPromo);
      setTimeout(() => openModal(modal, modalPromo), 600);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
