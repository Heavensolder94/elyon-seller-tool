import {
  pendingProductHealth,
  productDecisionStatus,
  productHealthReadiness,
} from "/seller-product-health-core.js";

const HEALTH_INSTALL_FLAG = "__elyonCompletenessAware";
const DECISION_INSTALL_FLAG = "__elyonDecisionAdvisory";
const COMPLETION_NOTICE_ID = "elyonAdvisoryCompletionNotice";
const COMPLETION_BUTTON_ID = "elyonOpenListingPackageDespiteWarning";
const BOARD_SELECTOR = "#productListTab #list";
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

function readProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem("elyonProducts") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cardProductId(card) {
  const aiButton = card.querySelector('[id^="productAiBtn_"]');
  if (aiButton?.id) return aiButton.id.replace(/^productAiBtn_/, "");
  const action = [...card.querySelectorAll("button")].find((button) =>
    /(?:editProduct|prepareProductForEbayDraft|removeProduct|duplicateProduct)\s*\(/.test(String(button.getAttribute("onclick") || "")),
  );
  const match = String(action?.getAttribute("onclick") || "").match(/\((?:'|")?([^)'"\s]+)(?:'|")?\)/);
  return match ? match[1] : "";
}

function productForCard(card, storedProducts) {
  const id = cardProductId(card);
  if (!id) return null;
  return storedProducts.find((product) => String(product?.id) === String(id)) || null;
}

function statusClass(node) {
  if (node?.classList.contains("good")) return "good";
  if (node?.classList.contains("bad")) return "bad";
  if (node?.classList.contains("warn")) return "warn";
  return "info";
}

function applyStatusNode(node, decision) {
  if (!node || !decision) return;
  if (node.textContent !== decision.label) node.textContent = decision.label;
  ["good", "warn", "bad", "info", "ai-status-ghost"].forEach((cls) => node.classList.remove(cls));
  node.classList.add("status", decision.cls || "info");
  node.title = decision.text || "Bewertung ist eine Empfehlung.";
}

function decisionNote(card, decision) {
  const scoreWrap = card.querySelector(":scope > .score-wrap");
  if (!scoreWrap) return;
  let note = scoreWrap.querySelector(":scope > .elyon-product-decision-note");
  if (!note) {
    note = document.createElement("div");
    note.className = "muted elyon-product-decision-note";
    note.style.marginTop = "10px";
    note.style.padding = "9px 10px";
    note.style.borderRadius = "12px";
    note.style.background = "rgba(59,130,246,.08)";
    note.style.border = "1px solid rgba(96,165,250,.16)";
    scoreWrap.appendChild(note);
  }
  const suffix = decision.key === "no"
    ? " Du kannst den Artikel trotzdem bearbeiten, das Listing vorbereiten und nach bewusster Pflichtprüfung manuell veröffentlichen."
    : " Bearbeiten und Listing vorbereiten bleiben möglich.";
  const message = `${decision.text || "Bewertung ist eine Empfehlung."}${suffix}`;
  if (note.textContent !== message) note.textContent = message;
}

function keepActionsAvailable(card, decision) {
  card.querySelectorAll("button[onclick]").forEach((button) => {
    const handler = String(button.getAttribute("onclick") || "");
    const isEdit = /editProduct\s*\(/.test(handler);
    const isPrepare = /prepareProductForEbayDraft\s*\(/.test(handler);
    if (!isEdit && !isPrepare) return;

    button.disabled = false;
    button.removeAttribute("aria-disabled");
    if (!button.dataset.elyonOriginalLabel) button.dataset.elyonOriginalLabel = button.textContent || "";

    if (isPrepare && decision.key === "no") {
      button.textContent = "Trotz Warnung für eBay vorbereiten";
      button.title = "Der Score ist eine Warnung, keine Sperre. Pflicht- und Rechtsangaben vor dem Einstellen prüfen.";
    } else {
      button.textContent = button.dataset.elyonOriginalLabel;
      button.title = decision.publicationNote || "Bearbeiten und Vorbereiten bleiben möglich.";
    }
  });
}

function decorateProductBoard() {
  const board = document.querySelector(BOARD_SELECTOR);
  if (!board) return;
  const storedProducts = readProducts();
  [...board.children].forEach((card) => {
    if (!(card instanceof HTMLElement) || !card.classList.contains("product-card") || card.classList.contains("small-card")) return;
    const product = productForCard(card, storedProducts);
    const statusNode = card.querySelector(":scope > .score-wrap .score-top .status");
    if (!product || !statusNode) return;

    const scoredStatus = {
      label: String(statusNode.textContent || "").trim(),
      cls: statusClass(statusNode),
    };
    const decision = productDecisionStatus(product, scoredStatus);
    applyStatusNode(statusNode, decision);

    if (!decision.readiness.ready) {
      const score = card.querySelector(":scope > .score-wrap .score-number");
      const bar = card.querySelector(":scope > .score-wrap .progress .bar");
      if (score && score.textContent !== "—") score.textContent = "—";
      if (bar) bar.style.width = "0%";
    }

    card.dataset.elyonDecisionState = decision.key;
    decisionNote(card, decision);
    keepActionsAvailable(card, decision);
  });
}

function decorateAdvisoryUi() {
  decorationScheduled = false;
  decorateFocusedCompletion();
  decorateProductBoard();
}

function scheduleAdvisoryDecoration() {
  if (decorationScheduled) return;
  decorationScheduled = true;
  window.requestAnimationFrame(decorateAdvisoryUi);
}

function bindCompletionAction() {
  if (document.documentElement.dataset.elyonDecisionAdvisoryBound === "1") return;
  document.documentElement.dataset.elyonDecisionAdvisoryBound = "1";
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.(`#${COMPLETION_BUTTON_ID}`);
    if (!button) return;
    event.preventDefault();
    const packageRoot = document.getElementById("sellerReadyRoot");
    if (packageRoot) packageRoot.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function observeAdvisoryUi() {
  if (observer) return;
  observer = new MutationObserver(scheduleAdvisoryDecoration);
  observer.observe(document.body, { childList: true, subtree: true });
}

function installAll() {
  exposePolicy();
  const healthReady = installProductHealthGuard();
  const decisionReady = installProductDecisionGuard();
  bindCompletionAction();
  observeAdvisoryUi();
  scheduleAdvisoryDecoration();

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
window.addEventListener("elyon:seller-product-selected", scheduleAdvisoryDecoration);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key === "elyonProducts") scheduleInstall();
});
