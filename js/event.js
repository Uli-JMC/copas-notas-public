"use strict";

/* ============================================================
   event.js (Supabase-first)
   - Carga evento + fechas desde Supabase
   - Renderiza detalle + lista de fechas
   - "Elegir" manda a register con date_id (UUID)
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
  // Sin depender de ECN. Si tu data.js publica algo, se puede usar, si no fallback.
  try {
    const media = window.ECN && typeof ECN.getMedia === "function" ? ECN.getMedia() : null;
    return normalizeImgPath(media?.defaultHero || "./assets/img/hero-1.jpg");
  } catch (_) {
    return "./assets/img/hero-1.jpg";
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

  // 2) Fechas (tratamos de ordenar por date_at si existe, si no created_at, si no label)
  // Nota: si "date_at" no existe en tu tabla, Supabase tiraría error si lo pedimos.
  // Para evitar eso, pedimos columnas seguras y ordenamos en JS.
  const datesRes = await APP.supabase
    .from("event_dates")
    .select("id,event_id,label,seats_total,seats_available,created_at")
    .eq("event_id", eventId);

  if (datesRes.error) {
    console.error(datesRes.error);
    toast("Aviso", "El evento cargó, pero no se pudieron cargar las fechas.");
  }

  const datesRaw = Array.isArray(datesRes.data) ? datesRes.data : [];

  const dates = datesRaw
    .map((d) => ({
      id: String(d?.id || ""),
      label: String(d?.label || "").trim(),
      seats: Math.max(0, Number(d?.seats_available ?? 0)), // ✅ DISPONIBLES
      seats_total: Math.max(0, Number(d?.seats_total ?? 0)),
      created_at: d?.created_at ? String(d.created_at) : "",
    }))
    .filter((d) => d.id);

  // Orden estable (created_at asc, luego label)
  dates.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ta !== tb) return ta - tb;
    return String(a.label).localeCompare(String(b.label), "es");
  });

  // ✅ Seats del evento = suma de seats_available
  const seatsTotalAvailable = dates.reduce((acc, x) => acc + (Number(x.seats) || 0), 0);

  return {
    id: String(evRes.data.id || ""),
    type: String(evRes.data.type || "Experiencia"),
    monthKey: String(evRes.data.month_key || "—").toUpperCase(),
    title: String(evRes.data.title || "Evento"),
    desc: String(evRes.data.desc || ""),
    img: normalizeImgPath(evRes.data.img || getDefaultHero()),

    // Fechas
    dates, // [{id,label,seats,seats_total}]
    seats: seatsTotalAvailable, // ✅ DISPONIBLES REALES

    // Detalles
    location: safeText(evRes.data.location, "Por confirmar"),
    timeRange: safeText(evRes.data.time_range, "Por confirmar"),
    durationHours: safeText(evRes.data.duration_hours, "Por confirmar"),

    // Legacy compat
    duration: safeText(evRes.data.duration_hours, "Por confirmar"),
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
  // date_label es opcional (solo UI)
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

    const soldOutTotal = (Number(CURRENT.seats) || 0) <= 0;
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
function renderEvent(ev) {
  CURRENT = ev;

  if (!ev) {
    toast("Evento no encontrado", "Volviendo a la lista de eventos…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  const soldOutTotal = (Number(ev.seats) || 0) <= 0;

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
      <span class="pill">${escapeHtml(datesText || "Por definir")}</span>
      <span class="pill">${escapeHtml(ev.monthKey || "—")}</span>
      ${
        soldOutTotal
          ? `<span class="pill" style="border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.10);">AGOTADO</span>`
          : ``
      }
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
    if (!dates.length) {
      dateList.innerHTML = `<div class="emptyMonth">Fechas por confirmar.</div>`;
    } else {
      dates.forEach((x) => {
        const dateId = String(x?.id || "");
        const label = String(x?.label || "").trim();
        const seats = Math.max(0, Number(x?.seats) || 0);
        const dateSoldOut = seats <= 0;

        const row = document.createElement("div");
        row.className = "dateItem";

        // Armamos DOM seguro (evita problemas con HTML escapado en data-pick)
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
        <div class="kvValue">${soldOutTotal ? "0 (Agotado)" : escapeHtml(ev.seats)}</div>
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

  // Register button (sin fecha seleccionada)
  const btnRegister = $("#btnRegister");
  if (btnRegister) {
    // ✅ Si hay una única fecha con cupo, mandamos directo con date_id (mejor UX)
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

  // Sold-out UI
  const soldNotice = $("#soldNotice");
  if (soldNotice) soldNotice.hidden = !soldOutTotal;

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

  const ev = await fetchEventFromSupabase(eventId);
  renderEvent(ev);
})();
