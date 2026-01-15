"use strict";

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

  const closeBtn = el.querySelector(".close");
  const kill = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 180);
  };

  closeBtn?.addEventListener("click", kill, { once: true });
  setTimeout(kill, timeoutMs);
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function normalizePhone(raw) {
  const only = String(raw || "").replace(/\D/g, "");
  // CR: 8 dígitos o 506 + 8 dígitos
  if (only.length === 8) return "506" + only;
  if (only.length === 11 && only.startsWith("506")) return only;
  return null;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || "").trim());
}

function setFieldError(fieldId, msg) {
  const field = document.getElementById(fieldId)?.closest(".field");
  if (!field) return;
  field.classList.add("invalid");
  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = msg || "Revisá este campo.";
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId)?.closest(".field");
  if (!field) return;
  field.classList.remove("invalid");
  const err = field.querySelector(`[data-err-for="${fieldId}"]`);
  if (err) err.textContent = "";
}

function safeTrim(v) {
  return String(v || "").trim();
}

function sumSeatsFromDates(ev) {
  return (ev?.dates || []).reduce((a, d) => a + (Number(d?.seats) || 0), 0);
}

// ✅ Cupos DISPONIBLES (no totales): suma solo fechas con seats > 0
function sumAvailableSeats(ev) {
  return (ev?.dates || []).reduce((a, d) => {
    const s = Number(d?.seats) || 0;
    return a + (s > 0 ? s : 0);
  }, 0);
}

