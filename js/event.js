"use strict";

/* ============================================================
   event.js (Supabase-first) ✅ FIX
   - No marca "Agotado" si fechas aún no cargaron (evita falso sold-out)
   - Loader suave para evitar “brinco” visual al refrescar
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

function normalizeImgPath(input) {
  const fallback = "./assets/img/hero-1.jpg";
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

function getDefaultHero() {
  try {
    const media = window.ECN && typeof ECN.getMedia === "function" ? ECN.getMedia() : null;
    return normalizeImgPath(media?.defaultHero || "./assets/img/hero-1.jpg");
  } catch (_) {
    return "./assets/img/hero-1.jpg";
  }
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
// Supabase fetch
// ============================================================
async function fetchEventFromSupabase(eventId) {
  if (!hasSupabase()) {
    console.error("APP.supabase no está listo. Orden: Supabase CDN -> supabaseClient.js -> event.js");
    toast("Error", "Supabase no está listo.");
    return null;
  }
  if (!eventId) return null;

  // 1) Evento
  const evRes = await APP.supabase
    .from("events")
    .select('id,title,type,month_key,"desc",img,location,time_range,duration_hours,created_at,updated_at')
    .eq("id", eventId)
    .maybeSingle();

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
    .eq("event_id", eventId);

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

  // Si no hubo error pero vienen 0 fechas, lo tratamos como "pendiente"
  if (!datesRes.error && dates.length === 0) datesOk = false;

  // Orden estable
  dates.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ta !== tb) return ta - tb;
    return String(a.label).localeCompare(String(b.label), "es");
  });

  const seatsTotalAvailable = dates.reduce((acc, x) => acc + (Number(x.seats) || 0), 0);

  return {
    id: String(evRes.data.id || ""),
    type: String(evRes.data.type || "Experiencia"),
    monthKey: String(evRes.data.month_key || "—").toUpperCase(),
    title: String(evRes.data.title || "Evento"),
    // ✅ FIX: la columna se llama "desc"
    desc: String(evRes.data["desc"] || ""),
    img: normalizeImgPath(evRes.data.img || getDefaultHero()),

    dates,
    seats: seatsTotalAvailable, // suma seats_available (solo si datesOk)
    datesOk,

    location: safeText(evRes.data.location, "Por confirmar"),
    timeRange: safeText(evRes.data.time_range, "Por confirmar"),
    durationHours: safeText(evRes.data.duration_hours, "Por confirmar"),
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

    const dateId = String(pickBtn.getAttribute("data-pick") || "");
    if (!dateId) return;

    const dateObj = (CURRENT.dates || []).find((d) => String(d.id) === dateId);
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
// Render
// ============================================================
function setNotices({ sold, available, pending }) {
  const soldNotice = $("#soldNotice");
  const availNotice = $("#availNotice");
  const pendingNotice = $("#pendingNotice");

  // ✅ primero ocultar todos (por si CSS raro)
  [soldNotice, availNotice, pendingNotice].forEach((el) => {
    if (!el) return;
    el.setAttribute("hidden", "");
  });

  // ✅ luego mostrar SOLO el que corresponde
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

  // ✅ SOLO es agotado si fechas están OK y el total de seats es 0
  const soldOutTotal = ev.datesOk && (Number(ev.seats) || 0) <= 0;
  const hasDates = Array.isArray(ev.dates) && ev.dates.length > 0;

  // Background hero
  const heroBg = $("#heroBg");
  if (heroBg) {
    const bg = normalizeImgPath(ev.img || getDefaultHero());
    heroBg.style.setProperty("--bgimg", `url('${safeCssUrl(bg)}')`);
    heroBg.style.backgroundImage = `url('${safeCssUrl(bg)}')`;
  }

  // Meta pills
  const metaRow = $("#metaRow");
  const datesText = (ev.dates || []).map((d) => d.label).filter(Boolean).join(" • ");

  if (metaRow) {
    metaRow.innerHTML = `
      <span class="pill"><span class="dot"></span> ${escapeHtml(ev.type)}</span>
      <span class="pill">${escapeHtml(datesText || (ev.datesOk ? "Por definir" : "Cupos por confirmar"))}</span>
      <span class="pill">${escapeHtml(ev.monthKey || "—")}</span>
      ${soldOutTotal ? `<span class="pill" style="border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.10);">AGOTADO</span>` : ``}
    `;
  }

  // Title + desc
  const t = $("#evTitle");
  const d = $("#evDesc");
  if (t) t.textContent = ev.title;
  if (d) d.textContent = ev.desc || "";

  // Dates list
  const dateList = $("#dateList");
  if (dateList) {
    dateList.innerHTML = "";

    const dates = Array.isArray(ev.dates) ? ev.dates : [];

    if (!ev.datesOk) {
      dateList.innerHTML = `<div class="emptyMonth">Fechas y cupos por confirmar.</div>`;
    } else if (!dates.length) {
      dateList.innerHTML = `<div class="emptyMonth">Fechas por confirmar.</div>`;
    } else {
      dates.forEach((x) => {
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
        dateList.appendChild(row);
      });
    }
  }

  // KV (DETALLES)
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
    `;
  }

  // Notices
  if (!ev.datesOk) {
    setNotices({ sold: false, available: false, pending: true });
  } else if (soldOutTotal) {
    setNotices({ sold: true, available: false, pending: false });
  } else {
    // si hay fechas ok y no está agotado => disponible
    setNotices({ sold: false, available: true, pending: false });
  }

  // Register button (sin fecha seleccionada)
  const btnRegister = $("#btnRegister");
  if (btnRegister) {
    const firstAvailable = (ev.dates || []).find((x) => (Number(x?.seats) || 0) > 0);

    if (firstAvailable && String(firstAvailable.id || "")) {
      btnRegister.href =
        `./register.html?event=${encodeURIComponent(ev.id)}&date_id=${encodeURIComponent(firstAvailable.id)}&date_label=${encodeURIComponent(firstAvailable.label || "")}`;
    } else {
      btnRegister.href = `./register.html?event=${encodeURIComponent(ev.id)}`;
    }

    // Si cupos por confirmar, no bloqueamos (pero no prometemos cupos)
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

  if (soldOutTotal) {
    toast("Evento agotado", "Este evento no tiene cupos disponibles.");
  }
}

// ============================================================
// Init
// ============================================================
(async function init() {
  ensurePickListener();

  const eventId = getParam("event");
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
