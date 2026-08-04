(() => {
  "use strict";

  const WRAPPER_ID = "elyonSystemDataStatusSettings";
  const STYLE_ID = "elyonSystemDataStatusSettingsStyles";
  const PANEL_ATTRIBUTE = "data-elyon-system-status-panel";
  const PANEL_SELECTOR = `[${PANEL_ATTRIBUTE}="1"], .seller-system-status-panel`;
  const EBAY_STATUS_URL = "/api/ebay/status?environment=production";
  const FINANCE_STATUS_URL = "/api/finance?action=status";
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
  const notify = (message, eyebrow) => { if (typeof window.toast === "function") window.toast(message, eyebrow || "Seller Einstellungen"); };

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
      #${WRAPPER_ID} .elyon-finance-sync{margin-top:14px;padding:14px;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(15,23,42,.42)}
      #${WRAPPER_ID} .elyon-finance-sync h4{margin:0 0 6px;color:#e2e8f0}#${WRAPPER_ID} .elyon-finance-sync p{margin:4px 0 10px;color:#94a3b8;font-size:12px;line-height:1.45}#${WRAPPER_ID} .elyon-finance-sync label{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0;color:#cbd5e1;font-size:12px}#${WRAPPER_ID} .elyon-finance-sync input{accent-color:#2563eb}.elyon-toggle-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0;color:#cbd5e1;font-size:12px}.elyon-toggle{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}.elyon-toggle input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}.elyon-toggle-track{width:42px;height:24px;border-radius:999px;background:#475569;border:1px solid rgba(148,163,184,.35);display:block;transition:background .18s,border-color .18s;box-shadow:inset 0 1px 2px rgba(0,0,0,.22)}.elyon-toggle-thumb{position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .18s,background .18s}.elyon-toggle input:checked + .elyon-toggle-track{background:#22c55e;border-color:#4ade80}.elyon-toggle input:checked + .elyon-toggle-track + .elyon-toggle-thumb{transform:translateX(18px);background:#fff}.elyon-toggle input:focus-visible + .elyon-toggle-track{outline:2px solid #60a5fa;outline-offset:2px}
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

  async function installFinanceSyncPanel(host) {
    if (!host || host.querySelector('.elyon-finance-sync')) return;
    const panel = document.createElement('section');
    panel.className = 'elyon-finance-sync';
    panel.innerHTML = '<h4>Server-Synchronisierung</h4><p>Bestellstatus, Rechnungsnummern, Bestand und Retouren werden zentral gespeichert. Lokale Browserdaten bleiben nur als Fallback erhalten.</p><div data-finance-sync-body>Wird geprüft …</div>';
    host.appendChild(panel);
    try {
      const response = await fetch(FINANCE_STATUS_URL, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'HTTP ' + response.status);
      const store = data.store || {};
      const safety = data.safety || {};
      panel.querySelector('[data-finance-sync-body]').innerHTML =
        '<div><strong class="' + (store.persistent ? 'sd-good' : 'sd-warn') + '">' + (store.persistent ? 'Zentral verbunden' : 'Nicht persistent konfiguriert') + '</strong><br><span>Speicher: ' + text(store.source || store.mode || 'unbekannt') + '</span></div>' +
        '<label class="elyon-toggle-row">Live-Veröffentlichung erlaubt<span class="elyon-toggle"><input type="checkbox" data-finance-safety="livePublishingEnabled" ' + (safety.livePublishingEnabled ? 'checked' : '') + '><span class="elyon-toggle-track"></span><span class="elyon-toggle-thumb"></span></span></label>' +
        '<label class="elyon-toggle-row">Tracking-Übertragung freigeben (späterer manueller Schritt)<span class="elyon-toggle"><input type="checkbox" data-finance-safety="trackingSyncEnabled" ' + (safety.trackingSyncEnabled ? 'checked' : '') + '><span class="elyon-toggle-track"></span><span class="elyon-toggle-thumb"></span></span></label>' +
        '<small>Beide Schalter bleiben standardmäßig aus. Aktivieren allein führt keine Veröffentlichung oder Nachricht aus.</small>';
      panel.querySelectorAll('[data-finance-safety]').forEach((input) => input.addEventListener('change', async () => {
        const next = { ...safety, [input.dataset.financeSafety]: input.checked };
        input.disabled = true;
        try {
          const save = await fetch('/api/finance?action=save', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ state: { safety: next }, action: 'seller_safety_settings_update', source: 'seller_settings' }) });
          const saved = await save.json().catch(() => ({}));
          if (!save.ok || saved.ok === false) throw new Error(saved.message || saved.error || 'Speichern fehlgeschlagen');
          notify('Sicherheitseinstellung gespeichert.', 'Seller Einstellungen');
        } catch (error) {
          input.checked = !input.checked;
          notify(error.message, 'Seller Einstellungen');
        } finally { input.disabled = false; }
      }));
    } catch (error) {
      panel.querySelector('[data-finance-sync-body]').innerHTML = '<span class="sd-warn">Status nicht abrufbar: ' + text(error.message) + '</span>';
    }
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
    installFinanceSyncPanel(target.host);
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
