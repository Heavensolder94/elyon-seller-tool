(() => {
  "use strict";

  const PRODUCTS_KEY = "elyonProducts";
  const STYLE_ID = "elyonButtonIntegrityStyles";
  const TOAST_ID = "elyonButtonIntegrityToast";
  const knownProductActions = new Set([
    "editProduct",
    "toggleShopifyCandidate",
    "duplicateProduct",
    "productDecisionReport",
    "stopProduct",
    "removeProduct",
    "prepareProductForEbayDraft",
    "triggerProductDecision",
  ]);
  const busyButtons = new WeakSet();
  let observer = null;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();
  const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

  function decodeHtml(value) {
    const area = document.createElement("textarea");
    area.innerHTML = text(value);
    return area.value;
  }

  function readProducts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function productIds(product = {}) {
    const local = object(product);
    const server = object(local.rawServerProduct || local.raw || local);
    return [
      local.id,
      local.sellerToolMasterProductId,
      local.sourceImportId,
      local.companyOsProductId,
      server.id,
      server.sourceImportId,
      server.companyOsProductId,
    ].map(text).filter(Boolean);
  }

  function nativeProductId(rawId) {
    const wanted = text(rawId);
    const product = readProducts().find((entry) => productIds(entry).includes(wanted));
    if (product && product.id !== undefined && product.id !== null) return product.id;
    return /^-?\d+(?:\.\d+)?$/.test(wanted) ? Number(wanted) : wanted;
  }

  function parseInlineAction(button) {
    const handler = text(button?.getAttribute("onclick"));
    const match = handler.match(/^\s*([A-Za-z_$][\w$]*)\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*$/);
    if (!match || !knownProductActions.has(match[1])) return null;
    let rawId = decodeHtml(match[2]);
    rawId = rawId.replace(/^['"]|['"]$/g, "").trim();
    return rawId ? { action: match[1], id: rawId } : null;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID}{position:fixed;right:18px;bottom:18px;z-index:100000;max-width:min(480px,calc(100vw - 30px));padding:13px 15px;border-radius:15px;background:#172554;border:1px solid rgba(96,165,250,.45);box-shadow:0 18px 60px rgba(0,0,0,.42);color:#dbeafe;font-size:13px;font-weight:800;line-height:1.45}
      #${TOAST_ID}.error{background:#450a0a;border-color:rgba(239,68,68,.55);color:#fecaca}
      #${TOAST_ID}[hidden]{display:none}
      [data-elyon-stable-action][aria-busy="true"]{opacity:.62;cursor:wait!important}
    `;
    document.head.appendChild(style);
  }

  function notify(message, error = false) {
    try {
      if (typeof window.toast === "function") {
        window.toast(message);
        return;
      }
    } catch {}
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.className = error ? "error" : "";
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.hidden = true; }, error ? 9000 : 5000);
  }

  function decorateProductButtons() {
    document.querySelectorAll("#productListTab button[onclick]").forEach((button) => {
      if (button.dataset.elyonStableAction) return;
      const parsed = parseInlineAction(button);
      if (!parsed) return;
      button.dataset.elyonStableAction = parsed.action;
      button.dataset.elyonStableId = parsed.id;
      button.removeAttribute("onclick");
      button.type = "button";
      button.title ||= `${text(button.textContent) || parsed.action} zuverlässig ausführen`;
    });
  }

  function startObserver() {
    if (!document.body) return;
    if (!observer) observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function decorate() {
    scheduled = false;
    observer?.disconnect();
    try {
      installStyles();
      decorateProductButtons();
    } finally {
      startObserver();
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function resolveHandler(action) {
    if (action === "removeProduct" && typeof window.elyonDeleteProduct === "function") {
      return window.elyonDeleteProduct;
    }
    return typeof window[action] === "function" ? window[action] : null;
  }

  async function runProductAction(button) {
    if (busyButtons.has(button) || button.disabled) return;
    const action = text(button.dataset.elyonStableAction);
    const rawId = text(button.dataset.elyonStableId);
    const handler = resolveHandler(action);
    if (!handler) {
      notify(`Aktion „${action}“ ist nicht geladen. Bitte Seite mit Strg + F5 neu laden.`, true);
      return;
    }

    busyButtons.add(button);
    const previousDisabled = button.disabled;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const nativeId = nativeProductId(rawId);
      if (action === "removeProduct" && handler === window.elyonDeleteProduct) {
        await handler(rawId, button, button.closest(".product-card, .kanban-mini-card"));
      } else {
        await handler(nativeId);
      }
    } catch (error) {
      console.error("Elyon button action failed", { action, rawId, error });
      notify(`${text(button.textContent) || action} fehlgeschlagen: ${error?.message || error}`, true);
    } finally {
      busyButtons.delete(button);
      if (button.isConnected) {
        button.disabled = previousDisabled;
        button.removeAttribute("aria-busy");
      }
    }
  }

  function firstExisting(ids) {
    for (const id of ids) {
      const target = document.getElementById(id);
      if (target && !target.disabled) return target;
    }
    return null;
  }

  function clickTarget(ids, label) {
    const target = firstExisting(ids);
    if (!target) {
      notify(`${label}: zugehörige Funktion ist in dieser Ansicht nicht verfügbar.`, true);
      return false;
    }
    target.click();
    return true;
  }

  function runHubAction(action) {
    if (action === "company-refresh") return clickTarget(["elyonCompanyOsProductImportRefresh"], "Company OS aktualisieren");
    if (action === "chrome-refresh") return clickTarget(["browserImportsRefreshBtn"], "Chrome/Nova aktualisieren");
    if (action === "file-import") return clickTarget(["localCsvImportBtn", "importBtn"], "Dateiimport");
    if (action === "new-product") return clickTarget(["newProductBtn"], "Neues Produkt");
    if (action === "strong-products") return clickTarget(["winnerFilterBtn"], "Starke Kandidaten");
    if (action === "kanban") return clickTarget(["toggleViewBtn"], "Kanban/Liste");
    if (action === "sheet-import") {
      const opened = clickTarget(["importBtn"], "Google-Sheets-Import");
      if (opened) setTimeout(() => clickTarget(["googleCsvImportBtn"], "Google-Sheets-Import"), 80);
      return opened;
    }
    return false;
  }

  function captureClick(event) {
    const productButton = event.target?.closest?.("#productListTab button[data-elyon-stable-action]");
    if (productButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      runProductAction(productButton);
      return;
    }

    const hubButton = event.target?.closest?.("#elyonProductsHub button[data-hub-action]");
    if (hubButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      runHubAction(text(hubButton.dataset.hubAction));
    }
  }

  function install() {
    installStyles();
    document.addEventListener("click", captureClick, true);
    startObserver();
    decorate();
    window.ElyonButtonIntegrity = {
      refresh: scheduleDecorate,
      runHubAction,
      nativeProductId,
      actions: [...knownProductActions],
    };
    window.dispatchEvent(new CustomEvent("elyon:button-integrity-ready"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
