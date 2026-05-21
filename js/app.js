const STORAGE_KEY = "frenchHabitTracker.entries.v1";
const state = {
  entries: [],
  selectedDate: localDateString(new Date()),
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth()
};

const els = {
  entryForm: document.getElementById("entryForm"),
  entryDate: document.getElementById("entryDate"),
  durationMinutes: document.getElementById("durationMinutes"),
  activity: document.getElementById("activity"),
  activityPills: document.getElementById("activityPills"),
  note: document.getElementById("note"),
  formFeedback: document.getElementById("formFeedback"),
  currentStreak: document.getElementById("currentStreak"),
  streakText: document.getElementById("streakText"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  monthLabel: document.getElementById("monthLabel"),
  calendarGrid: document.getElementById("calendarGrid"),
  selectedDayLabel: document.getElementById("selectedDayLabel"),
  entriesList: document.getElementById("entriesList"),
  statsGrid: document.getElementById("statsGrid"),
  weeklyChart: document.getElementById("weeklyChart"),
  monthlyOverview: document.getElementById("monthlyOverview"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  resetBtn: document.getElementById("resetBtn"),
  settingsFeedback: document.getElementById("settingsFeedback")
};

// Local date helpers avoid UTC conversion, which can shift days in Safari.
function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateString, amount) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

// Persistence helpers keep the app fully offline and browser-local.
function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidEntry)
      .map(entry => ({
        id: String(entry.id || createId()),
        date: entry.date,
        durationMinutes: Number(entry.durationMinutes),
        activity: String(entry.activity).trim(),
        note: entry.note ? String(entry.note) : ""
      }));
  } catch {
    return [];
  }
}

function saveEntries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    return true;
  } catch {
    return false;
  }
}

function isValidEntry(entry) {
  return entry &&
    typeof entry.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    Number(entry.durationMinutes) > 0 &&
    String(entry.activity || "").trim().length > 0;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Entry mutations are intentionally small and always followed by a save.
function addEntry(data) {
  const previousEntries = [...state.entries];
  state.entries.push({
    id: createId(),
    date: data.date,
    durationMinutes: Number(data.durationMinutes),
    activity: data.activity.trim(),
    note: (data.note || "").trim()
  });
  sortEntries();
  if (saveEntries()) return true;
  state.entries = previousEntries;
  return false;
}

function updateEntry(id, updates) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;
  const previousEntry = { ...entry };
  entry.durationMinutes = Number(updates.durationMinutes);
  entry.activity = updates.activity.trim();
  entry.note = (updates.note || "").trim();
  sortEntries();
  if (saveEntries()) return true;
  Object.assign(entry, previousEntry);
  sortEntries();
  return false;
}

function deleteEntry(id) {
  const previousEntries = [...state.entries];
  state.entries = state.entries.filter(entry => entry.id !== id);
  if (saveEntries()) return true;
  state.entries = previousEntries;
  return false;
}

function sortEntries() {
  state.entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
}

function entriesForDate(dateString) {
  return state.entries.filter(entry => entry.date === dateString);
}

function minutesForDate(dateString) {
  return entriesForDate(dateString).reduce((sum, entry) => sum + entry.durationMinutes, 0);
}

function datesWithEntries() {
  return new Set(state.entries.map(entry => entry.date));
}

// Streaks count consecutive active days, ending today or yesterday.
function calculateCurrentStreak() {
  const studiedDates = datesWithEntries();
  const today = localDateString(new Date());
  let cursor = studiedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;

  while (studiedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function calculateBestStreak() {
  const sortedDates = Array.from(datesWithEntries()).sort();
  let best = 0;
  let current = 0;
  let previous = "";

  sortedDates.forEach(date => {
    current = previous && addDays(previous, 1) === date ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  });

  return best;
}

function getWeekDates(dateString) {
  const date = parseLocalDate(dateString);
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + index);
    return localDateString(day);
  });
}

function getMonthEntries(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return state.entries.filter(entry => entry.date.startsWith(prefix));
}

