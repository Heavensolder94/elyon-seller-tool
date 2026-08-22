import {
  buildSellerListingView,
  sellerProductIdentity,
  sellerProductPayload,
} from "/seller-selling-flow-core.js";
import {
  buildAdvancedAutoListerState,
  buildAdvancedChecks,
  buildParityDraft,
  mergeProductWithParityDraft,
  cleanAspects,
} from "/seller-auto-lister-parity-core.js";

const PRODUCTS_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";
const UI_KEY = "elyon_seller_auto_lister_parity_v1";
let categoryMetadata = null;
let aiPrepared = false;
let aiModel = "";
let currentProduct = null;
let observerScheduled = false;

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
  const server = object(product.rawServerProduct || product.raw || product);
  return [sellerProductIdentity(product), product.id, product.sellerToolMasterProductId, server.id, server.companyOsProductId].map(text).includes(text(id));
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
  window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
  return { ok: true, mode: "local_working_copy", product: updated };
}

function readUi() {
  try { return object(JSON.parse(localStorage.getItem(UI_KEY) || "{}")); } catch { return {}; }
}

function saveUi(patch = {}) {
  localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch, updatedAt: new Date().toISOString() }));
}

function installStyles() {
  if (document.getElementById("sellerAutoListerParityStyles")) return;
  const style = document.createElement("style");
  style.id = "sellerAutoListerParityStyles";
  style.textContent = `
    .salp-shell{margin-top:16px;padding:17px;border-radius:22px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.1)}
    .salp-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}.salp-head h3{margin:0 0 5px}.salp-head p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.5;max-width:780px}.salp-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}.salp-tabs button{padding:9px 11px;font-size:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}.salp-tabs button.active{background:linear-gradient(135deg,#2563eb,#7c3aed)}.salp-panel{display:none}.salp-panel.active{display:block}.salp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.salp-card{padding:14px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}.salp-card h4{margin:0 0 9px;color:#bfdbfe}.salp-actions{display:flex;gap:7px;flex-wrap:wrap}.salp-results{display:grid;gap:7px;margin-top:10px}.salp-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}.salp-result strong{display:block;font-size:12px}.salp-result small{display:block;color:#94a3b8;margin-top:2px}.salp-aspects{display:grid;gap:7px}.salp-aspect{padding:9px 10px;border-radius:13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.salp-aspect strong{display:block;font-size:12px}.salp-aspect small{color:#94a3b8}.salp-aspect.required{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.07)}.salp-checks{display:grid;gap:7px}.salp-check{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.salp-check>span:first-child{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:rgba(239,68,68,.13);color:#fecaca;font-weight:900}.salp-check.ok>span:first-child{background:rgba(34,197,94,.13);color:#bbf7d0}.salp-check strong{display:block;font-size:12px}.salp-check small{display:block;color:#94a3b8;margin-top:2px;line-height:1.35}.salp-check em{font-style:normal;font-size:10px;color:#cbd5e1}.salp-status{margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1;font-size:11px;line-height:1.45}.salp-status.good{color:#bbf7d0;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.08)}.salp-status.bad{color:#fecaca;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08)}.salp-lock{padding:12px 14px;border-radius:16px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fde68a;font-size:12px;line-height:1.5}.salp-metric{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.salp-metric div{padding:10px;border-radius:13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.salp-metric small{display:block;color:#94a3b8}.salp-metric strong{display:block;margin-top:4px}.salp-hidden{display:none!important}@media(max-width:820px){.salp-grid{grid-template-columns:1fr}.salp-metric{grid-template-columns:1fr}.salp-check{grid-template-columns:28px minmax(0,1fr)}.salp-check em{grid-column:2}}
  `;
  document.head.appendChild(style);
}

function field(id) {
  return text(document.getElementById(id)?.value);
}

function checkBox(id) {
  return document.getElementById(id)?.checked === true;
}

