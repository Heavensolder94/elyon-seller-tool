import {
  createSharedRefresh,
  routeById,
  shouldRequestDashboardRefresh,
} from "./seller-quickstart-core.js";
import { dashboardSnapshotFromDocument } from "./seller-quickstart-snapshot.js";
import {
  PANEL_ID,
  installQuickstartStyles,
  quickstartPanelMarkup,
} from "./seller-quickstart-view.js";

const MODAL_ID = "startLauncherModal";
const SHOW_AGAIN_KEY = "elyonShowStartLauncher";
let dashboardObserver = null;
let refreshTimer = null;
let installed = false;
let dashboardBridgeInstalled = false;
let lastFocusedElement = null;

function installDashboardBridge(documentRef = document) {
  if (dashboardBridgeInstalled) return window.ElyonSellerDashboard || null;
  const api = window.ElyonSellerDashboard;
  if (!api || typeof api.refresh !== "function") return null;
  dashboardBridgeInstalled = true;
  const sharedRefresh = createSharedRefresh(api.refresh.bind(api));
  api.refresh = (...args) => sharedRefresh(...args).then((value) => {
    const snapshot = dashboardSnapshotFromDocument(documentRef);
    window.dispatchEvent(new CustomEvent("elyon:seller-dashboard-updated", { detail: snapshot }));
    return value;
  });
  api.getSnapshot = () => dashboardSnapshotFromDocument(documentRef);
  return api;
}

function modal(documentRef = document) {
  return documentRef.getElementById(MODAL_ID);
}

function isModalOpen(documentRef = document) {
  const node = modal(documentRef);
  return Boolean(node && !node.classList.contains("hidden"));
}

function ensurePanel(documentRef = document) {
  const modalNode = modal(documentRef);
  if (!modalNode) return null;
  installQuickstartStyles(documentRef);
  let panel = documentRef.getElementById(PANEL_ID);
  if (panel) return panel;
  modalNode.innerHTML = `<div class="card modal-panel" id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="elyonQuickstartTitle"></div>`;
  return documentRef.getElementById(PANEL_ID);
}

function render(documentRef = document) {
  const panel = ensurePanel(documentRef);
  if (!panel) return null;
  const snapshot = window.ElyonSellerDashboard?.getSnapshot?.() || dashboardSnapshotFromDocument(documentRef);
  panel.innerHTML = quickstartPanelMarkup(snapshot);
  const checkbox = panel.querySelector("#showStartLauncherAgain");
  if (checkbox) checkbox.checked = localStorage.getItem(SHOW_AGAIN_KEY) !== "no";
  return snapshot;
}

function stopWatchingDashboard() {
  dashboardObserver?.disconnect?.();
  dashboardObserver = null;
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = null;
}

function watchDashboard(documentRef = document) {
  stopWatchingDashboard();
  const host = documentRef.getElementById("dashboardTab");
  if (!host || typeof MutationObserver === "undefined") return;
  let scheduled = false;
  dashboardObserver = new MutationObserver(() => {
    if (scheduled || !isModalOpen(documentRef)) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const snapshot = render(documentRef);
      if (snapshot?.ready && !snapshot.loading) stopWatchingDashboard();
    });
  });
  dashboardObserver.observe(host, { childList: true, subtree: true, characterData: true });
  refreshTimer = window.setTimeout(stopWatchingDashboard, 8000);
}

function persistShowAgain(documentRef = document) {
  const checkbox = documentRef.getElementById("showStartLauncherAgain");
  localStorage.setItem(SHOW_AGAIN_KEY, checkbox?.checked === false ? "no" : "yes");
}

function close(documentRef = document) {
  persistShowAgain(documentRef);
  stopWatchingDashboard();
  modal(documentRef)?.classList.add("hidden");
  lastFocusedElement?.focus?.();
  lastFocusedElement = null;
}

