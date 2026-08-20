(() => {
  "use strict";

  // Legacy entry point kept for build/backward compatibility only.
  // The required nested-card behavior now lives in seller-product-board-accordion.js,
  // so this file must not install another observer, retry loop, or click handler.
  const accordion = window.ElyonProductBoardAccordion;
  if (!accordion) {
    console.warn("[Elyon Product Board] Base accordion is not available; compat shim stayed passive.");
    return;
  }

  window.ElyonProductBoardAccordionCompat = {
    delegated: true,
    implementation: accordion.implementation || "base",
    refresh: () => accordion.refresh?.(),
  };
})();
