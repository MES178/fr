const STORAGE_KEY = "frenchHabitTracker.entries.v1";
const META_STORAGE_KEY = "frenchHabitTracker.meta.v1";
const AUTH_STORAGE_KEY = "frenchHabitTracker.authSession.v1";
const CLOUD_TABLE = "habit_tracker_data";
const cloudConfig = window.FHT_CLOUD_CONFIG || {};
let cloudSaveTimer = null;

const state = {
  entries: [],
  session: null,
  user: null,
  selectedDate: localDateString(new Date()),
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth()
};

const els = {
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  authForm: document.getElementById("authForm"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  signUpBtn: document.getElementById("signUpBtn"),
  authFeedback: document.getElementById("authFeedback"),
  entryForm: document.getElementById("entryForm"),
  entryDate: document.getElementById("entryDate"),
  durationMinutes: document.getElementById("durationMinutes"),
  activity: document.getElementById("activity"),
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
  yearlyOverview: document.getElementById("yearlyOverview"),
  syncBtn: document.getElementById("syncBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  cloudStatus: document.getElementById("cloudStatus"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  resetBtn: document.getElementById("resetBtn"),
  settingsFeedback: document.getElementById("settingsFeedback"),
  copyrightYear: document.getElementById("copyrightYear")
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

function userScopedKey(baseKey) {
  return state.user?.id ? `${baseKey}.${state.user.id}` : baseKey;
}

function entriesStorageKey() {
  return userScopedKey(STORAGE_KEY);
}

function metaStorageKey() {
  return userScopedKey(META_STORAGE_KEY);
}

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(metaStorageKey()) || "{}");
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  try {
    localStorage.setItem(metaStorageKey(), JSON.stringify(meta));
  } catch {
    // Metadata is helpful for sync conflict decisions, but the app can still run without it.
  }
}

// Persistence helpers keep the app fully offline and browser-local.
function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(entriesStorageKey()) || "[]");
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

