(() => {
  "use strict";

  const TAB_ID = "ebayListingTab";
  const ORIGINAL_ID = "sellerPreservedListingDesigner";
  let preserved = null;
  let scheduled = false;

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

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
      setText(option, `${index + 1}. Verkaufen`);
    }

    const launcher = document.getElementById("launcherGenerator");
    if (launcher) {
      setText(launcher.querySelector("strong"), "🛒 Verkaufen");
      setText(launcher.querySelector("small"), "Listing Designer, Auto Lister und Abschluss");
    }

    const banner = document.getElementById("elyonSellerRoleBanner");
    if (banner) {
      setText(banner.querySelector("strong"), "Seller Tool = Verkaufen und Betrieb nach der Company-OS-Freigabe");
      setText(
        banner.querySelector("p"),
        "Nova sammelt. Company OS prüft und gibt Produkte frei. Das Seller Tool erstellt und finalisiert danach das Listing mit Designer und Auto Lister, dokumentiert das bewusst manuelle eBay-Listing und verwaltet Bestellungen, Versand, Rechnungen und Retouren."
      );
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
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      restoreAndPatch();
    }, 0);
    [80, 300, 900, 1850].forEach((delay) => window.setTimeout(restoreAndPatch, delay));
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
    const host = document.getElementById("sellerDesignerOriginalHost");
    const option = document.getElementById("mainMenu")?.querySelector('option[value="ebayListingTab"]');
    const originalMissing = Boolean(host && preserved && !host.contains(preserved));
    const labelMissing = Boolean(option && !/Verkaufen/.test(option.textContent || ""));
    if (originalMissing || labelMissing) scheduleRestore();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });

  window.ElyonSellerSellingFlowCapture = {
    capture: captureOriginalDesigner,
    restore: restoreOriginalDesigner,
    patchLabels: patchSellerWorkflowLabels,
  };
})();