(() => {
  "use strict";

  const LEGACY_IDS = ["mobileSellingQuickAction", "mobileSellingSheetAction"];

  function removeLegacySellingActions() {
    let removed = 0;
    LEGACY_IDS.forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.remove();
      removed += 1;
    });
    return removed;
  }

  function install() {
    removeLegacySellingActions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.setTimeout(install, 400);
  window.setTimeout(install, 1400);
  window.ElyonMobileSellingEntry = {
    install,
    removeLegacySellingActions,
    retired: true,
    reason: "Listing-Erstellung und Auto Lister liegen im Company OS; das Seller Tool beginnt ab eBay.",
  };
})();
