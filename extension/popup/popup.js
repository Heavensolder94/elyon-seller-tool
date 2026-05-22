import { SOUL_AGENTS, getAgentStatus, getAgentStatusLabel } from "../shared/agents.js";
import { getElyonStatus, pingBackend, sendProductToElyon, getBackendUrl, setBackendUrl } from "../shared/apiClient.js";
import { DEFAULT_SECURITY_STATE, getActionLabel, getSecurityLabel, getSecurityState, setSecurityState } from "../shared/security.js";
import { saveCurrentProductSnapshot } from "../shared/storage.js";

let lastTabHunter = { summary: null, tabs: [] };
let lastBackendStatus = null;
let inlineSettingsVisible = false;
let confirmResolve = null;
let suppressBackendStatusUntil = 0;

function setActionLog(message, kind = "info") {
  const el = document.getElementById("actionLog");
  if (!el) return;
  el.textContent = message || "Bereit.";
  el.classList.remove("status-ok", "status-bad");
  if (kind === "ok") el.classList.add("status-ok");
  if (kind === "error") el.classList.add("status-bad");
}

function holdActionStatus(ms = 2500) {
  suppressBackendStatusUntil = Date.now() + ms;
}

function openConfirmModal(text, onAccept) {
  const backdrop = document.getElementById("confirmBackdrop");
  const confirmText = document.getElementById("confirmText");
  if (!backdrop || !confirmText) {
    return onAccept();
  }

  confirmText.textContent = text || "Produkt an Elyon senden?";
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    confirmResolve = resolve;
    const accept = document.getElementById("confirmAccept");
    const cancel = document.getElementById("confirmCancel");
    const close = document.getElementById("confirmClose");

    if (accept) accept.replaceWith(accept.cloneNode(true));
    if (cancel) cancel.replaceWith(cancel.cloneNode(true));
    if (close) close.replaceWith(close.cloneNode(true));

    const freshAccept = document.getElementById("confirmAccept");
    const freshCancel = document.getElementById("confirmCancel");
    const freshClose = document.getElementById("confirmClose");

    const finish = async (value) => {
      backdrop.classList.add("hidden");
      backdrop.setAttribute("aria-hidden", "true");
      confirmResolve = null;
      window.onkeydown = null;
      resolve(value);
    };

    const handleAccept = async () => {
      try {
        const result = await onAccept();
        await finish(result ?? true);
      } catch (error) {
        await finish({ ok: false, error: error?.message || String(error) });
      }
    };

    const handleCancel = async () => finish(false);

    freshAccept?.addEventListener("click", handleAccept, { once: true });
    freshCancel?.addEventListener("click", handleCancel, { once: true });
    freshClose?.addEventListener("click", handleCancel, { once: true });
    backdrop.onclick = (event) => {
      if (event.target === backdrop) handleCancel();
    };
    window.onkeydown = (event) => {
      if (event.key === "Escape") handleCancel();
    };

    setActionLog("BestÃ¤tigung geÃ¶ffnet. Klick auf Senden oder Abbrechen.", "ok");
  });
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
  return "Unbekannt";
}

function setPopupStatus(message, kind = "info") {
  const el = document.getElementById("popupStatus");
  if (!el) return;
  el.textContent = message || "-";
  el.classList.remove("status-ok", "status-bad");
  if (kind === "ok") el.classList.add("status-ok");
  if (kind === "error") el.classList.add("status-bad");
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", async (event) => {
    event.preventDefault();
    setPopupStatus("Aktion wird ausgefuehrt ...");
    setActionLog(`Starte ${el.textContent || id} ...`);
    el.classList.add("button-flash");
    setTimeout(() => el.classList.remove("button-flash"), 180);
    try {
      await handler(event);
    } catch (error) {
      setActionLog(error?.message || "Aktion fehlgeschlagen", "error");
      setPopupStatus(error?.message || "Aktion fehlgeschlagen", "error");
    }
  });
}

