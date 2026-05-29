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
  deleteResearchProductById,
  saveCurrentProductSnapshot,
  saveManualCapture,
  loadManualCaptures
} from "./shared/storage.js";
import { prepareAgentWorkflow, loadAgentWorkflows } from "./shared/agentWorkflows.js";
import { SOUL_AGENTS } from "./shared/agents.js";
import { sendProductToElyon as sendProductImportToElyon, prepareAiAnalysis } from "./shared/apiClient.js";

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

const ALIEXPRESS_VARIANT_CACHE_KEY = "elyon_aliexpress_variant_cache";
const ALIEXPRESS_PARENT_SEARCH_KEY = "elyon_aliexpress_parent_search";
const PLATFORM_VARIANT_CACHE_KEY = "elyon_platform_variant_cache";

const CONTEXT_MENU_ITEMS = [
  { id: "elyon-capture-auto", title: "Markierten Text übernehmen", contexts: ["selection"] },
  { id: "elyon-capture-description", title: "Als Produktbeschreibung speichern", contexts: ["selection"] },
  { id: "elyon-capture-bullets", title: "Als Bulletpoints speichern", contexts: ["selection"] },
  { id: "elyon-capture-technical", title: "Als technische Daten speichern", contexts: ["selection"] },
  { id: "elyon-capture-delivery", title: "Als Lieferinfo speichern", contexts: ["selection"] },
  { id: "elyon-capture-note", title: "Als Notiz speichern", contexts: ["selection", "page"] },
  { id: "elyon-capture-image", title: "Bild übernehmen", contexts: ["image"] },
  { id: "elyon-capture-main-image", title: "Als Hauptbild setzen", contexts: ["image"] },
  { id: "elyon-capture-product-local", title: "Produktdaten lokal erfassen", contexts: ["page", "selection", "image"] },
  { id: "elyon-scan-variants-local", title: "Varianten lokal scannen", contexts: ["page"] }
];

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
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

function createContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "elyon-root", title: "Elyon", contexts: ["page", "selection", "image", "link"] });
    CONTEXT_MENU_ITEMS.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        parentId: "elyon-root",
        title: item.title,
        contexts: item.contexts
      });
    });
  });
}

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

function isAliExpressUrl(url = "") {
  return String(url || "").toLowerCase().includes("aliexpress");
}

function isAliExpressProductUrl(url = "") {
  const value = String(url || "").toLowerCase();
  return value.includes("aliexpress") && value.includes("/item/");
}

async function rememberAliExpressParentSearch(tabId, url = "") {
  if (!tabId || !isAliExpressUrl(url) || isAliExpressProductUrl(url)) return;
  const result = await chrome.storage.local.get(ALIEXPRESS_PARENT_SEARCH_KEY).catch(() => ({}));
  const current = result?.[ALIEXPRESS_PARENT_SEARCH_KEY] || {};
  await chrome.storage.local.set({
    [ALIEXPRESS_PARENT_SEARCH_KEY]: {
      ...current,
      [tabId]: { url, capturedAt: new Date().toISOString() }
    }
  });
}

async function readAliExpressParentSearch(tabId) {
  const result = await chrome.storage.local.get(ALIEXPRESS_PARENT_SEARCH_KEY).catch(() => ({}));
  const current = result?.[ALIEXPRESS_PARENT_SEARCH_KEY] || {};
  const own = current?.[tabId]?.url || "";
  if (own) return own;
  const recent = Object.values(current)
    .filter((entry) => entry?.url)
    .sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")))[0];
  return recent?.url || "";
}

async function cacheAliExpressProduct(product = {}, tabId = null) {
  const parentSearchUrl = product.parentSearchUrl || await readAliExpressParentSearch(tabId);
  const nextProduct = {
    ...product,
    parentSearchUrl,
    extractedAt: new Date().toISOString()
  };
  await saveCurrentProductSnapshot(nextProduct).catch(() => null);
  const cacheResult = await chrome.storage.local.get(ALIEXPRESS_VARIANT_CACHE_KEY).catch(() => ({}));
  const cache = cacheResult?.[ALIEXPRESS_VARIANT_CACHE_KEY] || {};
  const key = nextProduct.url || `tab-${tabId || Date.now()}`;
  await chrome.storage.local.set({
    [ALIEXPRESS_VARIANT_CACHE_KEY]: {
      ...cache,
      [key]: {
        product: nextProduct,
        variants: nextProduct.aliexpressVariants || nextProduct.elyonProduct?.variants || null,
        debug: nextProduct.aliexpressVariantDebug || nextProduct.extractionDebug?.aliexpressVariants || null,
        updatedAt: new Date().toISOString()
      }
    }
  });
  return nextProduct;
}

function localToast(message) {
  chrome.action?.setBadgeText?.({ text: "OK" });
  chrome.action?.setBadgeBackgroundColor?.({ color: "#22c55e" });
  setTimeout(() => chrome.action?.setBadgeText?.({ text: "" }), 1800);
  chrome.storage.local.set({
    elyon_extension_last_local_status: {
      message,
      updatedAt: new Date().toISOString()
    }
  }).catch(() => null);
}

