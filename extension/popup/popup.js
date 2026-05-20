import { getActionLabel, getSecurityLabel } from "../shared/security.js";
import { SOUL_AGENTS, getAgentModeLabel, getAgentStatus, getAgentStatusLabel } from "../shared/agents.js";
import { getElyonStatus, pingBackend, sendProductToElyon, prepareAiAnalysis } from "../shared/apiClient.js";

let lastTabHunter = { summary: null, tabs: [] };
let lastBackendStatus = null;

function getMarketplaceFromUrl(url = "") {
  const value = String(url).toLowerCase();
  if (value.includes("ebay.")) return "eBay";
  if (value.includes("amazon.")) return "Amazon";
  if (value.includes("aliexpress")) return "AliExpress";
  if (value.includes("cjdropshipping")) return "CJ Dropshipping";
  if (value.includes("temu")) return "Temu";
  return "Unbekannt";
}

async function refresh() {
  const snapshot = await chrome.runtime.sendMessage({ type: "ELYON_GET_SNAPSHOT" });
  if (!snapshot?.ok) return;
  const researchResult = await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_LIST" });
  const security = snapshot.security || {};
  const tab = snapshot.currentTab || null;
  document.getElementById("securityStatus").textContent = `${getSecurityLabel(security)}${security.aiEnabled ? "" : " · KI vorbereitet"}`;
  document.getElementById("securityHint").textContent = [
    security.securityMode ? "Live-Aktion blockiert" : "Live-Aktionen möglich",
    security.sandboxMode ? "Sandbox aktiv" : "Sandbox inaktiv",
    security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie frei",
    security.aiEnabled ? "AI aktiv" : "AI vorbereitet"
  ].join(" · ");
  document.getElementById("detectedPage").textContent = tab?.url ? getMarketplaceFromUrl(tab.url) : "Keine aktive Seite";
  document.getElementById("activeTab").textContent = tab ? `${tab.title || "Ohne Titel"}\n${tab.url || "-"}` : "-";
  document.getElementById("overlayState").textContent = snapshot.settings?.overlayEnabled === false ? "Overlay aus" : "Overlay an";
  document.getElementById("riskLabel").textContent = getActionLabel("live_order", security);
  renderResearchList(Array.isArray(researchResult?.researchMemory) ? researchResult.researchMemory : []);
  renderAgents(security);
  renderTabHunter(lastTabHunter.summary, lastTabHunter.tabs);
  await refreshBackend();
  window.__elyonCurrentTab = tab;
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
    list.textContent = "Noch keine Research-Memory-Einträge.";
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
  summaryEl.textContent = `${summary.checkedTabs} geprüft · ${summary.supportedTabs} unterstützt · ${summary.savedTabs} gespeichert · ${summary.newTabs} neu`;
  const items = Array.isArray(tabs) ? tabs.slice(0, 50) : [];
  if (!items.length) {
    listEl.textContent = "Keine unterstützten Tabs gefunden.";
    return;
  }
  listEl.innerHTML = items
    .map((tab) => `
      <div class="tab-hunter-item">
        <div class="tab-hunter-title">${tab.title || "Ohne Titel"}</div>
        <div class="tab-hunter-meta">${tab.marketplace || "-"} · ${tab.domain || "-"} · ${tab.saved ? "bereits gespeichert" : "neu"}</div>
        <div class="tab-hunter-meta">${tab.url || "-"}</div>
        <div class="actions-inline">
          <button type="button" data-tab-open="${tab.id}">Öffnen</button>
          <button type="button" data-tab-save="${tab.id}">Speichern</button>
          <button type="button" data-tab-prepare="${tab.id}">Analysieren vorbereiten</button>
        </div>
      </div>
    `)
    .join("");

  listEl.querySelectorAll("[data-tab-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-tab-open"));
      if (!Number.isNaN(id)) {
        await chrome.tabs.update(id, { active: true });
        await refresh();
      }
    });
  });
  listEl.querySelectorAll("[data-tab-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-tab-save"));
      if (Number.isNaN(id)) return;
      const tabs = await chrome.runtime.sendMessage({ type: "ELYON_SCAN_TABS" });
      const tab = Array.isArray(tabs?.tabs) ? tabs.tabs.find((entry) => entry.id === id) : null;
      if (!tab?.url) return;
      await chrome.runtime.sendMessage({
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
      await refresh();
    });
  });
  listEl.querySelectorAll("[data-tab-prepare]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-tab-prepare"));
      if (Number.isNaN(id)) return;
      await chrome.tabs.update(id, { active: true });
      await chrome.runtime.sendMessage({
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
      await refresh();
    });
  });
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
}

document.getElementById("overlayToggle").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "ELYON_TOGGLE_OVERLAY" });
  await refresh();
});

document.getElementById("saveProduct").addEventListener("click", async () => {
  const tab = window.__elyonCurrentTab;
  if (!tab?.url) return;
  await chrome.runtime.sendMessage({
    type: "ELYON_SAVE_PRODUCT",
    product: {
      url: tab.url,
      title: tab.title || "Unbekannt",
      marketplace: getMarketplaceFromUrl(tab.url),
      status: "new"
    }
  });
  await refresh();
});

document.getElementById("openSettings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("allResearch").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("options/research.html") }));
document.getElementById("openAgents").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("options/agents.html") }));
document.getElementById("scanTabs").addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "ELYON_SCAN_TABS" });
  if (!result?.ok) return;
  lastTabHunter = { summary: result.summary || null, tabs: Array.isArray(result.tabs) ? result.tabs : [] };
  renderTabHunter(result.summary || null, result.tabs || []);
});

document.getElementById("testBackend").addEventListener("click", async () => {
  await refreshBackend();
});

document.getElementById("sendToElyon").addEventListener("click", async () => {
  const tab = window.__elyonCurrentTab;
  if (!tab?.url) return;
  const result = await sendProductToElyon({
    id: tab.url,
    title: tab.title || "",
    price: "",
    currency: "",
    image: "",
    url: tab.url,
    supplier: getMarketplaceFromUrl(tab.url),
    domain: (() => {
      try { return new URL(tab.url).hostname.toLowerCase(); } catch { return ""; }
    })(),
    status: "new",
    notes: "",
    score: "",
    detectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const backendMessage = document.getElementById("backendMessage");
  if (backendMessage) {
    backendMessage.textContent = result?.message || "Produkt verarbeitet";
  }
  if (!result.ok && result.storedLocally) {
    backendMessage?.classList.add("status-bad");
    backendMessage.textContent = "Lokal gespeichert – Backend nicht erreichbar";
  }
  if (!result.ok) {
    await refresh();
  } else {
    await refreshBackend();
  }
});

void refresh();
