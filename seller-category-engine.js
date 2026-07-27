import {
  buildSellerListingView,
  sellerProductIdentity,
  sellerProductPayload,
} from "/seller-selling-flow-core.js";
import {
  categoryNeedsResolution,
  categoryQueryFromProduct,
  categoryState,
  mergeProductWithCategory,
  normalizeCategoryResolution,
} from "/seller-category-engine-core.js";

const PRODUCTS_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";
const STYLE_ID = "elyonSharedCategoryEngineStyles";
const CHOOSER_ID = "elyonCategoryChooser";
const runtime = new Map();
const attempted = new Set();
let observer = null;
let decorationQueued = false;
let backfillQueued = false;
let backfillRunning = false;
let taxonomyUnavailable = false;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const esc = (value) => text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function readProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function productMatches(product, id) {
  if (!id) return false;
  const server = object(product?.rawServerProduct || product?.raw || product);
  return [sellerProductIdentity(product), product?.id, product?.sellerToolMasterProductId, server.id, server.companyOsProductId]
    .map(text)
    .includes(text(id));
}

function selectedProduct() {
  const products = readProducts();
  const selectedId = text(localStorage.getItem(SELECTED_KEY));
  return products.find((product) => productMatches(product, selectedId)) || products[0] || null;
}

function replaceStoredProduct(updated) {
  const id = sellerProductIdentity(updated);
  const products = readProducts();
  const next = products.map((product) => productMatches(product, id) ? updated : product);
  if (!next.some((product) => productMatches(product, id))) next.unshift(updated);
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
}

