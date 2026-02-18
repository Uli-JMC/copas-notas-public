"use strict";

/* ============================================================
   event.js (Supabase-first) ✅ DROPDOWN FECHAS + FIX + PRICE + MEDIA
   - ✅ Si hay 1 fecha: se muestra card normal con botón Elegir
   - ✅ Si hay 2+ fechas: se muestra dropdown + botón Elegir
   - No marca "Agotado" si fechas aún no cargaron (evita falso sold-out)
   - Loader suave para evitar “brinco” visual al refrescar
   - ✅ Muestra Precio (events.price_amount + events.price_currency)
     - Si no hay precio => "Por confirmar"

   ✅ UPDATE (2026-02-17):
   - Tu tabla events YA tiene:
       img_desktop, img_mobile, more_img, more_img_alt
   - Este JS:
       - Los pide en el SELECT (evita 400 porque ya existen)
       - Hero image:
           - Desktop: prioridad video_url si hay <video id="heroVideo"> y hay URL
                     si no: img_desktop -> img -> fallback
           - Mobile:  img_mobile -> img -> fallback
       - "Ver más info": usa more_img / more_img_alt y si no hay -> se oculta

   ⚠️ Requisitos en HTML (opcional):
   - Video hero solo si existe:
       <video id="heroVideo"><source></source></video>
   - Ver más info usa IDs:
       #moreInfo, #btnMoreInfo, #morePanel, #evMoreImg
============================================================ */

// ============================================================
// Helpers
// ============================================================
const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeCssUrl(url) {
  return String(url ?? "")
    .replaceAll("'", "%27")
    .replaceAll('"', "%22")
    .replaceAll(")", "%29")
    .trim();
}

