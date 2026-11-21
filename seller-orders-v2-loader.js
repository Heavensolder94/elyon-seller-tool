// Load the order cockpit only when its existing menu tab becomes visible.
(() => {
  let started = false;
  function loadIfVisible() {
    if (started) return;
    const tab = document.getElementById("ordersTab");
    if (!tab || !tab.classList.contains("active")) return;
    started = true;
    observer?.disconnect();
    import("/seller-orders-v2.js?v=orders2-20261121-nova-pair-fix1").catch((error) => {
      started = false;
      console.error("ELYON Bestellzentrale konnte nicht geladen werden:", error);
    });
  }
  let observer = null;
  function install() {
    const tab = document.getElementById("ordersTab");
    if (!tab) return;
    observer = new MutationObserver(loadIfVisible);
    observer.observe(tab, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu") queueMicrotask(loadIfVisible);
    });
    loadIfVisible();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
