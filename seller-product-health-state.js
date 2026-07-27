import {
  pendingProductHealth,
  productDecisionStatus,
  productHealthReadiness,
} from "/seller-product-health-core.js";

const HEALTH_INSTALL_FLAG = "__elyonCompletenessAware";
const DECISION_INSTALL_FLAG = "__elyonDecisionAdvisory";
const COMPLETION_NOTICE_ID = "elyonAdvisoryCompletionNotice";
const COMPLETION_BUTTON_ID = "elyonOpenListingPackageDespiteWarning";
let attempts = 0;
let retryTimer = null;
let latestCalculatedProduct = null;
let observer = null;
let decorationScheduled = false;

function installProductHealthGuard() {
  const current = window.productHealth;
  if (typeof current !== "function") return false;
  if (current[HEALTH_INSTALL_FLAG]) return true;

  const originalProductHealth = current;
  const guardedProductHealth = function guardedProductHealth(product) {
    const original = originalProductHealth(product || {});
    const readiness = productHealthReadiness(product || {});
    if (readiness.ready) return original;
    return pendingProductHealth(readiness, original?.issues || []);
  };

  guardedProductHealth[HEALTH_INSTALL_FLAG] = true;
  guardedProductHealth.originalProductHealth = originalProductHealth;
  window.productHealth = guardedProductHealth;
  return true;
}

function installProductDecisionGuard() {
  const currentCalc = window.calcProduct;
  const currentStatus = window.statusFromScore;
  if (typeof currentCalc !== "function" || typeof currentStatus !== "function") return false;

  if (!currentCalc[DECISION_INSTALL_FLAG]) {
    const originalCalc = currentCalc;
    const guardedCalc = function guardedCalc(product) {
      latestCalculatedProduct = product || null;
      return originalCalc(product || {});
    };
    guardedCalc[DECISION_INSTALL_FLAG] = true;
    guardedCalc.originalCalcProduct = originalCalc;
    window.calcProduct = guardedCalc;
  }

  if (!currentStatus[DECISION_INSTALL_FLAG]) {
    const originalStatus = currentStatus;
    const guardedStatus = function guardedStatus(score) {
      const scoredStatus = originalStatus(score);
      if (!latestCalculatedProduct) return scoredStatus;
      return productDecisionStatus(latestCalculatedProduct, scoredStatus);
    };
    guardedStatus[DECISION_INSTALL_FLAG] = true;
    guardedStatus.originalStatusFromScore = originalStatus;
    window.statusFromScore = guardedStatus;
  }

  return true;
}

function exposePolicy() {
  window.elyonProductHealthReadiness = productHealthReadiness;
  window.elyonProductDecisionStatus = productDecisionStatus;
  window.elyonProductDecisionPolicy = productDecisionStatus;
}

function completionNoticeHtml() {
  return `
    <strong>Bewertung ist eine Empfehlung, keine Sperre.</strong><br>
    Du kannst den Artikel unabhängig vom Score weiter bearbeiten und das Listing-Paket öffnen. Vor der manuellen Veröffentlichung müssen eBay-Pflichtangaben und rechtliche Angaben vollständig sein.
  `;
}

function decorateFocusedCompletion() {
  decorationScheduled = false;
  const step = document.getElementById("focusedSellingStep3");
  if (!step) return;

  let notice = document.getElementById(COMPLETION_NOTICE_ID);
  if (!notice) {
    notice = document.createElement("div");
    notice.id = COMPLETION_NOTICE_ID;
    notice.className = "focused-selling-status";
    notice.innerHTML = completionNoticeHtml();
    const actions = step.querySelector(":scope > .focused-selling-actions");
    step.insertBefore(notice, actions || null);
  }

  step.querySelectorAll(":scope > .focused-selling-status.bad").forEach((node) => {
    const current = String(node.textContent || "").trim();
    if (!current || node.id === COMPLETION_NOTICE_ID) return;
    node.classList.remove("bad");
    node.classList.add("warn");
    if (current.startsWith("Noch offene Blocker:")) {
      node.textContent = current.replace("Noch offene Blocker:", "Vor dem manuellen Einstellen noch klären:");
    }
  });

  const actions = step.querySelector(":scope > .focused-selling-actions");
  if (actions && !document.getElementById(COMPLETION_BUTTON_ID)) {
    const button = document.createElement("button");
    button.id = COMPLETION_BUTTON_ID;
    button.type = "button";
    button.className = "secondary";
    button.textContent = "Listing-Paket trotzdem anzeigen";
    actions.appendChild(button);
  }
}

function scheduleCompletionDecoration() {
  if (decorationScheduled) return;
  decorationScheduled = true;
  window.requestAnimationFrame(decorateFocusedCompletion);
}

function bindCompletionAction() {
  if (document.documentElement.dataset.elyonDecisionAdvisoryBound === "1") return;
  document.documentElement.dataset.elyonDecisionAdvisoryBound = "1";
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.(`#${COMPLETION_BUTTON_ID}`);
    if (!button) return;
    event.preventDefault();
    const packageRoot = document.getElementById("sellerReadyRoot");
    if (packageRoot) {
      packageRoot.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function observeCompletionFlow() {
  if (observer) return;
  observer = new MutationObserver(scheduleCompletionDecoration);
  observer.observe(document.body, { childList: true, subtree: true });
}

function installAll() {
  exposePolicy();
  const healthReady = installProductHealthGuard();
  const decisionReady = installProductDecisionGuard();
  bindCompletionAction();
  observeCompletionFlow();
  scheduleCompletionDecoration();

  if (healthReady && decisionReady) {
    if (typeof window.render === "function") window.render();
    window.dispatchEvent(new CustomEvent("elyon:product-decision-policy-ready"));
    return true;
  }
  return false;
}

function scheduleInstall() {
  if (installAll()) return;
  attempts += 1;
  if (attempts >= 60) return;
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(scheduleInstall, 100);
}

scheduleInstall();
window.addEventListener("elyon:products-updated", scheduleInstall);
window.addEventListener("elyon:seller-product-selected", scheduleCompletionDecoration);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key === "elyonProducts") scheduleInstall();
});