async function requestDashboardRefresh(documentRef = document) {
  const dashboardApi = installDashboardBridge(documentRef) || window.ElyonSellerDashboard;
  const snapshot = dashboardApi?.getSnapshot?.() || dashboardSnapshotFromDocument(documentRef);
  if (!shouldRequestDashboardRefresh({ manual: true, ready: snapshot.ready, loading: snapshot.loading })) {
    watchDashboard(documentRef);
    return;
  }
  watchDashboard(documentRef);
  try { await dashboardApi?.refresh?.(); } catch { render(documentRef); }
}

async function waitForAnchor(anchorId, documentRef = document) {
  if (!anchorId) return null;
  for (const delay of [0, 80, 180, 320]) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    const node = documentRef.getElementById(anchorId);
    if (node) return node;
  }
  return null;
}

async function navigate(routeId, documentRef = document) {
  const route = routeById(routeId);
  if (!route) return;
  close(documentRef);
  if (route.runtimeGroup) {
    try { await window.ElyonRuntimeLoader?.loadGroup?.(route.runtimeGroup); } catch {}
  }
  try {
    if (typeof window.showTab === "function") window.showTab(route.tab);
    else {
      const menu = documentRef.getElementById("mainMenu");
      if (menu) {
        menu.value = route.tab;
        menu.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  } catch {}
  window.dispatchEvent(new CustomEvent("elyon:tab-changed", { detail: { tabId: route.tab, source: "quickstart" } }));
  if (route.sellingPanel) {
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    window.ElyonSellerSellingFlow?.setActivePanel?.(route.sellingPanel);
  }
  const anchor = await waitForAnchor(route.anchor, documentRef);
  anchor?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  if (route.id === "settings" && anchor?.tagName === "DETAILS") anchor.open = true;
}

function open({ manual = true, documentRef = document } = {}) {
  lastFocusedElement = documentRef.activeElement;
  const panel = ensurePanel(documentRef);
  if (!panel) return false;
  modal(documentRef)?.classList.remove("hidden");
  const snapshot = render(documentRef);
  watchDashboard(documentRef);
  if (shouldRequestDashboardRefresh({ manual, ready: snapshot?.ready, loading: snapshot?.loading })) requestDashboardRefresh(documentRef);
  window.setTimeout(() => panel.querySelector("[data-quickstart-route]")?.focus?.(), 0);
  return true;
}

function handleClick(event, documentRef = document) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest("#startLauncherBtn")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    open({ manual: true, documentRef });
    return;
  }
  if (!target.closest(`#${MODAL_ID}`)) return;
  const routeButton = target.closest("[data-quickstart-route]");
  if (routeButton) {
    event.preventDefault();
    navigate(routeButton.dataset.quickstartRoute, documentRef);
  } else if (target.closest("[data-quickstart-refresh]")) {
    event.preventDefault();
    requestDashboardRefresh(documentRef);
  } else if (target.closest("[data-quickstart-close]") || target === modal(documentRef)) {
    event.preventDefault();
    close(documentRef);
  }
}

function install(documentRef = document) {
  if (installed || !documentRef?.getElementById?.(MODAL_ID)) return false;
  installed = true;
  ensurePanel(documentRef);
  installDashboardBridge(documentRef);
  documentRef.addEventListener("click", (event) => handleClick(event, documentRef), true);
  documentRef.addEventListener("keydown", (event) => { if (event.key === "Escape" && isModalOpen(documentRef)) close(documentRef); });
  window.addEventListener("elyon:seller-authenticated", () => { if (isModalOpen(documentRef)) render(documentRef); });
  window.addEventListener("elyon:seller-product-selected", () => { if (isModalOpen(documentRef)) render(documentRef); });
  window.addEventListener("elyon:seller-dashboard-updated", () => { if (isModalOpen(documentRef)) render(documentRef); });
  if (isModalOpen(documentRef)) open({ manual: false, documentRef });
  return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.ElyonSellerQuickstart = { open, close, render, navigate, snapshot: () => dashboardSnapshotFromDocument(document) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => install(document), { once: true });
  else install(document);
}