function calculateMonthlyStats(year, month) {
  const monthEntries = getMonthEntries(year, month);
  const activeDates = new Set(monthEntries.map(entry => entry.date));
  const totalMinutes = monthEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const activityCounts = {};

  monthEntries.forEach(entry => {
    const key = entry.activity.trim();
    activityCounts[key] = (activityCounts[key] || 0) + 1;
  });

  const mostCommonActivity = Object.entries(activityCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "None yet";

  return {
    activeStudyDays: activeDates.size,
    totalMinutes,
    averageMinutes: activeDates.size ? Math.round(totalMinutes / activeDates.size) : 0,
    mostCommonActivity
  };
}

function calculateWeekMinutes() {
  return getWeekDates(localDateString(new Date()))
    .reduce((sum, date) => sum + minutesForDate(date), 0);
}

function setSelectedDate(dateString) {
  state.selectedDate = dateString;
  const date = parseLocalDate(dateString);
  state.viewYear = date.getFullYear();
  state.viewMonth = date.getMonth();
  els.entryDate.value = dateString;
  renderAll();
}

function renderHeaderStats() {
  const current = calculateCurrentStreak();
  els.currentStreak.textContent = current;
  els.streakText.textContent = current
    ? current === 1 ? "One day in motion." : `${current} days in motion.`
    : "Start with one small session.";
}

// Rendering functions rebuild each section from state for predictable UI.
function renderCalendar() {
  const year = state.viewYear;
  const month = state.viewMonth;
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const markedDates = datesWithEntries();
  const today = localDateString(new Date());
  const monthEntries = getMonthEntries(year, month);
  const maxDayMinutes = Math.max(...monthEntries.map(entry => minutesForDate(entry.date)), 1);

  els.monthLabel.textContent = firstDay.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  els.calendarGrid.innerHTML = "";

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateString = localDateString(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-btn";
    button.textContent = date.getDate();
    const dayMinutes = minutesForDate(dateString);
    const level = dayMinutes === 0 ? 0 : Math.min(4, Math.ceil((dayMinutes / maxDayMinutes) * 4));
    button.dataset.level = String(level);
    button.setAttribute("aria-label", date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }) + (dayMinutes ? `, ${dayMinutes} minutes studied` : ", no study logged"));

    if (date.getMonth() !== month) button.classList.add("outside");
    if (markedDates.has(dateString)) button.classList.add("has-entry");
    if (dateString === today) button.classList.add("today");
    if (dateString === state.selectedDate) button.classList.add("selected");

    button.addEventListener("click", () => setSelectedDate(dateString));
    els.calendarGrid.appendChild(button);
  }
}

function renderEntries() {
  const entries = entriesForDate(state.selectedDate);
  const selectedDate = parseLocalDate(state.selectedDate);
  els.selectedDayLabel.textContent = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  els.entriesList.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No French practice logged for this day yet.";
    els.entriesList.appendChild(empty);
    return;
  }

  entries.forEach(entry => {
    const item = document.createElement("article");
    item.className = "entry-item";

    const top = document.createElement("div");
    top.className = "entry-top";

    const minutesField = document.createElement("div");
    minutesField.className = "field";
    const minutesLabel = document.createElement("label");
    minutesLabel.textContent = "Minutes";
    const minutesInput = document.createElement("input");
    minutesInput.type = "number";
    minutesInput.inputMode = "numeric";
    minutesInput.min = "1";
    minutesInput.step = "1";
    minutesInput.value = entry.durationMinutes;
    minutesField.append(minutesLabel, minutesInput);

    const activityField = document.createElement("div");
    activityField.className = "field";
    const activityLabel = document.createElement("label");
    activityLabel.textContent = "Activity";
    const activityInput = document.createElement("input");
    activityInput.type = "text";
    activityInput.maxLength = 24;
    activityInput.value = entry.activity;
    activityField.append(activityLabel, activityInput);
    top.append(minutesField, activityField);

    const noteDetails = document.createElement("details");
    noteDetails.className = "optional-note";
    const noteSummary = document.createElement("summary");
    noteSummary.textContent = entry.note ? "Note added" : "Optional note";
    const noteField = document.createElement("div");
    noteField.className = "field";
    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Note";
    const noteInput = document.createElement("textarea");
    noteInput.maxLength = 180;
    noteInput.value = entry.note || "";
    noteField.append(noteLabel, noteInput);
    noteDetails.append(noteSummary, noteField);

    const feedback = document.createElement("p");
    feedback.className = "feedback";

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const saveButton = document.createElement("button");
    saveButton.className = "secondary-btn";
    saveButton.type = "button";
    saveButton.textContent = "Update";
    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-btn";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    actions.append(saveButton, deleteButton);

    saveButton.addEventListener("click", () => {
      const duration = Number(minutesInput.value);
      const activity = activityInput.value.trim();
      if (!duration || duration < 1) {
        feedback.textContent = "Add a duration of at least 1 minute.";
        feedback.classList.remove("success");
        return;
      }
      if (!activity) {
        feedback.textContent = "Add a short activity label.";
        feedback.classList.remove("success");
        return;
      }
      const saved = updateEntry(entry.id, {
        durationMinutes: Math.round(duration),
        activity,
        note: noteInput.value
      });
      if (!saved) {
        feedback.textContent = "This browser could not save changes to local storage.";
        feedback.classList.remove("success");
        return;
      }
      feedback.textContent = "Updated. Très bien.";
      feedback.classList.add("success");
      renderAll();
    });

    deleteButton.addEventListener("click", () => {
      if (confirm("Delete this study entry?")) {
        if (!deleteEntry(entry.id)) {
          feedback.textContent = "This browser could not delete from local storage.";
          feedback.classList.remove("success");
          return;
        }
        renderAll();
      }
    });

    item.append(top, noteDetails, actions, feedback);
    els.entriesList.appendChild(item);
  });
}

