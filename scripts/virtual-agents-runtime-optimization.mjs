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

const V2_RENDER_END_BEFORE = `    decorateTasks();
    return true;
  }`;

const V2_RENDER_END_AFTER = `    decorateTasks();
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-rendered"));
    return true;
  }`;

const V2_WATCH_BEFORE = `  function watch() {
    renderV2();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const grid = document.getElementById("aiwAgentGrid");
        if (grid && !grid.querySelector('[data-agent-id="elyon-manager"]')) renderV2();
        decorateTasks();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 400, 900, 1800].forEach((delay) => setTimeout(renderV2, delay));
  }`;

const V2_WATCH_AFTER = `  function watch() {
    renderV2();
  }`;

const V2_OPERATIONS_INSTALL_BEFORE = `  function install() {
    installButton();
    const observer = new MutationObserver(installButton);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 400, 900, 1800].forEach((delay) => setTimeout(installButton, delay));
    if (window.ElyonAIWorkforceV2) window.ElyonAIWorkforceV2.runOperations = runOperations;
  }`;

const V2_OPERATIONS_INSTALL_AFTER = `  function install() {
    installButton();
    window.addEventListener("elyon:ai-workforce-v2-rendered", installButton);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") installButton();
    });
    if (window.ElyonAIWorkforceV2) window.ElyonAIWorkforceV2.runOperations = runOperations;
  }`;

const WORKSPACE_V3_INSTALL_BEFORE = `  function install() {
    ensureSettings();
    installStyles();
    render();
    bindTriggers();
    const observer = new MutationObserver(() => {
      const grid = document.getElementById("aiwAgentGrid");
      if (grid && !grid.querySelector(".aiw-v3")) queueRender();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    [100, 500, 1200].forEach((delay) => setTimeout(render, delay));
  }`;

const WORKSPACE_V3_INSTALL_AFTER = `  function install() {
    ensureSettings();
    installStyles();
    render();
    bindTriggers();
    window.addEventListener("elyon:ai-workforce-v2-rendered", queueRender);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") queueRender();
    });
  }`;

const PROVIDER_REFRESH_BEFORE = `  function refreshAfterMain(pair) {
    [0, 40, 160].forEach((delay) => setTimeout(() => {
      syncDashboard(pair);
      syncWorkforceModelSelectors();
    }, delay));
  }`;

const PROVIDER_REFRESH_AFTER = `  function refreshAfterMain(pair) {
    requestAnimationFrame(() => {
      syncDashboard(pair);
      syncWorkforceModelSelectors();
    });
  }`;

const PROVIDER_INSTALL_BEFORE = `  function install() {
    document.addEventListener("change", handleChange, true);
    document.addEventListener("click", handleClick, true);
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    apply();
    [120, 400, 900, 1800].forEach((delay) => setTimeout(scheduleApply, delay));
  }`;

const PROVIDER_INSTALL_AFTER = `  function install() {
    document.addEventListener("change", handleChange, true);
    document.addEventListener("click", handleClick, true);
    apply();
    window.addEventListener("elyon:ai-workforce-v2-rendered", scheduleApply);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (["settingsTab", "virtualAgentsTab"].includes(event.detail?.tabId)) scheduleApply();
    });
  }`;

const LEGACY_RUNTIME_ENTRY = `      { src: "/seller-virtual-agents-legacy.js" },\n`;
const ADVANCED_RUNTIME_ENTRY = `      { src: "/seller-ai-workforce-advanced-settings.js" },\n`;
const REDESIGN_RUNTIME_ENTRY = `      { src: "/seller-virtual-agents-redesign.js" },\n`;

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

export function optimizeWorkforceV2Structure(source) {
  let output = replaceRequired(source, V2_RENDER_END_BEFORE, V2_RENDER_END_AFTER, "v2 render event");
  output = replaceRequired(output, V2_WATCH_BEFORE, V2_WATCH_AFTER, "v2 global observer");
  return output;
}

export function optimizeWorkforceV2Operations(source) {
  return replaceRequired(source, V2_OPERATIONS_INSTALL_BEFORE, V2_OPERATIONS_INSTALL_AFTER, "v2 operations observer");
}

export function optimizeWorkforceWorkspaceV3(source) {
  return replaceRequired(source, WORKSPACE_V3_INSTALL_BEFORE, WORKSPACE_V3_INSTALL_AFTER, "workspace v3 observer");
}

export function optimizeProviderModelGuard(source) {
  let output = replaceRequired(source, PROVIDER_REFRESH_BEFORE, PROVIDER_REFRESH_AFTER, "provider refresh timers");
  output = replaceRequired(output, PROVIDER_INSTALL_BEFORE, PROVIDER_INSTALL_AFTER, "provider global observer");
  return output;
}

export function optimizeVirtualAgentsRuntimeLoader(source) {
  let output = replaceRequired(source, LEGACY_RUNTIME_ENTRY, "", "legacy virtual-agent runtime entry");
  if (!output.includes(REDESIGN_RUNTIME_ENTRY)) {
    output = replaceRequired(
      output,
      ADVANCED_RUNTIME_ENTRY,
      `${ADVANCED_RUNTIME_ENTRY}${REDESIGN_RUNTIME_ENTRY}`,
      "virtual-agent redesign runtime entry"
    );
  }
  output = output.replace(
    /const VERSION = "[^"]+";/,
    'const VERSION = "virtual-agents-final-20260807-2";'
  );
  return output;
}