// popup.js - Complete implementation with all helper functions

const FIREBASE_API_KEY = "AIzaSyA6nKy7nwf4oca8PXz7EdMiI0QUMCA-Epk";
const DEFAULT_APP_BASE = "https://bee-commerce-78532760.base44.app";

// ---- Storage Helpers ----
async function getSession() {
  return await chrome.storage.local.get([
    "idToken",
    "refreshToken",
    "expiresAt",
    "email",
    "lastDraftId"
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

// ---- Firebase Auth ----
async function signIn(email, password) {
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );

  const json = await resp.json();
  
  if (!resp.ok) {
    const msg = json?.error?.message || "Sign in failed";
    throw new Error(msg);
  }

  const idToken = json.idToken;
  const refreshToken = json.refreshToken;
  const expiresInSec = Number(json.expiresIn || 3600);
  const expiresAt = nowMs() + expiresInSec * 1000;

  await setSession({
    idToken,
    refreshToken,
    expiresAt,
    email: json.email || email
  });

  return { idToken, refreshToken, expiresAt, email: json.email || email };
}

async function refreshIdTokenIfNeeded(session) {
  const expiresAt = session.expiresAt || 0;
  const refreshToken = session.refreshToken;
  
  if (!refreshToken) return session;

  // Refresh 2 minutes early
  if (nowMs() < expiresAt - 2 * 60 * 1000 && session.idToken) {
    return session;
  }

  const resp = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    }
  );

  const json = await resp.json();
  
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Token refresh failed");
  }

  const newIdToken = json.id_token;
  const newRefreshToken = json.refresh_token || refreshToken;
  const expiresInSec = Number(json.expires_in || 3600);
  const newExpiresAt = nowMs() + expiresInSec * 1000;

  const updated = {
    ...session,
    idToken: newIdToken,
    refreshToken: newRefreshToken,
    expiresAt: newExpiresAt
  };
  
  await setSession(updated);
  return updated;
}

// ---- Scraping ----
async function scrapeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PRODUCT" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
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

// ---- UI Helpers ----
function setStatus(msg, isError = false) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  
  statusEl.textContent = msg;
  statusEl.className = isError ? "err" : (msg ? "ok" : "");
  statusEl.style.display = msg ? "block" : "none";
}

function showLoggedOut() {
  const loggedOut = document.getElementById("loggedOut");
  const loggedIn = document.getElementById("loggedIn");
  if (loggedOut) loggedOut.style.display = "block";
  if (loggedIn) loggedIn.style.display = "none";
}

function showLoggedIn(email) {
  const loggedOut = document.getElementById("loggedOut");
  const loggedIn = document.getElementById("loggedIn");
  const userEmail = document.getElementById("userEmail");
  
  if (loggedOut) loggedOut.style.display = "none";
  if (loggedIn) loggedIn.style.display = "block";
  if (userEmail) userEmail.textContent = email || "Unknown";
}

async function openDraftUrl(url) {
  await chrome.tabs.create({ url });
}

// ---- Initialize UI ----
async function initUI() {
  // Show correct section on load
  try {
    const session = await getSession();
    if (session?.idToken && session?.refreshToken) {
      showLoggedIn(session.email);
      
      // Enable open draft button if we have a lastDraftId
      const openDraftBtn = document.getElementById("openDraftBtn");
      if (openDraftBtn && session.lastDraftId) {
        openDraftBtn.disabled = false;
      }
    } else {
      showLoggedOut();
    }
  } catch (err) {
    console.error("Init error:", err);
    showLoggedOut();
  }

  // LOGIN
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      setStatus("");
      loginBtn.disabled = true;
      loginBtn.textContent = "Signing in...";
      
      try {
        const email = document.getElementById("email")?.value?.trim();
        const password = document.getElementById("password")?.value || "";
        
        if (!email || !password) {
          setStatus("Enter email + password", true);
          return;
        }

        await signIn(email, password);
        showLoggedIn(email);
        setStatus("Signed in ✅");
      } catch (err) {
        setStatus(String(err?.message || err), true);
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
      }
    });
  }

  // LOGOUT
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

  // IMPORT CURRENT PAGE
  const importBtn = document.getElementById("importBtn");
  const openDraftBtn = document.getElementById("openDraftBtn");

  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      setStatus("Importing…");
      importBtn.disabled = true;
      const originalText = importBtn.textContent;
      importBtn.textContent = "Importing...";
      
      if (openDraftBtn) openDraftBtn.disabled = true;

      try {
        // Ensure logged in + refresh token if needed
        let session = await getSession();
        if (!session?.refreshToken) {
          throw new Error("Please sign in first.");
        }
        
        session = await refreshIdTokenIfNeeded(session);

        // Ask content script to scrape
        const { data } = await scrapeActiveTab();
        if (!data) {
          throw new Error("No scraped data returned.");
        }

        // Send scraped draft to backend
        const resp = await fetch(
          "https://us-central1-studio-9717498599-c95ab.cloudfunctions.net/importDraft",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + session.idToken
            },
            body: JSON.stringify(data)
          }
        );

        const text = await resp.text();
        let json = null;
        try { 
          json = JSON.parse(text); 
        } catch { 
          json = { raw: text }; 
        }

        if (!resp.ok) {
          const details = json?.error || json?.message || json?.raw || "Unknown error";
          throw new Error(`Import failed (${resp.status}): ${details}`);
        }

        const draftId = json?.draftId;
        if (!draftId) {
          throw new Error("No draftId returned from server.");
        }

        await setSession({ lastDraftId: draftId });

        if (openDraftBtn) openDraftBtn.disabled = false;
        setStatus(`Imported ✅  Draft ID: ${draftId}`);
      } catch (err) {
        setStatus(String(err?.message || err), true);
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = originalText;
      }
    });
  }

  // OPEN LAST DRAFT
  if (openDraftBtn) {
    openDraftBtn.addEventListener("click", async () => {
      try {
        const session = await getSession();
        const draftId = session?.lastDraftId;
        
        if (!draftId) {
          setStatus("No draft imported yet.", true);
          return;
        }

        const openUrl = `${DEFAULT_APP_BASE}/DraftDetail?draftId=${encodeURIComponent(draftId)}`;
        await openDraftUrl(openUrl);
      } catch (err) {
        setStatus(String(err?.message || err), true);
      }
    });
  }
}

// Initialize when popup opens
initUI();
