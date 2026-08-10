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

const WORKSPACE_MODE_OPTIONS_BEFORE = `  function modeOptions(selected, allowExternal) {
    return MODES.map((mode) => \`<option value="\${mode.id}" \${mode.id === selected ? "selected" : ""} \${mode.id === "auto_external" && !allowExternal ? "disabled" : ""}>\${mode.level} · \${mode.label}</option>\`).join("");
  }`;

const WORKSPACE_MODE_OPTIONS_AFTER = `  function modeOptions(selected) {
    return MODES
      .filter((mode) => mode.level <= 3)
      .map((mode) => \`<option value="\${mode.id}" \${mode.id === selected ? "selected" : ""}>\${mode.level} · \${mode.label}</option>\`)
      .join("");
  }`;

const WORKSPACE_MIGRATION_MARKER = `      const existing = current.autonomy && typeof current.autonomy === "object" ? current.autonomy : {};`;
const WORKSPACE_MIGRATION_AFTER = `      if (modeById(migratedMode).level > 3) migratedMode = "semi";
      const existing = current.autonomy && typeof current.autonomy === "object" ? current.autonomy : {};`;

const WORKSPACE_INSTALL_BEFORE = `  function install() {
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

const WORKSPACE_INSTALL_AFTER = `  function install() {
    ensureSettings();
    installStyles();
    render();
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") queueRender();
    });
  }`;

const WORKSPACE_EXTERNAL_EXECUTION_PATTERN = /  async function executeExternalActions\(run\) \{[\s\S]*?\n  \}\n\n  function discoverExecutor/;
const WORKSPACE_EXTERNAL_EXECUTION_AFTER = `  async function executeExternalActions(run) {
    if (run && Array.isArray(run.warnings)) {
      run.warnings.push("Legacy-Workspace: externe Agentenaktionen sind durch Elyon Manager V1 gesperrt.");
      run.updatedAt = nowIso();
      saveRun(run);
    }
    return false;
  }

  function discoverExecutor`;

const LEGACY_RUNTIME_ENTRY = `      { src: "/seller-virtual-agents-legacy.js" },\n`;

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Virtual-agent optimization failed: ${label} signature not found.`);
  }
  return source.replace(before, after);
}

function replaceRegexRequired(source, pattern, after, label) {
  if (!pattern.test(source)) {
    throw new Error(`Virtual-agent optimization failed: ${label} signature not found.`);
  }
  return source.replace(pattern, after);
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

export function optimizeWorkspaceV3(source) {
  let output = replaceRequired(source, WORKSPACE_MODE_OPTIONS_BEFORE, WORKSPACE_MODE_OPTIONS_AFTER, "workspace autonomy options");
  output = replaceRequired(output, WORKSPACE_MIGRATION_MARKER, WORKSPACE_MIGRATION_AFTER, "workspace legacy autonomy migration");
  output = replaceRequired(output, WORKSPACE_INSTALL_BEFORE, WORKSPACE_INSTALL_AFTER, "workspace global observer and auto triggers");
  output = replaceRegexRequired(output, WORKSPACE_EXTERNAL_EXECUTION_PATTERN, WORKSPACE_EXTERNAL_EXECUTION_AFTER, "workspace external execution");
  return output;
}

export function optimizeVirtualAgentsRuntimeLoader(source) {
  let output = replaceRequired(source, LEGACY_RUNTIME_ENTRY, "", "legacy virtual-agent runtime entry");
  output = output.replace(
    /const VERSION = "[^"]+";/,
    'const VERSION = "virtual-agents-stable-20260810-2";'
  );
  return output;
}
