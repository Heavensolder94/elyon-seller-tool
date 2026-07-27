(() => {
  "use strict";

  let scheduled = false;

  function refresh() {
    const api = window.ElyonSellerSellingFlow;
    if (!api || typeof api.render !== "function") return false;
    api.render();
    window.ElyonSellerSellingFlowCapture?.restore?.();
    window.ElyonSellerSellingFlowCapture?.patchLabels?.();
    return true;
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    [0, 60, 240].forEach((delay, index) => {
      window.setTimeout(() => {
        if (index === 2) scheduled = false;
        refresh();
      }, delay);
    });
  }

  function boot() {
    scheduleRefresh();
    window.setTimeout(scheduleRefresh, 700);
    window.setTimeout(scheduleRefresh, 1900);
  }

  window.addEventListener("elyon:seller-product-selected", scheduleRefresh);
  window.addEventListener("storage", (event) => {
    if (["elyonProducts", "elyonSelectedSellerProductId"].includes(event.key)) scheduleRefresh();
  });

  const observer = new MutationObserver(() => {
    const tab = document.getElementById("ebayListingTab");
    if (!tab || !window.ElyonSellerSellingFlow) return;
    if (!document.getElementById("elyonSellerSellingFlow")) scheduleRefresh();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();