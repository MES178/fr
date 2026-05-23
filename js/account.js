const AUTH_STORAGE_KEY = "frenchHabitTracker.authSession.v1";
const PASSWORD_RECOVERY_PENDING_KEY = "frenchHabitTracker.passwordRecoveryPending.v1";
const cloudConfig = window.FHT_CLOUD_CONFIG || {};

const els = {
  accountInitial: document.getElementById("accountInitial"),
  accountEmail: document.getElementById("accountEmail"),
  accountHint: document.getElementById("accountHint"),
  passwordForm: document.getElementById("passwordForm"),
  newPassword: document.getElementById("newPassword"),
  confirmPassword: document.getElementById("confirmPassword"),
  updatePasswordBtn: document.getElementById("updatePasswordBtn"),
  accountFeedback: document.getElementById("accountFeedback"),
  signOutBtn: document.getElementById("signOutBtn")
};

let session = null;

function authUrl(path) {
  const baseUrl = cloudConfig.supabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/auth/v1/${path}`;
}

function authHeaders(accessToken = session?.access_token) {
  return {
    apikey: cloudConfig.supabaseAnonKey,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${cloudConfig.supabaseAnonKey}`,
    "Content-Type": "application/json"
  };
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  session = nextSession;
  if (!nextSession) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
}

function clearPasswordRecoveryPending() {
  try {
    localStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
  } catch {
    // Non-critical cleanup.
  }
}

function accountUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  return url.toString();
}

function saveSessionFromPayload(payload) {
  if (!payload?.access_token || !payload?.user?.id) return false;
  saveSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || "",
    expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
    user: payload.user,
    isPasswordRecovery: false
  });
  return true;
}

async function fetchAuthUser(accessToken) {
  const response = await fetch(authUrl("user"), {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || payload.message || "Could not load user");
  return payload;
}

async function handleAuthRedirect() {
  if (!window.location.hash.includes("access_token=")) return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return false;

  try {
    const user = await fetchAuthUser(accessToken);
    const saved = saveSessionFromPayload({
      access_token: accessToken,
      refresh_token: params.get("refresh_token") || "",
      expires_at: Number(params.get("expires_at")) || Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
      user
    });
    if (!saved) throw new Error("Could not start password reset");
    clearPasswordRecoveryPending();
    window.history.replaceState(null, "", accountUrl());
    els.accountFeedback.textContent = "Choose a new password to finish recovery.";
    renderAccount();
    return true;
  } catch (error) {
    window.history.replaceState(null, "", accountUrl());
    els.accountFeedback.textContent = error.message || "Password reset link could not be opened.";
    renderAccount();
    return false;
  }
}

async function authRequest(path, body, method = "POST") {
  const response = await fetch(authUrl(path), {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || payload.message || "Authentication failed");
  }
  return payload;
}

function renderAccount() {
  const email = session?.user?.email || "Not signed in";
  els.accountEmail.textContent = email;
  els.accountInitial.textContent = session?.user?.email?.trim().charAt(0).toUpperCase() || "F";
  if (!session?.access_token) {
    els.accountHint.textContent = "Sign in from the tracker first, then return here.";
    els.passwordForm.hidden = true;
    els.signOutBtn.hidden = true;
    return;
  }
  els.accountHint.textContent = "You can change this account password here.";
  els.passwordForm.hidden = false;
  els.signOutBtn.hidden = false;
  window.setTimeout(() => els.newPassword.focus(), 80);
}

function validatePassword() {
  const password = els.newPassword.value;
  const confirmed = els.confirmPassword.value;
  els.accountFeedback.classList.remove("success");

  if (!password || password.length < 6) {
    els.accountFeedback.textContent = "Use at least 6 characters for the new password.";
    return null;
  }
  if (password !== confirmed) {
    els.accountFeedback.textContent = "Both password fields need to match.";
    return null;
  }
  return password;
}

function setBusy(isBusy, message = "") {
  els.updatePasswordBtn.disabled = isBusy;
  els.signOutBtn.disabled = isBusy;
  if (message) {
    els.accountFeedback.textContent = message;
    els.accountFeedback.classList.remove("success");
  }
}

async function refreshSessionIfNeeded() {
  if (!session?.access_token) return false;
  if (!session?.refresh_token) return true;
  const expiresSoon = session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 120;
  if (!expiresSoon) return true;

  try {
    const payload = await authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token
    });
    if (!payload?.access_token || !payload?.user?.id) return false;
    saveSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
      user: payload.user
    });
    renderAccount();
    return true;
  } catch {
    saveSession(null);
    renderAccount();
    return false;
  }
}

async function updatePassword(password) {
  if (!(await refreshSessionIfNeeded())) {
    throw new Error("Sign in again before changing your password.");
  }

  const user = await authRequest("user", { password }, "PUT");
  saveSession({
    ...session,
    isPasswordRecovery: false,
    user: {
      ...session.user,
      ...user
    }
  });
  clearPasswordRecoveryPending();
  renderAccount();
}

function signOut() {
  if (session?.access_token) {
    fetch(authUrl("logout"), {
      method: "POST",
      headers: authHeaders()
    }).catch(() => {});
  }
  saveSession(null);
  clearPasswordRecoveryPending();
  renderAccount();
  els.accountFeedback.textContent = "Signed out.";
}

async function init() {
  if (!(await handleAuthRedirect())) {
    session = loadSession();
    renderAccount();
  }

  els.passwordForm.addEventListener("submit", async event => {
    event.preventDefault();
    const password = validatePassword();
    if (!password) return;

    try {
      setBusy(true, "Updating password...");
      await updatePassword(password);
      els.passwordForm.reset();
      els.accountFeedback.textContent = "Password updated. Très bien.";
      els.accountFeedback.classList.add("success");
    } catch (error) {
      els.accountFeedback.textContent = error.message || "Password update failed.";
      els.accountFeedback.classList.remove("success");
    } finally {
      setBusy(false);
    }
  });

  els.signOutBtn.addEventListener("click", signOut);
}

init();