async function executeSendToElyon() {
  const tab = window.__elyonCurrentTab;
  if (!tab?.url) throw new Error("Kein aktiver Tab gefunden");
  const detectedProduct = await getProductFromActiveTab(tab);
  const product = buildProductPayload(tab, detectedProduct);

  setPopupStatus("Bestaetigung bereit", "ok");
  setActionLog("Bestaetigung geoeffnet", "ok");

  const result = await openConfirmModal(
    `Titel: ${product.title || "Ohne Titel"}\nURL: ${product.url}\n\nEs werden keine Live-Aktionen ausgefuehrt.`,
    async () => {
      setPopupStatus("Sende Produkt an Elyon ...", "ok");
      setActionLog("Produkt wird gesendet ...", "ok");
      return sendProductToElyon(product);
    }
  );

  if (!result) {
    setPopupStatus("Senden abgebrochen", "error");
    setActionLog("Senden abgebrochen", "error");
    return { ok: false, canceled: true };
  }
  const backendMessage = document.getElementById("backendMessage");
  if (backendMessage) {
    const boardText = result?.boardSync?.synced ? "Board aktualisiert" : result?.boardSync?.message || "";
    backendMessage.textContent = [result?.message || "Produkt verarbeitet", boardText].filter(Boolean).join(" | ");
  }

  if (!result.ok && result.serverSaved === false) {
    backendMessage?.classList.add("status-bad");
    backendMessage.textContent = result.message || "Server nicht erreichbar - nicht gespeichert";
    setPopupStatus("Server nicht erreichbar - nicht gespeichert", "error");
    setActionLog("Produkt nicht gespeichert", "error");
  } else if (result.ok) {
    setPopupStatus(result?.boardSync?.synced ? "Produkt uebertragen - Board aktualisiert" : "Gespeichert", "ok");
    setActionLog(result?.boardSync?.synced ? "Produkt uebertragen - Board aktualisiert" : "Gespeichert", "ok");
  }

  holdActionStatus();
  await refresh();
  if (!result.ok && result.serverSaved === false) {
    setPopupStatus("Server nicht erreichbar - nicht gespeichert", "error");
    setActionLog("Produkt nicht gespeichert", "error");
  } else if (result.ok) {
    setPopupStatus(result?.boardSync?.synced ? "Produkt uebertragen - Board aktualisiert" : "Gespeichert", "ok");
    setActionLog(result?.boardSync?.synced ? "Produkt uebertragen - Board aktualisiert" : "Gespeichert", "ok");
  }
  return result;
}

async function sendBackgroundMessage(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function loadActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  return tabs[0] || null;
}

async function getProductFromActiveTab(tab) {
  if (!tab?.id) return null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "ELYON_GET_PRODUCT" });
    const product = response?.ok && response.product ? response.product : null;
    if (product) await saveCurrentProductSnapshot(product).catch(() => null);
    return product;
  } catch {
    return null;
  }
}

