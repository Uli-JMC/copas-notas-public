"use strict";

/* ============================================================
   event.js ✅ PRO (Supabase-first) — 2026-02-20 (ALINEADO A IMPLEMENTACIÓN B)
   - ✅ Hero del evento desde v_media_bindings_latest (scope='event', scope_id=eventId):
       slots:
         - desktop: desktop_event
         - mobile : mobile_event
   - ✅ "Ver más info" (mobile) desde v_media_bindings_latest:
       slot: event_more
   - ✅ more_img_alt sigue en events.more_img_alt
   - ✅ Fechas dropdown (1 vs N) + control cupos
   - ✅ Precio: price_amount + price_currency
   - ✅ Fallbacks seguros y logs de diagnóstico

   ✅ FIX 2026-02-20: HERO RESPONSIVE REAL
   - En móvil usa mobile_event (si existe)
   - En desktop usa desktop_event (si existe)
   - Fallbacks seguros
============================================================ */

(() => {
  // ----------------------------
  // Helpers
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  const safeStr = (x) => String(x ?? "");
  const cleanSpaces = (s) => safeStr(s).replace(/\s+/g, " ").trim();

  function escapeHtml(str) {
    return safeStr(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeCssUrl(url) {
    return safeStr(url).replaceAll("'", "%27").replaceAll('"', "%22").replaceAll(")", "%29").trim();
  }

  function isAbsUrl(u) {
    return /^https?:\/\//i.test(String(u || "").trim());
  }

  function normalizeImgPath(input) {
    const fallback = "./assets/img/hero-1.jpg";
    const raw = cleanSpaces(input);
    if (!raw) return fallback;

    // ✅ URL absoluta: no tocar
    if (isAbsUrl(raw)) return raw;

    // ✅ a veces guardaste path con URL completa por error: si parece URL, no tocar
    if (raw.includes("supabase.co/storage/v1/object/public/")) return raw;

    // assets locales
    const [pathPart, rest] = raw.split(/(?=[?#])/);
    let p = pathPart.replaceAll("\\", "/");

    if (p.startsWith("./")) p = p.slice(2);
    if (p.startsWith("/")) return p + (rest || "");
    if (p.startsWith("assets/img/")) return "./" + p + (rest || "");
    if (p.startsWith("img/")) return "./assets/" + p + (rest || "");

    return "./assets/img/" + p + (rest || "");
  }

  // ✅ viewport helper (móvil real)
  function isMobileViewport() {
    try {
      return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    } catch (_) {
      return window.innerWidth <= 768;
    }
  }

  // ✅ elige hero según viewport (B: slots desktop_event / mobile_event)
  function pickHeroFromBindings(bindings) {
    const desk = cleanSpaces(bindings?.desktop_event || "");
    const mob = cleanSpaces(bindings?.mobile_event || "");

    if (isMobileViewport()) return normalizeImgPath(mob || desk || "./assets/img/hero-1.jpg");
    return normalizeImgPath(desk || mob || "./assets/img/hero-1.jpg");
  }

  function toast(title, msg, timeoutMs = 3800) {
    try {
      if (window.APP && typeof APP.toast === "function") return APP.toast(title, msg, timeoutMs);
    } catch (_) {}

    const toastsEl = $("#toasts");
    if (!toastsEl) return;

    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <div>
        <p class="tTitle">${escapeHtml(title)}</p>
        <p class="tMsg">${escapeHtml(msg)}</p>
      </div>
      <button class="close" aria-label="Cerrar" type="button">✕</button>
    `;
    toastsEl.appendChild(el);

    const kill = () => {
      el.style.opacity = "0";
      el.style.transform = "translateY(-6px)";
      setTimeout(() => el.remove(), 180);
    };

    el.querySelector(".close")?.addEventListener("click", kill, { once: true });
    setTimeout(kill, timeoutMs);
  }

  function getParam(name) {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get(name);
    } catch (_) {
      return null;
    }
  }

  function safeText(v, fallback = "Por confirmar") {
    const t = cleanSpaces(v);
    return t ? t : fallback;
  }

  function getSB() {
    return window.APP && (APP.supabase || APP.sb) ? (APP.supabase || APP.sb) : null;
  }

  // ----------------------------
  // Precio helpers
  // ----------------------------
  function normCurrency(cur) {
    const c = cleanSpaces(cur).toUpperCase();
    return c === "USD" || c === "CRC" ? c : "";
  }

  function formatMoney(amount, currency) {
    const cur = normCurrency(currency);
    const n = Number(amount);
    if (!cur || !Number.isFinite(n)) return "Por confirmar";

    const isCRC = cur === "CRC";
    const decimals = isCRC ? 0 : 2;

    try {
      const formatted = n.toLocaleString("es-CR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return isCRC ? `₡${formatted}` : `$${formatted}`;
    } catch (_) {
      const fixed = n.toFixed(decimals);
      return isCRC ? `₡${fixed}` : `$${fixed}`;
    }
  }

  function safePriceText(priceAmount, priceCurrency) {
    const cur = normCurrency(priceCurrency);
    const n = Number(priceAmount);
    if (!cur || !Number.isFinite(n)) return "Por confirmar";
    return formatMoney(n, cur);
  }

  // ----------------------------
  // Loader
  // ----------------------------
  function setLoading(on) {
    const loader = $("#pageLoader");
    const card = $("#heroCard");

    if (loader) {
      loader.style.opacity = on ? "1" : "0";
      loader.style.pointerEvents = on ? "auto" : "none";
    }
    if (card) {
      card.style.opacity = on ? "0" : "1";
      card.style.transition = "opacity .2s ease";
    }
  }

  // ----------------------------
  // Media fetch (v_media_bindings_latest) ✅ IMPLEMENTACIÓN B
  // ----------------------------
  const WANT_SLOTS = ["desktop_event", "mobile_event", "event_more"];

  function resolveBindingUrl(row) {
    const pub = cleanSpaces(row?.public_url);
    if (pub) return pub;

    const p = cleanSpaces(row?.path);
    // Si path trae URL absoluta, úsala
    if (isAbsUrl(p)) return p;

    // Si es path relativo de storage (ej: "events-img/x.webp") NO lo convertimos aquí
    // porque no guardás bucket en DB. Lo correcto es tener public_url poblado.
    return "";
  }

  async function fetchEventMediaFromSupabase(eventId) {
    const sb = getSB();
    const eid = cleanSpaces(eventId);
    if (!sb || !eid) return {};

    try {
      const { data, error } = await sb
        .from("v_media_bindings_latest")
        .select("slot,public_url,path,media_id,binding_updated_at,media_updated_at")
        .eq("scope", "event")
        .eq("scope_id", eid)
        .in("slot", WANT_SLOTS);

      if (error) {
        console.error("[event] v_media_bindings_latest error:", error);
        return {};
      }

      const map = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        const slot = cleanSpaces(row?.slot);
        if (!slot) return;

        const url = resolveBindingUrl(row);
        if (!url) return;

        map[slot] = url;
      });

      if (!map.desktop_event && !map.mobile_event) {
        console.warn("[event] Sin hero en bindings para event_id:", eid, data);
      }

      return map;
    } catch (err) {
      console.error("[event] v_media_bindings_latest fetch failed:", err);
      return {};
    }
  }

  // ----------------------------
  // Supabase fetch (event + dates)
  // ----------------------------
  async function fetchEventFromSupabase(eventId) {
    const sb = getSB();
    if (!sb) {
      console.error("APP.supabase no está listo. Orden: Supabase CDN -> supabaseClient.js -> event.js");
      toast("Error", "Supabase no está listo.");
      return null;
    }

    const eid = cleanSpaces(eventId);
    if (!eid) return null;

    const selectBase =
      "id,title,type,month_key,description,location,time_range,duration_hours,price_amount,price_currency,more_img_alt,created_at,updated_at";

    const evRes = await sb.from("events").select(selectBase).eq("id", eid).maybeSingle();

    if (evRes.error) {
      console.error(evRes.error);
      toast("Error", "No se pudo cargar el evento.");
      return null;
    }
    if (!evRes.data) return null;

    // media (bindings)
    const media = await fetchEventMediaFromSupabase(eid);

    // ✅ FIX: hero responsive
    const heroUrl = pickHeroFromBindings(media);

    const moreUrlRaw = cleanSpaces(media.event_more || "");
    const moreUrl = moreUrlRaw ? normalizeImgPath(moreUrlRaw) : "";

    // dates
    let datesOk = true;

    const datesRes = await sb
      .from("event_dates")
      .select("id,event_id,label,seats_total,seats_available,created_at")
      .eq("event_id", eid);

    if (datesRes.error) {
      console.error(datesRes.error);
      datesOk = false;
      toast("Aviso", "El evento cargó, pero aún no se pudieron cargar las fechas.");
    }

    const datesRaw = Array.isArray(datesRes.data) ? datesRes.data : [];
    const dates = datesRaw
      .map((d) => ({
        id: safeStr(d?.id || ""),
        label: cleanSpaces(d?.label || ""),
        seats: Math.max(0, Number(d?.seats_available ?? 0)),
        seats_total: Math.max(0, Number(d?.seats_total ?? 0)),
        created_at: d?.created_at ? safeStr(d.created_at) : "",
      }))
      .filter((d) => d.id);

    if (!datesRes.error && dates.length === 0) datesOk = false;

    dates.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      if (ta !== tb) return ta - tb;
      return safeStr(a.label).localeCompare(safeStr(b.label), "es");
    });

    const seatsTotalAvailable = dates.reduce((acc, x) => acc + (Number(x.seats) || 0), 0);

    return {
      id: safeStr(evRes.data.id || ""),
      type: safeStr(evRes.data.type || "Experiencia"),
      monthKey: safeStr(evRes.data.month_key || "—").toUpperCase(),
      title: safeStr(evRes.data.title || "Evento"),
      desc: safeStr(evRes.data.description || ""),

      // ✅ guardamos ambos por si querés recalcular en resize/orientation
      _mediaDesktop: cleanSpaces(media.desktop_event || ""),
      _mediaMobile: cleanSpaces(media.mobile_event || ""),

      img: heroUrl,

      moreImg: moreUrl,
      moreImgAlt: cleanSpaces(evRes.data.more_img_alt || ""),

      dates,
      seats: seatsTotalAvailable,
      datesOk,

      location: safeText(evRes.data.location, "Por confirmar"),
      timeRange: safeText(evRes.data.time_range, "Por confirmar"),
      durationHours: safeText(evRes.data.duration_hours, "Por confirmar"),

      priceAmount: evRes.data.price_amount,
      priceCurrency: evRes.data.price_currency,
      priceText: safePriceText(evRes.data.price_amount, evRes.data.price_currency),
    };
  }

  // ----------------------------
  // State + click delegation
  // ----------------------------
  let CURRENT = null;

  function goRegisterWithDate(eventId, dateId, dateLabel) {
    const e = encodeURIComponent(safeStr(eventId || ""));
    const d = encodeURIComponent(safeStr(dateId || ""));
    const l = encodeURIComponent(safeStr(dateLabel || ""));
    window.location.href = `./register.html?event=${e}&date_id=${d}&date_label=${l}`;
  }

  function ensurePickListener() {
    if (ensurePickListener._done) return;
    ensurePickListener._done = true;

    document.addEventListener("click", (e) => {
      const pickBtn = e.target?.closest?.("[data-pick]");
      if (!pickBtn || !CURRENT) return;

      let dateId = safeStr(pickBtn.getAttribute("data-pick") || "");
      if (!dateId) return;

      if (dateId === "__dropdown__") {
        const sel = $("#dateSelect");
        const v = safeStr(sel?.value || "");
        if (!v) {
          toast("Elegí una fecha", "Seleccioná una fecha para continuar.");
          return;
        }
        dateId = v;
      }

      const dateObj = (CURRENT.dates || []).find((d) => safeStr(d.id) === safeStr(dateId));
      const label = dateObj ? safeStr(dateObj.label || "") : "";
      const seats = dateObj ? (Number(dateObj.seats) || 0) : 0;

      const soldOutTotal = CURRENT.datesOk && (Number(CURRENT.seats) || 0) <= 0;
      const dateSoldOut = seats <= 0;

      if (soldOutTotal || dateSoldOut || pickBtn.disabled) {
        toast("No disponible", "Esta fecha no tiene cupos.");
        return;
      }

      toast("Fecha seleccionada", `Te inscribiremos para: ${label || "esta fecha"}`);
      goRegisterWithDate(CURRENT.id, dateId, label);
    });
  }

  // ----------------------------
  // "Ver más info" (mobile)
  // ----------------------------
  function ensureMoreInfoBlock() {
    if (ensureMoreInfoBlock._done) return;
    ensureMoreInfoBlock._done = true;

    const desc = $("#evDesc");
    if (!desc) return;

    const wrap = document.createElement("div");
    wrap.className = "moreInfo";
    wrap.id = "moreInfo";
    wrap.setAttribute("hidden", "");

    wrap.innerHTML = `
      <button class="btn moreBtn" type="button" id="moreBtn" aria-expanded="false" aria-controls="morePanel">
        Ver más info
      </button>

      <div class="morePanel" id="morePanel" hidden>
        <div class="moreMedia">
          <img id="moreImg" class="moreImg" alt="Más información del evento" loading="lazy" decoding="async" />
        </div>
      </div>
    `;

    desc.insertAdjacentElement("afterend", wrap);

    const btn = $("#moreBtn");
    const panel = $("#morePanel");

    btn?.addEventListener("click", () => {
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      const next = !isOpen;

      btn.setAttribute("aria-expanded", next ? "true" : "false");
      if (panel) {
        if (next) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      }
    });
  }

  function setMoreInfoMedia(ev) {
    const wrap = $("#moreInfo");
    const img = $("#moreImg");
    const btn = $("#moreBtn");
    const panel = $("#morePanel");
    if (!wrap || !img || !btn || !panel) return;

    const raw = cleanSpaces(ev?.moreImg || "");
    if (!raw) {
      wrap.setAttribute("hidden", "");
      return;
    }

    img.src = raw;
    img.alt = ev?.moreImgAlt
      ? ev.moreImgAlt
      : ev?.title
      ? `Más info: ${ev.title}`
      : "Más información del evento";

    wrap.removeAttribute("hidden");
    btn.setAttribute("aria-expanded", "false");
    panel.setAttribute("hidden", "");
  }

  // ----------------------------
  // Dates UI
  // ----------------------------
  function renderDatesUI(dateListEl, ev, soldOutTotal) {
    const dates = Array.isArray(ev.dates) ? ev.dates : [];

    if (!ev.datesOk) {
      dateListEl.innerHTML = `<div class="emptyMonth">Fechas y cupos por confirmar.</div>`;
      return;
    }
    if (!dates.length) {
      dateListEl.innerHTML = `<div class="emptyMonth">Fechas por confirmar.</div>`;
      return;
    }

    if (dates.length === 1) {
      const x = dates[0];
      const dateId = safeStr(x?.id || "");
      const label = cleanSpaces(x?.label || "");
      const seats = Math.max(0, Number(x?.seats) || 0);
      const dateSoldOut = seats <= 0;

      const row = document.createElement("div");
      row.className = "dateItem";

      const left = document.createElement("div");
      left.className = "dateLeft";

      const main = document.createElement("div");
      main.className = "dateMain";
      main.textContent = label || "Por definir";

      const hint = document.createElement("div");
      hint.className = "dateHint";
      hint.innerHTML = dateSoldOut
        ? `<span style="opacity:.8;">Sin cupos para esta fecha.</span>`
        : `Cupos disponibles: <b>${escapeHtml(seats)}</b>`;

      left.appendChild(main);
      left.appendChild(hint);

      const btn = document.createElement("button");
      btn.className = "datePick";
      btn.type = "button";
      btn.textContent = "Elegir";
      btn.setAttribute("data-pick", dateId);

      if (soldOutTotal || dateSoldOut) {
        btn.disabled = true;
        btn.style.opacity = ".55";
        btn.style.cursor = "not-allowed";
      }

      row.appendChild(left);
      row.appendChild(btn);
      dateListEl.appendChild(row);
      return;
    }

    // dropdown
    const wrap = document.createElement("div");
    wrap.className = "dateItem";
    wrap.style.alignItems = "stretch";

    const left = document.createElement("div");
    left.className = "dateLeft";

    const main = document.createElement("div");
    main.className = "dateMain";
    main.textContent = "Seleccioná una fecha";

    const hint = document.createElement("div");
    hint.className = "dateHint";
    hint.textContent = "Si hay más de una fecha, elegí tu opción aquí.";

    left.appendChild(main);
    left.appendChild(hint);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "10px";
    right.style.alignItems = "center";
    right.style.justifyContent = "flex-end";
    right.style.flex = "0 0 auto";

    const sel = document.createElement("select");
    sel.id = "dateSelect";
    sel.setAttribute("aria-label", "Seleccionar fecha");
    sel.style.minHeight = "46px";
    sel.style.borderRadius = "999px";
    sel.style.border = "1px solid rgba(18,18,18,.14)";
    sel.style.background = "rgba(18,18,18,.02)";
    sel.style.padding = "10px 12px";
    sel.style.fontSize = "12px";
    sel.style.fontWeight = "900";
    sel.style.letterSpacing = ".14em";
    sel.style.textTransform = "uppercase";
    sel.style.color = "rgba(18,18,18,.88)";
    sel.style.maxWidth = "260px";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Elegir fecha…";
    sel.appendChild(opt0);

    dates.forEach((x) => {
      const id = safeStr(x?.id || "");
      const label = cleanSpaces(x?.label || "") || "Por definir";
      const seats = Math.max(0, Number(x?.seats) || 0);

      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${label}${seats <= 0 ? " (Sin cupos)" : ` (${seats})`}`;
      if (seats <= 0) opt.disabled = true;
      sel.appendChild(opt);
    });

    const btn = document.createElement("button");
    btn.className = "datePick";
    btn.type = "button";
    btn.textContent = "Elegir";
    btn.setAttribute("data-pick", "__dropdown__");

    if (soldOutTotal) {
      btn.disabled = true;
      btn.style.opacity = ".55";
      btn.style.cursor = "not-allowed";
    }

    sel.addEventListener("change", () => {
      if (btn.disabled && soldOutTotal) return;
      const v = safeStr(sel.value || "");
      btn.disabled = !v;
      btn.style.opacity = btn.disabled ? ".55" : "1";
      btn.style.cursor = btn.disabled ? "not-allowed" : "pointer";
    });

    btn.disabled = true;
    btn.style.opacity = ".55";
    btn.style.cursor = "not-allowed";

    right.appendChild(sel);
    right.appendChild(btn);

    wrap.appendChild(left);
    wrap.appendChild(right);
    dateListEl.appendChild(wrap);
  }

  // ----------------------------
  // Render
  // ----------------------------
  function setNotices({ sold, available, pending }) {
    const soldNotice = $("#soldNotice");
    const availNotice = $("#availNotice");
    const pendingNotice = $("#pendingNotice");

    [soldNotice, availNotice, pendingNotice].forEach((el) => el && el.setAttribute("hidden", ""));

    if (sold && soldNotice) soldNotice.removeAttribute("hidden");
    else if (available && availNotice) availNotice.removeAttribute("hidden");
    else if (pending && pendingNotice) pendingNotice.removeAttribute("hidden");
  }

  // ✅ aplica hero (por si hay resize/orientation)
  function applyHeroForViewport() {
    if (!CURRENT) return;

    const heroBg = $("#heroBg");
    const heroImgEl = $("#evPhoto");

    const picked = isMobileViewport()
      ? normalizeImgPath(CURRENT._mediaMobile || CURRENT._mediaDesktop || "./assets/img/hero-1.jpg")
      : normalizeImgPath(CURRENT._mediaDesktop || CURRENT._mediaMobile || "./assets/img/hero-1.jpg");

    if (heroBg) {
      heroBg.style.setProperty("--bgimg", `url('${safeCssUrl(picked)}')`);
      heroBg.style.backgroundImage = `url('${safeCssUrl(picked)}')`;
    }

    if (heroImgEl) {
      heroImgEl.src = picked;
    }
  }

  function renderEvent(ev) {
    CURRENT = ev;

    if (!ev) {
      toast("Evento no encontrado", "Volviendo a la lista de eventos…");
      setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
      return;
    }

    const soldOutTotal = ev.datesOk && (Number(ev.seats) || 0) <= 0;

    // ✅ pinta hero correcto según viewport
    applyHeroForViewport();

    const heroImgEl = $("#evPhoto");
    if (heroImgEl) {
      heroImgEl.alt = ev.title ? `Foto del evento: ${ev.title}` : "Foto del evento";
    }

    ensureMoreInfoBlock();
    setMoreInfoMedia(ev);

    const metaRow = $("#metaRow");
    const datesText = (ev.dates || []).map((d) => d.label).filter(Boolean).join(" • ");

    if (metaRow) {
      metaRow.innerHTML = `
        <span class="pill"><span class="dot"></span> ${escapeHtml(ev.type)}</span>
        <span class="pill">${escapeHtml(datesText || (ev.datesOk ? "Por definir" : "Cupos por confirmar"))}</span>
        <span class="pill">${escapeHtml(ev.monthKey || "—")}</span>
        ${soldOutTotal ? `<span class="pill">AGOTADO</span>` : ``}
      `;
    }

    const t = $("#evTitle");
    const d = $("#evDesc");
    if (t) t.textContent = ev.title;
    if (d) d.textContent = ev.desc || "";

    const dateList = $("#dateList");
    if (dateList) {
      dateList.innerHTML = "";
      renderDatesUI(dateList, ev, soldOutTotal);
    }

    const kv = $("#kv");
    if (kv) {
      kv.innerHTML = `
        <div class="kvRow">
          <div class="kvLabel">Cupos disponibles</div>
          <div class="kvValue">${
            !ev.datesOk ? "Por confirmar" : soldOutTotal ? "0 (Agotado)" : escapeHtml(ev.seats)
          }</div>
        </div>

        <div class="kvRow">
          <div class="kvLabel">Duración</div>
          <div class="kvValue">${escapeHtml(safeText(ev.durationHours))}</div>
        </div>

        <div class="kvRow">
          <div class="kvLabel">Hora</div>
          <div class="kvValue">${escapeHtml(safeText(ev.timeRange))}</div>
        </div>

        <div class="kvRow">
          <div class="kvLabel">Ubicación</div>
          <div class="kvValue">${escapeHtml(safeText(ev.location))}</div>
        </div>

        <div class="kvRow">
          <div class="kvLabel">Costo</div>
          <div class="kvValue">${escapeHtml(ev.priceText || "Por confirmar")}</div>
        </div>
      `;
    }

    if (!ev.datesOk) setNotices({ sold: false, available: false, pending: true });
    else if (soldOutTotal) setNotices({ sold: true, available: false, pending: false });
    else setNotices({ sold: false, available: true, pending: false });

    const btnRegister = $("#btnRegister");
    if (btnRegister) {
      const firstAvailable = (ev.dates || []).find((x) => (Number(x?.seats) || 0) > 0);

      if (firstAvailable && safeStr(firstAvailable.id || "")) {
        btnRegister.href =
          `./register.html?event=${encodeURIComponent(ev.id)}&date_id=${encodeURIComponent(firstAvailable.id)}&date_label=${encodeURIComponent(firstAvailable.label || "")}`;
      } else {
        btnRegister.href = `./register.html?event=${encodeURIComponent(ev.id)}`;
      }

      if (soldOutTotal) {
        btnRegister.setAttribute("aria-disabled", "true");
        btnRegister.classList.remove("primary");
        btnRegister.classList.add("btn");
        btnRegister.style.opacity = ".55";
        btnRegister.style.pointerEvents = "none";
      } else {
        btnRegister.removeAttribute("aria-disabled");
        btnRegister.classList.add("primary");
        btnRegister.style.opacity = "1";
        btnRegister.style.pointerEvents = "auto";
      }
    }

    const heroCard = $("#heroCard");
    if (heroCard) heroCard.classList.toggle("isSoldOut", soldOutTotal);

    if (soldOutTotal && ev.datesOk) toast("Evento agotado", "Este evento no tiene cupos disponibles.");
  }

  // ----------------------------
  // Init
  // ----------------------------
  (async function init() {
    ensurePickListener();

    const eventId = cleanSpaces(getParam("event"));
    if (!eventId) {
      toast("Falta el evento", "Volviendo a la lista…");
      setTimeout(() => (window.location.href = "./home.html#proximos"), 700);
      return;
    }

    setLoading(true);

    const ev = await fetchEventFromSupabase(eventId);
    renderEvent(ev);

    setLoading(false);

    // ✅ PRO: si rota/cambia tamaño, re-aplica hero
    window.addEventListener("resize", () => {
      try { applyHeroForViewport(); } catch (_) {}
    });
    window.addEventListener("orientationchange", () => {
      try { applyHeroForViewport(); } catch (_) {}
    });
  })();
})();