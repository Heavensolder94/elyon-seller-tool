(function installSellerDashboardCompatibility(global) {
  "use strict";

  const DASHBOARD_TAB_ID = "dashboardTab";
  const LEGACY_DASHBOARD_ID = "elyonSellerLegacyDashboard";
  const HOST_MARKER = "elyonSellerCockpitHost";
  const FINANCE_TAB_ID = "financeTab";
  const INVOICE_TAB_ID = "invoiceTab";
  const FINANCE_MERGE_MARKER = "elyonFinanceMenuMerged";
  const NAV_OBSERVER_MARKER = "elyonPostEbayNavigationObserver";
  const DASHBOARD_OBSERVER_MARKER = "elyonPostEbayDashboardObserver";
  const RETIRED_PRE_EBAY_TABS = new Set([
    "productSearchTab",
    "productAnalysisTab",
    "productListTab",
    "ebayListingTab",
  ]);
  const RETIRED_PRE_EBAY_LAUNCHERS = ["launcherNewProduct", "launcherBoard", "launcherGenerator"];

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

  function listingLabel(option, label) {
    if (!option) return;
    const current = String(option.textContent || "");
    const prefix = current.match(/^\s*(\d+\.\s*)/i)?.[1] || "";
    const next = `${prefix}${label}`;
    if (current !== next) option.textContent = next;
  }

  function removeOption(menu, option) {
    if (!menu || !option) return;
    if (typeof option.remove === "function") {
      option.remove();
      return;
    }
    if (typeof menu.removeChild === "function") {
      try {
        menu.removeChild(option);
        return;
      } catch {}
    }
    if (Array.isArray(menu.children)) {
      const index = menu.children.indexOf(option);
      if (index >= 0) menu.children.splice(index, 1);
    }
  }

  function hideNode(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute?.("aria-hidden", "true");
    node.style?.setProperty?.("display", "none", "important");
    if (node.dataset) node.dataset.elyonRetiredPreEbay = "true";
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

  function normalizePostEbayNavigation(documentRef) {
    const doc = documentRef || global.document;
    if (!doc || typeof doc.getElementById !== "function") return { cleaned: false, reason: "document_unavailable" };

    RETIRED_PRE_EBAY_TABS.forEach((id) => hideNode(doc.getElementById(id)));
    RETIRED_PRE_EBAY_LAUNCHERS.forEach((id) => hideNode(doc.getElementById(id)));

    const menu = doc.getElementById("mainMenu");
    if (menu) {
      const selectedWasRetired = RETIRED_PRE_EBAY_TABS.has(String(menu.value || ""));
      menuOptions(menu).forEach((option) => {
        const value = String(option?.value || "");
        if (RETIRED_PRE_EBAY_TABS.has(value)) removeOption(menu, option);
      });
      const draftOption = menuOptions(menu).find((option) => String(option?.value || "") === "draftsTab");
      const activeOption = menuOptions(menu).find((option) => String(option?.value || "") === "activeListingsTab");
      listingLabel(draftOption, "eBay-Entwürfe");
      listingLabel(activeOption, "Aktive Listings");
      if (selectedWasRetired) menu.value = DASHBOARD_TAB_ID;
    }

    const modules = global.ElyonSellerModules;
    if (modules && Array.isArray(modules.active)) {
      modules.active = modules.active.filter((item) => !RETIRED_PRE_EBAY_TABS.has(String(item?.id || "")));
      modules.postEbayOnly = true;
      modules.upstreamListingOwner = "Elyon Company OS";
    }

    return {
      cleaned: true,
      sourcingHidden: Boolean(doc.getElementById("productSearchTab")),
      analysisHidden: Boolean(doc.getElementById("productAnalysisTab")),
      productsHidden: Boolean(doc.getElementById("productListTab")),
      sellingHidden: Boolean(doc.getElementById("ebayListingTab")),
    };
  }

  function normalizePostEbayDashboard(documentRef) {
    const doc = documentRef || global.document;
    const root = doc?.getElementById?.("elyonSellerDashboard");
    if (!root || typeof root.querySelectorAll !== "function") return { cleaned: false, reason: "dashboard_missing" };

    const retiredTasks = [];
    for (const task of root.querySelectorAll(".sd-task")) {
      const button = task.querySelector?.("[data-sd-tab]");
      if (RETIRED_PRE_EBAY_TABS.has(String(button?.dataset?.sdTab || ""))) {
        hideNode(task);
        retiredTasks.push(task);
      }
    }

    for (const label of root.querySelectorAll(".sd-kpi small")) {
      if (/^Listingbereit$/i.test(String(label.textContent || "").trim())) hideNode(label.closest?.(".sd-kpi"));
    }

    for (const heading of root.querySelectorAll(".sd-head h3")) {
      const title = String(heading.textContent || "").trim();
      const panel = heading.closest?.(".sd-panel");
      if (title === "Produktleistung" && panel) {
        const button = panel.querySelector?.('[data-sd-tab="productListTab"]');
        if (button) {
          button.dataset.sdTab = "activeListingsTab";
          button.textContent = "Aktive Listings öffnen";
        }
      }
      if (title === "Seller-Pipeline" && panel) {
        const copy = panel.querySelector?.(".sd-head p");
        if (copy) copy.textContent = "eBay ist die Quelle für Entwürfe, aktive Listings und den anschließenden Seller-Betrieb.";
        const pipeline = panel.querySelector?.(".sd-pipeline");
        if (pipeline) {
          for (const step of pipeline.querySelectorAll?.(".sd-step") || []) {
            const label = String(step.querySelector?.("span")?.textContent || "").toLowerCase();
            if (label.includes("product master") || label.includes("listingbereit")) hideNode(step);
          }
          pipeline.style?.setProperty?.("grid-template-columns", "repeat(4,minmax(0,1fr))");
        }
      }
      if (title === "Datenqualität und Blocker" && panel) {
        hideNode(panel);
        panel.parentElement?.style?.setProperty?.("grid-template-columns", "1fr");
      }
    }

    for (const label of root.querySelectorAll(".sd-status span")) {
      const value = String(label.textContent || "").trim();
      if (value === "Company-OS-Produkte") label.textContent = "Product-Master-Anreicherung";
      if (value === "Automatisches Einstellen / Bestellen") label.textContent = "Automatische Lieferantenbestellung";
    }

    const roleBanner = doc.getElementById("elyonSellerRoleBanner");
    const roleStrong = roleBanner?.querySelector?.("strong");
    const roleParagraph = roleBanner?.querySelector?.("p");
    if (roleStrong && /Seller Tool =/i.test(String(roleStrong.textContent || ""))) {
      roleStrong.textContent = "Seller Tool = Betrieb ab eBay";
      if (roleParagraph) roleParagraph.textContent = "Company OS erstellt und übergibt das Listing. Das Seller Tool übernimmt eBay-Entwürfe, aktive Listings, Bestellungen, Versand, Finanzen und Retouren.";
    }

    return { cleaned: true, retiredTasks: retiredTasks.length };
  }

  function normalizeAll(documentRef) {
    const doc = documentRef || global.document;
    const finance = normalizeFinanceNavigation(doc);
    const navigation = normalizePostEbayNavigation(doc);
    const dashboard = normalizePostEbayDashboard(doc);
    return { finance, navigation, dashboard };
  }

  function observeNavigation(documentRef) {
    const doc = documentRef || global.document;
    const menu = doc?.getElementById?.("mainMenu");
    if (!menu) return { installed: false, reason: "menu_missing" };

    normalizeAll(doc);
    if (menu.dataset?.[NAV_OBSERVER_MARKER] === "true") {
      return { installed: false, reason: "already_observing" };
    }

    if (menu.dataset) menu.dataset[NAV_OBSERVER_MARKER] = "true";
    const Observer = global.MutationObserver;
    if (typeof Observer !== "function") return { installed: false, reason: "observer_unavailable" };

    const observer = new Observer(() => normalizeAll(doc));
    observer.observe(menu, { childList: true, subtree: true, characterData: true });
    return { installed: true, observer };
  }

  function observeDashboard(documentRef) {
    const doc = documentRef || global.document;
    const host = doc?.getElementById?.(DASHBOARD_TAB_ID);
    if (!host) return { installed: false, reason: "dashboard_missing" };
    if (host.dataset?.[DASHBOARD_OBSERVER_MARKER] === "true") return { installed: false, reason: "already_observing" };
    if (host.dataset) host.dataset[DASHBOARD_OBSERVER_MARKER] = "true";

    const Observer = global.MutationObserver;
    if (typeof Observer !== "function") return { installed: false, reason: "observer_unavailable" };
    const observer = new Observer(() => normalizePostEbayDashboard(doc));
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    return { installed: true, observer };
  }

  function scheduleNormalization(documentRef) {
    const doc = documentRef || global.document;
    const run = () => {
      normalizeAll(doc);
      observeNavigation(doc);
      observeDashboard(doc);
    };
    run();
    if (typeof global.setTimeout === "function") [80, 400, 1200, 2600].forEach((delay) => global.setTimeout(run, delay));
    if (typeof doc?.addEventListener === "function") doc.addEventListener("DOMContentLoaded", run, { once: true });
  }

  global.ElyonSellerDashboardCompat = {
    install,
    normalizeFinanceNavigation,
    normalizePostEbayNavigation,
    normalizePostEbayDashboard,
    normalizeAll,
    observeNavigation,
    observeDashboard,
  };
  install(global.document);
  scheduleNormalization(global.document);
})(typeof window !== "undefined" ? window : globalThis);