function buildProductPayload(tab, detectedProduct = {}) {
  return {
    id: tab?.url || detectedProduct?.url || "",
    title: detectedProduct?.title || tab?.title || "",
    price: detectedProduct?.price || "",
    currency: detectedProduct?.currency || "",
    image: detectedProduct?.image || "",
    images: Array.isArray(detectedProduct?.images) ? detectedProduct.images : [],
    description: detectedProduct?.description || "",
    descriptionCandidates: Array.isArray(detectedProduct?.descriptionCandidates) ? detectedProduct.descriptionCandidates : [],
    descriptionSource: detectedProduct?.descriptionSource || "",
    variants: Array.isArray(detectedProduct?.variants) ? detectedProduct.variants : [],
    shipping: detectedProduct?.shipping || {},
    rating: detectedProduct?.rating || "",
    reviewsCount: detectedProduct?.reviewsCount || "",
    soldCount: detectedProduct?.soldCount || "",
    productDetails: detectedProduct?.productDetails || {},
    availability: detectedProduct?.availability || "",
    category: detectedProduct?.category || "",
    supplierInfo: detectedProduct?.supplierInfo || {},
    complianceRisks: Array.isArray(detectedProduct?.complianceRisks) ? detectedProduct.complianceRisks : [],
    elyonProduct: detectedProduct?.elyonProduct || null,
    extractionDebug: detectedProduct?.extractionDebug || null,
    detectedPlatform: detectedProduct?.detectedPlatform || "",
    url: tab?.url || detectedProduct?.url || "",
    supplier: detectedProduct?.supplier || getMarketplaceFromUrl(tab?.url || detectedProduct?.url || ""),
    domain: detectedProduct?.domain || (() => {
      try {
        return new URL(tab?.url || detectedProduct?.url || "").hostname.toLowerCase();
      } catch {
        return "";
      }
    })(),
    status: "new",
    notes: "",
    score: "",
    detectedAt: detectedProduct?.detectedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function renderLocalSnapshot() {
  const security = await getSecurityState().catch(() => DEFAULT_SECURITY_STATE);
  const tab = await loadActiveTab();
  const researchResult = await chrome.storage.local.get("elyon_research_memory").catch(() => ({}));
  const researchMemory = Array.isArray(researchResult.elyon_research_memory) ? researchResult.elyon_research_memory : [];
  const settings = await chrome.storage.local.get("elyon.settings").catch(() => ({}));
  const overlayEnabled = settings?.["elyon.settings"]?.overlayEnabled !== false;

  const securityStatus = document.getElementById("securityStatus");
  if (securityStatus) {
    securityStatus.textContent = `${getSecurityLabel(security)}${security.aiEnabled ? "" : " | KI vorbereitet"}`;
  }

  const securityHint = document.getElementById("securityHint");
  if (securityHint) {
    securityHint.textContent = [
      security.securityMode ? "Live-Aktion blockiert" : "Live-Aktionen moeglich",
      security.sandboxMode ? "Sandbox aktiv" : "Sandbox inaktiv",
      security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie frei",
      security.aiEnabled ? "KI aktiv" : "KI vorbereitet"
    ].join(" | ");
  }

  const detectedPage = document.getElementById("detectedPage");
  if (detectedPage) {
    detectedPage.textContent = tab?.url ? getMarketplaceFromUrl(tab.url) : "Keine aktive Seite";
  }

  const activeTab = document.getElementById("activeTab");
  if (activeTab) {
    activeTab.textContent = tab ? `${tab.title || "Ohne Titel"}\n${tab.url || "-"}` : "-";
  }

  const overlayState = document.getElementById("overlayState");
  if (overlayState) {
    overlayState.textContent = overlayEnabled ? "Overlay an" : "Overlay aus";
  }

  const riskLabel = document.getElementById("riskLabel");
  if (riskLabel) {
    riskLabel.textContent = getActionLabel("live_order", security);
  }

  renderResearchList(researchMemory);
  renderAgents(security);
  window.__elyonCurrentTab = tab;
  if (tab?.id) {
    const detectedProduct = await getProductFromActiveTab(tab).catch(() => null);
    renderExtractionDebug(detectedProduct);
  } else {
    renderExtractionDebug(null);
  }
  setPopupStatus(tab?.url ? "Lokale Daten geladen" : "Bereit", "ok");
  setActionLog(tab?.url ? "Popup bereit - Aktionen verfuegbar" : "Popup bereit", "ok");
}

async function refresh() {
  await renderLocalSnapshot();
  const snapshot = await Promise.race([
    sendBackgroundMessage({ type: "ELYON_GET_SNAPSHOT" }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 1200))
  ]);

  if (snapshot?.ok) {
    const security = { ...DEFAULT_SECURITY_STATE, ...(snapshot.security || {}) };
    const tab = snapshot.currentTab || window.__elyonCurrentTab || null;
    const researchResult = await sendBackgroundMessage({ type: "ELYON_RESEARCH_LIST" });
    const overlayState = document.getElementById("overlayState");
    if (overlayState) {
      overlayState.textContent = snapshot.settings?.overlayEnabled === false ? "Overlay aus" : "Overlay an";
    }
    const securityStatus = document.getElementById("securityStatus");
    if (securityStatus) {
      securityStatus.textContent = `${getSecurityLabel(security)}${security.aiEnabled ? "" : " | KI vorbereitet"}`;
    }
    const securityHint = document.getElementById("securityHint");
    if (securityHint) {
      securityHint.textContent = [
        security.securityMode ? "Live-Aktion blockiert" : "Live-Aktionen moeglich",
        security.sandboxMode ? "Sandbox aktiv" : "Sandbox inaktiv",
        security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie frei",
        security.aiEnabled ? "KI aktiv" : "KI vorbereitet"
      ].join(" | ");
    }
    const detectedPage = document.getElementById("detectedPage");
    if (detectedPage) {
      detectedPage.textContent = tab?.url ? getMarketplaceFromUrl(tab.url) : "Keine aktive Seite";
    }
    const activeTab = document.getElementById("activeTab");
    if (activeTab) {
      activeTab.textContent = tab ? `${tab.title || "Ohne Titel"}\n${tab.url || "-"}` : "-";
    }
    const riskLabel = document.getElementById("riskLabel");
    if (riskLabel) {
      riskLabel.textContent = getActionLabel("live_order", security);
    }
    renderResearchList(Array.isArray(researchResult?.researchMemory) ? researchResult.researchMemory : []);
    renderAgents(security);
    window.__elyonCurrentTab = tab;
  }
  await refreshBackend();
  await refreshInlineSettings();
}

function getBadgeClass(status) {
  const value = String(status || "new").toLowerCase();
  return `badge badge-${value}`;
}

function renderResearchList(items) {
  const list = document.getElementById("researchList");
  if (!list) return;
  const latest = items.slice(0, 10);
  if (!latest.length) {
    list.textContent = "Noch keine Research-Memory-Eintraege.";
    return;
  }

  list.innerHTML = latest
    .map((item) => {
      const badgeText = item.status || "new";
      return `
        <div class="research-item">
          <div class="research-top">
            <div class="research-title">${item.title || "Ohne Titel"}</div>
            <span class="${getBadgeClass(badgeText)}">${badgeText}</span>
          </div>
          <div class="research-meta">${item.domain || item.url || "-"}</div>
        </div>
      `;
    })
    .join("");
}

function renderAgents(security) {
  const summary = document.getElementById("agentSummary");
  const list = document.getElementById("agentList");
  if (!summary || !list) return;

  summary.textContent = security.aiEnabled ? "KI-Verbindung aktiv" : "KI-Verbindung nicht aktiv";
  list.innerHTML = SOUL_AGENTS.map((agent) => {
    const status = getAgentStatus(agent, security);
    return `
      <div class="agent-item">
        <div class="agent-row">
          <div>
            <div class="agent-name">${agent.name}</div>
            <div class="agent-role">${agent.role}</div>
          </div>
          <span class="badge badge-${status}">${getAgentStatusLabel(agent, security)}</span>
        </div>
        <div class="agent-desc">${agent.description}</div>
      </div>
    `;
  }).join("");
}

function renderTabHunter(summary, tabs) {
  const summaryEl = document.getElementById("tabHunterSummary");
  const listEl = document.getElementById("tabHunterList");
  if (!summaryEl || !listEl) return;

  if (!summary) {
    summaryEl.textContent = "Noch kein Scan";
    listEl.textContent = "Tabs scannen, um Ergebnisse zu sehen.";
    return;
  }

  summaryEl.textContent = `${summary.checkedTabs} geprueft | ${summary.supportedTabs} unterstuetzt | ${summary.savedTabs} gespeichert | ${summary.newTabs} neu`;

  const items = Array.isArray(tabs) ? tabs.slice(0, 50) : [];
  if (!items.length) {
    listEl.textContent = "Keine unterstuetzten Tabs gefunden.";
    return;
  }

  listEl.innerHTML = items
    .map((tab) => `
      <div class="tab-hunter-item">
        <div class="tab-hunter-title">${tab.title || "Ohne Titel"}</div>
        <div class="tab-hunter-meta">${tab.marketplace || "-"} | ${tab.domain || "-"} | ${tab.saved ? "bereits gespeichert" : "neu"}</div>
        <div class="tab-hunter-meta">${tab.url || "-"}</div>
        <div class="actions-inline">
          <button type="button" data-tab-open="${tab.id}">Oeffnen</button>
          <button type="button" data-tab-save="${tab.id}">Speichern</button>
          <button type="button" data-tab-prepare="${tab.id}">Analysieren vorbereiten</button>
        </div>
      </div>
    `)
    .join("");

  listEl.querySelectorAll("[data-tab-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-tab-open"));
      if (Number.isNaN(id)) return;
      try {
        await chrome.tabs.update(id, { active: true });
        setPopupStatus("Tab geoeffnet", "ok");
        await refresh();
      } catch (error) {
        setPopupStatus(error?.message || "Tab konnte nicht geoeffnet werden", "error");
      }
    });
  });

  listEl.querySelectorAll("[data-tab-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-tab-save"));
      if (Number.isNaN(id)) return;
      try {
        const tabsResult = await sendBackgroundMessage({ type: "ELYON_SCAN_TABS" });
        const tab = Array.isArray(tabsResult?.tabs) ? tabsResult.tabs.find((entry) => entry.id === id) : null;
        if (!tab?.url) throw new Error("Tab-Daten fehlen");
        const result = await sendBackgroundMessage({
          type: "ELYON_RESEARCH_UPSERT",
          product: {
            id: tab.url,
            title: tab.title || "",
            price: "",
            currency: "",
            image: "",
            url: tab.url,
            supplier: tab.marketplace || "",
            domain: tab.domain || "",
            status: "new",
            notes: "",
            score: "",
            detectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        });
        if (!result?.ok) throw new Error(result?.error || "Speichern fehlgeschlagen");
        setPopupStatus("Tab gespeichert", "ok");
        await refresh();
      } catch (error) {
        setPopupStatus(error?.message || "Tab konnte nicht gespeichert werden", "error");
      }
    });
  });

  listEl.querySelectorAll("[data-tab-prepare]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-tab-prepare"));
      if (Number.isNaN(id)) return;
      try {
        await chrome.tabs.update(id, { active: true });
        const result = await sendBackgroundMessage({
          type: "ELYON_RESEARCH_UPSERT",
          product: {
            id: `tab-${id}`,
            title: "Tab Analyse vorbereitet",
            url: `tab:${id}`,
            status: "new",
            notes: "Analyse vorbereitet",
            score: "",
            detectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        });
        if (!result?.ok) throw new Error(result?.error || "Vorbereitung fehlgeschlagen");
        setPopupStatus("Analyse vorbereitet", "ok");
        await refresh();
      } catch (error) {
        setPopupStatus(error?.message || "Analyse konnte nicht vorbereitet werden", "error");
      }
    });
  });
}