async function saveLocalProductOnly(product = {}, extraDebug = {}) {
  const now = new Date().toISOString();
  const nextProduct = {
    ...product,
    updatedAt: now,
    localOnly: true,
    localStatus: "Lokal übernommen – noch nicht an Elyon gesendet."
  };
  await saveCurrentProductSnapshot(nextProduct).catch(() => null);
  const debugResult = await chrome.storage.local.get("elyon_extraction_debug").catch(() => ({}));
  await chrome.storage.local.set({
    elyon_extraction_debug: {
      ...(debugResult?.elyon_extraction_debug || {}),
      ...extraDebug,
      lastLocalActionAt: now,
      status: "Lokal übernommen – noch nicht an Elyon gesendet."
    }
  }).catch(() => null);
  return nextProduct;
}

async function handleLocalTextCapture(tab, target, selectedText = "") {
  if (!tab?.id) return { ok: false, error: "Kein Tab" };
  const injected = await ensureContentScript(tab.id);
  if (!injected) return { ok: false, error: "Content Script nicht geladen" };
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "ELYON_CAPTURE_SELECTED_TEXT",
    target,
    text: selectedText || "",
    persist: false
  }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (response?.ok && response.product) {
    await saveLocalProductOnly(response.product, { manualCapture: response.capture || null });
    if (response.capture) await saveManualCapture(response.capture).catch(() => null);
  }
  return response;
}

async function handleLocalImageCapture(tab, srcUrl, asMain = false) {
  if (!tab?.id) return { ok: false, error: "Kein Tab" };
  const injected = await ensureContentScript(tab.id);
  if (!injected) return { ok: false, error: "Content Script nicht geladen" };
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "ELYON_CAPTURE_IMAGE",
    srcUrl,
    asMain
  }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (response?.ok && response.product) {
    await saveLocalProductOnly(response.product, { imageCapture: { srcUrl, asMain } });
  }
  return response;
}

