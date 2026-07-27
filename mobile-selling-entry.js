(() => {
  "use strict";

  const DESKTOP_SELLING_URL = "/?open=selling#verkaufen";
  const QUICK_ID = "mobileSellingQuickAction";
  const SHEET_ID = "mobileSellingSheetAction";

  function openSelling() {
    window.location.assign(DESKTOP_SELLING_URL);
  }

  function buildQuickAction() {
    const grid = document.querySelector("#home .quick-grid");
    if (!grid || document.getElementById(QUICK_ID)) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.id = QUICK_ID;
    button.className = "quick-action";
    button.setAttribute("aria-label", "Verkaufen öffnen");
    button.innerHTML = '<span class="qa-icon">🛒</span><b>Verkaufen</b>';
    button.addEventListener("click", openSelling);
    grid.prepend(button);
    return true;
  }

  function buildSheetAction() {
    const grid = document.querySelector("#actionSheet .sheet-grid");
    if (!grid || document.getElementById(SHEET_ID)) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.id = SHEET_ID;
    button.className = "sheet-action";
    button.setAttribute("aria-label", "Verkaufsbereich öffnen");
    button.innerHTML = '<b>🛒 Verkaufen</b><span>Listing Designer, Auto Lister und Abschluss</span>';
    button.addEventListener("click", openSelling);
    grid.prepend(button);
    return true;
  }

  function install() {
    buildQuickAction();
    buildSheetAction();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.setTimeout(install, 400);
  window.setTimeout(install, 1400);
  window.ElyonMobileSellingEntry = { install, open: openSelling, url: DESKTOP_SELLING_URL };
})();
