(() => {
  "use strict";

  const TAB_ID = "ebayListingTab";
  const MENU_ID = "mainMenu";
  const ROOT_ID = "elyonSellerSellingFlow";
  const LOCAL_KEYS = ["elyonProducts", "elyonSelectedSellerProductId"];
  let queued = false;

  function shouldOpenSelling() {
    const params = new URLSearchParams(window.location.search);
    return params.get("open") === "selling" || window.location.hash === "#verkaufen";
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
        selling.role = "Listing Designer, Auto Lister und manuelle eBay-Freigabe";
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
  };
})();
