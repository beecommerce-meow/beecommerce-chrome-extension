// popup.js

const FIREBASE_API_KEY = "AIzaSyA6nKy7nwf4oca8PXz7EdMiI0QUMCA-Epk";

// *** FIXED: correct project URL ***
const API_BASE       = "https://us-central1-studio-9717498599-c95ab.cloudfunctions.net";
const IMPORT_URL     = `${API_BASE}/importDraft`;
const DEFAULT_APP_BASE = "https://bee-commerce-78532760.base44.app";

// ---- Storage helpers ----
async function getSession() {
  return await chrome.storage.local.get([
    "idToken",
    "refreshToken",
    "expiresAt",
    "email",
    "lastDraftId",
  ]);
}

async function setSession(data) {
  await chrome.storage.local.set(data);
}

async function clearSession() {
  await chrome.storage.local.clear();
}

function nowMs() {
  return Date.now();
}

// ---- Firebase auth ----
async function signIn(email, password) {
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Sign in failed");
  }

  const session = {
    idToken:      json.idToken,
    refreshToken: json.refreshToken,
    expiresAt:    nowMs() + Number(json.expiresIn || 3600) * 1000,
    email:        json.email || email,
  };

  await setSession(session);
  return session;
}

async function refreshIdTokenIfNeeded(session) {
  const expiresAt    = session.expiresAt    || 0;
  const refreshToken = session.refreshToken || "";
  if (!refreshToken) return session;

  if (nowMs() < expiresAt - 2 * 60 * 1000 && session.idToken) return session;

  const resp = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
      }),
    }
  );

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Token refresh failed");
  }

  const updated = {
    ...session,
    idToken:      json.id_token,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt:    nowMs() + Number(json.expires_in || 3600) * 1000,
  };

  await setSession(updated);
  return updated;
}

// ---- Scraping ----
async function scrapeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PRODUCT" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(
          chrome.runtime.lastError.message ||
          "Could not reach the content script. Try reloading the product page."
        ));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Scraping failed"));
        return;
      }
      resolve(response);
    });
  });
}

// ---- UI helpers ----
function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent     = msg;
  el.className       = isError ? "err" : msg ? "ok" : "";
  el.style.display   = msg ? "block" : "none";
}

function showLoggedOut() {
  const lo = document.getElementById("loggedOut");
  const li = document.getElementById("loggedIn");
  if (lo) lo.style.display = "block";
  if (li) li.style.display = "none";
}

function showLoggedIn(email) {
  const lo        = document.getElementById("loggedOut");
  const li        = document.getElementById("loggedIn");
  const emailEl   = document.getElementById("userEmail");
  if (lo)      lo.style.display    = "none";
  if (li)      li.style.display    = "block";
  if (emailEl) emailEl.textContent = email || "Unknown";
}

async function openDraftUrl(url) {
  await chrome.tabs.create({ url });
}

// ---- Init ----
async function initUI() {
  // Restore session state on popup open
  try {
    const session = await getSession();
    if (session?.idToken && session?.refreshToken) {
      showLoggedIn(session.email);
      const openDraftBtn = document.getElementById("openDraftBtn");
      if (openDraftBtn && session.lastDraftId) {
        openDraftBtn.disabled = false;
      }
    } else {
      showLoggedOut();
    }
  } catch {
    showLoggedOut();
  }

  // ── Login ─────────────────────────────────────────────────────
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      setStatus("");
      loginBtn.disabled    = true;
      loginBtn.textContent = "Signing in…";

      try {
        const email    = document.getElementById("email")?.value?.trim();
        const password = document.getElementById("password")?.value || "";

        if (!email || !password) {
          setStatus("Enter email + password", true);
          return;
        }

        const session = await signIn(email, password);
        showLoggedIn(session.email);
        setStatus("Signed in ✅");
      } catch (err) {
        setStatus(String(err?.message || err), true);
      } finally {
        loginBtn.disabled    = false;
        loginBtn.textContent = "Sign In";
      }
    });
  }

  // ── Logout ────────────────────────────────────────────────────
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await clearSession();
      showLoggedOut();
      setStatus("Signed out.");
      const openDraftBtn = document.getElementById("openDraftBtn");
      if (openDraftBtn) openDraftBtn.disabled = true;
    });
  }

  // ── Import current page ───────────────────────────────────────
  const importBtn    = document.getElementById("importBtn");
  const openDraftBtn = document.getElementById("openDraftBtn");

  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      setStatus("Importing…");
      importBtn.disabled = true;
      const originalText = importBtn.textContent;
      importBtn.textContent = "Importing…";
      if (openDraftBtn) openDraftBtn.disabled = true;

      try {
        // Get and refresh session
        let session = await getSession();
        if (!session?.refreshToken) {
          throw new Error("Please sign in first.");
        }
        session = await refreshIdTokenIfNeeded(session);
        if (!session?.idToken) {
          throw new Error("Could not obtain a valid token. Please sign in again.");
        }

        // Scrape the active tab via content script
        const { data } = await scrapeActiveTab();
        if (!data) throw new Error("No scraped data returned from content script.");
        if (!data.supplierUrl) throw new Error("Could not detect product URL on this page.");

        // POST to /importDraft with Bearer token
        // *** FIXED: include Authorization header ***
        const resp = await fetch(IMPORT_URL, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": "Bearer " + session.idToken,
          },
          body: JSON.stringify(data),
        });

        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }

        if (!resp.ok) {
          const details =
            json?.error   ||
            json?.message ||
            json?.raw     ||
            `HTTP ${resp.status}`;
          throw new Error(`Import failed (${resp.status}): ${details}`);
        }

        // *** FIXED: read from json.result.draftId (new envelope) ***
        const draftId =
          json?.result?.draftId ||   // { success: true, result: { draftId } }
          json?.draftId          ||   // legacy flat shape
          null;

        if (!draftId) {
          console.error("[BeeCommerce popup] Unexpected response:", json);
          throw new Error("No draftId returned from server.");
        }

        await setSession({ lastDraftId: draftId });
        if (openDraftBtn) openDraftBtn.disabled = false;
        setStatus(`Imported ✅  Draft ID: ${draftId}`);

      } catch (err) {
        setStatus(String(err?.message || err), true);
      } finally {
        importBtn.disabled    = false;
        importBtn.textContent = originalText;
      }
    });
  }

  // ── Open last draft ───────────────────────────────────────────
  if (openDraftBtn) {
    openDraftBtn.addEventListener("click", async () => {
      try {
        const session = await getSession();
        const draftId = session?.lastDraftId;
        if (!draftId) {
          setStatus("No draft imported yet.", true);
          return;
        }
        const url = `${DEFAULT_APP_BASE}/DraftDetail?draftId=${encodeURIComponent(draftId)}`;
        await openDraftUrl(url);
      } catch (err) {
        setStatus(String(err?.message || err), true);
      }
    });
  }
}

initUI();
