import { upsertResearchProduct, loadResearchMemory } from "./storage.js";

export const API_SETTINGS_KEY = "elyon_extension_api_settings";
const BROWSER_IMPORTS_KEY = "elyon_browser_imports";
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

async function upsertLocalBrowserImport(product) {
  const result = await chrome.storage.local.get(BROWSER_IMPORTS_KEY).catch(() => ({}));
  const current = Array.isArray(result?.[BROWSER_IMPORTS_KEY]) ? result[BROWSER_IMPORTS_KEY] : [];
  const url = String(product?.url || "");
  const now = new Date().toISOString();
  const nextItem = {
    ...product,
    source: "chrome_extension",
    status: product?.status || "new",
    importedAt: product?.importedAt || now,
    updatedAt: now
  };
  const existingIndex = current.findIndex((item) => String(item?.url || "") === url);
  const next = existingIndex >= 0
    ? current.map((item, index) => (index === existingIndex ? { ...item, ...nextItem } : item))
    : [nextItem, ...current];
  await chrome.storage.local.set({ [BROWSER_IMPORTS_KEY]: next });
  return { items: next, status: existingIndex >= 0 ? "updated" : "saved" };
}

export async function pingBackend() {
  const backendUrl = await getBackendUrl();
  if (!backendUrl) {
    return { ok: false, reachable: false, message: "Backend-URL nicht gesetzt" };
  }

  const candidates = [
    `${backendUrl}/api/health`,
    `${backendUrl}/health`,
    backendUrl
  ];

  let lastErrorMessage = "Backend nicht erreichbar";
  for (const url of candidates) {
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, 4000);
      if (response.ok) {
        return {
          ok: true,
          reachable: true,
          status: response.status,
          message: `Backend erreichbar (${new URL(url).pathname || "/"})`
        };
      }
      lastErrorMessage = `Backend reagiert mit ${response.status}`;
    } catch (error) {
      lastErrorMessage = error?.name === "AbortError" ? "Timeout beim Backend-Test" : "Backend nicht erreichbar";
    }
  }

  try {
    return { ok: false, reachable: false, message: lastErrorMessage };
  } catch {
    return { ok: false, reachable: false, message: lastErrorMessage };
  }
}

export async function sendProductToElyon(product) {
  const backendUrl = await getBackendUrl();
  if (!backendUrl) {
    await upsertResearchProduct({ ...product, updatedAt: new Date().toISOString() });
    const browserImport = await upsertLocalBrowserImport(product);
    return { ok: false, storedLocally: true, browserImport, message: "Backend-URL nicht gesetzt" };
  }

  try {
    const response = await fetchWithTimeout(`${backendUrl}/api/extension/import-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: product?.title || "",
        price: product?.price || "",
        currency: product?.currency || "",
        image: product?.image || "",
        url: product?.url || "",
        supplier: product?.supplier || "",
        domain: product?.domain || "",
        detectedAt: product?.detectedAt || new Date().toISOString(),
        source: "chrome_extension",
        status: product?.status || "new",
        notes: product?.notes || "",
        score: product?.score || ""
      })
    }, 5000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const browserImport = await upsertLocalBrowserImport({ ...product, ...payload.product, status: payload.status || "new" });

    const boardSync = await chrome.runtime.sendMessage({
      type: "ELYON_RESEARCH_UPSERT",
      product: {
        ...product,
        updatedAt: new Date().toISOString()
      }
    }).catch(() => ({ ok: false, boardSync: { ok: false, message: "Board-Tab nicht offen" } }));

    return {
      ok: true,
      storedLocally: false,
      browserImport,
      boardSync: boardSync?.boardSync || { ok: false, synced: false, message: "Board-Tab nicht offen" },
      message:
        payload.status === "duplicate"
          ? "Schon vorhanden"
          : payload.status === "updated"
            ? "Gespeichert"
            : "Gespeichert"
    };
  } catch (error) {
    try {
      const fallback = await fetchWithTimeout(`${backendUrl}/api/elyon-soul`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-product",
          prompt: "Produkt aus Elyon Browser OS speichern und vorbereiten.",
          products: [product],
          summary: { total: 1 }
        })
      }, 5000);
      if (fallback.ok) {
        const browserImport = await upsertLocalBrowserImport(product);
        const boardSync = await chrome.runtime.sendMessage({
          type: "ELYON_RESEARCH_UPSERT",
          product: {
            ...product,
            updatedAt: new Date().toISOString()
          }
        }).catch(() => ({ ok: false, boardSync: { ok: false, message: "Board-Tab nicht offen" } }));
        return {
          ok: true,
          storedLocally: false,
          browserImport,
          boardSync: boardSync?.boardSync || { ok: false, synced: false, message: "Board-Tab nicht offen" },
          message: "Gespeichert"
        };
      }
    } catch {
      // fall through to local storage
    }

    await upsertResearchProduct({ ...product, updatedAt: new Date().toISOString() });
    const browserImport = await upsertLocalBrowserImport(product);
    return {
      ok: false,
      storedLocally: true,
      browserImport,
      message: error?.name === "AbortError" ? "Backend nicht erreichbar – lokal gespeichert" : "Backend nicht erreichbar – lokal gespeichert"
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
    const response = await fetchWithTimeout(`${backendUrl}/api/elyon-soul`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ai-prepare",
        prompt: "AI-Analyse fuer ein Produkt vorbereiten.",
        products: [product],
        summary: {
          total: 1,
          missingMarginCount: 0,
          missingDeliveryCount: 0,
          complianceRiskCount: 0,
          weakMarginCount: 0,
          averageProfit: 0
        }
      })
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