function renderExtractionDebug(product) {
  const debug = product?.extractionDebug || {};
  const normalized = product?.elyonProduct || debug.rawProduct || null;
  const platformEl = document.getElementById("debugPlatform");
  const confidenceEl = document.getElementById("debugConfidence");
  const fieldsEl = document.getElementById("debugFields");
  const warningsEl = document.getElementById("debugWarnings");
  const rawEl = document.getElementById("debugRawJson");

  if (platformEl) platformEl.textContent = debug.platform ? `${debug.platform} | ${debug.parser || "Parser unbekannt"}` : "-";
  if (confidenceEl) confidenceEl.textContent = debug.confidenceScore != null ? `Confidence Score: ${debug.confidenceScore}%` : "-";
  if (fieldsEl) {
    const found = Array.isArray(debug.foundFields) ? debug.foundFields.join(", ") : "-";
    const missing = Array.isArray(debug.missingFields) ? debug.missingFields.join(", ") : "-";
    fieldsEl.textContent = `Gefunden: ${found} | Fehlt: ${missing}`;
  }
  if (warningsEl) {
    const warnings = Array.isArray(debug.extractionWarnings) ? debug.extractionWarnings : [];
    warningsEl.textContent = warnings.length ? `Warnings: ${warnings.join(" | ")}` : "Keine kritischen Warnings.";
  }
  if (rawEl) rawEl.textContent = normalized ? JSON.stringify(normalized, null, 2) : "-";
}