function saveEntries(options = {}) {
  const { markChanged = true, syncCloud = true } = options;
  try {
    localStorage.setItem(entriesStorageKey(), JSON.stringify(state.entries));
    if (markChanged) {
      const meta = loadMeta();
      meta.localModifiedAt = new Date().toISOString();
      saveMeta(meta);
    }
    if (syncCloud) queueCloudSave();
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

function isCloudEnabled() {
  return Boolean(
    cloudConfig.enabled &&
    cloudConfig.provider === "supabase" &&
    cloudConfig.supabaseUrl &&
    cloudConfig.supabaseAnonKey &&
    !cloudConfig.supabaseUrl.includes("YOUR-PROJECT") &&
    !cloudConfig.supabaseAnonKey.includes("YOUR_PUBLIC")
  );
}

function authUrl(path) {
  const baseUrl = cloudConfig.supabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/auth/v1/${path}`;
}

function updateCloudStatus(message) {
  if (els.cloudStatus) els.cloudStatus.textContent = message;
}

function authHeaders(accessToken = state.session?.access_token) {
  return {
    apikey: cloudConfig.supabaseAnonKey,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${cloudConfig.supabaseAnonKey}`,
    "Content-Type": "application/json"
  };
}

function cloudHeaders() {
  return authHeaders();
}

function cloudUrl(query = "") {
  const baseUrl = cloudConfig.supabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rest/v1/${CLOUD_TABLE}${query}`;
}

function loadAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveAuthSession(session) {
  if (!session) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function normalizeSession(payload) {
  if (!payload?.access_token || !payload?.user?.id) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
    user: payload.user
  };
}

function setSession(session) {
  state.session = session;
  state.user = session?.user || null;
  saveAuthSession(session);
}

function renderAuthState() {
  const signedIn = Boolean(state.session?.access_token && state.user?.id);
  els.authView.hidden = signedIn;
  els.appView.hidden = !signedIn;
  if (signedIn) updateCloudStatus(`Signed in as ${state.user.email || "your account"}.`);
}

function validateAuthInputs() {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !email.includes("@")) {
    els.authFeedback.textContent = "Enter a valid email address.";
    return null;
  }
  if (!password || password.length < 6) {
    els.authFeedback.textContent = "Password must be at least 6 characters.";
    return null;
  }
  return { email, password };
}

function setAuthBusy(isBusy, message = "") {
  els.authForm.querySelectorAll("button").forEach(button => {
    button.disabled = isBusy;
  });
  if (message) {
    els.authFeedback.textContent = message;
    els.authFeedback.classList.toggle("success", false);
  }
}

async function authRequest(path, body, accessToken) {
  const response = await fetch(authUrl(path), {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.message || "Authentication failed");
  return payload;
}

async function signIn(email, password) {
  const payload = await authRequest("token?grant_type=password", { email, password });
  const session = normalizeSession(payload);
  if (!session) throw new Error("Could not create a session");
  setSession(session);
  await loadAuthenticatedApp();
}

async function signUp(email, password) {
  const payload = await authRequest("signup", { email, password });
  const session = normalizeSession(payload);
  if (session) {
    setSession(session);
    await loadAuthenticatedApp();
    return;
  }
  els.authFeedback.textContent = "Account created. Check your email, then sign in.";
  els.authFeedback.classList.add("success");
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token) return false;
  const expiresSoon = state.session.expires_at && state.session.expires_at < Math.floor(Date.now() / 1000) + 120;
  if (!expiresSoon) return true;
  try {
    const payload = await authRequest("token?grant_type=refresh_token", {
      refresh_token: state.session.refresh_token
    });
    const session = normalizeSession(payload);
    if (!session) return false;
    setSession(session);
    return true;
  } catch {
    setSession(null);
    return false;
  }
}

async function signOut() {
  if (state.session?.access_token) {
    fetch(authUrl("logout"), {
      method: "POST",
      headers: authHeaders()
    }).catch(() => {});
  }
  setSession(null);
  state.entries = [];
  renderAuthState();
  els.authFeedback.textContent = "";
}

function migrateLegacyEntriesToUser() {
  const meta = loadMeta();
  if (meta.legacyMigratedAt) return;
  try {
    const legacyEntries = cleanCloudEntries(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    if (legacyEntries.length && !state.entries.length) {
      state.entries = mergeEntries(state.entries, legacyEntries);
      saveEntries({ markChanged: true, syncCloud: false });
    }
    meta.legacyMigratedAt = new Date().toISOString();
    saveMeta(meta);
  } catch {
    meta.legacyMigratedAt = new Date().toISOString();
    saveMeta(meta);
  }
}

function cleanCloudEntries(entries) {
  return Array.isArray(entries)
    ? entries
      .filter(isValidEntry)
      .map(entry => ({
        id: String(entry.id || createId()),
        date: entry.date,
        durationMinutes: Number(entry.durationMinutes),
        activity: String(entry.activity).trim(),
        note: entry.note ? String(entry.note) : ""
      }))
    : [];
}

function mergeEntries(localEntries, cloudEntries) {
  const mergedById = new Map();
  [...cloudEntries, ...localEntries].forEach(entry => {
    if (isValidEntry(entry)) {
      const id = String(entry.id || createId());
      mergedById.set(id, {
        id,
        date: entry.date,
        durationMinutes: Number(entry.durationMinutes),
        activity: String(entry.activity).trim(),
        note: entry.note ? String(entry.note) : ""
      });
    }
  });
  return Array.from(mergedById.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
}

async function fetchCloudSnapshot() {
  const query = `?id=eq.${encodeURIComponent(state.user.id)}&select=entries,updated_at&limit=1`;
  const response = await fetch(cloudUrl(query), {
    method: "GET",
    headers: cloudHeaders()
  });
  if (!response.ok) throw new Error("Cloud fetch failed");
  const rows = await response.json();
  return rows[0] || null;
}

async function pushCloudEntries() {
  if (!isCloudEnabled() || !state.user?.id) return false;
  if (!(await refreshSessionIfNeeded())) throw new Error("Not signed in");
  const updatedAt = new Date().toISOString();
  const response = await fetch(cloudUrl("?on_conflict=id"), {
    method: "POST",
    headers: {
      ...cloudHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: state.user.id,
      entries: state.entries,
      updated_at: updatedAt
    })
  });
  if (!response.ok) throw new Error("Cloud save failed");
  const meta = loadMeta();
  meta.lastCloudSyncedAt = updatedAt;
  meta.localModifiedAt = updatedAt;
  saveMeta(meta);
  updateCloudStatus(`Cloud sync complete: ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  return true;
}

function queueCloudSave() {
  if (!isCloudEnabled()) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => {
    pushCloudEntries().catch(() => {
      updateCloudStatus("Cloud sync failed. Local changes are still saved on this browser.");
    });
  }, 700);
}

