(() => {
  "use strict";

  const VERSION = "phase-e5-v1-integration-center-v3-lazy-workspaces";
  const COMMAND_CENTER_TAB = "jarvisCommandCenterTab";
  const INTEGRATION_CENTER_TAB = "jarvisIntegrationCenterTab";
  const VIRTUAL_AGENTS_TAB = "virtualAgentsTab";
  const LEGACY_MENU_VALUE = "__elyon_jarvis_panel__";

  // Keep only the lightweight Jarvis companion available globally. Heavy workspaces
  // are loaded when the user actually opens the corresponding area.
  const CORE_FILES = [
    "/seller-jarvis-client.js",
    "/seller-jarvis-ui.js",
  ];

  const FEATURE_GROUPS = Object.freeze({
    commandCenter: [
      "/seller-jarvis-command-center.js",
      "/seller-jarvis-companion-handoff.js",
      "/seller-jarvis-e1-cloud.js",
      "/seller-jarvis-e4-control.js",
      "/seller-jarvis-e5-pipeline.js",
    ],
    integrationCenter: [
      "/seller-jarvis-integration-center.js",
    ],
    workforce: [
      "/seller-ai-workforce-builder-integration.js",
    ],
  });

  const TAB_GROUPS = Object.freeze({
    [COMMAND_CENTER_TAB]: "commandCenter",
    [INTEGRATION_CENTER_TAB]: "integrationCenter",
    [VIRTUAL_AGENTS_TAB]: "workforce",
  });

  const loads = new Map();
  const groupLoads = new Map();

  function existing(path) {
    return [...document.scripts].some((script) => {
      try { return new URL(script.src, window.location.href).pathname === path; }
      catch { return false; }
    });
  }

  function load(path) {
    if (existing(path)) return Promise.resolve();
    if (loads.has(path)) return loads.get(path);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${path}?v=${VERSION}`;
      script.defer = true;
      script.dataset.elyonJarvisModule = path;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error(`Jarvis-Modul konnte nicht geladen werden: ${path}`)), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      loads.delete(path);
      throw error;
    });

    loads.set(path, promise);
    return promise;
  }

  async function loadFiles(files) {
    for (const file of files) await load(file);
  }

  function ensureMenuEntries() {
    const menu = document.getElementById("mainMenu");
    if (!menu) return false;

    let commandOption = menu.querySelector(`option[value="${COMMAND_CENTER_TAB}"]`);
    const legacyOption = menu.querySelector(`option[value="${LEGACY_MENU_VALUE}"]`);

    // D1 creates a panel-only shortcut. Reuse that node for the real D2 workspace so
    // the visible navigation remains exactly as before without loading D2 at startup.
    if (!commandOption && legacyOption) {
      legacyOption.value = COMMAND_CENTER_TAB;
      legacyOption.textContent = "◉ JARVIS";
      legacyOption.classList.remove("elyon-jarvis-menu-option");
      commandOption = legacyOption;
    }

    if (!commandOption) {
      commandOption = document.createElement("option");
      commandOption.value = COMMAND_CENTER_TAB;
      commandOption.textContent = "◉ JARVIS";
      const agents = menu.querySelector(`option[value="${VIRTUAL_AGENTS_TAB}"]`);
      if (agents) agents.insertAdjacentElement("afterend", commandOption);
      else menu.appendChild(commandOption);
    }

    if (!menu.querySelector(`option[value="${INTEGRATION_CENTER_TAB}"]`)) {
      const option = document.createElement("option");
      option.value = INTEGRATION_CENTER_TAB;
      option.textContent = "⚙ Jarvis Integration Center";
      commandOption.insertAdjacentElement("afterend", option);
    }

    return true;
  }

  function activateFeature(tabId) {
    if (tabId === COMMAND_CENTER_TAB) window.ElyonJarvisCommandCenter?.open?.();
    else if (tabId === INTEGRATION_CENTER_TAB) window.ElyonJarvisIntegrationCenter?.open?.();
    else if (tabId === VIRTUAL_AGENTS_TAB) window.ElyonAIWorkforceBuilderIntegration?.refresh?.();
  }

  function loadGroup(name, tabId = "") {
    if (!FEATURE_GROUPS[name]) return Promise.resolve(false);
    if (groupLoads.has(name)) {
      return groupLoads.get(name).then(() => {
        if (tabId) activateFeature(tabId);
        return true;
      });
    }

    const promise = loadFiles(FEATURE_GROUPS[name])
      .then(() => {
        if (tabId) activateFeature(tabId);
        window.dispatchEvent(new CustomEvent("elyon:jarvis-feature-ready", { detail: { group: name, tabId } }));
        return true;
      })
      .catch((error) => {
        groupLoads.delete(name);
        console.warn(`[Elyon Jarvis] Lazy-Gruppe ${name} konnte nicht geladen werden`, error);
        return false;
      });

    groupLoads.set(name, promise);
    return promise;
  }

  function requestTab(tabId) {
    const group = TAB_GROUPS[tabId];
    if (!group) return Promise.resolve(false);
    return loadGroup(group, tabId);
  }

  function hasCompanionHandoff() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("jarvisSource") === "quick-access" &&
        url.searchParams.get("jarvisMode") === "plan" &&
        Boolean(url.searchParams.get("jarvisCommand"));
    } catch {
      return false;
    }
  }

  function installLazyTriggers() {
    if (document.documentElement.dataset.elyonJarvisLazyBound === "1") return;
    document.documentElement.dataset.elyonJarvisLazyBound = "1";

    document.addEventListener("change", (event) => {
      if (event.target?.id !== "mainMenu") return;
      void requestTab(event.target.value);
    }, true);

    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail?.id || event.detail?.tab;
      if (tabId) void requestTab(tabId);
    });
  }

  async function boot() {
    try {
      await loadFiles(CORE_FILES);
      window.ElyonJarvisUI?.refresh?.();
      ensureMenuEntries();
      installLazyTriggers();

      const initialTab = document.getElementById("mainMenu")?.value || "";
      if (TAB_GROUPS[initialTab]) void requestTab(initialTab);
      if (hasCompanionHandoff()) void loadGroup("commandCenter", COMMAND_CENTER_TAB);

      window.dispatchEvent(new CustomEvent("elyon:jarvis-ready", {
        detail: { version: VERSION, mode: "lazy-workspaces", eagerFiles: [...CORE_FILES] },
      }));
    } catch (error) {
      console.warn("[Elyon Jarvis] Core-Bootstrap fehlgeschlagen", error);
    }
  }

  window.ElyonJarvisBootstrap = Object.freeze({
    version: VERSION,
    loadCommandCenter: () => loadGroup("commandCenter", COMMAND_CENTER_TAB),
    loadIntegrationCenter: () => loadGroup("integrationCenter", INTEGRATION_CENTER_TAB),
    loadWorkforceIntegration: () => loadGroup("workforce", VIRTUAL_AGENTS_TAB),
    requestTab,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else void boot();
})();