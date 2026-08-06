const CLIENT_HOST_BEFORE = `  function findMountHost() {
    const direct = [
      document.getElementById("settings"),
      document.getElementById("settingsTab"),
      document.getElementById("einstellungen"),
      document.querySelector('[data-tab="settings"]'),
      document.querySelector('[data-section="settings"]'),
    ].find(Boolean);
    if (direct) return direct;

    const heading = [...document.querySelectorAll("h1,h2,h3,summary")].find((node) => {
      const value = text(node.textContent).toLowerCase();
      return value.includes("ki und modelle") || value.includes("einstellungen") || value.includes("settings");
    });
    if (heading) return heading.closest(".tab,.card,.settings-section,section,main") || heading.parentElement;
    return document.querySelector(".container") || document.querySelector("main") || document.body;
  }`;

const CLIENT_HOST_AFTER = `  function findMountHost() {
    const dedicated = [
      document.getElementById("virtualAgentsSettingsRoot"),
      document.getElementById("virtualAgentsTab"),
    ].find(Boolean);
    if (dedicated) return dedicated;

    const fallback = [
      document.getElementById("settings"),
      document.getElementById("settingsTab"),
      document.getElementById("einstellungen"),
      document.querySelector('[data-tab="settings"]'),
      document.querySelector('[data-section="settings"]'),
    ].find(Boolean);
    if (fallback) return fallback;

    return document.querySelector(".container") || document.querySelector("main") || document.body;
  }`;

const CLIENT_WATCH_BEFORE = `  function watchMount() {
    mount();
    const observer = new MutationObserver(() => {
      if (!document.getElementById("elyonAiWorkforce")) mount();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }`;

const CLIENT_WATCH_AFTER = `  function installMountLifecycle() {
    mount();
  }`;

const CLIENT_BOOT_BEFORE = `  bindTriggers();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchMount, { once: true });
  else watchMount();`;

const CLIENT_BOOT_AFTER = `  bindTriggers();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installMountLifecycle, { once: true });
  else installMountLifecycle();`;

const ADVANCED_INSTALL_BEFORE = `  function install() {
    installStyles();
    installFetchBridge();
    updateCards();
    const observer = new MutationObserver(updateCards);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 500, 1200, 2400].forEach((delay) => setTimeout(updateCards, delay));
    window.ElyonAIWorkforceAdvancedSettings = {
      open: openModal,
      get: advancedFor,
      refresh: updateCards,
      agents: AGENTS,
    };
  }`;

const ADVANCED_INSTALL_AFTER = `  let updateScheduled = false;

  function scheduleCardUpdate() {
    if (updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateScheduled = false;
      updateCards();
    });
  }

  function install() {
    installStyles();
    installFetchBridge();
    scheduleCardUpdate();

    const root = document.getElementById("virtualAgentsSettingsRoot") || document.getElementById("virtualAgentsTab");
    if (root) {
      const observer = new MutationObserver((mutations) => {
        const needsRefresh = mutations.some((mutation) =>
          [...mutation.addedNodes].some((node) =>
            node instanceof Element && (node.matches?.(".aiw-card,[data-agent-id]") || node.querySelector?.(".aiw-card,[data-agent-id]"))
          )
        );
        if (needsRefresh) scheduleCardUpdate();
      });
      observer.observe(root, { childList: true, subtree: true });
    }

    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") scheduleCardUpdate();
    });

    window.ElyonAIWorkforceAdvancedSettings = {
      open: openModal,
      get: advancedFor,
      refresh: scheduleCardUpdate,
      agents: AGENTS,
    };
  }`;

const LEGACY_RUNTIME_ENTRY = `      { src: "/seller-virtual-agents-legacy.js" },\n`;

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Virtual-agent optimization failed: ${label} signature not found.`);
  }
  return source.replace(before, after);
}

export function optimizeAiWorkforceClient(source) {
  let output = replaceRequired(source, CLIENT_HOST_BEFORE, CLIENT_HOST_AFTER, "client mount host");
  output = replaceRequired(output, CLIENT_WATCH_BEFORE, CLIENT_WATCH_AFTER, "client global observer");
  output = replaceRequired(output, CLIENT_BOOT_BEFORE, CLIENT_BOOT_AFTER, "client boot lifecycle");
  return output;
}

export function optimizeAdvancedAgentSettings(source) {
  return replaceRequired(source, ADVANCED_INSTALL_BEFORE, ADVANCED_INSTALL_AFTER, "advanced settings observer");
}

export function optimizeVirtualAgentsRuntimeLoader(source) {
  let output = replaceRequired(source, LEGACY_RUNTIME_ENTRY, "", "legacy virtual-agent runtime entry");
  output = output.replace(
    /const VERSION = "[^"]+";/,
    'const VERSION = "virtual-agents-stable-20260806-1";'
  );
  return output;
}
