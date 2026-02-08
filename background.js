// background.js (MV3 service worker)

// ---- Config ----
const FIREBASE_API_KEY = "AIzaSyA6nKy7nwf4oca8PXz7EdMiI0QUMCA-Epk";
const DEFAULT_IMPORT_URL =
  "https://us-central1-studio-9717498599-c95ab.cloudfunctions.net/importDraft";
const DEFAULT_APP_BASE = "https://bee-commerce-78532760.base44.app";

// ---- Storage helpers ----
async function getSettings() {
  const { importUrl, appBaseUrl } = await chrome.storage.sync.get(["importUrl", "appBaseUrl"]);
  return {
    importUrl: importUrl || DEFAULT_IMPORT_URL,
    appBaseUrl: appBaseUrl || DEFAULT_APP_BASE
  };
}

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

function nowMs() {
  return Date.now();
}

// ---- Token refresh (same behavior as your current code) ----
async function refreshIdTokenIfNeeded(session) {
  const expiresAt = session.expiresAt || 0;
  const refreshToken = session.refreshToken;
  if (!refreshToken) return session;

  // refresh 2 minutes early
  if (nowMs() < expiresAt - 2 * 60 * 1000 && session.idToken) return session;

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

// ---- ImportDraft ----
async function importDraft(importUrl, idToken, scraped) {
  const resp = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    },
    body: JSON.stringify(scraped)
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    const details = json?.error || json?.message || json?.raw || "Unknown error";
    throw new Error(`Import failed (${resp.status}): ${details}`);
  }
  if (!json?.draftId) throw new Error("No draftId returned");
  return json.draftId;
}

function buildDraftUrl(appBaseUrl, draftId) {
  return `${appBaseUrl}/DraftDetail?draftId=${encodeURIComponent(draftId)}`;
}

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "BEE_IMPORT_SCRAPED") {
      const scraped = msg.payload?.scraped;
      if (!scraped?.supplierUrl) throw new Error("Missing supplierUrl (scrape failed)");

      const settings = await getSettings();
      let session = await getSession();

      session = await refreshIdTokenIfNeeded(session);
      if (!session?.idToken) throw new Error("Please sign in in the extension popup first.");

      const draftId = await importDraft(settings.importUrl, session.idToken, scraped);
      await setSession({ lastDraftId: draftId });

      sendResponse({
        ok: true,
        draftId,
        openUrl: buildDraftUrl(settings.appBaseUrl, draftId)
      });
      return;
    }

    if (msg?.type === "BEE_GET_LAST_DRAFT") {
      const settings = await getSettings();
      const session = await getSession();
      const draftId = session.lastDraftId || null;

      sendResponse({
        ok: true,
        draftId,
        openUrl: draftId ? buildDraftUrl(settings.appBaseUrl, draftId) : null
      });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((e) => {
    sendResponse({ ok: false, error: String(e?.message || e) });
  });

  return true;
});
