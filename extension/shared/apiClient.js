import { upsertResearchProduct, loadResearchMemory } from "./storage.js";

export const API_SETTINGS_KEY = "elyon_extension_api_settings";
const DEFAULT_API_SETTINGS = {
  backendUrl: ""
};

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export async function getBackendUrl() {
  const result = await chrome.storage.local.get(API_SETTINGS_KEY).catch(() => ({}));
  const stored = result?.[API_SETTINGS_KEY] || {};
  return safeUrl(stored.backendUrl) || safeUrl(DEFAULT_API_SETTINGS.backendUrl);
}

export async function setBackendUrl(url) {
  const backendUrl = safeUrl(url);
  const current = await chrome.storage.local.get(API_SETTINGS_KEY).catch(() => ({}));
  const next = { ...DEFAULT_API_SETTINGS, ...(current?.[API_SETTINGS_KEY] || {}), backendUrl };
  await chrome.storage.local.set({ [API_SETTINGS_KEY]: next });
  return next;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function pingBackend() {
  const backendUrl = await getBackendUrl();
  if (!backendUrl) {
    return { ok: false, reachable: false, message: "Backend-URL nicht gesetzt" };
  }
  try {
    const response = await fetchWithTimeout(`${backendUrl}/api/health`, { method: "GET" }, 4000);
    return {
      ok: response.ok,
      reachable: response.ok,
      status: response.status,
      message: response.ok ? "Backend erreichbar" : `Backend reagiert mit ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      message: error?.name === "AbortError" ? "Timeout beim Backend-Test" : "Backend nicht erreichbar"
    };
  }
}

export async function sendProductToElyon(product) {
  const backendUrl = await getBackendUrl();
  if (!backendUrl) {
    await upsertResearchProduct({ ...product, updatedAt: new Date().toISOString() });
    return { ok: false, storedLocally: true, message: "Backend-URL nicht gesetzt" };
  }

  try {
    const response = await fetchWithTimeout(`${backendUrl}/api/elyon/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product })
    }, 5000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return { ok: true, storedLocally: false, message: "Produkt an Elyon gesendet" };
  } catch (error) {
    await upsertResearchProduct({ ...product, updatedAt: new Date().toISOString() });
    return {
      ok: false,
      storedLocally: true,
      message: error?.name === "AbortError" ? "Timeout - lokal gespeichert" : "Backend nicht erreichbar - lokal gespeichert"
    };
  }
}

export async function prepareAiAnalysis(product) {
  const backendUrl = await getBackendUrl();
  if (!backendUrl) {
    await upsertResearchProduct({ ...product, notes: "AI-Analyse vorbereitet", updatedAt: new Date().toISOString() });
    return { ok: false, storedLocally: true, message: "KI-Verbindung nicht aktiv" };
  }

  try {
    const response = await fetchWithTimeout(`${backendUrl}/api/elyon/ai/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product })
    }, 5000);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true, storedLocally: false, message: "KI-Analyse vorbereitet" };
  } catch (error) {
    await upsertResearchProduct({ ...product, notes: "AI-Analyse vorbereitet", updatedAt: new Date().toISOString() });
    return {
      ok: false,
      storedLocally: true,
      message: "Lokal gespeichert – Backend nicht erreichbar"
    };
  }
}

export async function getElyonStatus() {
  const backendUrl = await getBackendUrl();
  const ping = await pingBackend();
  const researchCount = (await loadResearchMemory()).length;
  return {
    backendUrl,
    reachable: Boolean(ping.reachable),
    message: ping.message,
    researchCount
  };
}