async function persistProduct(updated) {
  replaceStoredProduct(updated);
  const response = await fetch("/api/products", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ product: sellerProductPayload(updated) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

function runtimeState(product) {
  return runtime.get(sellerProductIdentity(product)) || {};
}

function setRuntime(product, patch) {
  const id = sellerProductIdentity(product);
  runtime.set(id, { ...runtime.get(id), ...patch });
  scheduleDecoration();
}

async function taxonomyFetch(params) {
  const response = await fetch(`/api/ebay-taxonomy?${new URLSearchParams(params)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .sce-id-internal{display:none!important}
    .sce-category-control{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:7px 0 13px;padding:11px 12px;border-radius:15px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.18)}
    .sce-category-control strong{display:block;font-size:13px;color:#dbeafe}.sce-category-control small{display:block;margin-top:3px;color:#94a3b8;font-size:11px;line-height:1.4}.sce-category-control button{padding:8px 10px;font-size:11px;border-radius:11px}
    .sce-category-control.loading{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.08)}.sce-category-control.error{border-color:rgba(239,68,68,.28);background:rgba(239,68,68,.08)}
    .sce-board-category{cursor:pointer}.sce-board-category.pending{color:#93c5fd;border-color:rgba(96,165,250,.2)}
    .sce-chooser-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px;background:rgba(2,6,23,.78);backdrop-filter:blur(8px)}
    .sce-chooser{width:min(760px,96vw);max-height:88vh;overflow:auto;padding:20px;border-radius:24px;background:#0f172a;border:1px solid rgba(148,163,184,.24);box-shadow:0 28px 90px rgba(0,0,0,.55)}
    .sce-chooser-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sce-chooser-head h2{margin:0 0 5px}.sce-chooser-head p{margin:0;color:#94a3b8;font-size:12px;line-height:1.45}.sce-chooser-head button{padding:8px 11px}
    .sce-chooser-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;margin-top:15px}.sce-chooser-search input{margin:0}.sce-chooser-results{display:grid;gap:8px;margin-top:13px}
    .sce-choice{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;padding:12px 13px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09)}.sce-choice strong{display:block}.sce-choice small{display:block;margin-top:4px;color:#94a3b8;font-weight:500;line-height:1.4}.sce-choice span:last-child{color:#bfdbfe;font-size:12px}
    .sce-chooser-status{margin-top:12px;padding:11px 12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1;font-size:12px}.sce-chooser-status.error{color:#fecaca;border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.08)}
    @media(max-width:620px){.sce-chooser-search{grid-template-columns:1fr}.sce-choice{grid-template-columns:1fr}.sce-category-control{align-items:flex-start}}
  `;
  document.head.appendChild(style);
}

function categoryMessage(product) {
  const state = categoryState(product);
  const current = runtimeState(product);
  if (current.loading) return { cls: "loading", title: "Kategorie wird automatisch ermittelt …", detail: "Elyon gleicht Titel und Produktdaten mit der offiziellen eBay-Taxonomie ab." };
  if (current.error) return { cls: "error", title: "Kategorie konnte noch nicht ermittelt werden", detail: `${current.error} Du kannst weiterarbeiten und die Suche erneut starten.` };
  if (state.valid) {
    const path = Array.isArray(state.metadata?.path) ? state.metadata.path.filter(Boolean).join(" › ") : "";
    return { cls: "ready", title: state.categoryName || "eBay-Kategorie automatisch hinterlegt", detail: path || "Die technische Kategorie-ID ist intern gespeichert und muss nicht eingegeben werden." };
  }
  return { cls: "pending", title: "Noch keine eBay-Kategorie", detail: "Sie wird automatisch aus Titel und Produktdaten ermittelt. Keine Zahleneingabe erforderlich." };
}

function setInputValue(input, value) {
  if (!input || text(input.value) === text(value)) return;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function hideIdField(input) {
  if (!input) return;
  input.readOnly = true;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  const wrapper = input.closest(".row > div, .svd-row > div, .seller-selling-box > div, .settings-dropdown-content > div");
  if (wrapper) wrapper.classList.add("sce-id-internal");
  else input.classList.add("sce-id-internal");
}

function controlFor(input, product) {
  const key = input.id || input.name || "category";
  let control = input.parentElement?.querySelector(`:scope > [data-sce-control-for="${CSS.escape(key)}"]`);
  if (!control) {
    control = document.createElement("div");
    control.dataset.sceControlFor = key;
    input.insertAdjacentElement("afterend", control);
  }
  const message = categoryMessage(product);
  control.className = `sce-category-control ${message.cls}`;
  control.innerHTML = `<span><strong>${esc(message.title)}</strong><small>${esc(message.detail)}</small></span><button type="button" class="secondary" data-sce-action="choose">Kategorie ändern</button>`;
}

function decorateCategoryFields() {
  const product = selectedProduct();
  if (!product) return;
  const state = categoryState(product);

  const idInputs = new Set([
    document.getElementById("sellerAutoCategoryId"),
    ...document.querySelectorAll('input[id*="CategoryId" i],input[name*="categoryId" i],input[id*="ebayCategoryId" i],input[name*="ebayCategoryId" i]'),
  ].filter(Boolean));
  document.querySelectorAll("label").forEach((label) => {
    if (/kategorie[- ]?id/i.test(text(label.textContent))) {
      const input = label.parentElement?.querySelector("input");
      if (input) idInputs.add(input);
    }
  });
  idInputs.forEach((input) => {
    setInputValue(input, state.categoryId);
    hideIdField(input);
  });

  const nameInputs = [
    document.getElementById("sellerAutoCategoryName"),
    document.getElementById("svdCategory"),
    ...document.querySelectorAll('input[id*="CategoryName" i],input[name*="categoryName" i]'),
  ].filter(Boolean);
  [...new Set(nameInputs)].forEach((input) => {
    input.readOnly = true;
    input.placeholder = "Wird automatisch ermittelt";
    setInputValue(input, state.categoryName);
    controlFor(input, product);
  });

  const taxonomyMetric = document.getElementById("salpTaxonomyCategory");
  if (taxonomyMetric) {
    taxonomyMetric.textContent = state.categoryName || (runtimeState(product).loading ? "wird ermittelt" : "offen");
    taxonomyMetric.title = "Die technische eBay-Kategorie-ID wird intern verwaltet.";
  }
  document.querySelectorAll(".salp-result small").forEach((node) => {
    node.textContent = text(node.textContent).replace(/^ID\s+\d+\s*·?\s*/i, "");
  });
}

function cardProductId(card) {
  const aiButton = card.querySelector('[id^="productAiBtn_"]');
  if (aiButton?.id) return aiButton.id.replace(/^productAiBtn_/, "");
  const action = [...card.querySelectorAll("button[onclick]")].find((button) => /(?:editProduct|prepareProductForEbayDraft|removeProduct|duplicateProduct)\s*\(/.test(text(button.getAttribute("onclick"))));
  const match = text(action?.getAttribute("onclick")).match(/\((?:'|")?([^)'"\s]+)(?:'|")?\)/);
  return match ? match[1] : "";
}

function decorateProductBoard() {
  const products = readProducts();
  document.querySelectorAll(".product-card").forEach((card) => {
    const id = cardProductId(card);
    const product = products.find((entry) => productMatches(entry, id));
    if (!product) return;
    const state = categoryState(product);
    const current = runtimeState(product);
    const row = card.querySelector(".pill-row");
    if (!row) return;
    let badge = row.querySelector(":scope > .sce-board-category");
    if (!badge) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = "pill sce-board-category";
      badge.dataset.sceAction = "choose";
      badge.dataset.sceProductId = sellerProductIdentity(product);
      row.appendChild(badge);
    }
    badge.classList.toggle("pending", !state.valid);
    badge.textContent = current.loading ? "🏷️ Kategorie wird ermittelt" : state.categoryName ? `🏷️ ${state.categoryName}` : "🏷️ Kategorie automatisch";
    badge.title = state.valid ? "Kategorie anzeigen oder ändern" : "Kategorie jetzt automatisch ermitteln";
  });
}

function decorate() {
  decorationQueued = false;
  installStyles();
  decorateCategoryFields();
  decorateProductBoard();
}

function scheduleDecoration() {
  if (decorationQueued) return;
  decorationQueued = true;
  requestAnimationFrame(decorate);
}

async function applyResolution(product, resolution, { automatic = true } = {}) {
  const normalized = normalizeCategoryResolution({ ...resolution, automatic });
  if (!normalized.valid) throw new Error("eBay hat keine verwendbare Kategorie geliefert.");
  const updated = mergeProductWithCategory(product, normalized);
  replaceStoredProduct(updated);
  setRuntime(updated, { loading: false, error: "", resolvedAt: new Date().toISOString() });
  try {
    await persistProduct(updated);
  } catch (error) {
    setRuntime(updated, { error: `Lokal gespeichert; Server-Synchronisierung offen: ${error.message}` });
  }
  window.dispatchEvent(new CustomEvent("elyon:category-resolved", { detail: { product: updated, category: normalized } }));
  window.dispatchEvent(new CustomEvent("elyon:products-updated", { detail: { product: updated, reason: "category_resolved" } }));
  window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
  scheduleDecoration();
  return updated;
}

async function resolveProduct(product, { force = false } = {}) {
  if (!product) return null;
  const id = sellerProductIdentity(product);
  const query = categoryQueryFromProduct(product);
  const key = `${id}:${query.toLowerCase()}`;
  if (!force && (!categoryNeedsResolution(product) || attempted.has(key) || taxonomyUnavailable)) return product;
  if (query.length < 2) {
    setRuntime(product, { loading: false, error: "Für die automatische Zuordnung fehlt ein verwertbarer Produkttitel." });
    return product;
  }
  attempted.add(key);
  setRuntime(product, { loading: true, error: "" });
  try {
    const data = await taxonomyFetch({ action: "resolve", q: query });
    return await applyResolution(product, { ...data.category, ...data.metadata, query: data.query, source: "ebay_taxonomy" }, { automatic: true });
  } catch (error) {
    if (error.status === 503 || error.code === "ebay_app_credentials_missing") taxonomyUnavailable = true;
    setRuntime(product, { loading: false, error: error.message });
    return product;
  }
}

function scheduleBackfill() {
  if (backfillQueued || backfillRunning || taxonomyUnavailable) return;
  backfillQueued = true;
  setTimeout(runBackfill, 180);
}

async function runBackfill() {
  backfillQueued = false;
  if (backfillRunning || taxonomyUnavailable) return;
  backfillRunning = true;
  try {
    for (const product of readProducts().filter(categoryNeedsResolution).slice(0, 30)) {
      await resolveProduct(product);
      if (taxonomyUnavailable) break;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  } finally {
    backfillRunning = false;
    scheduleDecoration();
  }
}

function chooserProduct(productId = "") {
  const products = readProducts();
  return products.find((product) => productMatches(product, productId)) || selectedProduct();
}

function chooserStatus(message, error = false) {
  const node = document.getElementById("sceChooserStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `sce-chooser-status ${error ? "error" : ""}`.trim();
}

async function searchChooser() {
  const input = document.getElementById("sceChooserQuery");
  const results = document.getElementById("sceChooserResults");
  const query = text(input?.value);
  if (query.length < 2) return chooserStatus("Bitte mindestens zwei Zeichen eingeben.", true);
  results.innerHTML = '<div class="sce-chooser-status">eBay-Kategorien werden gesucht …</div>';
  try {
    const data = await taxonomyFetch({ action: "suggestions", q: query });
    results.innerHTML = (data.suggestions || []).map((item) => {
      const path = [...(item.ancestors || []).map((entry) => entry.categoryName), item.categoryName].filter(Boolean).join(" › ");
      return `<button type="button" class="sce-choice" data-sce-choice="${esc(item.categoryId)}" data-sce-name="${esc(item.categoryName)}" data-sce-ancestors="${esc(JSON.stringify(item.ancestors || []))}"><span><strong>${esc(item.categoryName)}</strong><small>${esc(path)}</small></span><span>Auswählen →</span></button>`;
    }).join("") || '<div class="sce-chooser-status error">Keine passende Kategorie gefunden. Suchbegriff präzisieren.</div>';
    chooserStatus(`${data.count || 0} offizielle eBay-Vorschläge. Wähle nach Namen – die Nummer wird intern übernommen.`);
  } catch (error) {
    results.innerHTML = "";
    chooserStatus(error.message, true);
  }
}

function openChooser(product) {
  if (!product) return;
  document.getElementById(CHOOSER_ID)?.remove();
  const query = categoryQueryFromProduct(product);
  const state = categoryState(product);
  const backdrop = document.createElement("div");
  backdrop.id = CHOOSER_ID;
  backdrop.className = "sce-chooser-backdrop";
  backdrop.dataset.productId = sellerProductIdentity(product);
  backdrop.innerHTML = `<section class="sce-chooser" role="dialog" aria-modal="true" aria-labelledby="sceChooserTitle"><div class="sce-chooser-head"><div><h2 id="sceChooserTitle">eBay-Kategorie auswählen</h2><p>Elyon schlägt die Kategorie automatisch vor. Du wählst nur den Namen; die technische Nummer und Pflichtmerkmale werden intern übernommen.</p></div><button type="button" class="secondary" data-sce-action="close">Schließen</button></div><div class="sce-category-control ready"><span><strong>${esc(state.categoryName || "Noch keine Kategorie")}</strong><small>${state.valid ? "Aktuell im Product Master gespeichert." : "Noch nicht zugeordnet."}</small></span><button type="button" data-sce-action="automatic">Besten Vorschlag übernehmen</button></div><div class="sce-chooser-search"><input id="sceChooserQuery" value="${esc(query)}" placeholder="Produktbezeichnung"><button type="button" id="sceChooserSearch">Kategorien suchen</button></div><div id="sceChooserStatus" class="sce-chooser-status">Suche nach Produktnamen; keine Kategorie-ID eingeben.</div><div id="sceChooserResults" class="sce-chooser-results"></div></section>`;
  document.body.appendChild(backdrop);
  setTimeout(searchChooser, 0);
}

async function chooseCategory(button) {
  const backdrop = document.getElementById(CHOOSER_ID);
  const product = chooserProduct(backdrop?.dataset.productId);
  if (!product) return;
  const categoryId = text(button.dataset.sceChoice);
  const categoryName = text(button.dataset.sceName);
  let ancestors = [];
  try { ancestors = JSON.parse(button.dataset.sceAncestors || "[]"); } catch {}
  chooserStatus(`${categoryName} wird mit den eBay-Pflichtmerkmalen geladen …`);
  try {
    const metadata = await taxonomyFetch({ action: "aspects", categoryId });
    await applyResolution(product, { categoryId, categoryName, ancestors, ...metadata, query: text(document.getElementById("sceChooserQuery")?.value), source: "ebay_taxonomy_manual_choice" }, { automatic: false });
    document.getElementById(CHOOSER_ID)?.remove();
  } catch (error) {
    chooserStatus(error.message, true);
  }
}

function bindEvents() {
  if (document.documentElement.dataset.elyonCategoryEngineBound === "1") return;
  document.documentElement.dataset.elyonCategoryEngineBound = "1";
  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-sce-action]");
    if (action) {
      const type = action.dataset.sceAction;
      if (type === "close") document.getElementById(CHOOSER_ID)?.remove();
      if (type === "choose") openChooser(chooserProduct(action.dataset.sceProductId));
      if (type === "automatic") {
        const product = chooserProduct(document.getElementById(CHOOSER_ID)?.dataset.productId);
        chooserStatus("Der beste offizielle eBay-Vorschlag wird übernommen …");
        const updated = await resolveProduct(product, { force: true });
        if (categoryState(updated).valid) document.getElementById(CHOOSER_ID)?.remove();
        else chooserStatus(runtimeState(product).error || "Kategorie konnte nicht ermittelt werden.", true);
      }
      return;
    }
    if (event.target.closest("#sceChooserSearch")) return searchChooser();
    const choice = event.target.closest("[data-sce-choice]");
    if (choice) return chooseCategory(choice);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.getElementById(CHOOSER_ID)?.remove();
    if (event.key === "Enter" && event.target?.id === "sceChooserQuery") {
      event.preventDefault();
      searchChooser();
    }
  });
}

function observe() {
  if (observer || !document.body) return;
  observer = new MutationObserver(scheduleDecoration);
  observer.observe(document.body, { childList: true, subtree: true });
}

function install() {
  installStyles();
  bindEvents();
  observe();
  scheduleDecoration();
  scheduleBackfill();
  window.elyonCategoryEngine = {
    resolveSelected: () => resolveProduct(selectedProduct(), { force: true }),
    chooseSelected: () => openChooser(selectedProduct()),
    state: () => categoryState(selectedProduct() || {}),
  };
  window.dispatchEvent(new CustomEvent("elyon:category-engine-ready"));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();

["elyon:products-updated", "elyon:seller-product-selected", "elyon:company-os-inbox-updated"].forEach((name) => {
  window.addEventListener(name, () => {
    scheduleDecoration();
    scheduleBackfill();
  });
});
window.addEventListener("storage", (event) => {
  if (!event.key || event.key === PRODUCTS_KEY || event.key === SELECTED_KEY) {
    scheduleDecoration();
    scheduleBackfill();
  }
});
