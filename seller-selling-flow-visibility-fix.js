(() => {
  "use strict";

  const TAB_ID = "ebayListingTab";
  const MENU_ID = "mainMenu";
  const ROOT_ID = "elyonSellerSellingFlow";
  const PRODUCTION_SCRIPT = "/seller-ebay-production-readiness.js";
  const PRODUCTION_SETTINGS_KEY = "elyonEbayProductionSelectionV1";
  const LOCAL_KEYS = ["elyonProducts", "elyonSelectedSellerProductId"];
  let queued = false;
  let productionModulePromise = null;
  let productionSetupTimer = null;

  function shouldOpenSelling() {
    const params = new URLSearchParams(window.location.search);
    return params.get("open") === "selling" || window.location.hash === "#verkaufen";
  }

  function selectedPoliciesExist() {
    try {
      const value = JSON.parse(localStorage.getItem(PRODUCTION_SETTINGS_KEY) || "{}");
      return Boolean(
        value?.fulfillmentPolicyId &&
        value?.paymentPolicyId &&
        value?.returnPolicyId &&
        value?.merchantLocationKey
      );
    } catch {
      return false;
    }
  }

  function productionSelectionsNeedRefresh() {
    if (!selectedPoliciesExist()) return false;
    const select = document.getElementById("elyonEbayFulfillment");
    if (!select) return false;
    const value = String(select.value || "").trim();
    return select.options.length <= 1 || !value || value === "Setup prüfen";
  }

  function restoreProductionSelections() {
    window.clearTimeout(productionSetupTimer);
    productionSetupTimer = window.setTimeout(() => {
      if (!productionSelectionsNeedRefresh()) return;
      const checkSetup = window.ElyonEbayProductionReadiness?.checkSetup;
      if (typeof checkSetup === "function") {
        Promise.resolve(checkSetup()).catch((error) => {
          console.error("[Elyon eBay Setup Sync]", error);
        });
      }
    }, 80);
  }

  function loadProductionModule() {
    if (window.ElyonEbayProductionReadiness) {
      window.ElyonEbayProductionReadiness.install?.();
      restoreProductionSelections();
      return Promise.resolve(true);
    }
    if (productionModulePromise) return productionModulePromise;
    productionModulePromise = new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => {
        try { return new URL(script.src, window.location.href).pathname === PRODUCTION_SCRIPT; }
        catch { return false; }
      });
      if (existing) {
        existing.addEventListener("load", () => {
          window.ElyonEbayProductionReadiness?.install?.();
          restoreProductionSelections();
          resolve(true);
        }, { once: true });
        if (window.ElyonEbayProductionReadiness) {
          restoreProductionSelections();
          resolve(true);
        }
        return;
      }
      const script = document.createElement("script");
      script.src = `${PRODUCTION_SCRIPT}?v=20260731-2`;
      script.defer = true;
      script.dataset.elyonSellingAddon = "ebay-production";
      script.addEventListener("load", () => {
        window.ElyonEbayProductionReadiness?.install?.();
        restoreProductionSelections();
        resolve(true);
      }, { once: true });
      script.addEventListener("error", () => {
        productionModulePromise = null;
        reject(new Error("eBay-Produktionsmodul konnte nicht geladen werden."));
      }, { once: true });
      document.head.appendChild(script);
    });
    return productionModulePromise;
  }

  function patchLabels() {
    const menu = document.getElementById(MENU_ID);
    const option = menu?.querySelector(`option[value="${TAB_ID}"]`);
    if (option) {
      const index = Math.max(0, [...menu.options].indexOf(option));
      const label = `${index + 1}. Verkaufen`;
      if (option.textContent !== label) option.textContent = label;
    }

    const launcher = document.getElementById("launcherGenerator");
    if (launcher) {
      const strong = launcher.querySelector("strong");
      const small = launcher.querySelector("small");
      if (strong && strong.textContent !== "🛒 Verkaufen") strong.textContent = "🛒 Verkaufen";
      if (small && small.textContent !== "Listing Designer, Auto Lister und Abschluss") {
        small.textContent = "Listing Designer, Auto Lister und Abschluss";
      }
    }

    const modules = window.ElyonSellerModules?.active;
    if (Array.isArray(modules)) {
      const selling = modules.find((item) => item?.id === TAB_ID);
      if (selling) {
        selling.label = "Verkaufen";
        selling.role = "Listing Designer, Auto Lister und kontrollierte eBay-Veröffentlichung";
      }
    }
  }

  function activateSellingTab() {
    if (!shouldOpenSelling()) return false;
    const tab = document.getElementById(TAB_ID);
    if (!tab) return false;

    const menu = document.getElementById(MENU_ID);
    if (menu && menu.value !== TAB_ID) {
      menu.value = TAB_ID;
      menu.dispatchEvent(new Event("change", { bubbles: true }));
    }

    document.querySelectorAll(".tab").forEach((candidate) => {
      candidate.classList.toggle("active", candidate.id === TAB_ID);
    });
    tab.hidden = false;
    tab.removeAttribute("aria-hidden");
    window.ElyonSellerSellingFlow?.setActivePanel?.("designer");
    return true;
  }

  function restoreSellingFlow() {
    patchLabels();
    const tab = document.getElementById(TAB_ID);
    const flow = window.ElyonSellerSellingFlow;
    if (!tab || !flow || typeof flow.render !== "function") return false;

    const root = document.getElementById(ROOT_ID);
    if (!root || !tab.contains(root)) flow.render();

    window.ElyonSellerSellingFlowCapture?.restore?.();
    patchLabels();
    activateSellingTab();
    loadProductionModule()
      .then(restoreProductionSelections)
      .catch((error) => console.error("[Elyon eBay Production]", error));
    return Boolean(document.getElementById(ROOT_ID));
  }

  function scheduleRestore() {
    if (queued) return;
    queued = true;
    window.setTimeout(() => {
      queued = false;
      restoreSellingFlow();
    }, 0);
  }

  function needsRepair() {
    const tab = document.getElementById(TAB_ID);
    const root = document.getElementById(ROOT_ID);
    const option = document.getElementById(MENU_ID)?.querySelector(`option[value="${TAB_ID}"]`);
    return Boolean(
      (tab && (!root || !tab.contains(root))) ||
      (option && !/Verkaufen/.test(option.textContent || "")) ||
      (shouldOpenSelling() && tab && !tab.classList.contains("active"))
    );
  }

  function boot() {
    restoreSellingFlow();
    [80, 550, 1700, 2800].forEach((delay) => window.setTimeout(restoreSellingFlow, delay));

    window.addEventListener("elyon:seller-product-selected", scheduleRestore);
    window.addEventListener("storage", (event) => {
      if (LOCAL_KEYS.includes(event.key)) scheduleRestore();
    });
    window.addEventListener("hashchange", scheduleRestore);

    document.getElementById(MENU_ID)?.addEventListener("change", (event) => {
      if (event.target?.value === TAB_ID) scheduleRestore();
    });

    document.getElementById("launcherGenerator")?.addEventListener("click", scheduleRestore);

    const observer = new MutationObserver(() => {
      if (needsRepair()) scheduleRestore();
    });
    const tab = document.getElementById(TAB_ID);
    const menu = document.getElementById(MENU_ID);
    if (tab) observer.observe(tab, { childList: true });
    if (menu) observer.observe(menu, { childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.ElyonSellerSellingFlowVisibility = {
    restore: restoreSellingFlow,
    patchLabels,
    activate: activateSellingTab,
    loadProductionModule,
    restoreProductionSelections,
  };
})();
