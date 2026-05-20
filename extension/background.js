import {
  DEFAULT_SECURITY_STATE,
  SECURITY_STORAGE_KEY,
  canRunAction,
  getSecurityLabel,
  getSecurityState,
  setSecurityState
} from "./shared/security.js";
import {
  loadResearchMemory,
  saveResearchMemory,
  upsertResearchProduct,
  updateResearchProductById,
  deleteResearchProductById
} from "./shared/storage.js";

const DEFAULT_SETTINGS = {
  ...DEFAULT_SECURITY_STATE,
  overlayEnabled: true
};

const STORAGE_KEYS = {
  settings: "elyon.settings",
  products: "elyon.products",
  state: "elyon.state",
  researchMemory: "elyon_research_memory"
};

async function readSettings() {
  const result = await chrome.storage.local.get(SECURITY_STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SECURITY_STORAGE_KEY] || {}) };
}

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get([SECURITY_STORAGE_KEY, STORAGE_KEYS.state, STORAGE_KEYS.products, STORAGE_KEYS.researchMemory]);
  if (!result[SECURITY_STORAGE_KEY]) await chrome.storage.local.set({ [SECURITY_STORAGE_KEY]: DEFAULT_SETTINGS });
  if (!result[STORAGE_KEYS.state]) await chrome.storage.local.set({ [STORAGE_KEYS.state]: { lastUpdated: new Date().toISOString(), currentTab: null } });
  if (!result[STORAGE_KEYS.products]) await chrome.storage.local.set({ [STORAGE_KEYS.products]: [] });
  if (!result[STORAGE_KEYS.researchMemory]) await chrome.storage.local.set({ [STORAGE_KEYS.researchMemory]: [] });
});

async function ensureContentScript(tabId) {
  if (!tabId) return false;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ELYON_PING" });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/productDetector.js"]
      });
      return true;
    } catch {
      return false;
    }
  }
}

