(function installSellerDashboardCompatibility(global) {
  "use strict";

  const DASHBOARD_TAB_ID = "dashboardTab";
  const LEGACY_DASHBOARD_ID = "elyonSellerLegacyDashboard";
  const HOST_MARKER = "elyonSellerCockpitHost";
  const FINANCE_TAB_ID = "financeTab";
  const INVOICE_TAB_ID = "invoiceTab";
  const FINANCE_MERGE_MARKER = "elyonFinanceMenuMerged";
  const FINANCE_OBSERVER_MARKER = "elyonFinanceMenuObserver";

  function install(documentRef) {
    const doc = documentRef || global.document;
    if (!doc || typeof doc.getElementById !== "function") {
      return { installed: false, reason: "document_unavailable" };
    }

    const existingHost = doc.getElementById(DASHBOARD_TAB_ID);
    if (existingHost?.dataset?.[HOST_MARKER] === "true") {
      return {
        installed: false,
        reason: "already_installed",
        host: existingHost,
        legacy: doc.getElementById(LEGACY_DASHBOARD_ID),
      };
    }

    const legacy = doc.getElementById(LEGACY_DASHBOARD_ID) || existingHost;
    if (!legacy || !legacy.parentNode) {
      return { installed: false, reason: "dashboard_missing" };
    }

    const wasActive = legacy.classList?.contains("active") === true;
    legacy.id = LEGACY_DASHBOARD_ID;
    legacy.setAttribute?.("aria-hidden", "true");
    legacy.setAttribute?.("data-elyon-legacy-dashboard", "true");
    legacy.classList?.remove("active");
    legacy.style?.setProperty?.("display", "none", "important");

    const host = doc.createElement("section");
    host.id = DASHBOARD_TAB_ID;
    host.className = "tab";
    host.dataset[HOST_MARKER] = "true";
    host.setAttribute?.("data-elyon-seller-dashboard-host", "true");
    if (wasActive) host.classList?.add("active");

    legacy.parentNode.insertBefore(host, legacy);

    return { installed: true, host, legacy };
  }

  function menuOptions(menu) {
    return Array.from(menu?.options || menu?.children || []);
  }

  function financeLabel(option) {
    if (!option) return;
    const current = String(option.textContent || "");
    const prefix = current.match(/^\s*(\d+\.\s*)/i)?.[1] || "";
    const next = `${prefix}Finanzen`;
    if (current !== next) option.textContent = next;
    if (option.dataset) option.dataset[FINANCE_MERGE_MARKER] = "true";
  }

  function removeOption(menu, option) {
    if (!menu || !option) return;
    if (typeof option.remove === "function") {
      option.remove();
      return;
    }
    if (typeof menu.removeChild === "function") {
      try { menu.removeChild(option); } catch {}
    }
  }

  function normalizeFinanceNavigation(documentRef) {
    const doc = documentRef || global.document;
    const menu = doc?.getElementById?.("mainMenu");
    if (!menu) return { merged: false, reason: "menu_missing" };

    let options = menuOptions(menu);
    let invoiceOption = options.find((option) => String(option?.value || "") === INVOICE_TAB_ID) || null;
    let financeOption = options.find((option) => String(option?.value || "") === FINANCE_TAB_ID) || null;
    const invoiceWasSelected = String(menu.value || "") === INVOICE_TAB_ID;

    if (invoiceOption && !financeOption) {
      invoiceOption.value = FINANCE_TAB_ID;
      financeOption = invoiceOption;
      invoiceOption = null;
    }

    if (financeOption) financeLabel(financeOption);

    options = menuOptions(menu);
    for (const option of options) {
      if (String(option?.value || "") === INVOICE_TAB_ID) removeOption(menu, option);
    }

    if (invoiceWasSelected && financeOption) menu.value = FINANCE_TAB_ID;

    return {
      merged: Boolean(financeOption),
      financeOption,
      invoiceRemoved: !menuOptions(menu).some((option) => String(option?.value || "") === INVOICE_TAB_ID),
    };
  }

  function observeFinanceNavigation(documentRef) {
    const doc = documentRef || global.document;
    const menu = doc?.getElementById?.("mainMenu");
    if (!menu) return { installed: false, reason: "menu_missing" };

    normalizeFinanceNavigation(doc);
    if (menu.dataset?.[FINANCE_OBSERVER_MARKER] === "true") {
      return { installed: false, reason: "already_observing" };
    }

    if (menu.dataset) menu.dataset[FINANCE_OBSERVER_MARKER] = "true";
    const Observer = global.MutationObserver;
    if (typeof Observer !== "function") {
      return { installed: false, reason: "observer_unavailable" };
    }

    const observer = new Observer(() => normalizeFinanceNavigation(doc));
    observer.observe(menu, { childList: true, subtree: true, characterData: true });
    return { installed: true, observer };
  }

  function scheduleFinanceNavigation(documentRef) {
    const doc = documentRef || global.document;
    const immediate = observeFinanceNavigation(doc);
    if (immediate.reason !== "menu_missing") return immediate;
    if (typeof doc?.addEventListener === "function") {
      doc.addEventListener("DOMContentLoaded", () => observeFinanceNavigation(doc), { once: true });
      return { installed: false, reason: "scheduled" };
    }
    return immediate;
  }

  global.ElyonSellerDashboardCompat = {
    install,
    normalizeFinanceNavigation,
    observeFinanceNavigation,
  };
  install(global.document);
  scheduleFinanceNavigation(global.document);
})(typeof window !== "undefined" ? window : globalThis);
