import { extractPriceProvenance, enrichWorkingCopy } from "./seller-price-provenance-core.js";

const PANEL_ID = "elyonSellerPricePath";
const STYLE_ID = "elyonSellerPricePathStyles";
const LOCAL_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, currency = "EUR") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Nicht vorhanden";
  return parsed.toLocaleString("de-DE", { style: "currency", currency: currency || "EUR" });
}

function readCopies() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function selectedCopy() {
  const selectedId = text(localStorage.getItem(SELECTED_KEY));
  const copies = readCopies();
  return copies.find((entry) => text(entry.id) === selectedId || text(entry.sellerToolMasterProductId) === selectedId) || copies[0] || null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID}{margin:0 0 16px;padding:16px;border-radius:18px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(30,41,59,.86));border:1px solid rgba(96,165,250,.25);box-shadow:0 14px 38px rgba(0,0,0,.18)}
    #${PANEL_ID} h3{margin:0 0 5px;color:#f8fafc;font-size:16px}#${PANEL_ID} p{margin:0 0 12px;color:#cbd5e1;font-size:12px;line-height:1.5}
    .elyon-price-path-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.elyon-price-path-item{padding:10px;border-radius:13px;background:rgba(2,6,23,.5);border:1px solid rgba(148,163,184,.16);display:grid;gap:4px}.elyon-price-path-item span{color:#94a3b8;font-size:10px;font-weight:750}.elyon-price-path-item strong{color:#f8fafc;font-size:13px}.elyon-price-path-item small{color:#cbd5e1;font-size:9px;line-height:1.35}.elyon-price-path-item.final{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.08)}
    @media(max-width:850px){.elyon-price-path-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.elyon-price-path-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function panelMarkup(product) {
  const path = extractPriceProvenance(product || {});
  const safety = path.sellerValidationSuggestion
    ? `Seller-Sicherheitscheck: ${money(path.sellerValidationSuggestion, path.currency)}. Er überschreibt keinen bestätigten Preis.`
    : "Das Seller Tool prüft nur die Wirtschaftlichkeit und erzeugt keine konkurrierende Preisempfehlung.";
  return `
    <h3>Preisweg</h3>
    <p>Nova liefert nur eine vorläufige Produktidee. Company OS berechnet und bestätigt den Verkaufspreis. Das Seller Tool übernimmt ausschließlich den finalen Wert.</p>
    <div class="elyon-price-path-grid">
      <div class="elyon-price-path-item"><span>Einkaufspreis</span><strong>${escapeHtml(money(path.buyPrice, path.currency))}</strong><small>Bekannte Lieferantenkosten</small></div>
      <div class="elyon-price-path-item"><span>Nova-Preisidee</span><strong>${escapeHtml(money(path.novaPriceIdea, path.currency))}</strong><small>Vorläufig · nicht bindend</small></div>
      <div class="elyon-price-path-item"><span>Elyon-Empfehlung</span><strong>${escapeHtml(money(path.companyOsRecommendedPrice, path.currency))}</strong><small>In Company OS berechnet</small></div>
      <div class="elyon-price-path-item final"><span>Finaler Verkaufspreis</span><strong>${escapeHtml(money(path.finalSalePrice, path.currency))}</strong><small>${escapeHtml(path.finalSourceLabel)}</small></div>
    </div>
    <p style="margin-top:10px;margin-bottom:0">${escapeHtml(safety)}</p>
  `;
}

function render() {
  installStyles();
  const host = document.getElementById("sellerReadyRoot") || document.getElementById("ebayListingTab");
  if (!host) return false;
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    host.insertBefore(panel, host.firstChild);
  }
  panel.innerHTML = panelMarkup(selectedCopy());
  return true;
}

function enrichSelectedWorkingCopy() {
  const selectedId = text(localStorage.getItem(SELECTED_KEY));
  if (!selectedId) return null;
  const copies = readCopies();
  const index = copies.findIndex((entry) => text(entry.id) === selectedId || text(entry.sellerToolMasterProductId) === selectedId);
  if (index < 0) return null;
  const existing = copies[index];
  const enriched = enrichWorkingCopy(existing, existing.rawServerProduct || existing);
  copies[index] = enriched;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(copies));
  return enriched;
}

window.ElyonSellerPriceProvenance = Object.freeze({
  extract: extractPriceProvenance,
  enrichWorkingCopy,
  enrichSelectedWorkingCopy,
  panelMarkup,
  render,
});

window.addEventListener("elyon:seller-product-selected", () => {
  enrichSelectedWorkingCopy();
  window.setTimeout(render, 0);
});
window.addEventListener("elyon:runtime-group-loaded", (event) => {
  if (event.detail?.tabId === "ebayListingTab") window.setTimeout(render, 0);
});
window.addEventListener("storage", (event) => {
  if (event.key === LOCAL_KEY || event.key === SELECTED_KEY) render();
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
else render();
