"use strict";

/* ---------- State ---------- */
let dayDataByKey = {}; // "YYYY-MM-DD" -> { dateKey, date, shifts }
let currentWeekStart = getMonday(new Date());
let lastSyncTimestamp = null;
let isSyncing = false;

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABELS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/* ---------- Date helpers ---------- */
function getMonday(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = Sonntag
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

/* ---------- CSV parsing ---------- */

// Robustes CSV-Parsing (Komma-getrennt, unterstützt Anführungszeichen/Escaping).
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignorieren, \n beendet die Zeile
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Erwartet TT.MM.JJJJ, fällt defensiv auf JJJJ-MM-TT zurück (abweichende
// Google-Sheets-Exportformate). Gibt null zurück, wenn kein gültiges Datum
// erkennbar ist -> die Zeile wird dann als Nicht-Tageszeile übersprungen
// (Titel-, Leer-, Header- und Monats-Trennzeilen fallen so automatisch weg).
function parseRowDate(raw) {
  if (!raw) return null;
  const str = raw.trim();
  if (!str) return null;

  let m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
    }
    return null;
  }

  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
    }
    return null;
  }

  return null;
}

// Erwartet HH:MM, akzeptiert defensiv auch "." oder "," als Trenner
// (z.B. "10.00" statt "10:00" - kommt in der Praxis vor, wenn im Sheet
// eine Uhrzeit ohne Zeit-Zellformat als Zahl eingetragen wird).
function parseTime(raw) {
  if (!raw) return null;
  const str = raw.trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[:.,](\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// Baut aus den rohen CSV-Zeilen die Tagesdaten. Spaltenreihenfolge ist fix
// (nicht aus dem Header gelesen): A=Datum, B=Wochentag(ignoriert),
// C/D=Romy Start/Ende, E/F=Bea Start/Ende, G/H=Iris Start/Ende.
function buildDaysFromRows(rows) {
  const days = {};

  for (const row of rows) {
    const date = parseRowDate(row[0]);
    if (!date) continue; // Titel-, Leer-, Header- und Monats-Trennzeilen

    const romyStart = parseTime(row[2]);
    const romyEnd = parseTime(row[3]);
    const beaStart = parseTime(row[4]);
    const beaEnd = parseTime(row[5]);
    const irisStart = parseTime(row[6]);
    const irisEnd = parseTime(row[7]);

    const shifts = {
      romy: romyStart || romyEnd ? { start: romyStart, end: romyEnd } : null,
      bea: beaStart || beaEnd ? { start: beaStart, end: beaEnd } : null,
      iris: irisStart || irisEnd ? { start: irisStart, end: irisEnd } : null,
    };

    const key = dateKey(date);
    days[key] = { dateKey: key, date, shifts };
  }

  return days;
}

/* ---------- Persistenz ---------- */
function saveCache(days, timestamp) {
  const serializable = Object.values(days).map((d) => ({
    dateKey: d.dateKey,
    shifts: d.shifts,
  }));
  try {
    localStorage.setItem(CONFIG.CACHED_DATA_STORAGE_KEY, JSON.stringify(serializable));
    localStorage.setItem(CONFIG.LAST_SYNC_STORAGE_KEY, String(timestamp));
  } catch (e) {
    console.warn("Konnte Daten nicht cachen:", e);
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CONFIG.CACHED_DATA_STORAGE_KEY);
    const ts = localStorage.getItem(CONFIG.LAST_SYNC_STORAGE_KEY);
    if (!raw || !ts) return null;
    const list = JSON.parse(raw);
    const days = {};
    for (const d of list) {
      const [y, m, day] = d.dateKey.split("-").map(Number);
      days[d.dateKey] = { dateKey: d.dateKey, date: new Date(y, m - 1, day), shifts: d.shifts };
    }
    return { days, timestamp: parseInt(ts, 10) };
  } catch (e) {
    console.warn("Konnte Cache nicht laden:", e);
    return null;
  }
}

/* ---------- Sync ---------- */
async function fetchAndParse() {
  const res = await fetch(CONFIG.CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV-Abruf fehlgeschlagen (${res.status})`);
  const text = await res.text();
  const rows = parseCSV(text);
  return buildDaysFromRows(rows);
}

async function sync(force) {
  if (isSyncing) return;

  if (!force && lastSyncTimestamp) {
    const age = Date.now() - lastSyncTimestamp;
    if (age < CONFIG.SYNC_INTERVAL_MS) return;
  }

  isSyncing = true;
  setOffline(false);
  if (force) setSyncStatusText("Aktualisiere…");

  try {
    const days = await fetchAndParse();
    dayDataByKey = days;
    lastSyncTimestamp = Date.now();
    saveCache(days, lastSyncTimestamp);
    renderWeek();
    updateSyncStatus();
  } catch (err) {
    console.warn("Sync fehlgeschlagen, zeige zuletzt bekannten Stand:", err);
    setOffline(true);
    updateSyncStatus();
  } finally {
    isSyncing = false;
  }
}

function setOffline(offline) {
  const badge = document.getElementById("offlineBadge");
  badge.hidden = !offline;
}

function setSyncStatusText(text) {
  document.getElementById("syncStatus").textContent = text;
}

function updateSyncStatus() {
  if (!lastSyncTimestamp) {
    setSyncStatusText("Noch keine Daten geladen");
    return;
  }
  const d = new Date(lastSyncTimestamp);
  const formatted = d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  setSyncStatusText(`Zuletzt aktualisiert am ${formatted}`);
}

/* ---------- Rendering ---------- */
function monthLabelFor(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = weekStart.getMonth();
  const endMonth = weekEnd.getMonth();
  const startYear = weekStart.getFullYear();
  const endYear = weekEnd.getFullYear();

  if (startMonth === endMonth && startYear === endYear) {
    return `${MONTH_LABELS[startMonth]} ${startYear}`;
  }
  const startShort = MONTH_LABELS[startMonth].slice(0, 3);
  const endShort = MONTH_LABELS[endMonth].slice(0, 3);
  if (startYear === endYear) {
    return `${startShort} – ${endShort} ${startYear}`;
  }
  return `${startShort} ${startYear} – ${endShort} ${endYear}`;
}

function renderWeekStrip() {
  const strip = document.getElementById("weekStrip");
  strip.innerHTML = "";
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = addDays(currentWeekStart, i);
    const key = dateKey(date);
    const day = dayDataByKey[key];
    const btn = document.createElement("button");
    btn.className = "week-strip-day";
    if (isSameDay(date, today)) btn.classList.add("is-today");

    const dots = (day
      ? CONFIG.EMPLOYEES.filter((e) => day.shifts[e.key])
      : []
    )
      .map((e) => `<span class="wd-dot" style="background:${e.color}"></span>`)
      .join("");

    btn.innerHTML = `
      <span class="wd-label">${WEEKDAY_LABELS[i]}</span>
      <span class="wd-num">${date.getDate()}</span>
      <span class="wd-dots">${dots}</span>
    `;
    btn.addEventListener("click", () => scrollToDay(key));
    strip.appendChild(btn);
  }
}

function renderDayList() {
  const list = document.getElementById("dayList");
  list.innerHTML = "";
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = addDays(currentWeekStart, i);
    const key = dateKey(date);
    const day = dayDataByKey[key];
    const card = document.createElement("div");
    card.className = "day-card";
    card.id = `day-${key}`;
    const isToday = isSameDay(date, today);
    if (isToday) card.classList.add("is-today");

    const header = document.createElement("div");
    header.className = "day-card-header";
    header.innerHTML = `
      <span class="day-name">${WEEKDAY_LABELS[i]}</span>
      <span class="day-date">${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}</span>
      ${isToday ? '<span class="day-today-tag">Heute</span>' : ""}
    `;
    card.appendChild(header);

    const shiftList = document.createElement("div");
    shiftList.className = "shift-list";

    if (!day) {
      shiftList.innerHTML = `<div class="shift-no-data">Keine Daten für diesen Tag</div>`;
    } else {
      const working = CONFIG.EMPLOYEES.filter((e) => day.shifts[e.key]);
      if (working.length === 0) {
        shiftList.innerHTML = `<div class="shift-empty">Frei</div>`;
      } else {
        for (const e of working) {
          const shift = day.shifts[e.key];
          const row = document.createElement("div");
          row.className = "shift-row";
          let timeLabel;
          if (shift.start && shift.end) timeLabel = `${shift.start} – ${shift.end}`;
          else if (shift.start) timeLabel = `ab ${shift.start}`;
          else timeLabel = `bis ${shift.end}`;
          row.innerHTML = `
            <span class="shift-name-badge" style="background:${e.color};color:${e.textColor}">${e.name}</span>
            <span class="shift-time">${timeLabel}</span>
          `;
          shiftList.appendChild(row);
        }
      }
    }

    card.appendChild(shiftList);
    list.appendChild(card);
  }

  if (Object.keys(dayDataByKey).length === 0) {
    list.innerHTML = `<div class="empty-state">Noch keine Dienstplan-Daten verfügbar.<br>Zum Aktualisieren nach unten ziehen.</div>`;
  }
}

function renderWeek() {
  document.getElementById("monthLabel").textContent = monthLabelFor(currentWeekStart);
  renderWeekStrip();
  renderDayList();
}

function scrollToDay(key) {
  const el = document.getElementById(`day-${key}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Navigation ---------- */
function goToWeek(weekStart) {
  currentWeekStart = getMonday(weekStart);
  renderWeek();
  document.getElementById("scrollArea").scrollTo({ top: 0 });
}

function initNavigation() {
  document.getElementById("prevWeek").addEventListener("click", () => {
    goToWeek(addDays(currentWeekStart, -7));
  });
  document.getElementById("nextWeek").addEventListener("click", () => {
    goToWeek(addDays(currentWeekStart, 7));
  });
  document.getElementById("todayBtn").addEventListener("click", () => {
    goToWeek(new Date());
    setTimeout(() => scrollToDay(dateKey(new Date())), 50);
  });

  const picker = document.getElementById("datePicker");
  document.getElementById("monthLabelBtn").addEventListener("click", () => {
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.click();
  });
  picker.addEventListener("change", () => {
    if (picker.value) goToWeek(new Date(picker.value));
  });
}

/* ---------- Pull-to-refresh ---------- */
function initPullToRefresh() {
  const scrollArea = document.getElementById("scrollArea");
  const indicator = document.getElementById("pullIndicator");
  const label = document.getElementById("pullLabel");

  const THRESHOLD = 64;
  let startY = null;
  let pulling = false;

  scrollArea.addEventListener(
    "touchstart",
    (e) => {
      if (scrollArea.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      } else {
        startY = null;
        pulling = false;
      }
    },
    { passive: true }
  );

  scrollArea.addEventListener(
    "touchmove",
    (e) => {
      if (!pulling || startY === null) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) return;
      const height = Math.min(delta * 0.6, 90);
      indicator.classList.add("visible");
      indicator.style.height = `${height}px`;
      label.textContent = height >= THRESHOLD ? "Loslassen zum Aktualisieren" : "Zum Aktualisieren ziehen";
    },
    { passive: true }
  );

  scrollArea.addEventListener("touchend", () => {
    if (!pulling) return;
    const height = parseFloat(indicator.style.height || "0");
    indicator.classList.remove("visible");
    if (height >= THRESHOLD) {
      indicator.style.height = "48px";
      indicator.classList.add("spinning");
      label.textContent = "Aktualisiere…";
      sync(true).finally(() => {
        indicator.classList.remove("spinning");
        indicator.style.height = "0px";
      });
    } else {
      indicator.style.height = "0px";
    }
    pulling = false;
    startY = null;
  });
}

/* ---------- Init ---------- */
function init() {
  const cached = loadCache();
  if (cached) {
    dayDataByKey = cached.days;
    lastSyncTimestamp = cached.timestamp;
  }

  renderWeek();
  updateSyncStatus();
  initNavigation();
  initPullToRefresh();

  sync(false);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => {
      console.warn("Service Worker Registrierung fehlgeschlagen:", e);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