async function refreshBackend() {
  const status = await getElyonStatus().catch(() => ({ backendUrl: "", reachable: false, message: "Backend nicht erreichbar" }));
  lastBackendStatus = status;

  const backendStatus = document.getElementById("backendStatus");
  const backendMessage = document.getElementById("backendMessage");
  if (backendStatus) {
    backendStatus.textContent = status.backendUrl ? (status.reachable ? "Verbunden" : "Getrennt") : "Nicht konfiguriert";
    backendStatus.className = `value ${status.reachable ? "status-ok" : "status-bad"}`;
  }
  if (backendMessage) {
    backendMessage.textContent = status.message || "-";
  }

  if (Date.now() > suppressBackendStatusUntil) {
    setPopupStatus(
      status.reachable ? "Backend bereit" : status.backendUrl ? "Backend nicht erreichbar" : "Backend nicht konfiguriert",
      status.reachable ? "ok" : "error"
    );
    setActionLog(status.reachable ? "Backend erreichbar" : "Backend nicht erreichbar", status.reachable ? "ok" : "error");
  }
}

async function refreshInlineSettings() {
  const state = await getSecurityState().catch(() => DEFAULT_SECURITY_STATE);
  for (const id of ["securityMode", "sandboxMode", "autonomyLocked", "pauseAllAgents", "aiEnabled"]) {
    const el = document.getElementById(id);
    if (el) el.checked = state[id] === true;
  }

  const backendUrl = await getBackendUrl().catch(() => "");
  const backendInput = document.getElementById("backendUrl");
  if (backendInput) backendInput.value = backendUrl || "";
}

