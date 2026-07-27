(() => {
  "use strict";

  const TAB_ID = "ebayListingTab";
  const ORIGINAL_ID = "sellerPreservedListingDesigner";
  let preserved = null;

  function captureOriginalDesigner() {
    if (preserved) return preserved;
    const tab = document.getElementById(TAB_ID);
    if (!tab || !tab.querySelector("#gMainKeyword, #genBtn, #listingDraftSaveBtn")) return null;
    preserved = document.createElement("div");
    preserved.id = ORIGINAL_ID;
    preserved.className = "seller-designer-original";
    while (tab.firstChild) preserved.appendChild(tab.firstChild);
    window.__elyonSellerPreservedListingDesigner = preserved;
    return preserved;
  }

  function restoreOriginalDesigner() {
    const original = preserved || window.__elyonSellerPreservedListingDesigner;
    const host = document.getElementById("sellerDesignerOriginalHost");
    if (!original || !host || host.contains(original)) return false;
    host.replaceChildren(original);
    return true;
  }

  function patchSellerWorkflowLabels() {
    const menu = document.getElementById("mainMenu");
    const option = menu?.querySelector('option[value="ebayListingTab"]');
    if (option) {
      const options = [...menu.options];
      const index = Math.max(0, options.indexOf(option));
      option.textContent = `${index + 1}. Verkaufen`;
    }

    const launcher = document.getElementById("launcherGenerator");
    if (launcher) {
      const strong = launcher.querySelector("strong");
      const small = launcher.querySelector("small");
      if (strong) strong.textContent = "🛒 Verkaufen";
      if (small) small.textContent = "Listing Designer, Auto Lister und Abschluss";
    }

    const banner = document.getElementById("elyonSellerRoleBanner");
    if (banner) {
      const strong = banner.querySelector("strong");
      const paragraph = banner.querySelector("p");
      if (strong) strong.textContent = "Seller Tool = Verkaufen und Betrieb nach der Company-OS-Freigabe";
      if (paragraph) paragraph.textContent = "Nova sammelt. Company OS prüft und gibt Produkte frei. Das Seller Tool erstellt und finalisiert danach das Listing mit Designer und Auto Lister, dokumentiert das bewusst manuelle eBay-Listing und verwaltet Bestellungen, Versand, Rechnungen und Retouren.";
    }

    const modules = window.ElyonSellerModules?.active;
    if (Array.isArray(modules)) {
      const selling = modules.find((item) => item?.id === "ebayListingTab");
      if (selling) {
        selling.label = "Verkaufen";
        selling.role = "Listing Designer, Auto Lister und manuelle eBay-Freigabe";
      }
    }
  }

  function restoreAndPatch() {
    restoreOriginalDesigner();
    patchSellerWorkflowLabels();
  }

  function scheduleRestore() {
    [0, 40, 180, 650, 1750].forEach((delay) => window.setTimeout(restoreAndPatch, delay));
  }

  captureOriginalDesigner();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRestore, { once: true });
  } else {
    scheduleRestore();
  }

  window.addEventListener("elyon:seller-product-selected", scheduleRestore);
  window.addEventListener("storage", (event) => {
    if (["elyonProducts", "elyonSelectedSellerProductId"].includes(event.key)) scheduleRestore();
  });

  const observer = new MutationObserver(() => {
    if (document.getElementById("elyonSellerSellingFlow")) scheduleRestore();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });

  window.ElyonSellerSellingFlowCapture = {
    capture: captureOriginalDesigner,
    restore: restoreOriginalDesigner,
    patchLabels: patchSellerWorkflowLabels,
  };
})();