async function handleLocalProductCapture(tab) {
  if (!tab?.id) return { ok: false, error: "Kein Tab" };
  const injected = await ensureContentScript(tab.id);
  if (!injected) return { ok: false, error: "Content Script nicht geladen" };
  const response = await chrome.tabs.sendMessage(tab.id, { type: "ELYON_GET_PRODUCT" }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (response?.ok && response.product) {
    await saveLocalProductOnly(response.product, { productCapture: { url: response.product.url || tab.url || "", capturedAt: new Date().toISOString() } });
  }
  return response;
}

async function handleLocalVariantScan(tab) {
  if (!tab?.id) return { ok: false, error: "Kein Tab" };
  const injected = await ensureContentScript(tab.id);
  if (!injected) return { ok: false, error: "Content Script nicht geladen" };
  const isAli = String(tab.url || "").toLowerCase().includes("aliexpress");
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: isAli ? "ELYON_SCAN_ALIEXPRESS_VARIANTS" : "ELYON_SCAN_PLATFORM_VARIANTS"
  }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (response?.ok && response.product) {
    await saveLocalProductOnly(response.product, { variantScan: response.debug || null });
    const cacheResult = await chrome.storage.local.get([ALIEXPRESS_VARIANT_CACHE_KEY, PLATFORM_VARIANT_CACHE_KEY]).catch(() => ({}));
    const key = response.product.url || tab.url || `tab-${tab.id}`;
    const cacheKey = isAli ? ALIEXPRESS_VARIANT_CACHE_KEY : PLATFORM_VARIANT_CACHE_KEY;
    await chrome.storage.local.set({
      [cacheKey]: {
        ...(cacheResult?.[cacheKey] || {}),
        [key]: {
          product: response.product,
          variants: response.variants || null,
          debug: response.debug || null,
          updatedAt: new Date().toISOString()
        }
      }
    }).catch(() => null);
  }
  return response;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  (async () => {
    const url = tab?.url || changeInfo?.url || "";
    if (url && isAliExpressUrl(url) && !isAliExpressProductUrl(url)) {
      await rememberAliExpressParentSearch(tabId, url);
    }
    if (changeInfo.status !== "complete" || !isAliExpressProductUrl(tab?.url || "")) return;
    const injected = await ensureContentScript(tabId);
    if (!injected) return;
    const response = await chrome.tabs.sendMessage(tabId, { type: "ELYON_GET_PRODUCT" }).catch(() => null);
    if (response?.ok && response.product) {
      await cacheAliExpressProduct(response.product, tabId);
    }
  })().catch(() => {});
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  (async () => {
    let result = null;
    const selectedText = info.selectionText || "";
    const srcUrl = info.srcUrl || "";
    const targetByMenu = {
      "elyon-capture-auto": "auto",
      "elyon-capture-description": "description",
      "elyon-capture-bullets": "bullets",
      "elyon-capture-technical": "technical",
      "elyon-capture-delivery": "delivery",
      "elyon-capture-note": "note"
    };

    if (targetByMenu[info.menuItemId]) {
      result = await handleLocalTextCapture(tab, targetByMenu[info.menuItemId], selectedText);
    } else if (info.menuItemId === "elyon-capture-image") {
      result = await handleLocalImageCapture(tab, srcUrl, false);
    } else if (info.menuItemId === "elyon-capture-main-image") {
      result = await handleLocalImageCapture(tab, srcUrl, true);
    } else if (info.menuItemId === "elyon-capture-product-local") {
      result = await handleLocalProductCapture(tab);
    } else if (info.menuItemId === "elyon-scan-variants-local") {
      result = await handleLocalVariantScan(tab);
    }

    localToast(result?.ok ? "Lokal übernommen – noch nicht an Elyon gesendet." : result?.error || result?.message || "Aktion konnte nicht lokal übernommen werden.");
  })().catch((error) => localToast(error?.message || "Rechtsklick-Aktion fehlgeschlagen."));
});

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

    if (message?.type === "ELYON_RUN_AGENT_ANALYSIS" && message.agentId) {
      const agent = SOUL_AGENTS.find((entry) => entry.id === message.agentId);
      if (!agent) {
        sendResponse({ ok: false, error: "Agent not found" });
        return;
      }
      const product = message.product && typeof message.product === "object" ? message.product : {};
      const decision = canRunAction("ai_prepare", security);
      const workflows = await prepareAgentWorkflow(agent, {
        ...(message.context || {}),
        url: message.context?.url || product.url || "",
        notes: decision.label || "Soul Scout Analyse vorbereitet"
      });
      if (security.pauseAllAgents) {
        sendResponse({ ok: false, paused: true, workflows, lastWorkflow: workflows[0], message: "Alle Agenten pausiert.", security });
        return;
      }
      if (!security.aiEnabled) {
        sendResponse({ ok: true, preparedOnly: true, workflows, lastWorkflow: workflows[0], message: "Vorbereitet, aber gesperrt - KI ist in der Extension nicht aktiviert.", security });
        return;
      }
      const analysis = await prepareAiAnalysis(product, {
        agentId: agent.id,
        action: "soul-scout-analysis",
        prompt: message.prompt || undefined
      });
      const nextWorkflow = {
        ...workflows[0],
        status: analysis.ok ? "active" : "prepared",
        mode: analysis.ok ? (analysis.mode || "analysis") : "prepared",
        notes: analysis.content || analysis.message || workflows[0]?.notes || "",
        updatedAt: new Date().toISOString()
      };
      const nextWorkflows = [nextWorkflow, ...workflows.slice(1)];
      await chrome.storage.local.set({
        elyon_agent_workflows: nextWorkflows,
        elyon_last_soul_scout_analysis: {
          agentId: agent.id,
          productUrl: product.url || "",
          ok: analysis.ok === true,
          message: analysis.message || "",
          content: analysis.content || "",
          mode: analysis.mode || "",
          updatedAt: new Date().toISOString()
        }
      }).catch(() => null);
      sendResponse({ ok: analysis.ok === true, analysis, workflows: nextWorkflows, lastWorkflow: nextWorkflow, message: analysis.message, security });
      return;
    }

    if (message?.type === "ELYON_AGENT_WORKFLOWS_LIST") {
      const workflows = await loadAgentWorkflows();
      sendResponse({ ok: true, workflows, security });
      return;
    }

    if (message?.type === "ELYON_MANUAL_CAPTURE_SAVE" && message.capture) {
      const captures = await saveManualCapture(message.capture);
      if (message.product) await saveCurrentProductSnapshot(message.product).catch(() => null);
      sendResponse({ ok: true, captures, capture: message.capture, security });
      return;
    }

    if (message?.type === "ELYON_MANUAL_CAPTURE_LIST") {
      const captures = await loadManualCaptures();
      sendResponse({ ok: true, captures, security });
      return;
    }

    if (message?.type === "ELYON_OPEN_SIDEPANEL") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      try {
        if (chrome.sidePanel?.open && tab?.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          sendResponse({ ok: true, opened: "sidepanel" });
          return;
        }
      } catch {}
      await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel/sidepanel.html") });
      sendResponse({ ok: true, opened: "tab" });
      return;
    }

    if (message?.type === "ELYON_OPEN_SOUL_SCOUT") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("options/agents.html") });
      sendResponse({ ok: true, opened: "agents" });
      return;
    }

    if (message?.type === "ELYON_CHECK_SOUL_GUARD") {
      const agent = SOUL_AGENTS.find((entry) => entry.id === "soul-guard");
      if (!agent) {
        sendResponse({ ok: false, error: "Soul Guard not found" });
        return;
      }
      const workflows = await prepareAgentWorkflow(agent, {
        title: "Soul Guard Prüfung vorbereitet",
        notes: "Sicherheitsprüfung vorbereitet. Keine Live-Aktion."
      });
      sendResponse({ ok: true, workflows, lastWorkflow: workflows[0], security, message: "Soul Guard Prüfung vorbereitet." });
      return;
    }

    if (message?.type === "ELYON_OPEN_SECURITY_CENTER") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
      sendResponse({ ok: true, opened: "security" });
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