async function saveInlineSettings() {
  const nextSecurity = {};
  for (const id of ["securityMode", "sandboxMode", "autonomyLocked", "pauseAllAgents", "aiEnabled"]) {
    nextSecurity[id] = document.getElementById(id)?.checked === true;
  }
  await setSecurityState(nextSecurity);

  const backendInput = document.getElementById("backendUrl");
  if (backendInput) {
    await setBackendUrl(backendInput.value || "");
  }

  setPopupStatus("Einstellungen gespeichert", "ok");
  setActionLog("Einstellungen gespeichert", "ok");
  await refresh();
}

bindClick("overlayToggle", async () => {
  const result = await sendBackgroundMessage({ type: "ELYON_TOGGLE_OVERLAY" });
  if (!result?.ok) throw new Error(result?.error || "Overlay konnte nicht umgeschaltet werden");
  setPopupStatus(result.settings?.overlayEnabled ? "Overlay aktiviert" : "Overlay deaktiviert", "ok");
  setActionLog(result.settings?.overlayEnabled ? "Overlay aktiviert" : "Overlay deaktiviert", "ok");
  holdActionStatus();
  await refresh();
  setPopupStatus(result.settings?.overlayEnabled ? "Overlay aktiviert" : "Overlay deaktiviert", "ok");
  setActionLog(result.settings?.overlayEnabled ? "Overlay aktiviert" : "Overlay deaktiviert", "ok");
});

bindClick("saveProduct", async () => {
  const tab = window.__elyonCurrentTab;
  if (!tab?.url) throw new Error("Kein aktiver Tab gefunden");
  const detectedProduct = await getProductFromActiveTab(tab);
  const result = await sendProductToElyon(buildProductPayload(tab, detectedProduct));
  const backendMessage = document.getElementById("backendMessage");
  if (backendMessage) {
    const boardText = result?.boardSync?.synced ? "Board aktualisiert" : result?.boardSync?.message || "";
    backendMessage.textContent = [result?.message || "Produkt verarbeitet", boardText].filter(Boolean).join(" | ");
  }
  if (!result.ok && result.serverSaved === false) {
    backendMessage?.classList.add("status-bad");
    backendMessage.textContent = result.message || "Server nicht erreichbar - nicht gespeichert";
    setPopupStatus("Server nicht erreichbar - nicht gespeichert", "error");
    setActionLog("Produkt nicht gespeichert", "error");
  } else if (result.ok) {
    setPopupStatus("Produkt gespeichert", "ok");
    setActionLog(result?.boardSync?.synced ? "Produkt uebertragen und Board aktualisiert" : "Produkt gespeichert", "ok");
  }
  holdActionStatus();
  await refresh();
  if (!result.ok && result.serverSaved === false) {
    setPopupStatus("Server nicht erreichbar - nicht gespeichert", "error");
    setActionLog("Produkt nicht gespeichert", "error");
  } else if (result.ok) {
    setPopupStatus("Produkt gespeichert", "ok");
    setActionLog(result?.boardSync?.synced ? "Produkt uebertragen und Board aktualisiert" : "Produkt gespeichert", "ok");
  }
});