// ============================================================
// ECN helpers (regs + seats) - Local-first
// ============================================================
function getRegsLocal() {
  try {
    if (window.ECN && typeof ECN.getRegistrations === "function") {
      const list = ECN.getRegistrations();
      return Array.isArray(list) ? list : [];
    }
  } catch (_) {}

  try {
    const key = window.ECN?.LS?.REGS || "ecn_regs";
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function regExists(email, eventId, eventDate) {
  const e = String(email || "").trim().toLowerCase();
  const id = String(eventId || "");
  const d = String(eventDate || "");
  if (!e || !id || !d) return false;

  const regs = getRegsLocal();
  return regs.some((r) => {
    const re = String(r?.email || "").trim().toLowerCase();
    const rid = String(r?.event_id || r?.eventId || "");
    const rd = String(r?.event_date || r?.eventDate || "");
    return re === e && rid === id && rd === d;
  });
}

function decrementSeatLocal(eventId, dateLabel) {
  // 1) Hook oficial si existe
  try {
    if (window.ECN && typeof ECN.decrementSeat === "function") {
      return !!ECN.decrementSeat(eventId, dateLabel);
    }
  } catch (_) {}

  // 2) Fallback: actualizar localStorage de EVENTS (si tu data.js lo usa)
  try {
    const key = window.ECN?.LS?.EVENTS || "ecn_events";
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return false;

    const i = list.findIndex((x) => String(x?.id || "") === String(eventId || ""));
    if (i < 0) return false;

    const ev = list[i];
    if (!Array.isArray(ev?.dates)) return false;

    const j = ev.dates.findIndex((d) => String(d?.label || "") === String(dateLabel || ""));
    if (j < 0) return false;

    const cur = Math.max(0, Number(ev.dates[j].seats) || 0);
    if (cur <= 0) return false;

    ev.dates[j].seats = cur - 1;
    list[i] = ev;
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================
// Data mapping (✅ soporta RAW y FLATTENED)
// RAW:  {dates:[{label,seats}]}
// FLAT: {dates:[string], _dates:[{label,seats}]}
// ============================================================
function toUiEvent(ev) {
  const raw = ev || {};

  const srcDates =
    Array.isArray(raw._dates)
      ? raw._dates
      : Array.isArray(raw.dates) && raw.dates.length && typeof raw.dates[0] === "object"
        ? raw.dates
        : [];

  const dates = srcDates
    .map((d) => ({
      label: safeTrim(d?.label),
      seats: Math.max(0, Number(d?.seats) || 0),
    }))
    .filter((d) => d.label);

  // Si NO hay objetos, pero dates viene como string[]
  if (!dates.length && Array.isArray(raw.dates) && raw.dates.length && typeof raw.dates[0] !== "object") {
    raw.dates.forEach((label) => {
      const t = safeTrim(label);
      if (t) dates.push({ label: t, seats: 0 });
    });
  }

  const totalSeats =
    window.ECN && typeof ECN.totalSeats === "function"
      ? ECN.totalSeats(raw)
      : dates.reduce((a, d) => a + (Number(d.seats) || 0), 0);

  // ✅ NUEVO: campos oficiales (según tu data.js actualizado)
  const location = safeTrim(raw.location);
  const timeRange = safeTrim(raw.timeRange);
  const durationHours = safeTrim(raw.durationHours);

  // ✅ Compat (por si algo viejo los usaba)
  const legacyDuration =
    safeTrim(raw.duration) ||
    safeTrim(raw.duracion) ||
    safeTrim(raw.durationText) ||
    safeTrim(raw.duracionText) ||
    "";

  const legacyHours =
    safeTrim(raw.hours) ||
    safeTrim(raw.horarios) ||
    safeTrim(raw.schedule) ||
    safeTrim(raw.horario) ||
    safeTrim(raw.time) ||
    "";

  const legacyAddress =
    safeTrim(raw.address) ||
    safeTrim(raw.direccion) ||
    safeTrim(raw.ubicacion) ||
    "";

  return {
    id: raw.id,
    type: raw.type,
    monthKey: raw.monthKey,
    title: raw.title,
    desc: raw.desc,
    dates,
    seats: totalSeats,

    // ✅ Canon
    location: location || legacyAddress || "",
    timeRange: timeRange || legacyHours || "",
    durationHours: durationHours || legacyDuration || "",
  };
}

function pickEvent() {
  const eventId = getParam("event");
  const dateFromUrl = getParam("date");

  if (!window.ECN) {
    return { ev: null, dateFromUrl };
  }

  let ev = null;

  if (eventId) {
    // ✅ preferí el RAW para tener dates[{label,seats}]
    const raw =
      typeof ECN.getEventById === "function" ? ECN.getEventById(eventId)
      : typeof ECN.getEventRawById === "function" ? ECN.getEventRawById(eventId)
      : null;

    ev = raw ? toUiEvent(raw) : null;
  }

  if (!ev) {
    const up =
      typeof ECN.getUpcomingEvents === "function" ? ECN.getUpcomingEvents()
      : typeof ECN.getEventsRaw === "function" ? ECN.getEventsRaw()
      : typeof ECN.getEvents === "function" ? ECN.getEvents()
      : [];

    if (up && up.length) ev = toUiEvent(up[0]);
  }

  return { ev, dateFromUrl };
}

// ============================================================
// UI helpers (meta dinámico)
// ============================================================
function getSelectedDateSeats(ev, selectedLabel) {
  if (!selectedLabel) return null;
  const d = (ev?.dates || []).find((x) => x.label === selectedLabel);
  return d ? Number(d.seats) || 0 : null;
}

// ✅ Badge superior: cupos disponibles (por fecha si hay selección, si no total disponible)
function renderAvailableSeatsBadge(ev, selectedDateLabel = "") {
  const badge = $("#availableSeats");
  if (!badge) return;

  const selected = String(selectedDateLabel || "").trim();
  const seatsForSelected = selected ? getSelectedDateSeats(ev, selected) : null;

  // Si hay fecha seleccionada, mostramos cupos de esa fecha
  if (selected && seatsForSelected !== null) {
    badge.textContent = `CUPOS DISP.: ${Math.max(0, seatsForSelected)}`;
    return;
  }

  // Si no, mostramos cupos disponibles totales (solo >0)
  const availableTotal = sumAvailableSeats(ev);
  badge.textContent = `CUPOS DISP.: ${Math.max(0, availableTotal)}`;
}

// ✅ MetaBox: ESTRUCTURA EXACTA para desktop:
// Header: Tipo
// Body en 2 columnas (con 4 filas en orden):
// 1) Fechas disponibles  2) Ubicación
// 3) Duración (hrs)      4) Hora (rango)
// NOTA: tus IDs pedían "Dirección/Duración/Horarios"; ahora se alinea con data.js
function renderEventHeader(ev, selectedDateLabel = "") {
  const titleEl = $("#eventTitle");
  const descEl = $("#eventDesc");
  const metaBox = $("#metaBox");

  if (titleEl) titleEl.textContent = ev?.title || "Evento";
  if (descEl) descEl.textContent = ev?.desc || "Completá tus datos para reservar tu cupo.";
  if (!metaBox) return;

  // Consistencia interna (no rompe nada)
  const totalNow = sumSeatsFromDates(ev);
  ev.seats = totalNow;

  const datesText = (ev?.dates || []).map((d) => d.label).join(" • ");

  const locationText = safeTrim(ev?.location) || "Por confirmar";
  const durationText = safeTrim(ev?.durationHours) || "Por confirmar";
  const timeRangeText = safeTrim(ev?.timeRange) || "Por confirmar";

  metaBox.innerHTML = `
    <div class="mHead">
      <div class="mLabel">Tipo</div>
      <div class="mValue">${escapeHtml(ev?.type || "—")}</div>
    </div>

    <div class="mBody">
      <div class="mRow">
        <div class="mLabel">Fechas disponibles</div>
        <div class="mValue">${escapeHtml(datesText || "—")}</div>
      </div>

      <div class="mRow">
        <div class="mLabel">Ubicación</div>
        <div class="mValue">${escapeHtml(locationText)}</div>
      </div>

      <div class="mRow">
        <div class="mLabel">Duración</div>
        <div class="mValue">${escapeHtml(durationText)}</div>
      </div>

      <div class="mRow">
        <div class="mLabel">Hora</div>
        <div class="mValue">${escapeHtml(timeRangeText)}</div>
      </div>
    </div>
  `;

  // ✅ Badge superior
  renderAvailableSeatsBadge(ev, selectedDateLabel);
}

function renderDates(ev, preselect) {
  const select = $("#eventDate");
  if (!select) return;

  select.innerHTML = "";

  const dates = ev?.dates || [];
  if (!dates.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin fechas disponibles";
    select.appendChild(opt);
    return;
  }

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Seleccioná una fecha";
  select.appendChild(ph);

  dates.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.label;

    // ✅ Solo fecha (NO cupos)
    opt.textContent = `${d.label}`;

    // Si está agotada, se deshabilita (pero sin mostrar cupos)
    if ((Number(d.seats) || 0) <= 0) opt.disabled = true;

    select.appendChild(opt);
  });

  if (preselect) {
    const match = dates.find((x) => x.label === preselect);
    if (match && (Number(match.seats) || 0) > 0) {
      select.value = preselect;
    }
  }
}

function syncSubmitAvailability(ev) {
  const submitBtn = $("#submitBtn");
  const dateSel = $("#eventDate");
  if (!submitBtn || !dateSel) return;

  const selected = dateSel.value || "";
  const soldOutTotal = (sumAvailableSeats(ev) || 0) <= 0; // ✅ disponible real

  if (soldOutTotal) {
    submitBtn.disabled = true;
    return;
  }

  if (!selected) {
    submitBtn.disabled = true;
    return;
  }

  const seatsForDate = getSelectedDateSeats(ev, selected);
  if (seatsForDate !== null && seatsForDate <= 0) {
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = false;
}

// ============================================================
// Validation
// ============================================================
function validateForm(ev) {
  let ok = true;

  const firstName = ($("#firstName")?.value || "").trim();
  const lastName = ($("#lastName")?.value || "").trim();
  const birthDate = $("#birthDate")?.value || "";
  const email = ($("#email")?.value || "").trim();
  const phone = ($("#phone")?.value || "").trim();
  const eventDate = $("#eventDate")?.value || "";

  ["firstName", "lastName", "birthDate", "email", "phone", "eventDate", "allergies"].forEach(clearFieldError);

  if (!firstName) {
    ok = false;
    setFieldError("firstName", "Ingresá tu nombre.");
  }
  if (!lastName) {
    ok = false;
    setFieldError("lastName", "Ingresá tus apellidos.");
  }

  if (!birthDate) {
    ok = false;
    setFieldError("birthDate", "Seleccioná tu fecha de nacimiento.");
  } else {
    const d = new Date(birthDate);
    const now = new Date();
    if (isNaN(d.getTime()) || d > now) {
      ok = false;
      setFieldError("birthDate", "La fecha no es válida.");
    }
  }

  if (!email || !validEmail(email)) {
    ok = false;
    setFieldError("email", "Ingresá un correo válido.");
  }

  const normalized = normalizePhone(phone);
  if (!phone || !normalized) {
    ok = false;
    setFieldError("phone", "Ingresá un teléfono válido (8 dígitos o 506 + 8).");
  }

  if (!eventDate) {
    ok = false;
    setFieldError("eventDate", "Seleccioná una fecha del evento.");
  } else {
    const seatsForDate = getSelectedDateSeats(ev, eventDate);
    if (seatsForDate !== null && seatsForDate <= 0) {
      ok = false;
      setFieldError("eventDate", "Esa fecha está agotada. Elegí otra.");
    }
  }

  const allergies = $("#allergies")?.value || "";
  if (allergies && !allergies.trim()) {
    ok = false;
    setFieldError("allergies", "Si lo completás, escribí un detalle.");
  }
  if (allergies && allergies.length > 120) {
    ok = false;
    setFieldError("allergies", "Máximo 120 caracteres.");
  }

  return { ok, normalizedPhone: normalized };
}

// ============================================================
// Init
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const picked = pickEvent();
  const ev = picked.ev;
  const dateFromUrl = picked.dateFromUrl;

  if (!ev) {
    toast("Sin datos", "No encontramos el evento. Volviendo a Home…");
    setTimeout(() => (window.location.href = "./home.html#proximos"), 900);
    return;
  }

  // Buttons: volver + ver más
  const backBtn = $("#backBtn");
  const moreBtn = $("#moreBtn");
  if (backBtn) backBtn.href = `./event.html?event=${encodeURIComponent(ev.id)}`;
  if (moreBtn) moreBtn.href = `./event.html?event=${encodeURIComponent(ev.id)}`;

  // Render header + dates
  renderDates(ev, dateFromUrl);
  const initialSelected = $("#eventDate")?.value || "";
  renderEventHeader(ev, initialSelected);

  // Sold out total (disponible real)
  if ((sumAvailableSeats(ev) || 0) <= 0) {
    toast("Evento agotado", "Este evento no tiene cupos disponibles.");
  }

  // Counter allergies
  const allergiesEl = $("#allergies");
  const countEl = $("#count");
  const syncCount = () => {
    if (!countEl || !allergiesEl) return;
    countEl.textContent = String(allergiesEl.value.length);
  };
  if (allergiesEl) allergiesEl.addEventListener("input", syncCount);
  syncCount();

  // Live validation clear on input
  ["firstName", "lastName", "birthDate", "email", "phone", "eventDate", "allergies"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => clearFieldError(id));
    el.addEventListener("change", () => clearFieldError(id));
  });

  // Gate submit until date picked + cupos + meta live
  const dateSel = $("#eventDate");
  if (dateSel) {
    dateSel.addEventListener("change", () => {
      const selected = dateSel.value || "";

      // Update header + badge
      renderEventHeader(ev, selected);

      // Gate
      syncSubmitAvailability(ev);

      // Toast si está agotada
      if (selected) {
        const seatsForDate = getSelectedDateSeats(ev, selected);
        if (seatsForDate !== null && seatsForDate <= 0) {
          toast("Agotado", "Esa fecha está agotada. Elegí otra.");
          setFieldError("eventDate", "Esa fecha está agotada. Elegí otra.");
        }
      }
    });
  }
  syncSubmitAvailability(ev);

  // Submit
  const form = $("#regForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if ((sumAvailableSeats(ev) || 0) <= 0) {
      toast("Agotado", "No hay cupos para este evento.");
      return;
    }

    const { ok, normalizedPhone } = validateForm(ev);
    if (!ok) {
      toast("Revisá el formulario", "Hay campos pendientes o inválidos.");
      return;
    }

    const selectedDate = $("#eventDate")?.value || "";
    const dateSeats = getSelectedDateSeats(ev, selectedDate);

    if (dateSeats !== null && dateSeats <= 0) {
      toast("Agotado", "Esa fecha ya no tiene cupos.");
      syncSubmitAvailability(ev);
      renderEventHeader(ev, selectedDate);
      return;
    }

    const emailLower = ($("#email")?.value || "").trim().toLowerCase();

    // ✅ anti-duplicado (mismo email + evento + fecha)
    if (regExists(emailLower, ev.id, selectedDate)) {
      toast("Ya estás inscrito", "Encontramos un registro con ese correo para este evento y fecha.");
      setFieldError("email", "Este correo ya está inscrito en esta fecha.");
      return;
    }

    // Payload (luego se inserta en Supabase)
    const payload = {
      event_id: ev.id,
      event_title: ev.title,
      event_date: selectedDate,

      // ✅ NUEVO: persistimos los nuevos campos en el registro (para admin + CSV)
      event_location: safeTrim(ev.location) || "Por confirmar",
      event_time_range: safeTrim(ev.timeRange) || "Por confirmar",
      event_duration_hours: safeTrim(ev.durationHours) || "Por confirmar",

      first_name: ($("#firstName")?.value || "").trim(),
      last_name: ($("#lastName")?.value || "").trim(),
      birth_date: $("#birthDate")?.value || "",
      email: emailLower,
      phone: normalizedPhone,
      allergies: ($("#allergies")?.value || "").trim(),
      marketing_opt_in: !!$("#marketingOptIn")?.checked,
      created_at: new Date().toISOString(),
    };

    // UI submit
    const submitBtn = $("#submitBtn");
    const oldLabel = submitBtn ? submitBtn.textContent : "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";
    }

    try {
      // Simula request (luego se reemplaza por supabase.insert)
      await new Promise((r) => setTimeout(r, 650));

      // ✅ Descontar cupo local ANTES de guardar registro (evita sobrecupo)
      const seatOk = decrementSeatLocal(ev.id, selectedDate);
      if (!seatOk) {
        toast("Agotado", "Esa fecha se quedó sin cupos justo ahora. Elegí otra.");

        // refresca UI
        const refreshedPick = pickEvent();
        if (refreshedPick?.ev && refreshedPick.ev.id === ev.id) {
          ev.dates = refreshedPick.ev.dates;
          ev.seats = refreshedPick.ev.seats;
          renderDates(ev, selectedDate);
          renderEventHeader(ev, selectedDate);
        }

        syncSubmitAvailability(ev);

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = oldLabel || "Inscribirme";
        }
        return;
      }

      // ✅ Guarda en registros (localStorage) para el admin
      if (window.ECN && typeof ECN.saveRegistration === "function") {
        ECN.saveRegistration(payload);
      } else {
        const key = window.ECN?.LS?.REGS || "ecn_regs";
        const regs = getRegsLocal();
        regs.unshift(payload);
        localStorage.setItem(key, JSON.stringify(regs));
      }

      // Compat
      localStorage.setItem("last_registration", JSON.stringify(payload));

      toast("Inscripción completada", "Te llegará por correo la confirmación.");

      form.reset();
      if (countEl) countEl.textContent = "0";

      // Re-render fechas + header (refleja cupos nuevos)
      const refreshed = pickEvent().ev;
      if (refreshed && refreshed.id === ev.id) {
        ev.dates = refreshed.dates;
        ev.seats = refreshed.seats;

        // importante: mantener meta en pantalla (location/time/duration)
        ev.location = refreshed.location || ev.location;
        ev.timeRange = refreshed.timeRange || ev.timeRange;
        ev.durationHours = refreshed.durationHours || ev.durationHours;

        renderDates(ev, "");
        renderEventHeader(ev, "");
      } else {
        renderEventHeader(ev, "");
      }

      syncSubmitAvailability(ev);

      // Redirección suave a “ver más”
      setTimeout(() => {
        window.location.href = `./event.html?event=${encodeURIComponent(ev.id)}`;
      }, 1100);
    } catch (err) {
      console.error(err);
      toast("Error", "No se pudo enviar. Probá de nuevo.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = oldLabel || "Inscribirme";
      }
      return;
    }
  });
});