function isSupportedUrl(url = "") {
  const value = String(url).toLowerCase();
  return value.includes("ebay.") || value.includes("amazon.") || value.includes("aliexpress") || value.includes("cjdropshipping") || value.includes("temu");
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-command-bar") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isSupportedUrl(tab.url || "")) return;
  const injected = await ensureContentScript(tab.id);
  if (!injected) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ELYON_TOGGLE_COMMAND_BAR" });
  } catch {}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const settings = await readSettings();
    const security = await getSecurityState();

    if (message?.type === "ELYON_GET_SNAPSHOT") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      sendResponse({
        ok: true,
        settings,
        security,
        currentTab: tab
          ? {
              id: tab.id,
              url: tab.url || "",
              title: tab.title || "",
              detected: message.detected || "unknown"
            }
          : null,
        products: (await chrome.storage.local.get(STORAGE_KEYS.products))[STORAGE_KEYS.products] || []
      });
      return;
    }

    if (message?.type === "ELYON_SAVE_PRODUCT" && message.product) {
      const decision = canRunAction("research_save", security);
      const result = await chrome.storage.local.get(STORAGE_KEYS.products);
      const products = Array.isArray(result[STORAGE_KEYS.products]) ? result[STORAGE_KEYS.products] : [];
      const exists = products.some((item) => item.url === message.product.url);
      const next = exists
        ? products.map((item) => (item.url === message.product.url ? { ...item, ...message.product, updatedAt: new Date().toISOString() } : item))
        : [{ ...message.product, savedAt: new Date().toISOString() }, ...products];
      await chrome.storage.local.set({ [STORAGE_KEYS.products]: next });
      const researchResult = await chrome.storage.local.get(STORAGE_KEYS.researchMemory);
      const researchMemory = Array.isArray(researchResult[STORAGE_KEYS.researchMemory]) ? researchResult[STORAGE_KEYS.researchMemory] : [];
      const researchExists = researchMemory.some((item) => item.url === message.product.url);
      const nextResearch = researchExists
        ? researchMemory.map((item) =>
            item.url === message.product.url
              ? { ...item, ...message.product, updatedAt: new Date().toISOString(), status: item.status || "new" }
              : item
          )
        : [{ ...message.product, status: "new", detectedAt: message.product.detectedAt || new Date().toISOString() }, ...researchMemory];
      await chrome.storage.local.set({ [STORAGE_KEYS.researchMemory]: nextResearch });
      const normalizedResearch = await upsertResearchProduct({ ...message.product, status: "new" });
      sendResponse({ ok: true, products: next, researchMemory: normalizedResearch, security, decision });
      return;
    }

    if (message?.type === "ELYON_RESEARCH_UPSERT" && message.product) {
      const next = await upsertResearchProduct(message.product);
      sendResponse({ ok: true, researchMemory: next, security });
      return;
    }

    if (message?.type === "ELYON_RESEARCH_UPDATE" && message.id) {
      const next = await updateResearchProductById(message.id, message.patch || {});
      sendResponse({ ok: true, researchMemory: next, security });
      return;
    }

    if (message?.type === "ELYON_RESEARCH_DELETE" && message.id) {
      const next = await deleteResearchProductById(message.id);
      sendResponse({ ok: true, researchMemory: next, security });
      return;
    }

    if (message?.type === "ELYON_RESEARCH_LIST") {
      const researchMemory = await loadResearchMemory();
      sendResponse({ ok: true, researchMemory, security });
      return;
    }

    if (message?.type === "ELYON_RESEARCH_EXPORT_PREP") {
      const researchMemory = await loadResearchMemory();
      sendResponse({ ok: true, exportJson: JSON.stringify(researchMemory, null, 2), security });
      return;
    }

    if (message?.type === "ELYON_SCAN_TABS") {
      const tabs = await chrome.tabs.query({});
      const researchMemory = await loadResearchMemory();
      const supported = tabs
        .filter((tab) => {
          const url = String(tab.url || "").toLowerCase();
          return url.includes("ebay.") || url.includes("amazon.") || url.includes("aliexpress") || url.includes("cjdropshipping") || url.includes("temu");
        })
        .map((tab) => {
          const url = tab.url || "";
          const title = tab.title || "";
          const domain = (() => {
            try {
              return new URL(url).hostname.toLowerCase();
            } catch {
              return "";
            }
          })();
          const saved = researchMemory.some((item) => item.url === url);
          return {
            id: tab.id,
            title,
            url,
            domain,
            marketplace: domain.includes("ebay")
              ? "eBay"
              : domain.includes("amazon")
                ? "Amazon"
                : domain.includes("aliexpress")
                  ? "AliExpress"
                  : domain.includes("cjdropshipping")
                    ? "CJ Dropshipping"
                    : domain.includes("temu")
                      ? "Temu"
                      : "Unknown",
            saved,
            status: saved ? "saved" : "new"
          };
        });
      sendResponse({
        ok: true,
        summary: {
          checkedTabs: tabs.length,
          supportedTabs: supported.length,
          savedTabs: supported.filter((tab) => tab.saved).length,
          newTabs: supported.filter((tab) => !tab.saved).length
        },
        tabs: supported,
        security
      });
      return;
    }

    if (message?.type === "ELYON_UPDATE_SETTINGS" && message.settings) {
      const next = { ...settings, ...message.settings };
      const saved = await setSecurityState(next);
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: { ...saved, overlayEnabled: next.overlayEnabled !== false } });
      sendResponse({ ok: true, settings: { ...saved, overlayEnabled: next.overlayEnabled !== false }, security: saved });
      return;
    }

    if (message?.type === "ELYON_TOGGLE_OVERLAY") {
      const next = { ...settings, overlayEnabled: !settings.overlayEnabled };
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
      sendResponse({ ok: true, settings: next, security, label: getSecurityLabel(security) });
      return;
    }

    if (message?.type === "ELYON_OPEN_COMMAND_BAR") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !isSupportedUrl(tab.url || "")) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      const injected = await ensureContentScript(tab.id);
      if (!injected) {
        sendResponse({ ok: false, error: "Content script injection failed" });
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "ELYON_TOGGLE_COMMAND_BAR", force: true });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
