import {
  pendingProductHealth,
  productHealthReadiness,
} from "/seller-product-health-core.js";

const INSTALL_FLAG = "__elyonCompletenessAware";
let attempts = 0;
let retryTimer = null;

function installProductHealthGuard() {
  const current = window.productHealth;
  if (typeof current !== "function") return false;
  if (current[INSTALL_FLAG]) return true;

  const originalProductHealth = current;
  const guardedProductHealth = function guardedProductHealth(product) {
    const original = originalProductHealth(product || {});
    const readiness = productHealthReadiness(product || {});
    if (readiness.ready) return original;
    return pendingProductHealth(readiness, original?.issues || []);
  };

  guardedProductHealth[INSTALL_FLAG] = true;
  guardedProductHealth.originalProductHealth = originalProductHealth;
  window.productHealth = guardedProductHealth;

  if (typeof window.render === "function") {
    window.render();
  }

  window.dispatchEvent(new CustomEvent("elyon:product-health-guard-ready"));
  return true;
}

function scheduleInstall() {
  if (installProductHealthGuard()) return;
  attempts += 1;
  if (attempts >= 40) return;
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(scheduleInstall, 100);
}

scheduleInstall();
window.addEventListener("elyon:products-updated", scheduleInstall);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key === "elyonProducts") scheduleInstall();
});
