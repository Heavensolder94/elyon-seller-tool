(() => {
  "use strict";

  const WRAPPER_ID = "elyonSystemDataStatusSettings";
  const STYLE_ID = "elyonSystemDataStatusSettingsStyles";
  const PANEL_ATTRIBUTE = "data-elyon-system-status-panel";
  const PANEL_SELECTOR = `[${PANEL_ATTRIBUTE}="1"], .seller-system-status-panel`;
  const EBAY_STATUS_URL = "/api/ebay/status?environment=production";
  const STATUS_MAX_AGE_MS = 15000;
  let observer = null;
  let scheduled = false;
  let statusRequest = null;
  let statusRequestId = 0;
  let lastStatusCheckAt = 0;
  let lastConnected = null;
  let lastStatusError = "";

  const text = (value) => String(value ?? "").trim();
  const normalized = (value) => text(value).toLocaleLowerCase("de-DE").replace(/\s+/g, " ");

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${WRAPPER_ID}{grid-column:1/-1;margin-top:16px}
      #${WRAPPER_ID}>summary span{display:grid;gap:3px}
      #${WRAPPER_ID}>summary small{font-size:11px;font-weight:600;color:#94a3b8}
      #${WRAPPER_ID} [data-system-status-host]{display:grid;gap:10px}
      #${WRAPPER_ID} [${PANEL_ATTRIBUTE}="1"],#${WRAPPER_ID} .seller-system-status-panel{margin:0;padding:0;background:transparent;border:0;box-shadow:none}
      #${WRAPPER_ID} [${PANEL_ATTRIBUTE}="1"]>.sd-head,#${WRAPPER_ID} .seller-system-status-panel>.sd-head{display:none!important}
      #${WRAPPER_ID} .seller-system-status-placeholder{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}
    `;
    document.head.appendChild(style);
  }

  function findDashboardPanel() {
    const panels = [...document.querySelectorAll("#dashboardTab .sd-panel")];
    return panels.find((panel) => normalized(panel.querySelector(".sd-head h3")?.textContent) === "system- und datenstatus") || null;
  }

  function statusWrappers() {
    return [...document.querySelectorAll(`[id="${WRAPPER_ID}"], .seller-system-status-settings`)];
  }

  function statusPanels(root = document) {
    return [...new Set([...root.querySelectorAll(PANEL_SELECTOR)])];
  }

  function ensureHost(wrapper) {
    let host = wrapper.querySelector("[data-system-status-host]");
    if (!host) {
      host = document.createElement("div");
      host.className = "settings-dropdown-content";
      host.dataset.systemStatusHost = "";
      wrapper.appendChild(host);
    }
    return host;
  }

  function ensureSettingsWrapper() {
    const settings = document.getElementById("settingsTab");
    if (!settings) return null;

    const existing = statusWrappers();
    let wrapper = existing.find((node) => settings.contains(node)) || existing[0] || null;
    if (!wrapper) {
      wrapper = document.createElement("details");
      wrapper.innerHTML = `
        <summary><span>System- und Datenstatus<small>Verbindungen, Datenquellen und technische Betriebsbereitschaft</small></span></summary>
        <div class="settings-dropdown-content" data-system-status-host>
          <p class="seller-system-status-placeholder">Statusdaten werden aus dem Seller-Dashboard geladen …</p>
        </div>
      `;
    }

    wrapper.id = WRAPPER_ID;
    wrapper.classList.add("settings-section", "settings-dropdown", "seller-system-status-settings");
    wrapper.open = true;
    if (!settings.contains(wrapper)) settings.appendChild(wrapper);
    const host = ensureHost(wrapper);

    const duplicatePanels = existing
      .filter((node) => node !== wrapper)
      .flatMap((node) => statusPanels(node));
    const recoverablePanel = duplicatePanels.at(-1) || null;
    existing.filter((node) => node !== wrapper).forEach((node) => node.remove());
    if (!statusPanels(host).length && recoverablePanel) host.appendChild(recoverablePanel);

    return { wrapper, host };
  }

  function markPanel(panel) {
    panel.setAttribute(PANEL_ATTRIBUTE, "1");
    panel.classList.add("seller-system-status-panel");
  }

  function keepOnlyPanel(keep, host) {
    statusPanels().forEach((panel) => {
      if (panel !== keep) panel.remove();
    });
    if (keep && host && !host.contains(keep)) host.appendChild(keep);
    return keep || null;
  }

  function ebayStatusRows() {
    return [...document.querySelectorAll(".sd-status")].filter((row) => normalized(row.querySelector("span")?.textContent) === "ebay oauth");
  }

  function ebayHeroBadges() {
    return [...document.querySelectorAll(".sd-badge")].filter((badge) => normalized(badge.textContent).startsWith("ebay "));
  }

  function applyEbayStatus(state, detail = "") {
    const checking = state === "checking";
    const connected = state === "connected";
    const unavailable = state === "unavailable";
    const label = checking ? "wird geprüft …" : connected ? "verbunden" : unavailable ? "Status nicht abrufbar" : "nicht verbunden";
    const tone = checking || unavailable ? "sd-warn" : connected ? "sd-good" : "sd-bad";
    const title = detail || (checking ? "eBay-Verbindung wird direkt geprüft." : connected ? "Direkte Prüfung über /api/ebay/status erfolgreich." : "Kein gültiger eBay-Refresh-Token erkannt.");

    ebayStatusRows().forEach((row) => {
      const value = row.querySelector("strong");
      if (!value) return;
      value.classList.remove("sd-good", "sd-warn", "sd-bad");
      value.classList.add(tone);
      value.textContent = label;
      value.title = title;
      row.dataset.ebayStatusVerified = checking ? "checking" : "1";
    });

    ebayHeroBadges().forEach((badge) => {
      badge.classList.remove("good", "warn", "bad");
      badge.classList.add(checking || unavailable ? "warn" : connected ? "good" : "bad");
      badge.textContent = `eBay ${label}`;
      badge.title = title;
    });
  }

  async function verifyEbayStatus({ force = false } = {}) {
    const now = Date.now();
    if (!force && lastStatusCheckAt && now - lastStatusCheckAt < STATUS_MAX_AGE_MS && lastConnected !== null) {
      applyEbayStatus(lastConnected ? "connected" : "disconnected", lastStatusError);
      return { connected: lastConnected, cached: true };
    }
    if (statusRequest) return statusRequest;

    const requestId = ++statusRequestId;
    applyEbayStatus("checking");
    statusRequest = fetch(EBAY_STATUS_URL, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.connected !== "boolean") {
          throw new Error(data.message || data.error || `HTTP ${response.status}`);
        }
        if (requestId !== statusRequestId) return data;
        lastConnected = data.connected;
        lastStatusError = "";
        lastStatusCheckAt = Date.now();
        applyEbayStatus(data.connected ? "connected" : "disconnected");
        return data;
      })
      .catch((error) => {
        if (requestId !== statusRequestId) return { connected: null, ignored: true };
        lastConnected = null;
        lastStatusError = text(error?.message) || "eBay-Status konnte nicht geprüft werden.";
        lastStatusCheckAt = Date.now();
        applyEbayStatus("unavailable", lastStatusError);
        return { connected: null, error: lastStatusError };
      })
      .finally(() => {
        if (requestId === statusRequestId) statusRequest = null;
      });

    return statusRequest;
  }

  function moveSystemStatusToSettings() {
    scheduled = false;
    installStyles();

    const target = ensureSettingsWrapper();
    if (!target?.host) return false;

    const freshPanel = findDashboardPanel();
    const existingPanel = statusPanels(target.host).at(-1) || null;
    const panel = freshPanel || existingPanel;
    if (!panel) return false;

    markPanel(panel);
    keepOnlyPanel(panel, target.host);
    target.host.querySelector(".seller-system-status-placeholder")?.remove();

    if (lastConnected === null) applyEbayStatus("checking");
    else applyEbayStatus(lastConnected ? "connected" : "disconnected", lastStatusError);
    verifyEbayStatus();
    return true;
  }

  function scheduleMove() {
    if (scheduled) return;
    scheduled = true;
    const run = () => moveSystemStatusToSettings();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function observeDashboardRenders() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => scheduleMove());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function install() {
    installStyles();
    observeDashboardRenders();
    scheduleMove();
    [120, 450, 1000, 1800].forEach((delay) => setTimeout(scheduleMove, delay));
  }

  function health() {
    return {
      wrapperCount: statusWrappers().length,
      panelCount: statusPanels().length,
      wrapperPresent: Boolean(document.getElementById(WRAPPER_ID)),
      panelInSettings: Boolean(document.querySelector(`#${WRAPPER_ID} ${PANEL_SELECTOR}`)),
      panelInDashboard: Boolean(findDashboardPanel()),
      ebayConnected: lastConnected,
      ebayStatusError: lastStatusError,
      ebayStatusCheckedAt: lastStatusCheckAt || null,
    };
  }

  window.ElyonSystemStatusSettings = {
    install,
    move: moveSystemStatusToSettings,
    repair: moveSystemStatusToSettings,
    refreshEbayStatus: () => verifyEbayStatus({ force: true }),
    health,
  };

  window.addEventListener("elyon:seller-authenticated", () => {
    scheduleMove();
    verifyEbayStatus({ force: true });
  });
  window.addEventListener("focus", () => verifyEbayStatus());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") verifyEbayStatus();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