async function syncCloudNow() {
  if (!isCloudEnabled()) {
    updateCloudStatus("Cloud sync is off. Configure js/cloud-config.js to sync across browsers.");
    return;
  }
  if (!state.user?.id || !(await refreshSessionIfNeeded())) {
    updateCloudStatus("Sign in to sync your private history.");
    renderAuthState();
    return;
  }

  updateCloudStatus("Checking cloud sync...");
  try {
    const cloudSnapshot = await fetchCloudSnapshot();
    const meta = loadMeta();
    const hasUnsyncedLocal = Boolean(
      meta.lastCloudSyncedAt &&
      meta.localModifiedAt &&
      meta.localModifiedAt > meta.lastCloudSyncedAt
    );

    if (cloudSnapshot) {
      const cloudEntries = cleanCloudEntries(cloudSnapshot.entries);
      const hasNeverSyncedLocalData = state.entries.length > 0 && !meta.lastCloudSyncedAt;

      if (hasUnsyncedLocal || hasNeverSyncedLocalData) {
        state.entries = mergeEntries(state.entries, cloudEntries);
        sortEntries();
        saveEntries({ markChanged: true, syncCloud: false });
        await pushCloudEntries();
        renderAll();
        updateCloudStatus("Local and cloud histories were merged.");
        return;
      }

      state.entries = cloudEntries;
      sortEntries();
      saveEntries({ markChanged: false, syncCloud: false });
      saveMeta({
        ...meta,
        lastCloudSyncedAt: cloudSnapshot.updated_at,
        localModifiedAt: cloudSnapshot.updated_at
      });
      renderAll();
      updateCloudStatus(`Cloud data loaded: ${new Date(cloudSnapshot.updated_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`);
      return;
    }

    if (!cloudSnapshot && !state.entries.length) {
      updateCloudStatus("Cloud sync is ready. No study entries yet.");
      return;
    }

    await pushCloudEntries();
  } catch {
    updateCloudStatus("Cloud sync failed. Check Supabase settings and network access.");
  }
}

