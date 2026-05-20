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
    return { ok: false, storedLocally: false, serverSaved: false, message: "Backend-URL nicht gesetzt - nicht gespeichert" };
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
        images: Array.isArray(product?.images) ? product.images : [],
        description: product?.description || "",
        variants: Array.isArray(product?.variants) ? product.variants : [],
        shipping: product?.shipping && typeof product.shipping === "object" ? product.shipping : {},
        rating: product?.rating || "",
        reviewsCount: product?.reviewsCount || "",
        soldCount: product?.soldCount || "",
        productDetails: product?.productDetails && typeof product.productDetails === "object" ? product.productDetails : {},
        availability: product?.availability || "",
        category: product?.category || "",
        supplierInfo: product?.supplierInfo && typeof product.supplierInfo === "object" ? product.supplierInfo : {},
        complianceRisks: Array.isArray(product?.complianceRisks) ? product.complianceRisks : [],
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

    return {
      ok: true,
      storedLocally: false,
      serverSaved: true,
      product: payload.product || null,
      status: payload.status || "saved",
      persisted: payload.persisted === true,
      message: payload.message || (
        payload.status === "duplicate"
          ? "Schon vorhanden"
          : payload.status === "updated"
            ? "Serverseitig aktualisiert"
            : "Serverseitig gespeichert"
      )
    };
  } catch (error) {
    return {
      ok: false,
      storedLocally: false,
      serverSaved: false,
      message: error?.name === "AbortError" ? "Backend nicht erreichbar - nicht gespeichert" : "Server-Import fehlgeschlagen - nicht gespeichert"
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