function setStatus(message, type = "") {
  const node = document.getElementById("salpStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `salp-status ${type}`.trim();
}

function currentSpecifics() {
  try {
    const parsed = JSON.parse(field("sellerAutoSpecifics") || "{}");
    return cleanAspects(parsed);
  } catch {
    throw new Error("Artikelmerkmale sind kein gültiges JSON-Objekt.");
  }
}

function complianceFromUi() {
  return {
    gpsrStatus: field("salpGpsrStatus"),
    manufacturer: {
      companyName: field("salpManufacturerName"),
      addressLine1: field("salpManufacturerAddress"),
      city: field("salpManufacturerCity"),
      postalCode: field("salpManufacturerPostal"),
      country: field("salpManufacturerCountry").toUpperCase(),
      email: field("salpManufacturerEmail"),
      phone: field("salpManufacturerPhone"),
      contactUrl: field("salpManufacturerUrl"),
    },
    responsiblePersonRequired: field("salpResponsibleRequired"),
    responsiblePerson: {
      companyName: field("salpResponsibleName"),
      addressLine1: field("salpResponsibleAddress"),
      city: field("salpResponsibleCity"),
      postalCode: field("salpResponsiblePostal"),
      country: field("salpResponsibleCountry").toUpperCase(),
      email: field("salpResponsibleEmail"),
      phone: field("salpResponsiblePhone"),
      contactUrl: field("salpResponsibleUrl"),
    },
    safetyNotes: field("salpSafetyNotes").split(/\n|;/).map((entry) => entry.trim()).filter(Boolean),
    exemptionReason: field("salpExemptionReason"),
    exemptionConfirmed: checkBox("salpExemptionConfirmed"),
  };
}

function variantsFromUi(state) {
  return {
    variants: state.variantsState.variants,
    variantSummary: field("salpVariantSummary"),
    confirmed: checkBox("salpVariantsConfirmed"),
  };
}

function baseOverrides(view) {
  return {
    listingTitle: field("sellerAutoTitle") || view.listingTitle,
    descriptionHtml: field("sellerAutoDescription") || view.descriptionHtml,
    categoryId: field("sellerAutoCategoryId") || view.categoryId,
    categoryName: field("sellerAutoCategoryName") || view.categoryName,
    conditionId: field("sellerAutoConditionId") || view.conditionId,
    price: Number(String(document.getElementById("sellerAutoPrice")?.value || view.price || 0).replace(",", ".")) || 0,
    quantity: Math.max(1, Math.floor(Number(document.getElementById("sellerAutoQuantity")?.value || view.quantity || 1))),
    shippingProfile: field("sellerAutoShippingProfile") || view.shippingProfile,
    returnProfile: field("sellerAutoReturnProfile") || view.returnProfile,
    paymentProfile: field("sellerAutoPaymentProfile") || view.paymentProfile,
    itemSpecifics: currentSpecifics(),
    images: view.images,
  };
}

function checksHtml(checks) {
  return checks.map((check) => `<div class="salp-check ${check.ok ? "ok" : ""}"><span>${check.ok ? "✓" : "!"}</span><span><strong>${esc(check.label)}</strong><small>${esc(check.detail)}</small></span><em>${check.blocking === false ? "Hinweis" : check.ok ? "bereit" : "offen"}</em></div>`).join("");
}

function gpsrFields(state) {
  const compliance = state.compliance;
  return `<div class="salp-grid"><section class="salp-card"><h4>GPSR und Hersteller</h4><label>GPSR-Status</label><select id="salpGpsrStatus"><option value="">Bitte auswählen</option><option value="required" ${compliance.gpsrStatus === "required" ? "selected" : ""}>GPSR-Angaben erforderlich</option><option value="exempt" ${compliance.gpsrStatus === "exempt" ? "selected" : ""}>Dokumentierte Ausnahme</option></select><label>Herstellername</label><input id="salpManufacturerName" value="${esc(compliance.manufacturer.companyName)}"><label>Anschrift</label><input id="salpManufacturerAddress" value="${esc(compliance.manufacturer.addressLine1)}"><div class="row"><div><label>PLZ</label><input id="salpManufacturerPostal" value="${esc(compliance.manufacturer.postalCode)}"></div><div><label>Ort</label><input id="salpManufacturerCity" value="${esc(compliance.manufacturer.city)}"></div></div><div class="row"><div><label>Ländercode</label><input id="salpManufacturerCountry" maxlength="2" value="${esc(compliance.manufacturer.country)}" placeholder="DE"></div><div><label>E-Mail</label><input id="salpManufacturerEmail" value="${esc(compliance.manufacturer.email)}"></div></div><div class="row"><div><label>Telefon</label><input id="salpManufacturerPhone" value="${esc(compliance.manufacturer.phone)}"></div><div><label>Kontakt-URL</label><input id="salpManufacturerUrl" value="${esc(compliance.manufacturer.contactUrl)}"></div></div><label>Sicherheits- und Warnhinweise</label><textarea id="salpSafetyNotes">${esc(compliance.safetyNotes.join("\n"))}</textarea><label>Ausnahmegrund</label><textarea id="salpExemptionReason">${esc(compliance.exemptionReason)}</textarea><label class="checkrow"><input type="checkbox" id="salpExemptionConfirmed" ${compliance.exemptionConfirmed ? "checked" : ""}><span>GPSR-Ausnahme bewusst geprüft und dokumentiert</span></label></section><section class="salp-card"><h4>EU-verantwortliche Person</h4><label>Erforderlich?</label><select id="salpResponsibleRequired"><option value="">Bitte auswählen</option><option value="no" ${compliance.responsiblePersonRequired === "no" ? "selected" : ""}>Nein</option><option value="yes" ${compliance.responsiblePersonRequired === "yes" ? "selected" : ""}>Ja</option></select><label>Name/Firma</label><input id="salpResponsibleName" value="${esc(compliance.responsiblePerson.companyName)}"><label>Anschrift</label><input id="salpResponsibleAddress" value="${esc(compliance.responsiblePerson.addressLine1)}"><div class="row"><div><label>PLZ</label><input id="salpResponsiblePostal" value="${esc(compliance.responsiblePerson.postalCode)}"></div><div><label>Ort</label><input id="salpResponsibleCity" value="${esc(compliance.responsiblePerson.city)}"></div></div><div class="row"><div><label>Ländercode</label><input id="salpResponsibleCountry" maxlength="2" value="${esc(compliance.responsiblePerson.country)}" placeholder="DE"></div><div><label>E-Mail</label><input id="salpResponsibleEmail" value="${esc(compliance.responsiblePerson.email)}"></div></div><div class="row"><div><label>Telefon</label><input id="salpResponsiblePhone" value="${esc(compliance.responsiblePerson.phone)}"></div><div><label>Kontakt-URL</label><input id="salpResponsibleUrl" value="${esc(compliance.responsiblePerson.contactUrl)}"></div></div><div class="salp-lock"><strong>Keine Daten erfinden.</strong> Hersteller- und GPSR-Angaben müssen aus Produktprüfung, Verpackung oder verlässlichen Herstellerunterlagen stammen.</div></section></div>`;
}

function mount() {
  const root = document.getElementById("sellerAutoListerRoot");
  if (!root || !root.querySelector("#sellerAutoTitle")) return false;
  installStyles();
  currentProduct = selectedProduct();
  if (!currentProduct) return false;
  const view = buildSellerListingView(currentProduct);
  const state = buildAdvancedAutoListerState(currentProduct, view, { categoryMetadata: categoryMetadata || undefined, aiPrepared, aiModel });
  categoryMetadata = state.categoryMetadata;
  aiPrepared = state.aiPrepared;
  aiModel = state.aiModel;
  let shell = document.getElementById("sellerAutoListerParity");
  if (!shell) {
    shell = document.createElement("section");
    shell.id = "sellerAutoListerParity";
    shell.className = "salp-shell";
    root.appendChild(shell);
  }
  const checks = buildAdvancedChecks(currentProduct, view, state);
  const active = readUi().activeTab || "taxonomy";
  shell.innerHTML = `<div class="salp-head"><div><h3>🧠 Auto Lister · vollständige Pflichtdaten</h3><p>eBay Taxonomy, Pflichtmerkmale, Wettbewerb, Varianten, GPSR und faktengebundene DeepSeek-Unterstützung. Der Entwurf bleibt intern und unveröffentlicht.</p></div><div class="salp-actions"><button type="button" id="salpRefresh">Neu laden</button><button type="button" id="salpSave">Vollständigen Entwurf speichern</button></div></div><nav class="salp-tabs"><button type="button" data-salp-tab="taxonomy">Kategorie & Merkmale</button><button type="button" data-salp-tab="gpsr">GPSR</button><button type="button" data-salp-tab="variants">Varianten</button><button type="button" data-salp-tab="ai">DeepSeek & Wettbewerb</button><button type="button" data-salp-tab="checks">Gesamtprüfung</button></nav><div class="salp-panel" data-salp-panel="taxonomy"><div class="salp-grid"><section class="salp-card"><h4>eBay-Kategoriesuche</h4><label>Suchbegriff</label><input id="salpCategoryQuery" value="${esc(view.listingTitle)}"><div class="salp-actions"><button type="button" id="salpCategorySearch">Kategorien suchen</button><button type="button" class="secondary" id="salpLoadAspects">Aktuelle Kategorie laden</button></div><div id="salpCategoryResults" class="salp-results"></div></section><section class="salp-card"><h4>eBay Taxonomy</h4><div class="salp-metric"><div><small>Kategorie</small><strong id="salpTaxonomyCategory">${esc(state.categoryMetadata.categoryId || "offen")}</strong></div><div><small>Pflichtmerkmale</small><strong id="salpRequiredCount">${state.categoryMetadata.required.length}</strong></div><div><small>Merkmale gesamt</small><strong id="salpAspectCount">${state.categoryMetadata.aspects.length}</strong></div></div><div id="salpAspectList" class="salp-aspects" style="margin-top:10px">${state.categoryMetadata.aspects.slice(0, 30).map((aspect) => `<div class="salp-aspect ${aspect.required ? "required" : ""}"><strong>${esc(aspect.name)}${aspect.required ? " *" : ""}</strong><small>${esc((aspect.values || []).slice(0, 6).join(" · ") || "Freitext/keine Vorschläge")}</small></div>`).join("") || '<div class="hint">Noch keine eBay-Metadaten geladen.</div>'}</div></section></div></div><div class="salp-panel" data-salp-panel="gpsr">${gpsrFields(state)}</div><div class="salp-panel" data-salp-panel="variants"><section class="salp-card"><h4>Varianten-Zuordnung</h4><p class="hint">Erkannte Varianten: ${state.variantsState.variants.length}. Farbe, Größe, Menge, Preis, Bild und Verfügbarkeit müssen eindeutig zusammenpassen.</p><label>Variantenübersicht</label><textarea id="salpVariantSummary" style="min-height:180px">${esc(state.variantsState.variantSummary)}</textarea><label class="checkrow"><input type="checkbox" id="salpVariantsConfirmed" ${state.variantsState.confirmed ? "checked" : ""}><span>Alle Varianten bewusst geprüft und eindeutig zugeordnet</span></label><pre class="seller-selling-preview">${esc(JSON.stringify(state.variantsState.variants, null, 2))}</pre></section></div><div class="salp-panel" data-salp-panel="ai"><div class="salp-grid"><section class="salp-card"><h4>DeepSeek vorbereiten</h4><p class="hint">Optimiert ausschließlich Titel und Beschreibung anhand vorhandener Fakten. Produktsicherheitsdaten werden nicht erfunden.</p><div class="salp-ai-range"><label>Stärke <strong id="salpAiLabel">${Number(readUi().aiStrength ?? 45)} %</strong></label><input id="salpAiStrength" type="range" min="0" max="100" value="${Number(readUi().aiStrength ?? 45)}"></div><div class="salp-actions"><button type="button" id="salpAiRun">Titel & Beschreibung verbessern</button><button type="button" class="secondary" id="salpAiStatus">DeepSeek-Status</button></div><div id="salpAiOutput" class="salp-status">${state.aiPrepared ? `KI-Vorbereitung dokumentiert · ${esc(state.aiModel)}` : "Noch kein KI-Vorschlag übernommen."}</div></section><section class="salp-card"><h4>eBay-Wettbewerb</h4><label>Suchbegriff</label><input id="salpCompetitionQuery" value="${esc(view.listingTitle)}"><button type="button" id="salpCompetitionRun">Aktuelle Angebote vergleichen</button><div id="salpCompetitionOutput" class="salp-status">Noch nicht geladen.</div></section></div></div><div class="salp-panel" data-salp-panel="checks"><div id="salpAdvancedChecks" class="salp-checks">${checksHtml(checks)}</div><div class="salp-lock" style="margin-top:10px"><strong>🔒 Veröffentlichung gesperrt</strong>Auch bei 100 % Prüfung wird nur ein interner Seller-Entwurf gespeichert. Die eBay-Live-Aktion bleibt manuell.</div></div><div id="salpStatus" class="salp-status">Erweiterte Auto-Lister-Prüfung geladen.</div>`;
  const originalSave = document.getElementById("sellerAutoSaveBtn");
  if (originalSave) {
    originalSave.classList.add("salp-hidden");
    originalSave.title = "Durch den vollständigen Auto-Lister-Speicherbutton ersetzt.";
  }
  bindEvents(view, state);
  setTab(active);
  return true;
}

function setTab(tab) {
  const valid = ["taxonomy", "gpsr", "variants", "ai", "checks"].includes(tab) ? tab : "taxonomy";
  saveUi({ activeTab: valid });
  document.querySelectorAll("[data-salp-tab]").forEach((button) => button.classList.toggle("active", button.dataset.salpTab === valid));
  document.querySelectorAll("[data-salp-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.salpPanel === valid));
}

async function taxonomyFetch(params) {
  const response = await fetch(`/api/ebay-taxonomy?${new URLSearchParams(params)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

async function loadAspects(categoryId, categoryName = "") {
  if (!/^\d+$/.test(text(categoryId))) throw new Error("Numerische Kategorie-ID fehlt.");
  setStatus("eBay-Pflichtmerkmale werden geladen …");
  const data = await taxonomyFetch({ action: "aspects", categoryId });
  categoryMetadata = { categoryId, categoryName: categoryName || field("sellerAutoCategoryName"), required: data.required || [], aspects: data.aspects || [], loadedAt: new Date().toISOString() };
  const idInput = document.getElementById("sellerAutoCategoryId");
  const nameInput = document.getElementById("sellerAutoCategoryName");
  if (idInput) idInput.value = categoryId;
  if (nameInput && categoryName) nameInput.value = categoryName;
  const specifics = currentSpecifics();
  for (const name of categoryMetadata.required) if (!specifics[name]) specifics[name] = [];
  document.getElementById("sellerAutoSpecifics").value = JSON.stringify(specifics, null, 2);
  mount();
  setTab("taxonomy");
  setStatus(`${categoryMetadata.aspects.length} eBay-Merkmale geladen. Pflichtwerte ohne Daten bleiben sichtbar leer.`, "good");
}

async function searchCategories() {
  const query = field("salpCategoryQuery") || field("sellerAutoTitle");
  const output = document.getElementById("salpCategoryResults");
  output.innerHTML = '<div class="hint">Suche läuft …</div>';
  try {
    const data = await taxonomyFetch({ action: "suggestions", q: query });
    output.innerHTML = (data.suggestions || []).map((item) => `<div class="salp-result"><span><strong>${esc(item.categoryName)}</strong><small>ID ${esc(item.categoryId)} · ${esc((item.ancestors || []).map((ancestor) => ancestor.categoryName).filter(Boolean).join(" › "))}</small></span><button type="button" class="secondary" data-salp-category="${esc(item.categoryId)}" data-name="${esc(item.categoryName)}">Übernehmen</button></div>`).join("") || '<div class="hint">Keine Kategorie gefunden.</div>';
  } catch (error) {
    output.innerHTML = `<div class="salp-status bad">${esc(error.message)}</div>`;
  }
}

async function runCompetition() {
  const query = field("salpCompetitionQuery") || field("sellerAutoTitle");
  const output = document.getElementById("salpCompetitionOutput");
  output.textContent = "eBay-Angebote werden geladen …";
  try {
    const response = await fetch(`/api/ebay?action=competition&keyword=${encodeURIComponent(query)}&limit=20`, { credentials: "same-origin", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    const money = (value) => Number(value || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
    output.className = "salp-status good";
    output.textContent = `${data.count || 0} Angebote · niedrig ${money(data.low)} · Durchschnitt ${money(data.avg)} · hoch ${money(data.high)}. Nur Marktvergleich; kein automatischer Preisentscheid.`;
  } catch (error) {
    output.className = "salp-status bad";
    output.textContent = error.message;
  }
}

async function runAi(view) {
  const strength = Number(document.getElementById("salpAiStrength")?.value || 45);
  saveUi({ aiStrength: strength });
  const output = document.getElementById("salpAiOutput");
  output.textContent = "DeepSeek erstellt einen faktengebundenen Vorschlag …";
  try {
    const response = await fetch("/api/seller-listing-ai", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ strength, product: view, draft: { title: field("sellerAutoTitle"), longDescription: field("sellerAutoDescription"), specs: Object.entries(currentSpecifics()).flatMap(([name, values]) => (Array.isArray(values) ? values : [values]).map((value) => ({ name, value }))) } }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    if (data.result?.title) document.getElementById("sellerAutoTitle").value = data.result.title;
    if (data.result?.longDescription) document.getElementById("sellerAutoDescription").value = data.result.longDescription;
    else if (data.result?.shortDescription) document.getElementById("sellerAutoDescription").value = data.result.shortDescription;
    const existing = currentSpecifics();
    for (const spec of data.result?.specs || []) if (spec.name && spec.value && !existing[spec.name]?.length) existing[spec.name] = [spec.value];
    document.getElementById("sellerAutoSpecifics").value = JSON.stringify(existing, null, 2);
    aiPrepared = true;
    aiModel = text(data.model);
    output.className = "salp-status good";
    output.textContent = `DeepSeek-Vorschlag übernommen · ${aiModel}. Alle Aussagen vor dem Speichern kontrollieren.`;
  } catch (error) {
    output.className = "salp-status bad";
    output.textContent = `${error.message} Bestehende Eingaben blieben unverändert.`;
  }
}

async function aiStatus() {
  const output = document.getElementById("salpAiOutput");
  try {
    const response = await fetch("/api/seller-listing-ai", { credentials: "same-origin", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    output.className = `salp-status ${data.configured ? "good" : ""}`;
    output.textContent = data.configured ? `DeepSeek bereit · ${data.model}` : "DeepSeek noch nicht serverseitig konfiguriert.";
  } catch { output.className = "salp-status bad"; output.textContent = "DeepSeek-Status konnte nicht geladen werden."; }
}

async function saveParity(view, initialState) {
  const button = document.getElementById("salpSave");
  button.disabled = true;
  try {
    const overrides = {
      ...baseOverrides(view),
      compliance: complianceFromUi(),
      variantsState: variantsFromUi(initialState),
      categoryMetadata,
      aiPrepared,
      aiModel,
    };
    const draft = buildParityDraft(currentProduct, { ...view, itemSpecifics: overrides.itemSpecifics }, overrides);
    const updated = mergeProductWithParityDraft(currentProduct, draft);
    replaceStoredProduct(updated);
    setStatus(`Arbeitskopie lokal gespeichert · Prüfung ${draft.readiness.score} %. Company OS Product Master bleibt unverändert …`);
    await persistProduct(updated);
    currentProduct = updated;
    setStatus(`Vollständiger Auto-Lister-Entwurf gespeichert · ${draft.readiness.score} %. Keine eBay-Live-Aktion ausgeführt.`, draft.readiness.ready ? "good" : "bad");
    window.setTimeout(mount, 150);
  } catch (error) {
    setStatus(`Speichern fehlgeschlagen: ${error.message}`, "bad");
  } finally {
    button.disabled = false;
  }
}

function bindEvents(view, state) {
  const shell = document.getElementById("sellerAutoListerParity");
  if (!shell) return;
  shell._salpEventController?.abort();
  const controller = new AbortController();
  shell._salpEventController = controller;
  const eventOptions = { signal: controller.signal };
  shell.querySelectorAll("[data-salp-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.salpTab), eventOptions));
  document.getElementById("salpRefresh")?.addEventListener("click", mount, eventOptions);
  document.getElementById("salpCategorySearch")?.addEventListener("click", searchCategories, eventOptions);
  document.getElementById("salpLoadAspects")?.addEventListener("click", () => loadAspects(field("sellerAutoCategoryId"), field("sellerAutoCategoryName")).catch((error) => setStatus(error.message, "bad")), eventOptions);
  document.getElementById("salpCompetitionRun")?.addEventListener("click", runCompetition, eventOptions);
  document.getElementById("salpAiRun")?.addEventListener("click", () => runAi(view), eventOptions);
  document.getElementById("salpAiStatus")?.addEventListener("click", aiStatus, eventOptions);
  document.getElementById("salpSave")?.addEventListener("click", () => saveParity(view, state), eventOptions);
  document.getElementById("salpAiStrength")?.addEventListener("input", (event) => { document.getElementById("salpAiLabel").textContent = `${event.target.value} %`; }, eventOptions);
  shell.addEventListener("click", (event) => {
    const category = event.target.closest("[data-salp-category]");
    if (category) loadAspects(category.dataset.salpCategory, category.dataset.name).catch((error) => setStatus(error.message, "bad"));
  }, eventOptions);
  shell.addEventListener("input", () => {
    try {
      const advancedState = buildAdvancedAutoListerState(currentProduct, view, { compliance: complianceFromUi(), variantsState: variantsFromUi(state), categoryMetadata, itemSpecifics: currentSpecifics(), aiPrepared, aiModel });
      const checks = buildAdvancedChecks(currentProduct, view, advancedState);
      const root = document.getElementById("salpAdvancedChecks");
      if (root) root.innerHTML = checksHtml(checks);
    } catch {}
  }, eventOptions);
}

function scheduleMount() {
  if (observerScheduled) return;
  observerScheduled = true;
  setTimeout(() => { observerScheduled = false; mount(); }, 60);
}

const observer = new MutationObserver(() => {
  const autoRoot = document.getElementById("sellerAutoListerRoot");
  if (autoRoot?.querySelector("#sellerAutoTitle") && !document.getElementById("sellerAutoListerParity")) scheduleMount();
});
if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("elyon:seller-product-selected", scheduleMount);
window.addEventListener("storage", (event) => { if ([PRODUCTS_KEY, SELECTED_KEY].includes(event.key)) scheduleMount(); });
window.ElyonSellerAutoListerParity = { mount, loadAspects, searchCategories };
mount();