function renderStats() {
  const today = new Date();
  const monthStats = calculateMonthlyStats(today.getFullYear(), today.getMonth());
  const stats = [
    ["Current streak", `${calculateCurrentStreak()} days`],
    ["Study days", monthStats.activeStudyDays],
    ["Minutes this week", calculateWeekMinutes()],
    ["Minutes this month", monthStats.totalMinutes],
    ["Avg active day", `${monthStats.averageMinutes} min`],
    ["Best streak", `${calculateBestStreak()} days`],
    ["Top activity", monthStats.mostCommonActivity]
  ];

  els.statsGrid.innerHTML = "";
  stats.forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "stat";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    stat.append(labelEl, valueEl);
    els.statsGrid.appendChild(stat);
  });
}

function renderWeeklyChart() {
  const dates = getWeekDates(localDateString(new Date()));
  const values = dates.map(date => minutesForDate(date));
  const max = Math.max(...values, 1);
  els.weeklyChart.innerHTML = "";

  dates.forEach((date, index) => {
    const wrap = document.createElement("div");
    wrap.className = "bar-wrap";

    const track = document.createElement("div");
    track.className = "bar-track";
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = values[index] ? values[index] : "";
    const bar = document.createElement("div");
    bar.className = values[index] ? "bar" : "bar zero";
    bar.style.height = `${Math.max(6, (values[index] / max) * 100)}%`;
    track.append(value, bar);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = parseLocalDate(date).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
    wrap.append(track, label);
    els.weeklyChart.appendChild(wrap);
  });
}

function renderMonthlyOverview() {
  const year = state.viewYear;
  const month = state.viewMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const values = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return minutesForDate(`${year}-${String(month + 1).padStart(2, "0")}-${day}`);
  });
  const max = Math.max(...values, 1);
  els.monthlyOverview.innerHTML = "";

  values.forEach((minutes, index) => {
    const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
    const level = minutes === 0 ? 0 : Math.min(4, Math.ceil((minutes / max) * 4));
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "heat-day";
    cell.dataset.level = String(level);
    cell.setAttribute("aria-label", `${minutes} minutes on day ${index + 1}`);
    if (dateString === state.selectedDate) cell.classList.add("selected");
    cell.innerHTML = `<span>${index + 1}</span>`;
    cell.addEventListener("click", () => setSelectedDate(dateString));
    els.monthlyOverview.appendChild(cell);
  });
}

function renderAll() {
  renderHeaderStats();
  renderCalendar();
  renderEntries();
  renderStats();
  renderWeeklyChart();
  renderMonthlyOverview();
}

