(() => {
  "use strict";

  const TAB_ID = "virtualAgentsTab";
  const ROOT_ID = "virtualAgentsSettingsRoot";
  const MENU_ID = "mainMenu";
  const OPTION_LABEL = "9. Virtuelle Mitarbeiter / KI-Agenten";
  const STYLE_ID = "elyonVirtualAgentsPolicyStyles";
  let requestedTab = "";
  let tabObserver = null;
  let menuObserver = null;
  let scheduled = false;

  function installStyleOverride() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID}.active,
      #${TAB_ID}.active.elyon-role-hidden,
      #${TAB_ID}[hidden].active {
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  function exposeTab() {
    const tab = document.getElementById(TAB_ID);
    if (!tab) return false;
    tab.classList.remove("elyon-role-hidden");
    tab.hidden = false;
    tab.removeAttribute("aria-hidden");
    tab.dataset.elyonModuleState = "active";
    return true;
  }

  function ensureMenuOption() {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return false;

    let option = [...menu.options].find((entry) => entry.value === TAB_ID);
    if (!option) {
      option = document.createElement("option");
      option.value = TAB_ID;
      option.textContent = OPTION_LABEL;
      const settingsOption = [...menu.options].find((entry) => entry.value === "settingsTab");
      if (settingsOption?.nextSibling) menu.insertBefore(option, settingsOption.nextSibling);
      else menu.appendChild(option);
    }

    if (requestedTab === TAB_ID) menu.value = TAB_ID;
    return true;
  }

  function syncRoleMetadata() {
    const registry = window.ElyonSellerModules;
    if (!registry) return;
    if (Array.isArray(registry.inactive)) {
      registry.inactive = registry.inactive.filter((module) => module?.id !== TAB_ID);
    }
    if (Array.isArray(registry.active) && !registry.active.some((module) => module?.id === TAB_ID)) {
      registry.active.push({
        id: TAB_ID,
        label: "Virtuelle Mitarbeiter",
        role: "KI-Analysen, Entwürfe, Freigaben und sichere interne Aufgaben",
      });
    }
  }

  function showDedicatedTab() {
    const tab = document.getElementById(TAB_ID);
    if (!tab) return false;
    document.querySelectorAll(".tab").forEach((node) => node.classList.remove("active"));
    exposeTab();
    tab.classList.add("active");
    tab.scrollIntoView?.({ block: "start", behavior: "smooth" });
    window.ElyonAIWorkforceMountFix?.refresh?.();
    window.ElyonAIWorkforce?.mount?.();
    return true;
  }

  function activate() {
    scheduled = false;
    installStyleOverride();
    exposeTab();
    ensureMenuOption();
    syncRoleMetadata();
    if (requestedTab === TAB_ID) showDedicatedTab();
  }

  function scheduleActivate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(activate);
  }

  function observePolicyRewrites() {
    const tab = document.getElementById(TAB_ID);
    const menu = document.getElementById(MENU_ID);

    if (tab && !tabObserver) {
      tabObserver = new MutationObserver(scheduleActivate);
      tabObserver.observe(tab, { attributes: true, attributeFilter: ["class", "hidden", "aria-hidden"] });
    }
    if (menu && !menuObserver) {
      menuObserver = new MutationObserver(scheduleActivate);
      menuObserver.observe(menu, { childList: true });
    }

    window.setTimeout(() => {
      tabObserver?.disconnect();
      menuObserver?.disconnect();
      tabObserver = null;
      menuObserver = null;
      activate();
    }, 2600);
  }

  function install() {
    activate();
    observePolicyRewrites();

    document.addEventListener("change", (event) => {
      if (event.target?.id !== MENU_ID) return;
      requestedTab = event.target.value === TAB_ID ? TAB_ID : "";
      if (requestedTab) window.setTimeout(showDedicatedTab, 0);
    }, true);

    [100, 650, 1750, 2400].forEach((delay) => window.setTimeout(activate, delay));
    window.addEventListener("elyon:tab-changed", (event) => {
      if (event.detail?.tabId === TAB_ID || event.detail === TAB_ID) {
        requestedTab = TAB_ID;
        scheduleActivate();
      }
    });

    window.ElyonVirtualAgentsPolicy = {
      activate,
      show: () => {
        requestedTab = TAB_ID;
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.value = TAB_ID;
        activate();
      },
      root: () => document.getElementById(ROOT_ID),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
