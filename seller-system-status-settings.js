(() => {
  "use strict";

  const WRAPPER_ID = "elyonSystemDataStatusSettings";
  const STYLE_ID = "elyonSystemDataStatusSettingsStyles";
  const PANEL_MARKER = "elyonSystemStatusPanel";
  let observer = null;
  let scheduled = false;

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
      #${WRAPPER_ID} [data-${PANEL_MARKER}="1"]{margin:0;padding:0;background:transparent;border:0;box-shadow:none}
      #${WRAPPER_ID} [data-${PANEL_MARKER}="1"]>.sd-head{display:none!important}
      #${WRAPPER_ID} .seller-system-status-placeholder{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}
    `;
    document.head.appendChild(style);
  }

  function findDashboardPanel() {
    const panels = [...document.querySelectorAll("#dashboardTab .sd-panel")];
    return panels.find((panel) => normalized(panel.querySelector(".sd-head h3")?.textContent) === "system- und datenstatus") || null;
  }

  function ensureSettingsWrapper() {
    const settings = document.getElementById("settingsTab");
    if (!settings) return null;

    let wrapper = document.getElementById(WRAPPER_ID);
    if (!wrapper) {
      wrapper = document.createElement("details");
      wrapper.id = WRAPPER_ID;
      wrapper.className = "settings-section settings-dropdown seller-system-status-settings";
      wrapper.open = true;
      wrapper.innerHTML = `
        <summary><span>System- und Datenstatus<small>Verbindungen, Datenquellen und technische Betriebsbereitschaft</small></span></summary>
        <div class="settings-dropdown-content" data-system-status-host>
          <p class="seller-system-status-placeholder">Statusdaten werden aus dem Seller-Dashboard geladen …</p>
        </div>
      `;
      settings.appendChild(wrapper);
    }

    return {
      wrapper,
      host: wrapper.querySelector("[data-system-status-host]"),
    };
  }

  function moveSystemStatusToSettings() {
    scheduled = false;
    installStyles();

    const target = ensureSettingsWrapper();
    const panel = findDashboardPanel();
    if (!target?.host || !panel) return false;

    const previous = target.host.querySelector(`[data-${PANEL_MARKER}="1"]`);
    if (previous && previous !== panel) previous.remove();

    panel.dataset[PANEL_MARKER] = "1";
    panel.classList.add("seller-system-status-panel");
    target.host.querySelector(".seller-system-status-placeholder")?.remove();
    target.host.appendChild(panel);
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

  window.ElyonSystemStatusSettings = {
    install,
    move: moveSystemStatusToSettings,
    health() {
      return {
        wrapperPresent: Boolean(document.getElementById(WRAPPER_ID)),
        panelInSettings: Boolean(document.querySelector(`#${WRAPPER_ID} [data-${PANEL_MARKER}="1"]`)),
        panelInDashboard: Boolean(findDashboardPanel()),
      };
    },
  };

  window.addEventListener("elyon:seller-authenticated", scheduleMove);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
