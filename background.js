// background.js (MV3 service worker)

// ---- Config ----
// Firebase API key for the studio-9717498599-c95ab project
const FIREBASE_API_KEY = "AIzaSyA6nKy7nwf4oca8PXz7EdMiI0QUMCA-Epk";

// *** FIXED: correct project URL ***
const API_BASE = "https://us-central1-studio-9717498599-c95ab.cloudfunctions.net";

const DEFAULT_IMPORT_URL = `${API_BASE}/importDraft`;
const DEFAULT_APP_BASE   = "https://bee-commerce-78532760.base44.app";

// ---- Storage helpers ----
async function getSettings() {
  const { importUrl, appBaseUrl } = await chrome.storage.sync.get(["importUrl", "appBaseUrl"]);
  return {
    importUrl:  importUrl  || DEFAULT_IMPORT_URL,
    appBaseUrl: appBaseUrl || DEFAULT_APP_BASE,
  };
}

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

function nowMs() {
  return Date.now();
}

// ---- Token refresh ----
async function refreshIdTokenIfNeeded(session) {
  const expiresAt    = session.expiresAt    || 0;
  const refreshToken = session.refreshToken || "";
  if (!refreshToken) return session;

  // Refresh 2 minutes early
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

// ---- ImportDraft ----
// *** FIXED: backend returns { success, error, result: { ok, draftId } }
//     so we read json.result.draftId, not json.draftId ***
async function importDraft(importUrl, idToken, scraped) {
  const resp = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": "Bearer " + idToken,
    },
    body: JSON.stringify(scraped),
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    // Pull the error message out of the structured response envelope
    const details =
      json?.error ||
      json?.message ||
      json?.raw ||
      `HTTP ${resp.status}`;
    throw new Error(`Import failed (${resp.status}): ${details}`);
  }

  // *** FIXED: backend wraps the payload in json.result ***
  const draftId =
    json?.result?.draftId ||   // new envelope: { success, result: { draftId } }
    json?.draftId          ||   // fallback: legacy flat response
    null;

  if (!draftId) {
    console.error("[BeeCommerce background] Unexpected response shape:", json);
    throw new Error("No draftId returned from server");
  }

  return draftId;
}

function buildDraftUrl(appBaseUrl, draftId) {
  return `${appBaseUrl}/DraftDetail?draftId=${encodeURIComponent(draftId)}`;
}

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    // ── Import a scraped product ──────────────────────────────────
    if (msg?.type === "BEE_IMPORT_SCRAPED") {
      const scraped = msg.payload?.scraped;
      if (!scraped?.supplierUrl) {
        throw new Error("Missing supplierUrl — scrape failed or page not supported");
      }

      const settings = await getSettings();
      let session    = await getSession();

      if (!session?.refreshToken) {
        throw new Error("Please sign in in the extension popup first.");
      }

      session = await refreshIdTokenIfNeeded(session);

      if (!session?.idToken) {
        throw new Error("Could not obtain a valid Firebase token. Please sign in again.");
      }

      const draftId = await importDraft(settings.importUrl, session.idToken, scraped);
      await setSession({ lastDraftId: draftId });

      sendResponse({
        ok:      true,
        draftId,
        openUrl: buildDraftUrl(settings.appBaseUrl, draftId),
      });
      return;
    }

    // ── Return the last imported draft URL ────────────────────────
    if (msg?.type === "BEE_GET_LAST_DRAFT") {
      const settings = await getSettings();
      const session  = await getSession();
      const draftId  = session.lastDraftId || null;

      sendResponse({
        ok:      true,
        draftId,
        openUrl: draftId ? buildDraftUrl(settings.appBaseUrl, draftId) : null,
      });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((e) => {
    console.error("[BeeCommerce background] Error:", e);
    sendResponse({ ok: false, error: String(e?.message || e) });
  });

  return true; // keep message channel open for async sendResponse
});