async function loadAuthenticatedApp() {
  renderAuthState();
  state.entries = loadEntries();
  migrateLegacyEntriesToUser();
  sortEntries();
  els.entryDate.value = state.selectedDate;
  renderAll();
  await syncCloudNow();
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

function activeStudyDaysForMonth(year, month) {
  return new Set(getMonthEntries(year, month).map(entry => entry.date)).size;
}

function getYearlyOverviewStartMonth(year, currentMonth) {
  const meta = loadMeta();
  if (!meta.yearlyStartMonth) {
    meta.yearlyStartMonth = `${year}-${String(currentMonth + 1).padStart(2, "0")}`;
    saveMeta(meta);
  }

  const savedMatch = /^(\d{4})-(\d{2})$/.exec(meta.yearlyStartMonth);
  const savedMonth = savedMatch && Number(savedMatch[1]) === year
    ? Number(savedMatch[2]) - 1
    : currentMonth;
  const entryMonths = state.entries
    .filter(entry => parseLocalDate(entry.date).getFullYear() === year)
    .map(entry => parseLocalDate(entry.date).getMonth());
  const earliestEntryMonth = entryMonths.length ? Math.min(...entryMonths) : currentMonth;

  return Math.min(savedMonth, earliestEntryMonth, currentMonth);
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

function renderYearlyOverview() {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth();
  const startMonth = getYearlyOverviewStartMonth(year, currentMonth);
  const monthData = Array.from({ length: currentMonth - startMonth + 1 }, (_, index) => {
    const month = startMonth + index;
    return {
      month,
      days: activeStudyDaysForMonth(year, month),
      daysInMonth: new Date(year, month + 1, 0).getDate()
    };
  });
  const maxDays = Math.max(...monthData.map(item => item.days), 1);

  els.yearlyOverview.innerHTML = "";
  monthData.forEach(item => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "year-month";
    if (item.month === currentMonth) row.classList.add("current");
    if (item.month > currentMonth) row.classList.add("future");

    const monthName = new Date(year, item.month, 1)
      .toLocaleDateString(undefined, { month: "short" });
    const fill = item.days ? Math.max(8, (item.days / maxDays) * 100) : 0;

    row.setAttribute("aria-label", `${monthName}: ${item.days} active study days`);
    row.innerHTML = `
      <span class="year-month-name">${monthName}</span>
      <span class="year-track"><span class="year-fill" style="--fill: ${fill}%"></span></span>
      <span class="year-month-count">${item.days}/${item.daysInMonth}</span>
    `;
    row.addEventListener("click", () => {
      state.viewYear = year;
      state.viewMonth = item.month;
      setSelectedDate(localDateString(new Date(year, item.month, 1)));
    });
    els.yearlyOverview.appendChild(row);
  });
}

function renderAll() {
  renderHeaderStats();
  renderCalendar();
  renderEntries();
  renderStats();
  renderWeeklyChart();
  renderMonthlyOverview();
  renderYearlyOverview();
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
  els.copyrightYear.textContent = String(new Date().getFullYear());
  const savedSession = loadAuthSession();
  if (savedSession?.access_token && savedSession?.user?.id) {
    setSession(savedSession);
    loadAuthenticatedApp();
  } else {
    renderAuthState();
  }

  els.authForm.addEventListener("submit", async event => {
    event.preventDefault();
    els.authFeedback.textContent = "";
    els.authFeedback.classList.remove("success");
    const authData = validateAuthInputs();
    if (!authData) return;
    try {
      setAuthBusy(true, "Signing in...");
      await signIn(authData.email, authData.password);
    } catch (error) {
      els.authFeedback.textContent = error.message || "Sign in failed.";
    } finally {
      setAuthBusy(false);
    }
  });
  els.signUpBtn.addEventListener("click", async () => {
    els.authFeedback.textContent = "";
    els.authFeedback.classList.remove("success");
    const authData = validateAuthInputs();
    if (!authData) return;
    try {
      setAuthBusy(true, "Creating account...");
      await signUp(authData.email, authData.password);
    } catch (error) {
      els.authFeedback.textContent = error.message || "Account creation failed.";
    } finally {
      setAuthBusy(false);
    }
  });
  els.entryForm.addEventListener("submit", handleAddEntry);
  els.prevMonth.addEventListener("click", () => changeMonth(-1));
  els.nextMonth.addEventListener("click", () => changeMonth(1));
  els.exportBtn.addEventListener("click", exportData);
  els.importInput.addEventListener("change", event => importData(event.target.files[0]));
  els.syncBtn.addEventListener("click", syncCloudNow);
  els.signOutBtn.addEventListener("click", signOut);
  els.resetBtn.addEventListener("click", resetAllData);
}

init();
