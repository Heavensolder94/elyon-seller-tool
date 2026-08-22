(() => {
  "use strict";

  const PRODUCTS_KEY = "elyonProducts";
  const SELECTED_KEY = "elyonSelectedSellerProductId";
  const EXPANDED_KEY = "elyonProductBoardExpandedCardsV2";
  const STYLE_ID = "elyonProductDeleteStyles";
  const DELETE_ALL_SELECTOR = "[data-elyon-delete-all-products]";
  const DELETE_ALL_TYPED_PHRASE = "ALLE LÖSCHEN";
  const busy = new Set();
  let deleteAllBusy = false;
  let observer = null;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();
  const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

  function readProducts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function replaceLocalProducts(nextProducts) {
    const normalized = Array.isArray(nextProducts) ? nextProducts : [];
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
    try {
      if (typeof products !== "undefined" && Array.isArray(products)) {
        products.splice(0, products.length, ...normalized);
      }
    } catch {}
  }

  function deepestRaw(value) {
    let current = object(value);
    let deepest = current;
    const seen = new Set();
    for (let index = 0; index < 8; index += 1) {
      if (!current || seen.has(current)) break;
      seen.add(current);
      deepest = current;
      const next = object(current.raw);
      if (!Object.keys(next).length) break;
      current = next;
    }
    return deepest;
  }

  function productIdentifiers(product = {}) {
    const local = object(product);
    const server = object(local.rawServerProduct || local.raw || local);
    const raw = deepestRaw(server);
    const supplier = object(server.supplier || local.supplier);
    return [...new Set([
      raw.sourceImportId,
      raw.companyOsProductId,
      server.sourceImportId,
      server.companyOsProductId,
      local.sourceImportId,
      local.companyOsProductId,
      local.sellerToolMasterProductId,
      server.id,
      local.id,
      supplier.url,
      server.supplierLink,
      local.supplierLink,
    ].map(text).filter(Boolean))];
  }

  function primaryDeleteId(product = {}) {
    return productIdentifiers(product)[0] || "";
  }

  function productMatches(product, identifier) {
    const wanted = text(identifier);
    return Boolean(wanted && productIdentifiers(product).includes(wanted));
  }

  function parseInlineId(button) {
    const handler = text(button?.getAttribute("onclick"));
    const match = handler.match(/removeProduct\s*\(\s*([\s\S]*?)\s*\)/i);
    if (!match) return "";
    return text(match[1]).replace(/^["']|["']$/g, "");
  }

  function cardTitle(card) {
    const title = text(card?.querySelector(".product-title, .kanban-mini-title")?.textContent);
    return title.replace(/^(?:Niedrig|Normal|Hoch|Dringend)\s*·\s*/i, "");
  }

  function findProduct(identifier, card = null) {
    const productsList = readProducts();
    const direct = productsList.find((product) => productMatches(product, identifier));
    if (direct) return direct;
    const title = cardTitle(card).toLocaleLowerCase("de-DE");
    if (!title) return null;
    return productsList.find((product) => {
      const name = text(product?.name || product?.title || product?.listingTitle).toLocaleLowerCase("de-DE");
      return name && (name === title || title.includes(name) || name.includes(title));
    }) || null;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-elyon-delete-product],[data-elyon-delete-all-products]{position:relative}
      [data-elyon-delete-product][aria-busy="true"],[data-elyon-delete-all-products][aria-busy="true"]{opacity:.65;cursor:wait!important}
      .elyon-delete-note{grid-column:1/-1;margin:0;padding:9px 11px;border-radius:12px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.16);color:#fecaca;font-size:11px;line-height:1.4}
      #productListTab #list>.product-card>.elyon-board-delete-quick{grid-column:1/-1;justify-self:end;width:auto;margin-top:-2px;padding:8px 11px;border-radius:11px;font-size:11px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fecaca}
      #productListTab #list>.product-card>.elyon-board-delete-quick:hover{background:rgba(239,68,68,.2);border-color:rgba(248,113,113,.45)}
      #productListTab .quick-actions>.elyon-delete-all-products{margin-left:auto;background:rgba(239,68,68,.16);border:1px solid rgba(248,113,113,.38);color:#fecaca}
      #productListTab .quick-actions>.elyon-delete-all-products:hover{background:rgba(239,68,68,.25);border-color:rgba(248,113,113,.58)}
      #productListTab .quick-actions>.elyon-delete-all-products:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none}
      @media(max-width:760px){#productListTab .quick-actions>.elyon-delete-all-products{flex:1 1 100%;margin-left:0}}
      @media(max-width:620px){#productListTab #list>.product-card>.elyon-board-delete-quick{justify-self:stretch;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function decorateDeleteButtons() {
    document.querySelectorAll('#productListTab button[onclick*="removeProduct("], #productListTab button[data-elyon-delete-product]').forEach((button) => {
      const identifier = button.dataset.elyonDeleteProduct || parseInlineId(button);
      if (identifier) button.dataset.elyonDeleteProduct = identifier;
      button.removeAttribute("onclick");
      button.type = "button";
      button.classList.add("danger");
      if (!/löschen/i.test(text(button.textContent))) button.textContent = "Löschen";
      button.title = "Lokale Seller-Arbeitskopie löschen; Company OS Product Master bleibt unverändert";
    });
  }

  function decorateDeleteAllButton() {
    const actions = document.querySelector("#productListTab .quick-actions");
    if (!actions) return;
    let button = actions.querySelector(`:scope > ${DELETE_ALL_SELECTOR}`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "danger elyon-delete-all-products";
      button.dataset.elyonDeleteAllProducts = "true";
      actions.appendChild(button);
    }
    const count = readProducts().length;
    if (!deleteAllBusy) button.textContent = "🗑️ Alles löschen";
    button.disabled = deleteAllBusy || count === 0;
    button.title = count
      ? `Alle ${count} lokalen Arbeitskopien löschen; Company OS bleibt unverändert`
      : "Keine Produkte zum Löschen vorhanden";
  }

  function decorateQuickDeleteButtons() {
    document.querySelectorAll("#productListTab #list > .product-card").forEach((card) => {
      if (card.classList.contains("small-card") || card.closest(".kanban-board, .kanban-column, .kanban-shell")) return;
      const original = card.querySelector(":scope > .actions button[data-elyon-delete-product]");
      if (!original?.dataset.elyonDeleteProduct) return;
      let quick = card.querySelector(":scope > .elyon-board-delete-quick");
      if (!quick) {
        quick = document.createElement("button");
        quick.type = "button";
        quick.className = "danger elyon-board-delete-quick";
        quick.textContent = "Artikel löschen";
        const actions = card.querySelector(":scope > .actions");
        card.insertBefore(quick, actions || null);
      }
      quick.dataset.elyonDeleteProduct = original.dataset.elyonDeleteProduct;
      quick.title = "Artikel dauerhaft löschen";
    });
  }

  function decorateActionHints() {
    document.querySelectorAll("#productListTab #list > .product-card > .actions").forEach((actions) => {
      if (actions.querySelector(":scope > .elyon-delete-note")) return;
      const note = document.createElement("p");
      note.className = "elyon-delete-note";
      note.textContent = "Löschen entfernt nach Bestätigung nur die lokale Seller-Arbeitskopie. Der kanonische Company-OS-Product-Master-Datensatz bleibt unverändert.";
      actions.appendChild(note);
    });
  }

  function decorate() {
    scheduled = false;
    observer?.disconnect();
    try {
      installStyles();
      decorateDeleteButtons();
      decorateDeleteAllButton();
      decorateQuickDeleteButtons();
      decorateActionHints();
    } finally {
      startObserver();
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function startObserver() {
    if (!document.body) return;
    if (!observer) observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function notify(message, error = false) {
    try {
      if (typeof window.toast === "function") {
        window.toast(message);
        return;
      }
    } catch {}
    if (error) window.alert(message);
  }

  function removeLocalProduct(product) {
    const identifiers = new Set(productIdentifiers(product));
    const next = readProducts().filter((entry) => !productIdentifiers(entry).some((id) => identifiers.has(id)));
    replaceLocalProducts(next);

    const selected = text(localStorage.getItem(SELECTED_KEY));
    if (identifiers.has(selected)) localStorage.removeItem(SELECTED_KEY);
  }

  function clearLocalProducts() {
    replaceLocalProducts([]);
    localStorage.removeItem(SELECTED_KEY);
    localStorage.removeItem(EXPANDED_KEY);
  }

  async function deleteProductReliable(identifier, button = null, card = null) {
    const product = findProduct(identifier, card);
    if (!product) {
      notify("Der Artikel konnte im aktuellen Product Board nicht eindeutig gefunden werden.", true);
      return false;
    }

    const deleteId = primaryDeleteId(product);
    if (!deleteId) {
      notify("Dem Artikel fehlt eine stabile Product-Master-ID. Löschen wurde aus Sicherheitsgründen abgebrochen.", true);
      return false;
    }
    if (busy.has(deleteId) || deleteAllBusy) return false;

    const label = text(product.name || product.title || product.listingTitle) || "diesen Artikel";
    const confirmed = window.confirm(`Lokale Arbeitskopie wirklich löschen?\n\n${label}\n\nDer kanonische Company-OS-Product-Master-Datensatz bleibt unverändert.`);
    if (!confirmed) return false;

    busy.add(deleteId);
    const previousLabel = text(button?.textContent) || "Löschen";
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Wird gelöscht …";
    }

    try {
      removeLocalProduct(product);
      card?.remove();
      window.dispatchEvent(new CustomEvent("elyon:products-updated", { detail: { product, reason: "deleted" } }));
      window.dispatchEvent(new CustomEvent("elyon:product-deleted", { detail: { product, deleteId } }));
      try {
        if (typeof window.render === "function") window.render();
        else if (typeof render === "function") render();
      } catch {}
      notify(`Lokale Arbeitskopie „${label}“ wurde gelöscht.`);
      return true;
    } catch (error) {
      notify(`Artikel wurde nicht gelöscht: ${error.message}`, true);
      return false;
    } finally {
      busy.delete(deleteId);
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = previousLabel;
      }
      scheduleDecorate();
    }
  }

  async function deleteAllProductsReliable(button = null) {
    const productsList = readProducts();
    if (!productsList.length) {
      notify("Im Product Board sind keine Produkte zum Löschen vorhanden.");
      scheduleDecorate();
      return false;
    }
    if (deleteAllBusy || busy.size) return false;

    const ids = productsList.map(primaryDeleteId);
    const missingIds = ids.filter((id) => !id).length;
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (missingIds || uniqueIds.length !== productsList.length) {
      notify("Nicht alle Produkte besitzen eine eindeutige Product-Master-ID. Alles löschen wurde aus Sicherheitsgründen abgebrochen.", true);
      return false;
    }

    const count = productsList.length;
    const confirmed = window.confirm(
      `Wirklich alle ${count} lokalen Arbeitskopien löschen?\n\nCompany OS Product Master bleibt unverändert. Dieser lokale Vorgang kann nicht rückgängig gemacht werden.`,
    );
    if (!confirmed) return false;

    const typed = window.prompt(`Sicherheitsbestätigung: Bitte exakt „${DELETE_ALL_TYPED_PHRASE}“ eingeben.`);
    if (text(typed).toLocaleUpperCase("de-DE") !== DELETE_ALL_TYPED_PHRASE) {
      notify("Alles löschen wurde abgebrochen.");
      return false;
    }

    deleteAllBusy = true;
    const previousLabel = text(button?.textContent) || "🗑️ Alles löschen";
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = `${count} Produkte werden gelöscht …`;
    }

    try {
      clearLocalProducts();
      document.querySelectorAll("#productListTab #list > .product-card, #productListTab #list > .kanban-shell").forEach((node) => node.remove());
      window.dispatchEvent(new CustomEvent("elyon:products-updated", {
        detail: { reason: "bulk_deleted", count, serverDeleted: 0 },
      }));
      window.dispatchEvent(new CustomEvent("elyon:products-bulk-deleted", { detail: { deleted: 0, localDeleted: count, bulk: true } }));
      try {
        if (typeof window.render === "function") window.render();
        else if (typeof render === "function") render();
      } catch {}

      notify(`Alle ${count} lokalen Arbeitskopien wurden gelöscht.`);
      return true;
    } catch (error) {
      notify(`Produkte wurden nicht gelöscht: ${error.message}`, true);
      return false;
    } finally {
      deleteAllBusy = false;
      if (button?.isConnected) {
        button.removeAttribute("aria-busy");
        button.textContent = previousLabel;
      }
      scheduleDecorate();
    }
  }

  function clickHandler(event) {
    const deleteAllButton = event.target?.closest?.(`#productListTab ${DELETE_ALL_SELECTOR}`);
    if (deleteAllButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      deleteAllProductsReliable(deleteAllButton);
      return;
    }

    const button = event.target?.closest?.('#productListTab button[data-elyon-delete-product], #productListTab button[onclick*="removeProduct("]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const identifier = button.dataset.elyonDeleteProduct || parseInlineId(button);
    deleteProductReliable(identifier, button, button.closest(".product-card, .kanban-mini-card"));
  }

  function install() {
    installStyles();
    document.addEventListener("click", clickHandler, true);
    startObserver();
    decorate();

    window.removeProduct = function removeProduct(id) {
      return deleteProductReliable(text(id));
    };
    window.elyonDeleteProduct = deleteProductReliable;
    window.elyonDeleteAllProducts = deleteAllProductsReliable;
    window.dispatchEvent(new CustomEvent("elyon:product-delete-ready"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
