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

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return "";
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)])
  );
}

function normalizeImageUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeImages(primary, images) {
  return Array.from(new Set([primary, ...toArray(images)].map(normalizeImageUrl).filter(Boolean))).slice(0, 40);
}

function normalizeElyonProductForImport(product = {}) {
  const elyonProduct = toObject(product.elyonProduct);
  const identity = toObject(elyonProduct.identity);
  const content = toObject(elyonProduct.content);
  const media = toObject(elyonProduct.media);
  const pricing = toObject(elyonProduct.pricing);
  const availability = toObject(elyonProduct.availability);
  const supplier = toObject(elyonProduct.supplier);
  const reviews = toObject(elyonProduct.reviews);
  const variantsObj = toObject(elyonProduct.variants);
  const risk = toObject(elyonProduct.risk);
  const images = normalizeImages(firstValue(product.image, media.mainImage), firstValue(product.images, media.images));
  const descriptionCandidates = Array.from(new Set([
    ...toArray(product.descriptionCandidates),
    ...toArray(content.descriptionCandidates),
    content.longDescription,
    content.shortDescription,
    product.description
  ].filter(Boolean))).slice(0, 20);
  const variants = firstValue(product.variants, product.platformVariants, product.aliexpressVariants, product.sourceOnlineVariants, variantsObj.variantItems, variantsObj.variantGroups, []);
  const title = firstValue(product.title, identity.title) || "";
  const url = firstValue(product.url, elyonProduct.meta?.sourceUrl) || "";
  const warnings = Array.from(new Set([
    ...toArray(product.warnings),
    ...toArray(product.extractionDebug?.warnings),
    ...toArray(elyonProduct.raw?.extractionWarnings),
    !title ? "Produkt ohne Titel" : "",
    !url ? "Produkt ohne URL" : ""
  ].filter(Boolean))).slice(0, 50);
  const normalized = {
    id: product.id || product.url || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    price: firstValue(product.price, pricing.currentPrice, pricing.priceText),
    currency: firstValue(product.currency, pricing.currency),
    image: images[0] || "",
    images,
    url,
    domain: firstValue(product.domain, elyonProduct.meta?.sourceDomain),
    supplier: firstValue(product.supplier, supplier.supplierName, supplier.storeName),
    description: firstValue(product.description, content.longDescription, content.shortDescription),
    descriptionCandidates,
    descriptionSource: product.descriptionSource || "",
    shipping: product.shipping && typeof product.shipping === "object" ? product.shipping : {
      cost: pricing.shippingCost || "",
      deliveryTime: availability.deliveryText || "",
      shipsFrom: availability.shipsFrom || ""
    },
    availability: firstValue(product.availability, availability.stockText, availability.deliveryText),
    category: firstValue(product.category, identity.category, elyonProduct.marketplace?.marketplaceCategory),
    rating: firstValue(product.rating, reviews.ratingValue),
    reviewsCount: firstValue(product.reviewsCount, reviews.reviewsCount),
    soldCount: product.soldCount || "",
    variants: Array.isArray(variants) ? variants : variants && typeof variants === "object" ? [variants] : [],
    productDetails: firstValue(product.productDetails, content.productDetails, content.specifications, {}),
    complianceRisks: Array.from(new Set([...toArray(product.complianceRisks), ...toArray(risk.warningTexts)])).slice(0, 50),
    elyonProduct,
    raw: firstValue(product.raw, elyonProduct.raw, product.extractionDebug, {}),
    notes: product.notes || "",
    errorState: product.errorState || {},
    warnings,
    detectedAt: product.detectedAt || new Date().toISOString(),
    updatedAt: product.updatedAt || new Date().toISOString()
  };
  return stripUndefined(normalized);
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
  const normalizedImportProduct = normalizeElyonProductForImport(product || {});
  if (!backendUrl) {
    await upsertResearchProduct({ ...normalizedImportProduct, notes: "Backend-URL nicht gesetzt", updatedAt: new Date().toISOString() }).catch(() => null);
    return { ok: false, storedLocally: true, serverSaved: false, message: "Backend nicht erreichbar - Produkt lokal gespeichert." };
  }

  try {
    const requestBody = JSON.stringify({
      product: normalizedImportProduct,
      source: "chrome-extension",
      mode: "draft",
      importTarget: "browser-imports",
      safety: {
        liveAction: false,
        listingCreated: false,
        orderCreated: false,
        messageSent: false,
        reviewRequired: true,
        manualApprovalRequired: true
      }
    });
    await chrome.storage.local.set({
      elyon_last_import_payload: {
        product: normalizedImportProduct,
        sentAt: new Date().toISOString()
      }
    }).catch(() => null);
    const endpoints = ["/api/extension/import", "/api/extension/import-product"];
    let response = null;
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        response = await fetchWithTimeout(`${backendUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody
        }, 5000);
        if (response.ok) break;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    if (!response?.ok) {
      throw lastError || new Error("Backend-Import fehlgeschlagen");
    }

    const payload = await response.json().catch(() => ({}));
    await chrome.storage.local.set({
      elyon_last_import_response: {
        response: payload,
        receivedAt: new Date().toISOString()
      }
    }).catch(() => null);

    return {
      ok: true,
      storedLocally: false,
      serverSaved: true,
      product: payload.browserImport || payload.product || null,
      status: payload.status || "saved",
      persisted: payload.persisted === true,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      message: payload.message || (
        payload.status === "duplicate"
          ? "Schon vorhanden"
          : payload.status === "updated"
            ? "Serverseitig aktualisiert"
            : "Serverseitig gespeichert"
      )
    };
  } catch (error) {
    await chrome.storage.local.set({
      elyon_last_import_error: {
        message: error?.message || String(error),
        at: new Date().toISOString()
      }
    }).catch(() => null);
    await upsertResearchProduct({ ...normalizedImportProduct, notes: "Backend nicht erreichbar", updatedAt: new Date().toISOString() }).catch(() => null);
    return {
      ok: false,
      storedLocally: true,
      serverSaved: false,
      message: error?.name === "AbortError" ? "Backend nicht erreichbar - Produkt lokal gespeichert." : "Server-Import fehlgeschlagen - Produkt lokal gespeichert."
    };
  }
}

function buildSoulScoutPrompt(product = {}) {
  const normalized = product?.elyonProduct && typeof product.elyonProduct === "object" ? product.elyonProduct : {};
  const title = product?.title || normalized?.identity?.title || "Unbekanntes Produkt";
  const supplier = product?.supplier || normalized?.supplier?.supplierName || product?.domain || "Unbekannter Supplier";
  return [
    "Du bist Soul Scout im Elyon Seller Tool.",
    "Analysiere dieses importierte Produkt nur als Entscheidungshilfe. Keine Live-Aktion ausfuehren.",
    "Bewerte kurz und praktisch: Nachfrage, Zielgruppe, Wettbewerb, Liefer-/Supplier-Risiko, Compliance-Risiko, Marge-Potenzial und naechster manueller Schritt.",
    "Gib am Ende eine klare Empfehlung: winner, reviewed, risky oder rejected.",
    "",
    `Produkt: ${title}`,
    `Supplier/Domain: ${supplier}`,
    `Preis: ${product?.price || normalized?.pricing?.priceText || "-"} ${product?.currency || normalized?.pricing?.currency || ""}`,
    `URL: ${product?.url || normalized?.meta?.sourceUrl || "-"}`
  ].join("\n");
}

function buildAnalysisSummary(product = {}) {
  const risks = Array.isArray(product?.complianceRisks) ? product.complianceRisks.length : 0;
  const priceNumber = Number(String(product?.price || "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return {
    total: 1,
    missingMarginCount: 1,
    missingDeliveryCount: product?.shipping || product?.availability ? 0 : 1,
    complianceRiskCount: risks,
    weakMarginCount: Number.isFinite(priceNumber) && priceNumber > 0 ? 0 : 1,
    averageProfit: 0,
    averageMargin: 0
  };
}

export async function prepareAiAnalysis(product, options = {}) {
  const backendUrl = await getBackendUrl();
  const agentId = options.agentId || "soul-scout";
  const action = options.action || "soul-scout-analysis";
  const prompt = options.prompt || buildSoulScoutPrompt(product);
  if (!backendUrl) {
    await upsertResearchProduct({ ...product, notes: "Soul Scout Analyse lokal vorbereitet", updatedAt: new Date().toISOString() });
    return { ok: false, storedLocally: true, message: "Backend-URL nicht gesetzt - Soul Scout lokal vorbereitet." };
  }

  try {
    const response = await fetchWithTimeout(`${backendUrl}/api/elyon-soul`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        agentId,
        source: "chrome_extension",
        mode: "draft_analysis",
        prompt,
        products: [product],
        summary: buildAnalysisSummary(product),
        safety: {
          liveAction: false,
          listingCreated: false,
          orderCreated: false,
          messageSent: false,
          reviewRequired: true,
          manualApprovalRequired: true
        }
      })
    }, 12000);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    return {
      ok: true,
      storedLocally: false,
      aiEnabled: payload.aiEnabled === true,
      mode: payload.mode || "analysis",
      content: payload.content || payload.answer || payload.message || "",
      summary: payload.summary || null,
      message: payload.message || "Soul Scout Analyse abgeschlossen."
    };
  } catch (error) {
    await upsertResearchProduct({ ...product, notes: "Soul Scout Analyse lokal vorbereitet", updatedAt: new Date().toISOString() });
    return {
      ok: false,
      storedLocally: true,
      message: error?.name === "AbortError" ? "Soul Scout Timeout - lokal vorbereitet." : "Soul Scout Backend nicht erreichbar - lokal vorbereitet."
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