function showFormMessage(message, isSuccess) {
  els.formFeedback.textContent = message;
  els.formFeedback.classList.toggle("success", Boolean(isSuccess));
  if (isSuccess) {
    window.setTimeout(() => {
      if (els.formFeedback.textContent === message) els.formFeedback.textContent = "";
    }, 1800);
  }
}

function syncActivityPills() {
  const currentActivity = els.activity.value.trim().toLowerCase();
  els.activityPills.querySelectorAll(".activity-pill").forEach(button => {
    const isSelected = button.dataset.activity.toLowerCase() === currentActivity;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function chooseActivity(activity) {
  els.activity.value = activity;
  syncActivityPills();
  showFormMessage("", false);
}

function handleAddEntry(event) {
  event.preventDefault();
  const date = els.entryDate.value;
  const duration = Number(els.durationMinutes.value);
  const activity = els.activity.value.trim();

  if (!date) {
    showFormMessage("Choose a date.", false);
    return;
  }
  if (!duration || duration < 1) {
    showFormMessage("Add a duration of at least 1 minute.", false);
    return;
  }
  if (!activity) {
    showFormMessage("Add a short activity label.", false);
    return;
  }

  const saved = addEntry({
    date,
    durationMinutes: Math.round(duration),
    activity,
    note: els.note.value
  });
  if (!saved) {
    showFormMessage("This browser could not save to local storage.", false);
    return;
  }

  state.selectedDate = date;
  const selected = parseLocalDate(date);
  state.viewYear = selected.getFullYear();
  state.viewMonth = selected.getMonth();
  els.durationMinutes.value = "";
  els.activity.value = "";
  els.note.value = "";
  syncActivityPills();
  showFormMessage("Saved. À demain.", true);
  renderAll();
}

function changeMonth(amount) {
  const next = new Date(state.viewYear, state.viewMonth + amount, 1);
  state.viewYear = next.getFullYear();
  state.viewMonth = next.getMonth();
  renderAll();
}

function exportData() {
  const payload = {
    app: "French Habit Tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: state.entries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `french-habit-tracker-${localDateString(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.settingsFeedback.textContent = "Backup exported.";
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const importedEntries = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(importedEntries)) throw new Error("Missing entries");
      const cleaned = importedEntries.filter(isValidEntry).map(entry => ({
        id: String(entry.id || createId()),
        date: entry.date,
        durationMinutes: Math.round(Number(entry.durationMinutes)),
        activity: String(entry.activity).trim(),
        note: entry.note ? String(entry.note) : ""
      }));
      if (!confirm(`Import ${cleaned.length} entries and replace current data?`)) return;
      const previousEntries = [...state.entries];
      state.entries = cleaned;
      sortEntries();
      if (saveEntries()) {
        els.settingsFeedback.textContent = "Import complete.";
        renderAll();
      } else {
        state.entries = previousEntries;
        els.settingsFeedback.textContent = "Import was valid, but this browser could not save it.";
      }
    } catch {
      els.settingsFeedback.textContent = "That file does not look like a valid backup.";
    } finally {
      els.importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (!confirm("Reset all French Habit Tracker data? This cannot be undone.")) return;
  if (!confirm("Last check: delete every study entry from this iPhone?")) return;
  const previousEntries = [...state.entries];
  state.entries = [];
  if (saveEntries()) {
    els.settingsFeedback.textContent = "All data reset.";
  } else {
    state.entries = previousEntries;
    els.settingsFeedback.textContent = "This browser could not update local storage.";
  }
  renderAll();
}

function init() {
  state.entries = loadEntries();
  sortEntries();
  els.entryDate.value = state.selectedDate;
  els.entryForm.addEventListener("submit", handleAddEntry);
  els.activity.addEventListener("input", syncActivityPills);
  els.activityPills.addEventListener("click", event => {
    const button = event.target.closest(".activity-pill");
    if (button) chooseActivity(button.dataset.activity);
  });
  els.prevMonth.addEventListener("click", () => changeMonth(-1));
  els.nextMonth.addEventListener("click", () => changeMonth(1));
  els.exportBtn.addEventListener("click", exportData);
  els.importInput.addEventListener("change", event => importData(event.target.files[0]));
  els.resetBtn.addEventListener("click", resetAllData);
  renderAll();
}

init();
