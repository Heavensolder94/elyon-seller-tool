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

const WORKSPACE_V3_INSTALL_AFTER = `  function workspaceIsActive() {
    const tab = document.getElementById("virtualAgentsTab");
    if (!tab) return false;
    if (tab.classList.contains("active")) return true;
    return document.getElementById("mainMenu")?.value === "virtualAgentsTab";
  }

  function refreshWorkspace() {
    if (!workspaceIsActive()) return;
    queueRender();
  }

  function install() {
    ensureSettings();
    installStyles();
    render();
    bindTriggers();

    window.addEventListener("elyon:ai-workforce-v2-task-updated", refreshWorkspace);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") refreshWorkspace();
    });
    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === "virtualAgentsTab") refreshWorkspace();
    });
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === "virtualAgentsTab") refreshWorkspace();
    }, true);

    [120, 450].forEach((delay) => setTimeout(refreshWorkspace, delay));
  }`;

const RUNTIME_LOAD_GROUP_BEFORE = `  async function loadGroup(groupId) {
    const entries = GROUPS[groupId];
    if (!entries) return [];
    const scripts = await ensureGroup(groupId);
    activateGroup(groupId);
    window.dispatchEvent(new CustomEvent("elyon:runtime-group-loaded", {
      detail: { tabId: groupId, modules: entries.map((entry) => entry.src) },
    }));
    return scripts;
  }`;

const RUNTIME_LOAD_GROUP_AFTER = `  const activationRequests = new Map();
  const activationTimes = new Map();
  const ACTIVATION_DEDUP_MS = 250;

  async function loadGroup(groupId) {
    const entries = GROUPS[groupId];
    if (!entries) return [];
    if (activationRequests.has(groupId)) return activationRequests.get(groupId);

    const request = (async () => {
      const scripts = await ensureGroup(groupId);
      const now = Date.now();
      const lastActivation = Number(activationTimes.get(groupId) || 0);
      if (now - lastActivation >= ACTIVATION_DEDUP_MS) {
        activationTimes.set(groupId, now);
        activateGroup(groupId);
        window.dispatchEvent(new CustomEvent("elyon:runtime-group-loaded", {
          detail: { tabId: groupId, modules: entries.map((entry) => entry.src) },
        }));
      }
      return scripts;
    })().finally(() => activationRequests.delete(groupId));

    activationRequests.set(groupId, request);
    return request;
  }`;

const LEGACY_RUNTIME_ENTRY = `      { src: "/seller-virtual-agents-legacy.js" },\n`;
const TEAM_V6_RUNTIME_ENTRY = `      { src: "/seller-ai-workforce-team-v6.js" },`;
const ROUTING_CENTER_RUNTIME_ENTRY = `      { src: "/seller-ai-workforce-routing-center.js" },`;

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

export function optimizeWorkforceWorkspaceV3(source) {
  return replaceRequired(source, WORKSPACE_V3_INSTALL_BEFORE, WORKSPACE_V3_INSTALL_AFTER, "workspace v3 global observer");
}

export function optimizeVirtualAgentsRuntimeLoader(source) {
  let output = replaceRequired(source, LEGACY_RUNTIME_ENTRY, "", "legacy virtual-agent runtime entry");
  output = replaceRequired(output, RUNTIME_LOAD_GROUP_BEFORE, RUNTIME_LOAD_GROUP_AFTER, "runtime group activation dedupe");
  if (!output.includes(ROUTING_CENTER_RUNTIME_ENTRY)) {
    output = replaceRequired(
      output,
      TEAM_V6_RUNTIME_ENTRY,
      `${TEAM_V6_RUNTIME_ENTRY}\n${ROUTING_CENTER_RUNTIME_ENTRY}`,
      "workforce routing center runtime entry"
    );
  }
  output = output.replace(
    /const VERSION = "[^"]+";/,
    'const VERSION = "workforce-routing-20260813-1";'
  );
  return output;
}