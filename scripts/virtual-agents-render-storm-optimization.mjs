function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Virtual-agent render optimization failed: ${label} signature not found.`);
  }
  return source.replace(before, after);
}

const STRUCTURE_WATCH_BEFORE = `  function watch() {
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

const STRUCTURE_WATCH_AFTER = `  function installRuntimeApi() {
    migrateSettings();
  }`;

const STRUCTURE_BOOT_BEFORE = `  window.ElyonAIWorkforceV2 = { agents: AGENTS, render: renderV2, runAgent, runNextAgent, settings: migrateSettings, tasks: readTasks };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once: true });
  else watch();`;

const STRUCTURE_BOOT_AFTER = `  window.ElyonAIWorkforceV2 = { agents: AGENTS, render: renderV2, runAgent, runNextAgent, settings: migrateSettings, tasks: readTasks };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installRuntimeApi, { once: true });
  else installRuntimeApi();`;

const OPERATIONS_INSTALL_BEFORE = `  function install() {
    installButtons();
    const observer = new MutationObserver(installButtons);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 400, 900, 1800].forEach((delay) => setTimeout(installButtons, delay));
    window.addEventListener("elyon:ai-workforce-routing-updated", installButtons);
    window.addEventListener("elyon:ai-agent-resource-settings-changed", installButtons);
    if (window.ElyonAIWorkforceV2) {
      window.ElyonAIWorkforceV2.runOperations = runOperations;
      window.ElyonAIWorkforceV2.runProductTeam = runProductTeam;
      window.ElyonAIWorkforceV2.runManagerWorkflow = runManagerWorkflow;
    }
  }`;

const OPERATIONS_INSTALL_AFTER = `  function install() {
    const refreshButtons = () => requestAnimationFrame(installButtons);
    installButtons();
    window.addEventListener("elyon:ai-workforce-routing-updated", refreshButtons);
    window.addEventListener("elyon:ai-agent-resource-settings-changed", refreshButtons);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", refreshButtons);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") refreshButtons();
    });
    if (window.ElyonAIWorkforceV2) {
      window.ElyonAIWorkforceV2.runOperations = runOperations;
      window.ElyonAIWorkforceV2.runProductTeam = runProductTeam;
      window.ElyonAIWorkforceV2.runManagerWorkflow = runManagerWorkflow;
    }
  }`;

const INTERFACE_INSTALL_BEFORE = `  function installObserver() {
    if (state.observer) return;
    const scope = document.getElementById(TAB_ID) || document.getElementById("elyonAiWorkforce");
    if (!scope) return;
    state.observer = new MutationObserver(queueRefresh);
    state.observer.observe(scope, { childList: true, subtree: true });
  }

  function install() {
    refresh();
    installObserver();
    document.addEventListener("click", handleClick, true);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRefresh);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", queueRefresh);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === TAB_ID) setTimeout(() => { refresh(); installObserver(); }, 0);
    });
    [80, 300, 800].forEach((delay) => setTimeout(() => { refresh(); installObserver(); }, delay));
  }`;

const INTERFACE_INSTALL_AFTER = `  function workspaceIsActive() {
    const tab = document.getElementById(TAB_ID);
    return Boolean(tab?.classList.contains("active") || document.getElementById("mainMenu")?.value === TAB_ID);
  }

  function refreshWhenActive() {
    if (workspaceIsActive()) queueRefresh();
  }

  function install() {
    refresh();
    document.addEventListener("click", handleClick, true);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", refreshWhenActive);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", refreshWhenActive);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === TAB_ID) refreshWhenActive();
    });
  }`;

const BUILDER_INSTALL_BEFORE = `  function installObserver() {
    const root = document.getElementById("elyonAiWorkforce");
    if (!root || state.observer) return;
    state.observer = new MutationObserver(() => queueDecorate());
    state.observer.observe(root, { childList: true, subtree: true });
  }

  function install() {
    installStyles(); decorate(); installObserver();
    addEventListener("elyon:ai-workforce-v2-task-updated", queueDecorate);
    addEventListener("elyon:ai-workforce-custom-task-updated", queueDecorate);
    addEventListener("elyon:runtime-group-loaded", (event) => { if (event.detail?.tabId === "virtualAgentsTab") setTimeout(() => { decorate(); installObserver(); }, 0); });
    [100, 400, 900].forEach((delay) => setTimeout(() => { decorate(); installObserver(); }, delay));
  }`;

const BUILDER_INSTALL_AFTER = `  function installObserver() {
    return false;
  }

  function install() {
    installStyles();
    decorate();
    addEventListener("elyon:ai-workforce-v2-task-updated", queueDecorate);
    addEventListener("elyon:ai-workforce-custom-task-updated", queueDecorate);
    addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") queueDecorate();
    });
  }`;

const PROMPT_RETRY_BEFORE = `    [100, 350, 800].forEach((delay) => setTimeout(queueDecorate, delay));`;
const PROMPT_RETRY_AFTER = `    // Relevant clicks and workforce render events refresh the helper on demand.`;

export function optimizeWorkforceStructureV2(source) {
  let output = replaceRequired(source, STRUCTURE_WATCH_BEFORE, STRUCTURE_WATCH_AFTER, "structure v2 global observer");
  output = replaceRequired(output, STRUCTURE_BOOT_BEFORE, STRUCTURE_BOOT_AFTER, "structure v2 boot lifecycle");
  return output;
}

export function optimizeWorkforceV2Operations(source) {
  return replaceRequired(source, OPERATIONS_INSTALL_BEFORE, OPERATIONS_INSTALL_AFTER, "operations v2 global observer");
}

export function optimizeWorkforceInterfaceV4(source) {
  return replaceRequired(source, INTERFACE_INSTALL_BEFORE, INTERFACE_INSTALL_AFTER, "interface v4 observer and retry burst");
}

export function optimizeWorkforceAgentBuilder(source) {
  return replaceRequired(source, BUILDER_INSTALL_BEFORE, BUILDER_INSTALL_AFTER, "agent builder observer and retry burst");
}

export function optimizeTaskPromptHelper(source) {
  return replaceRequired(source, PROMPT_RETRY_BEFORE, PROMPT_RETRY_AFTER, "prompt helper retry burst");
}