bindClick("toggleInlineSettings", async () => {
  inlineSettingsVisible = !inlineSettingsVisible;
  const panel = document.getElementById("inlineSettings");
  if (panel) panel.classList.toggle("hidden", !inlineSettingsVisible);
  setPopupStatus(inlineSettingsVisible ? "Inline-Einstellungen geoeffnet" : "Inline-Einstellungen geschlossen", "ok");
  setActionLog(inlineSettingsVisible ? "Schnelleinstellungen geoeffnet" : "Schnelleinstellungen geschlossen", "ok");
});

bindClick("saveInlineSettings", saveInlineSettings);

bindClick("openAdvancedSettings", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
  setPopupStatus("Erweiterte Settings geoeffnet", "ok");
  setActionLog("Erweiterte Settings geoeffnet", "ok");
});

bindClick("openSettings", async () => {
  await chrome.runtime.openOptionsPage();
  setPopupStatus("Settings geoeffnet", "ok");
  setActionLog("Settings geoeffnet", "ok");
});

bindClick("allResearch", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("options/research.html") });
  setPopupStatus("Research Memory geoeffnet", "ok");
  setActionLog("Research Memory geoeffnet", "ok");
});

bindClick("openAgents", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("options/agents.html") });
  setPopupStatus("Agenten geoeffnet", "ok");
  setActionLog("Agenten geoeffnet", "ok");
});

bindClick("prepareScoutWorkflow", async () => {
  const activeTab = window.__elyonCurrentTab;
  const agent = SOUL_AGENTS.find((entry) => entry.id === "soul-scout");
  if (!agent) throw new Error("Soul Scout nicht gefunden");
  const result = await sendBackgroundMessage({
    type: "ELYON_PREPARE_AGENT_WORKFLOW",
    agentId: agent.id,
    context: {
      title: activeTab?.title ? `Soul Scout: ${activeTab.title}` : "Soul Scout vorbereitet",
      url: activeTab?.url || "",
      notes: activeTab?.url ? "Analyse aus dem aktuellen Tab vorbereitet" : "Workflow vorbereitet"
    }
  });
  if (!result?.ok) throw new Error(result?.error || "Workflow konnte nicht vorbereitet werden");
  setPopupStatus("Soul Scout Workflow vorbereitet", "ok");
  setActionLog("Soul Scout Workflow vorbereitet", "ok");
});

bindClick("scanTabs", async () => {
  const result = await sendBackgroundMessage({ type: "ELYON_SCAN_TABS" });
  if (!result?.ok) throw new Error(result?.error || "Tabs konnten nicht gescannt werden");
  lastTabHunter = { summary: result.summary || null, tabs: Array.isArray(result.tabs) ? result.tabs : [] };
  renderTabHunter(result.summary || null, result.tabs || []);
  setPopupStatus(`Tabs gescannt: ${result.summary?.supportedTabs || 0} Treffer`, "ok");
  setActionLog(`Tabs gescannt: ${result.summary?.supportedTabs || 0} Treffer`, "ok");
});

bindClick("testBackend", async () => {
  const status = await pingBackend().catch(() => ({ reachable: false, message: "Backend nicht erreichbar" }));
  const backendStatus = document.getElementById("backendStatus");
  const backendMessage = document.getElementById("backendMessage");
  if (backendStatus) {
    backendStatus.textContent = status.reachable ? "Verbunden" : "Getrennt";
    backendStatus.className = `value ${status.reachable ? "status-ok" : "status-bad"}`;
  }
  if (backendMessage) {
    backendMessage.textContent = status.message || "-";
  }
  setPopupStatus(status.reachable ? "Backend bereit" : "Backend nicht erreichbar", status.reachable ? "ok" : "error");
  setActionLog(status.reachable ? "Backend bereit" : "Backend nicht erreichbar", status.reachable ? "ok" : "error");
});

bindClick("sendToElyon", async () => executeSendToElyon());

bindClick("copyRawJson", async () => {
  const raw = document.getElementById("debugRawJson")?.textContent || "";
  if (!raw || raw === "-") throw new Error("Keine Rohdaten vorhanden");
  await navigator.clipboard.writeText(raw);
  setPopupStatus("JSON kopiert", "ok");
  setActionLog("Normalisierte Produktdaten kopiert", "ok");
});

void refresh();
