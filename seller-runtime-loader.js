(() => {
  "use strict";

  const VERSION = "perf-20260728-3";
  const loaded = new Map();

  const GROUPS = {
    quickstart: [
      { src: "/seller-quickstart-menu.js", type: "module" },
    ],
    productListTab: [
      { src: "/seller-company-os-inbox.js" },
      { src: "/seller-product-health-state.js", type: "module" },
      { src: "/seller-product-board-accordion.js" },
      { src: "/seller-product-board-accordion-compat.js" },
      { src: "/seller-product-delete.js" },
      { src: "/seller-button-integrity.js" },
    ],
    settingsTab: [
      { src: "/seller-ebay-api-status.js" },
    ],
    virtualAgentsTab: [
      { src: "/seller-virtual-agents-legacy.js" },
      { src: "/ai-workforce-client.js" },
      { src: "/ai-workforce-mount-fix.js" },
      { src: "/seller-ai-workforce-advanced-settings.js" },
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

  async function loadGroup(groupId) {
    const entries = GROUPS[groupId];
    if (!entries) return;

    for (const entry of entries) {
      await loadScript(entry);
    }

    if (groupId === "productListTab") {
      window.ElyonCompanyOsInbox?.install?.();
      window.ElyonProductBoardAccordion?.refresh?.();
      window.ElyonProductHealthState?.refresh?.();
    } else if (groupId === "settingsTab") {
      window.ElyonEbayApiStatus?.status?.();
    } else if (groupId === "virtualAgentsTab") {
      window.ElyonAIWorkforce?.mount?.();
      window.ElyonAIWorkforceMountFix?.refresh?.();
      window.ElyonAIWorkforceAdvancedSettings?.refresh?.();
    }

    window.dispatchEvent(new CustomEvent("elyon:runtime-group-loaded", {
      detail: { tabId: groupId, modules: entries.map((entry) => entry.src) },
    }));
  }

  function activeTabId() {
    const menuValue = document.getElementById("mainMenu")?.value;
    if (menuValue && GROUPS[menuValue]) return menuValue;
    const active = document.querySelector(".tab.active[id]");
    return active?.id && GROUPS[active.id] ? active.id : "";
  }

  function requestGroup(groupId) {
    if (!GROUPS[groupId]) return;
    loadGroup(groupId).catch((error) => {
      console.error("[Elyon Runtime Loader]", error);
      window.dispatchEvent(new CustomEvent("elyon:runtime-group-error", {
        detail: { tabId: groupId, message: error.message },
      }));
    });
  }

  function requestQuickstart(manual = true) {
    loadGroup("quickstart")
      .then(() => window.ElyonSellerQuickstart?.open?.({ manual }))
      .catch((error) => {
        console.error("[Elyon Runtime Loader]", error);
        window.dispatchEvent(new CustomEvent("elyon:runtime-group-error", {
          detail: { tabId: "quickstart", message: error.message },
        }));
      });
  }

  function tabFromClick(target) {
    if (!(target instanceof Element)) return "";
    const explicit = target.closest("[data-tab],[data-tab-id],[data-target-tab]");
    const candidate = explicit?.dataset.tab || explicit?.dataset.tabId || explicit?.dataset.targetTab;
    if (candidate && GROUPS[candidate]) return candidate;

    const inline = target.closest("[onclick]")?.getAttribute("onclick") || "";
    const match = inline.match(/showTab\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    return match && GROUPS[match[1]] ? match[1] : "";
  }

  function quickstartIsOpen() {
    const modal = document.getElementById("startLauncherModal");
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function install() {
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu") requestGroup(event.target.value);
    }, true);

    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("#startLauncherBtn")) {
        requestQuickstart(true);
        return;
      }
      const tabId = tabFromClick(event.target);
      if (tabId) requestGroup(tabId);
    }, true);

    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (typeof tabId === "string") requestGroup(tabId);
    });

    const initial = activeTabId();
    if (initial) {
      const start = () => requestGroup(initial);
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
      groups: GROUPS,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
