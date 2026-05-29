import { DEFAULT_SECURITY_STATE, getSecurityLabel, getSecurityState } from "../shared/security.js";

function safe(value, fallback = "-") {
  if (value == null || value === "") return fallback;
  return String(value);
}

function escapeHtml(value) {
  return safe(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function card(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

async function sendMessage(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function loadState() {
  const result = await chrome.storage.local.get([
    "elyon_current_product",
    "elyon_extension_history",
    "elyon_manual_captures",
    "elyon_aliexpress_variant_cache",
    "elyon_platform_variant_cache"
  ]).catch(() => ({}));
  const security = await getSecurityState().catch(() => DEFAULT_SECURITY_STATE);
  return { result, security };
}

function renderProduct(product) {
  const el = document.getElementById("productView");
  if (!el) return;
  el.innerHTML = [
    card("Titel", product?.title || product?.elyonProduct?.identity?.title),
    card("Preis", [product?.price, product?.currency].filter(Boolean).join(" ")),
    card("Plattform", product?.detectedPlatform || product?.elyonProduct?.meta?.detectedPlatform),
    card("URL", product?.url || product?.elyonProduct?.meta?.sourceUrl),
    card("Status", product?.localStatus || "Draft / Review erforderlich")
  ].join("");
}

function renderAnalysis(product) {
  const el = document.getElementById("analysisView");
  if (!el) return;
  const queue = product?.elyonProduct?.workflow?.analysisQueue || {};
  el.innerHTML = [
    card("Nachfrage", "Vorbereitet"),
    card("Konkurrenz", "Vorbereitet"),
    card("Risiko", queue.soulGuard || "pending"),
    card("Lieferzeit", product?.elyonProduct?.availability?.deliveryText || product?.shipping?.deliveryTime),
    card("KI Queue", Object.entries(queue).map(([key, value]) => `${key}: ${value}`).join(" | "))
  ].join("");
}

function renderSupplier(product) {
  const el = document.getElementById("supplierView");
  if (!el) return;
  const supplier = product?.elyonProduct?.supplier || {};
  el.innerHTML = [
    card("Supplier", supplier.supplierName || product?.supplier),
    card("Store", supplier.storeName),
    card("Rating", supplier.supplierRating),
    card("Warehouse", supplier.warehouse),
    card("Shipping", Array.isArray(supplier.shippingMethods) ? supplier.shippingMethods.join(", ") : "")
  ].join("");
}

function renderVariants(product, storage) {
  const el = document.getElementById("variantsView");
  if (!el) return;
  const variants = product?.platformVariants || product?.aliexpressVariants || product?.elyonProduct?.variants || {};
  const groups = Array.isArray(variants.variantGroups) ? variants.variantGroups : [];
  const items = Array.isArray(variants.variantItems) ? variants.variantItems : [];
  el.innerHTML = [
    card("Gruppen", groups.length),
    card("Items", items.length),
    card("Auswahl", Array.isArray(variants.selectedCombination?.labels) ? variants.selectedCombination.labels.join(" | ") : "-"),
    ...groups.slice(0, 12).map((group) => card(group.name || "Variante", (group.options || []).map((option) => option.label).filter(Boolean).join(", ")))
  ].join("");
}

function renderHistory(storage) {
  const el = document.getElementById("historyView");
  if (!el) return;
  const history = Array.isArray(storage.elyon_extension_history) ? storage.elyon_extension_history : [];
  el.innerHTML = history.slice(0, 20).map((item) => card(item.title || "Ohne Titel", item.url || item.updatedAt)).join("") || card("History", "Noch leer");
}

function renderNotes(storage) {
  const el = document.getElementById("notesView");
  if (!el) return;
  const captures = Array.isArray(storage.elyon_manual_captures) ? storage.elyon_manual_captures : [];
  el.innerHTML = captures.slice(0, 30).map((item) => card(item.type || "Notiz", item.text)).join("") || card("Notizen", "Noch keine manuellen Captures");
}

function renderSecurity(security) {
  const el = document.getElementById("securityView");
  const badge = document.getElementById("safeBadge");
  if (badge) badge.textContent = getSecurityLabel(security);
  if (!el) return;
  el.innerHTML = [
    card("Security Mode", security.securityMode ? "aktiv" : "inaktiv"),
    card("Sandbox", security.sandboxMode ? "aktiv" : "inaktiv"),
    card("Autonomie", security.autonomyLocked ? "gesperrt" : "frei"),
    card("Live Aktionen", "Blockiert: Bestellung, Warenkorb, Listing, Nachrichten"),
    card("Hinweis", "Nur sichtbare Produktdaten. Keine Cookies, keine Zahlungsdaten.")
  ].join("");
}

async function prepareWorkflow(agentId) {
  const { result } = await loadState();
  const product = result.elyon_current_product || {};
  const response = await sendMessage({
    type: "ELYON_RUN_AGENT_ANALYSIS",
    agentId,
    product,
    context: {
      title: `${agentId}: ${product.title || "Produktanalyse vorbereitet"}`,
      url: product.url || "",
      notes: "Aus Sidepanel analysiert. Keine Live-Aktion."
    }
  });
  return response;
}

async function render() {
  const { result, security } = await loadState();
  const product = result.elyon_current_product || {};
  renderProduct(product);
  renderAnalysis(product);
  renderSupplier(product);
  renderVariants(product, result);
  renderHistory(result);
  renderNotes(result);
  renderSecurity(security);
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((entry) => entry.classList.toggle("active", entry === button));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${button.dataset.tab}`));
  });
});

document.querySelectorAll("[data-workflow]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.textContent = "Analyse läuft";
    const result = await prepareWorkflow(button.dataset.workflow);
    button.textContent = result?.ok ? "Analyse fertig" : "Vorbereitet";
    await render();
  });
});

void render();
