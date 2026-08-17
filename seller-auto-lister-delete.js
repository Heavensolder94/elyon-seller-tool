const PRODUCTS_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";
const BUTTON_ID = "sellerAutoDeleteTaskBtn";
const STYLE_ID = "sellerAutoDeleteTaskStyles";
const AUTO_LISTER_STATUSES = new Set([
  "seller_draft",
  "ready_for_manual_ebay_draft",
]);

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function sellerServerProduct(product = {}) {
  return object(product.rawServerProduct || product.raw || product);
}

function sellerProductIdentity(product = {}) {
  const server = sellerServerProduct(product);
  return text(
    product.sellerToolMasterProductId ||
    server.id ||
    server.companyOsProductId ||
    product.id ||
    server.supplier?.url ||
    product.supplierLink
  );
}

function productMatches(product, id) {
  if (!text(id)) return false;
  const server = sellerServerProduct(product);
  return [
    sellerProductIdentity(product),
    product.id,
    product.sellerToolMasterProductId,
    server.id,
    server.companyOsProductId,
  ].map(text).includes(text(id));
}

export function hasSellerAutoListerDraft(product = {}) {
  const local = object(product);
  const server = sellerServerProduct(local);
  const listing = object(server.listing || local.listing);
  return Object.keys(object(listing.autoListerDraft)).length > 0 ||
    Object.keys(object(server.autoListerDraft)).length > 0 ||
    Object.keys(object(local.autoListerDraft)).length > 0;
}

export function removeSellerAutoListerDraft(product = {}, now = new Date().toISOString()) {
  const local = object(product);
  if (!hasSellerAutoListerDraft(local)) return local;

  const server = sellerServerProduct(local);
  const listingSource = object(server.listing || local.listing);
  const {
    autoListerDraft: _removedListingDraft,
    ...listingWithoutDraft
  } = listingSource;
  const currentListingStatus = text(
    listingWithoutDraft.status || server.listingStatus || "draft"
  );
  const nextListingStatus = AUTO_LISTER_STATUSES.has(currentListingStatus)
    ? "draft"
    : currentListingStatus || "draft";
  const nextListing = {
    ...listingWithoutDraft,
    status: nextListingStatus,
    updatedAt: now,
  };

  const {
    autoListerDraft: _removedServerDraft,
    ...serverWithoutDraft
  } = server;
  const nextServer = {
    ...serverWithoutDraft,
    listing: nextListing,
    listingStatus: AUTO_LISTER_STATUSES.has(text(server.listingStatus))
      ? nextListingStatus
      : text(server.listingStatus || nextListingStatus),
    updatedAt: now,
  };

  const {
    autoListerDraft: _removedLocalDraft,
    ...localWithoutDraft
  } = local;
  return {
    ...localWithoutDraft,
    listing: nextListing,
    status: AUTO_LISTER_STATUSES.has(text(local.status))
      ? nextListingStatus
      : local.status,
    rawServerProduct: nextServer,
    updatedAt: now,
  };
}

function readProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function selectedProduct() {
  const products = readProducts();
  const selectedId = text(localStorage.getItem(SELECTED_KEY));
  return products.find((product) => productMatches(product, selectedId)) || products[0] || null;
}

function sellerProductPayload(product = {}) {
  const server = sellerServerProduct(product);
  return {
    ...server,
    listing: object(product.rawServerProduct?.listing || product.listing || server.listing),
    updatedAt: text(product.updatedAt || server.updatedAt) || new Date().toISOString(),
  };
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID}{border-color:rgba(239,68,68,.38);color:#fecaca;background:rgba(127,29,29,.2)}
    #${BUTTON_ID}:hover:not(:disabled){background:rgba(153,27,27,.34);border-color:rgba(248,113,113,.55)}
    #${BUTTON_ID}:disabled{opacity:.48;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}

function setAutoListerStatus(message, type = "") {
  const node = document.getElementById("sellerAutoStatus") || document.getElementById("sellerSellingStatusLine");
  if (!node) return;
  node.textContent = message;
  node.className = `seller-selling-statusline ${type}`.trim();
}

async function persistRemovedDraft(updated) {
  const response = await fetch("/api/products", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ product: sellerProductPayload(updated) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function deleteSelectedAutoListerTask() {
  const product = selectedProduct();
  if (!product || !hasSellerAutoListerDraft(product)) {
    setAutoListerStatus("Für dieses Produkt ist kein gespeicherter AutoLister-Auftrag vorhanden.", "bad");
    refresh();
    return false;
  }

  const server = sellerServerProduct(product);
  const title = text(server.title || product.title || product.name) || "Unbenanntes Produkt";
  const confirmed = window.confirm(
    `AutoLister-Auftrag für „${title}“ wirklich entfernen?\n\n` +
    "Das Produkt im Seller Product Master bleibt erhalten. Es wird nichts bei eBay gelöscht oder verändert."
  );
  if (!confirmed) return false;

  const button = document.getElementById(BUTTON_ID);
  if (button) button.disabled = true;
  const previousProducts = readProducts();
  const selectedId = sellerProductIdentity(product);
  const updated = removeSellerAutoListerDraft(product);
  const nextProducts = previousProducts.map((entry) => productMatches(entry, selectedId) ? updated : entry);
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(nextProducts));
  setAutoListerStatus("AutoLister-Auftrag wird entfernt …");

  try {
    await persistRemovedDraft(updated);
    window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
    window.ElyonSellerSellingFlow?.render?.();
    window.setTimeout(() => {
      setAutoListerStatus("AutoLister-Auftrag entfernt. Das Produkt im Seller Product Master bleibt erhalten.", "good");
      refresh();
    }, 0);
    return true;
  } catch (error) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(previousProducts));
    window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product } }));
    window.ElyonSellerSellingFlow?.render?.();
    window.setTimeout(() => {
      setAutoListerStatus(`Auftrag konnte nicht entfernt werden. Der lokale Stand wurde wiederhergestellt: ${error.message}`, "bad");
      refresh();
    }, 0);
    return false;
  }
}

function refresh() {
  installStyles();
  const root = document.getElementById("sellerAutoListerRoot");
  const actions = root?.querySelector(".seller-selling-toolhead .seller-selling-actions");
  if (!actions) return false;

  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = "secondary";
    button.addEventListener("click", deleteSelectedAutoListerTask);
    actions.prepend(button);
  }

  const product = selectedProduct();
  const hasDraft = Boolean(product && hasSellerAutoListerDraft(product));
  button.disabled = !hasDraft;
  button.textContent = hasDraft ? "🗑 Auftrag entfernen" : "Kein Auftrag gespeichert";
  button.title = hasDraft
    ? "Entfernt nur den gespeicherten AutoLister-Auftrag. Das Produkt bleibt erhalten."
    : "Für dieses Produkt ist noch kein AutoLister-Auftrag gespeichert.";
  return true;
}

let refreshScheduled = false;
function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  window.requestAnimationFrame(() => {
    refreshScheduled = false;
    refresh();
  });
}

function install() {
  refresh();
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("elyon:seller-product-selected", scheduleRefresh);
  window.addEventListener("elyon:runtime-group-loaded", scheduleRefresh);
  window.addEventListener("storage", (event) => {
    if ([PRODUCTS_KEY, SELECTED_KEY].includes(event.key)) scheduleRefresh();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.ElyonSellerAutoListerDelete = {
    install,
    refresh,
    removeSellerAutoListerDraft,
    hasSellerAutoListerDraft,
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}