function normalizeImgPath(input, fallback = "./assets/img/hero-1.jpg") {
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;

  if (/^https?:\/\//i.test(raw)) return raw;

  const [pathPart, rest] = raw.split(/(?=[?#])/);
  let p = pathPart.replaceAll("\\", "/");

  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) return p + (rest || "");
  if (p.startsWith("assets/img/")) return "./" + p + (rest || "");
  if (p.startsWith("img/")) return "./assets/" + p + (rest || "");

  return "./assets/img/" + p + (rest || "");
}

function toast(title, msg, timeoutMs = 3800) {
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
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function safeText(v, fallback = "Por confirmar") {
  const t = String(v ?? "").trim();
  return t ? t : fallback;
}

function hasSupabase() {
  return !!(window.APP && APP.supabase);
}

// ✅ Precio helpers
function normCurrency(cur) {
  const c = String(cur || "").trim().toUpperCase();
  if (c === "USD" || c === "CRC") return c;
  return "";
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

// ============================================================
// Loader
// ============================================================
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

// ============================================================
// Media picking (desktop/mobile)
// ============================================================
function isDesktop() {
  return window.matchMedia && window.matchMedia("(min-width: 900px)").matches;
}

function pickHeroImage(ev) {
  const fallback = "./assets/img/hero-1.jpg";
  const desk = normalizeImgPath(ev?.imgDesktop, "");
  const mob = normalizeImgPath(ev?.imgMobile, "");
  const base = normalizeImgPath(ev?.img, "");

  // Desktop: img_desktop > img > fallback
  if (isDesktop()) return desk || base || fallback;

  // Mobile: img_mobile > img > fallback
  return mob || base || fallback;
}

function setHeroVideoIfPossible(ev) {
  // Solo si existe un <video id="heroVideo"> en tu HTML.
  const v = $("#heroVideo");
  if (!v) return;

  const url = String(ev?.videoUrl || "").trim();
  if (!url) {
    try { v.pause?.(); } catch (_) {}
    v.removeAttribute("src");
    const source = v.querySelector("source");
    if (source) source.removeAttribute("src");
    v.setAttribute("hidden", "");
    return;
  }

  v.removeAttribute("hidden");
  const source = v.querySelector("source");
  if (source) {
    source.src = url;
    v.load?.();
  } else {
    v.src = url;
    v.load?.();
  }
}

// ============================================================
// Supabase fetch
// ============================================================
async function fetchEventFromSupabase(eventId) {
  if (!hasSupabase()) {
    console.error("APP.supabase no está listo. Orden: Supabase CDN -> supabaseClient.js -> event.js");
    toast("Error", "Supabase no está listo.");
    return null;
  }

  const eid = String(eventId ?? "").trim();
  if (!eid) return null;

  // ✅ SELECT alineado con tu schema ACTUAL (incluye nuevas columnas)
  const sel =
    "id,title,type,month_key,description,img,img_desktop,img_mobile,more_img,more_img_alt,video_url,location,time_range,duration_hours,price_amount,price_currency,created_at,updated_at";

  const evRes = await APP.supabase.from("events").select(sel).eq("id", eid).maybeSingle();

  if (evRes.error) {
    console.error(evRes.error);
    toast("Error", "No se pudo cargar el evento.");
    return null;
  }
  if (!evRes.data) return null;

  // 2) Fechas
  let datesOk = true;

  const datesRes = await APP.supabase
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
      id: String(d?.id || ""),
      label: String(d?.label || "").trim(),
      seats: Math.max(0, Number(d?.seats_available ?? 0)),
      seats_total: Math.max(0, Number(d?.seats_total ?? 0)),
      created_at: d?.created_at ? String(d.created_at) : "",
    }))
    .filter((d) => d.id);

  if (!datesRes.error && dates.length === 0) datesOk = false;

  dates.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ta !== tb) return ta - tb;
    return String(a.label).localeCompare(String(b.label), "es");
  });

  const seatsTotalAvailable = dates.reduce((acc, x) => acc + (Number(x.seats) || 0), 0);

  const rawImg = evRes.data.img || "./assets/img/hero-1.jpg";
  const rawDesk = evRes.data.img_desktop || "";
  const rawMob = evRes.data.img_mobile || "";
  const rawMore = evRes.data.more_img || "";
  const rawMoreAlt = evRes.data.more_img_alt || "";
  const rawVideo = evRes.data.video_url || "";

  return {
    id: String(evRes.data.id || ""),
    type: String(evRes.data.type || "Experiencia"),
    monthKey: String(evRes.data.month_key || "—").toUpperCase(),
    title: String(evRes.data.title || "Evento"),
    desc: String(evRes.data.description || ""),

    img: normalizeImgPath(rawImg, "./assets/img/hero-1.jpg"),
    imgDesktop: normalizeImgPath(rawDesk, ""),
    imgMobile: normalizeImgPath(rawMob, ""),

    videoUrl: String(rawVideo || "").trim(),

    moreImg: String(rawMore || "").trim(),
    moreImgAlt: String(rawMoreAlt || "").trim(),

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

// ============================================================
// State + single listener
// ============================================================
let CURRENT = null;

function goRegisterWithDate(eventId, dateId, dateLabel) {
  const e = encodeURIComponent(String(eventId || ""));
  const d = encodeURIComponent(String(dateId || ""));
  const l = encodeURIComponent(String(dateLabel || ""));
  window.location.href = `./register.html?event=${e}&date_id=${d}&date_label=${l}`;
}

function ensurePickListener() {
  if (ensurePickListener._done) return;
  ensurePickListener._done = true;

  document.addEventListener("click", (e) => {
    const pickBtn = e.target.closest("[data-pick]");
    if (!pickBtn) return;
    if (!CURRENT) return;

    let dateId = String(pickBtn.getAttribute("data-pick") || "");
    if (!dateId) return;

    if (dateId === "__dropdown__") {
      const sel = $("#dateSelect");
      const v = String(sel?.value || "");
      if (!v) {
        toast("Elegí una fecha", "Seleccioná una fecha para continuar.");
        return;
      }
      dateId = v;
    }

    const dateObj = (CURRENT.dates || []).find((d) => String(d.id) === String(dateId));
    const label = dateObj ? String(dateObj.label || "") : "";
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

// ============================================================
// "Ver más info" (mobile) — USA TU HTML (NO inyecta)
// IDs en tu event.html:
//   #moreInfo, #btnMoreInfo, #morePanel, #evMoreImg
// ============================================================
function ensureMoreInfoWiring() {
  if (ensureMoreInfoWiring._done) return;
  ensureMoreInfoWiring._done = true;

  const btn = $("#btnMoreInfo");
  const panel = $("#morePanel");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    const next = !isOpen;

    btn.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
  });
}

function setMoreInfoMedia(ev) {
  const wrap = $("#moreInfo");
  const img = $("#evMoreImg");
  const btn = $("#btnMoreInfo");
  const panel = $("#morePanel");
  if (!wrap || !img || !btn || !panel) return;

  const raw = String(ev?.moreImg || "").trim();
  const has = !!raw;

  if (!has) {
    wrap.setAttribute("hidden", "");
    return;
  }

  img.src = raw;
  img.alt = ev?.moreImgAlt
    ? ev.moreImgAlt
    : (ev?.title ? `Más info: ${ev.title}` : "Información adicional del evento");

  wrap.removeAttribute("hidden");
  btn.setAttribute("aria-expanded", "false");
  panel.setAttribute("hidden", "");
}

// ============================================================
// Render helpers: fechas (1 vs dropdown)
// ============================================================
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
    const dateId = String(x?.id || "");
    const label = String(x?.label || "").trim();
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
    const id = String(x?.id || "");
    const label = String(x?.label || "").trim() || "Por definir";
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
    const v = String(sel.value || "");
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

// ============================================================
// Render
// ============================================================
function setNotices({ sold, available, pending }) {
  const soldNotice = $("#soldNotice");
  const availNotice = $("#availNotice");
  const pendingNotice = $("#pendingNotice");

  [soldNotice, availNotice, pendingNotice].forEach((el) => {
    if (!el) return;
    el.setAttribute("hidden", "");
  });

  if (sold && soldNotice) soldNotice.removeAttribute("hidden");
  else if (available && availNotice) availNotice.removeAttribute("hidden");
  else if (pending && pendingNotice) pendingNotice.removeAttribute("hidden");
}

function renderEvent(ev) {
  CURRENT = ev;

  if (!ev) {
    toast("Evento no encontrado", "Volviendo a la lista de eventos…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  const soldOutTotal = ev.datesOk && (Number(ev.seats) || 0) <= 0;

  // ✅ Hero media pick (img_desktop/img_mobile)
  const heroPickedImg = pickHeroImage(ev);

  // ✅ Video desktop si existe elemento + URL
  if (isDesktop()) setHeroVideoIfPossible(ev);
  else setHeroVideoIfPossible({ videoUrl: "" });

  const heroBg = $("#heroBg");
  if (heroBg) {
    heroBg.style.setProperty("--bgimg", `url('${safeCssUrl(heroPickedImg)}')`);
    heroBg.style.backgroundImage = `url('${safeCssUrl(heroPickedImg)}')`;
  }

  const heroImgEl = $("#evPhoto");
  if (heroImgEl) {
    heroImgEl.src = heroPickedImg;
    heroImgEl.alt = ev.title ? `Foto del evento: ${ev.title}` : "Foto del evento";
  }

  // ✅ More info (more_img / more_img_alt)
  ensureMoreInfoWiring();
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
          !ev.datesOk ? "Por confirmar" : (soldOutTotal ? "0 (Agotado)" : escapeHtml(ev.seats))
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

  if (!ev.datesOk) {
    setNotices({ sold: false, available: false, pending: true });
  } else if (soldOutTotal) {
    setNotices({ sold: true, available: false, pending: false });
  } else {
    setNotices({ sold: false, available: true, pending: false });
  }

  const btnRegister = $("#btnRegister");
  if (btnRegister) {
    const firstAvailable = (ev.dates || []).find((x) => (Number(x?.seats) || 0) > 0);

    if (firstAvailable && String(firstAvailable.id || "")) {
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

  if (soldOutTotal && ev.datesOk) {
    toast("Evento agotado", "Este evento no tiene cupos disponibles.");
  }
}

// ============================================================
// Init
// ============================================================
(async function init() {
  ensurePickListener();

  const eventId = String(getParam("event") ?? "").trim();
  if (!eventId) {
    toast("Falta el evento", "Volviendo a la lista…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 700);
    return;
  }

  setLoading(true);

  const ev = await fetchEventFromSupabase(eventId);
  renderEvent(ev);

  setLoading(false);
})();
