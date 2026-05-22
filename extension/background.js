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
import { prepareAgentWorkflow, loadAgentWorkflows } from "./shared/agentWorkflows.js";
import { SOUL_AGENTS } from "./shared/agents.js";
import { sendProductToElyon as sendProductImportToElyon } from "./shared/apiClient.js";

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
  if (!result.elyon_agent_workflows) await chrome.storage.local.set({ elyon_agent_workflows: [] });
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

async function notifyActiveTabOverlayState(enabled) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.id || !isSupportedUrl(tab.url || "")) return false;
  const injected = await ensureContentScript(tab.id);
  if (!injected) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ELYON_SET_OVERLAY_ENABLED", enabled });
    return true;
  } catch {
    return false;
  }
}

async function syncProductToBoardTab(product) {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const target = tabs.find((tab) => {
    const url = String(tab.url || "").toLowerCase();
    return (
      url.includes("elyonsellertool.vercel.app") ||
      url.includes("elyon-seller-tool.vercel.app") ||
      url.includes("localhost")
    );
  });

  if (!target?.id) {
    return { ok: false, synced: false, message: "Elyon-Board-Tab nicht offen" };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (incoming) => {
        try {
          const key = "elyonProducts";
          const raw = localStorage.getItem(key);
          let current = [];
          try {
            const parsed = JSON.parse(raw || "[]");
            current = Array.isArray(parsed) ? parsed : [];
          } catch {
            current = [];
          }

          const now = new Date().toISOString();
          const nextItem = {
            ...(incoming || {}),
            createdAt: incoming?.createdAt || incoming?.savedAt || now,
            savedAt: incoming?.savedAt || now,
            updatedAt: now
          };
          const url = String(nextItem.url || "");
          const existingIndex = current.findIndex((item) => item && item.url === url);
          const next = existingIndex >= 0
            ? current.map((item, index) => (index === existingIndex ? { ...item, ...nextItem } : item))
            : [nextItem, ...current];

          localStorage.setItem(key, JSON.stringify(next));
          window.dispatchEvent(new CustomEvent("elyon:external-product-sync", { detail: { product: nextItem, source: "extension" } }));
          return { ok: true, count: next.length };
        } catch (error) {
          return { ok: false, error: error?.message || String(error) };
        }
      },
      args: [product]
    });

    if (result?.result?.ok) {
      try {
        await chrome.tabs.reload(target.id, { bypassCache: true });
      } catch {
        // reload is best-effort only
      }
      return { ok: true, synced: true, message: "Board aktualisiert und Seite neu geladen" };
    }

    return { ok: false, synced: false, message: result?.result?.error || "Board-Sync fehlgeschlagen" };
  } catch (error) {
    return { ok: false, synced: false, message: error?.message || "Board-Sync fehlgeschlagen" };
  }
}

function isSupportedUrl(url = "") {
  const value = String(url).toLowerCase();
  return value.includes("ebay.") || value.includes("amazon.") || value.includes("aliexpress") || value.includes("cjdropshipping") || value.includes("temu") || value.includes("bigbuy.") || value.includes("vidaxl.") || value.includes("dropshippingxl");
}

function getMarketplaceFromUrl(url = "") {
  const value = String(url).toLowerCase();
  if (value.includes("ebay.")) return "eBay";
  if (value.includes("amazon.")) return "Amazon";
  if (value.includes("aliexpress")) return "AliExpress";
  if (value.includes("cjdropshipping")) return "CJ Dropshipping";
  if (value.includes("temu")) return "Temu";
  if (value.includes("bigbuy.")) return "BigBuy";
  if (value.includes("vidaxl.") || value.includes("dropshippingxl")) return "vidaXL";
  return "Unknown";
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
      const importResult = await sendProductImportToElyon({ ...message.product, status: "new" });
      const researchResult = await loadResearchMemory();
      sendResponse({
        ok: importResult?.ok !== false,
        products: await chrome.storage.local.get(STORAGE_KEYS.products).then((result) => Array.isArray(result[STORAGE_KEYS.products]) ? result[STORAGE_KEYS.products] : []),
        researchMemory: researchResult,
        security,
        decision,
        boardSync: importResult?.boardSync || { ok: false, synced: false, message: "Board-Tab nicht offen" },
        importResult,
        message: importResult?.message || "Produkt verarbeitet"
      });
      return;
    }

    if (message?.type === "ELYON_RESEARCH_UPSERT" && message.product) {
      const next = await upsertResearchProduct(message.product);
      const boardSync = await syncProductToBoardTab(message.product);
      sendResponse({ ok: true, researchMemory: next, security, boardSync });
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

    if (message?.type === "ELYON_PREPARE_AGENT_WORKFLOW" && message.agentId) {
      const agent = SOUL_AGENTS.find((entry) => entry.id === message.agentId);
      if (!agent) {
        sendResponse({ ok: false, error: "Agent not found" });
        return;
      }
      const workflows = await prepareAgentWorkflow(agent, message.context || {});
      sendResponse({ ok: true, workflows, lastWorkflow: workflows[0], security });
      return;
    }

    if (message?.type === "ELYON_AGENT_WORKFLOWS_LIST") {
      const workflows = await loadAgentWorkflows();
      sendResponse({ ok: true, workflows, security });
      return;
    }

    if (message?.type === "ELYON_SCAN_TABS") {
      const tabs = await chrome.tabs.query({});
      const researchMemory = await loadResearchMemory();
      const supported = tabs
        .filter((tab) => {
          return isSupportedUrl(tab.url || "");
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
            marketplace: getMarketplaceFromUrl(url),
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
      const notified = await notifyActiveTabOverlayState(next.overlayEnabled);
      sendResponse({ ok: true, settings: next, security, label: getSecurityLabel(security), overlayNotified: notified });
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
