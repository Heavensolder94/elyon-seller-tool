(() => {
  "use strict";

  const ROOT_ID = "virtualAgentsSettingsRoot";
  const TAB_ID = "virtualAgentsTab";
  const SHELL_ID = "elyonAiWorkforce";
  let scheduled = false;

  function dedicatedRoot() {
    return document.getElementById(ROOT_ID);
  }

  function workforceShell() {
    return document.getElementById(SHELL_ID);
  }

  function moveIntoDedicatedTab() {
    scheduled = false;
    const root = dedicatedRoot();
    if (!root) return false;

    let shell = workforceShell();
    if (!shell && window.ElyonAIWorkforce?.mount) {
      try {
        shell = window.ElyonAIWorkforce.mount() || workforceShell();
      } catch {
        shell = workforceShell();
      }
    }
    if (!shell) return false;

    if (shell.parentElement !== root) root.appendChild(shell);

    shell.classList.add("aiw-dedicated-tab");
    root.dataset.elyonWorkforceReady = "1";
    const tab = document.getElementById(TAB_ID);
    if (tab) tab.dataset.elyonWorkforceReady = "1";
    return true;
  }

  function scheduleMove() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(moveIntoDedicatedTab);
  }

  function install() {
    scheduleMove();

    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) scheduleMove();
    }, true);

    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === TAB_ID) scheduleMove();
    });

    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === TAB_ID) scheduleMove();
    });

    window.ElyonAIWorkforceMountFix = {
      refresh: moveIntoDedicatedTab,
      root: dedicatedRoot,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();