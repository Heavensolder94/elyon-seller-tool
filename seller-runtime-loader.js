(() => {
  "use strict";

  const VERSION = "seller-operations-20260807-6";
  const LEGACY_QUICKSTART_BRIDGE_FLAG = "__elyonModernQuickstartBridge";
  const loaded = new Map();
  const groupLoads = new Map();
  const AI_MODEL_GUARD = { src: "/seller-ai-provider-model-guard.js" };
  const PRICE_PROVENANCE = { src: "/seller-price-provenance.js", type: "module" };

  const GROUPS = {
    quickstart: [
      { src: "/seller-quickstart-menu.js", type: "module" },
    ],
    ebayListingTab: [
      PRICE_PROVENANCE,
      { src: "/seller-selling-flow-capture.js" },
      { src: "/seller-selling-flow.js", type: "module" },
      { src: "/seller-selling-flow-event-guard.js" },
      { src: "/seller-listing-visual-designer.js", type: "module" },
      { src: "/seller-auto-lister-parity.js", type: "module" },
      { src: "/seller-category-engine.js", type: "module" },
      { src: "/seller-selling-flow-resilience.js" },
      { src: "/seller-selling-flow-visibility-fix.js" },
      { src: "/seller-selling-flow-focused-ui.js", type: "module" },
    ],
    productListTab: [
      PRICE_PROVENANCE,
      { src: "/seller-company-os-inbox.js" },
      { src: "/seller-product-health-state.js", type: "module" },
      { src: "/seller-product-board-accordion.js" },
      { src: "/seller-product-board-accordion-compat.js" },
      { src: "/seller-product-delete.js" },
      { src: "/seller-button-integrity.js" },
    ],
    financeTab: [
      { src: "/seller-finance.js", type: "module" },
      { src: "/seller-order-invoices.js", type: "module" },
    ],
    settingsTab: [
      { src: "/seller-system-status-settings.js" },
      { src: "/seller-settings-layout-experiment.js" },
      { src: "/seller-ai-settings-label.js" },
      { src: "/seller-ebay-api-status.js" },
    ],
    virtualAgentsTab: [
      { src: "/seller-virtual-agents-legacy.js" },
      { src: "/ai-workforce-client.js" },
      { src: "/ai-workforce-mount-fix.js" },
      { src: "/seller-ai-workforce-advanced-settings.js" },
      { src: "/seller-ai-workforce-team-v5.js" },
      { src: "/seller-ai-task-prompt-helper.js" },
    ],
  };

  function normalizedSrc(src) {
    return `${src}?v=${VERSION}`;
  }

  function findExisting(src) {
    return [...document.scripts].find((script) => {
      try {
        return new URL(script.src, window.location.href).pathname === src;
      } catch {
        return false;
      }
    }) || null;
  }

  function loadScript(entry) {
    const src = entry.src;
    if (loaded.has(src)) return loaded.get(src);

    const existing = findExisting(src);
    if (existing) {
      const ready = Promise.resolve(existing);
      loaded.set(src, ready);
      return ready;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = normalizedSrc(src);
      script.dataset.elyonRuntimeModule = src;
      script.async = true;
      if (entry.type === "module") script.type = "module";
      script.addEventListener("load", () => resolve(script), { once: true });
      script.addEventListener("error", () => {
        loaded.delete(src);
        reject(new Error(`Modul konnte nicht geladen werden: ${src}`));
      }, { once: true });
      document.head.appendChild(script);
    });

    loaded.set(src, promise);
    return promise;
  }

  function ensureGroup(groupId) {
    if (groupLoads.has(groupId)) return groupLoads.get(groupId);
    const entries = GROUPS[groupId];
    if (!entries) return Promise.resolve([]);

    const promise = (async () => {
      const scripts = [];
      for (const entry of entries) scripts.push(await loadScript(entry));
      if (groupId === "settingsTab" || groupId === "virtualAgentsTab") {
        scripts.push(await loadScript(AI_MODEL_GUARD));
      }
      return scripts;
    })().catch((error) => {
      groupLoads.delete(groupId);
      throw error;
    });

    groupLoads.set(groupId, promise);
    return promise;
  }

  function activateGroup(groupId) {
    if (groupId === "ebayListingTab") {
      window.ElyonSellerPriceProvenance?.enrichSelectedWorkingCopy?.();
      window.ElyonSellerPriceProvenance?.render?.();
      window.ElyonSellerSellingFlowCapture?.restore?.();
      window.ElyonSellerSellingFlow?.render?.();
    } else if (groupId === "productListTab") {
      window.ElyonSellerPriceProvenance?.enrichSelectedWorkingCopy?.();
      window.ElyonCompanyOsInbox?.install?.();
      window.ElyonProductBoardAccordion?.refresh?.();
      window.ElyonProductHealthState?.refresh?.();
    } else if (groupId === "financeTab") {
      window.ElyonSellerFinance?.open?.();
      window.ElyonOrderInvoices?.mount?.();
    } else if (groupId === "settingsTab") {
      window.ElyonSystemStatusSettings?.install?.();
      window.ElyonSystemStatusSettings?.move?.();
      window.ElyonSettingsLayoutExperiment?.refresh?.();
      window.ElyonAiSettingsLabel?.apply?.();
      window.ElyonAiProviderModelGuard?.apply?.();
      window.ElyonEbayApiStatus?.status?.();
    } else if (groupId === "virtualAgentsTab") {
      window.ElyonAIWorkforce?.mount?.();
      window.ElyonAIWorkforceMountFix?.refresh?.();
      window.ElyonAIWorkforceAdvancedSettings?.refresh?.();
      window.ElyonAIWorkforceTeamV5?.render?.();
      window.ElyonAITaskPromptHelper?.refresh?.();
      window.ElyonAiProviderModelGuard?.apply?.();
      window.ElyonAiProviderModelGuard?.syncWorkforce?.();
    }
  }

  async function loadGroup(groupId) {
    const entries = GROUPS[groupId];
    if (!entries) return [];
    const scripts = await ensureGroup(groupId);
    activateGroup(groupId);
    window.dispatchEvent(new CustomEvent("elyon:runtime-group-loaded", {
      detail: { tabId: groupId, modules: entries.map((entry) => entry.src) },
    }));
    return scripts;
  }

  function activeTabId() {
    const menuValue = document.getElementById("mainMenu")?.value;
    if (menuValue && GROUPS[menuValue]) return menuValue;
    const active = document.querySelector(".tab.active[id]");
    return active?.id && GROUPS[active.id] ? active.id : "";
  }

  function requestGroup(groupId) {
    if (!GROUPS[groupId]) return Promise.resolve([]);
    return loadGroup(groupId).catch((error) => {
      console.error("[Elyon Runtime Loader]", error);
      window.dispatchEvent(new CustomEvent("elyon:runtime-group-error", {
        detail: { tabId: groupId, message: error.message },
      }));
      throw error;
    });
  }

  function requestQuickstart(manual = true) {
    return requestGroup("quickstart")
      .then(() => window.ElyonSellerQuickstart?.open?.({ manual }))
      .catch(() => false);
  }

  function installLegacyQuickstartBridge() {
    const legacyOpen = window.openStartLauncher;
    if (typeof legacyOpen !== "function") return false;
    if (legacyOpen[LEGACY_QUICKSTART_BRIDGE_FLAG] === true) return true;

    function openModernQuickstartFromLegacy() {
      requestQuickstart(false);
    }

    Object.defineProperty(openModernQuickstartFromLegacy, LEGACY_QUICKSTART_BRIDGE_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(openModernQuickstartFromLegacy, "legacyOpenStartLauncher", {
      value: legacyOpen,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    window.openStartLauncher = openModernQuickstartFromLegacy;
    return window.openStartLauncher === openModernQuickstartFromLegacy;
  }

  function installFinanceEntry() {
    const menu = document.getElementById("mainMenu");
    if (menu && !menu.querySelector('option[value="financeTab"]')) {
      const option = document.createElement("option");
      option.value = "financeTab";
      option.textContent = "Finanzen & Buchhaltung";
      menu.appendChild(option);
    }

    const nav = document.querySelector(".nav-menu");
    if (nav && !document.getElementById("elyonFinanceRuntimeNav")) {
      const link = document.createElement("a");
      link.id = "elyonFinanceRuntimeNav";
      link.href = "#finance";
      link.className = "nav-item";
      link.dataset.tab = "financeTab";
      link.innerHTML = '<span class="nav-icon">€</span><span>Finanzen</span>';
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (menu) menu.value = "financeTab";
        requestGroup("financeTab").catch(() => {});
      });
      nav.appendChild(link);
    }
  }

  function tabFromClick(target) {
    if (!(target instanceof Element)) return "";
    const explicit = target.closest("[data-tab],[data-tab-id],[data-target-tab],[data-sd-tab]");
    const candidate = explicit?.dataset.tab || explicit?.dataset.tabId || explicit?.dataset.targetTab || explicit?.dataset.sdTab;
    if (candidate && GROUPS[candidate]) return candidate;

    if (target.closest("#settingsBtn,#openAiDashboardBtn")) return "settingsTab";
    if (target.closest("#launcherGenerator")) return "ebayListingTab";
    if (target.closest("#launcherBoard")) return "productListTab";

    const inline = target.closest("[onclick]")?.getAttribute("onclick") || "";
    const match = inline.match(/showTab\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    return match && GROUPS[match[1]] ? match[1] : "";
  }

  function quickstartIsOpen() {
    const modal = document.getElementById("startLauncherModal");
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function install() {
    installLegacyQuickstartBridge();
    installFinanceEntry();

    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu") requestGroup(event.target.value).catch(() => {});
    }, true);

    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("#startLauncherBtn")) {
        event.preventDefault();
        event.stopPropagation();
        requestQuickstart(true);
        return;
      }
      const tabId = tabFromClick(event.target);
      if (tabId) requestGroup(tabId).catch(() => {});
    }, true);

    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (typeof tabId === "string") requestGroup(tabId).catch(() => {});
    });

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#finance") requestGroup("financeTab").catch(() => {});
    });

    const initial = window.location.hash === "#finance" ? "financeTab" : activeTabId();
    if (initial) {
      const start = () => requestGroup(initial).catch(() => {});
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(start, { timeout: 700 });
      } else {
        window.setTimeout(start, 0);
      }
    }

    if (quickstartIsOpen()) requestQuickstart(false);

    window.ElyonRuntimeLoader = {
      loadGroup,
      loadScript: (src, type = "") => loadScript({ src, type }),
      openQuickstart: requestQuickstart,
      loaded: () => [...loaded.keys()],
      loadedGroups: () => [...groupLoads.keys()],
      groups: GROUPS,
    };
  }

  installLegacyQuickstartBridge();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
