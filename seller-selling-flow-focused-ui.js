import {
  buildSellerListingView,
  buildAutoListerChecks,
  autoListerReadiness,
  buildInternalAutoListerDraft,
  mergeSellerProductWithDraft,
  sellerProductIdentity,
  sellerProductPayload,
} from "/seller-selling-flow-core.js";
import {
  buildAdvancedAutoListerState,
  buildAdvancedChecks,
} from "/seller-auto-lister-parity-core.js";

const PRODUCTS_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";
const ROOT_ID = "elyonSellerSellingFlow";
const HEADER_ID = "elyonFocusedSellingHeader";
const STYLE_ID = "elyonFocusedSellingStyles";
const STEP_TO_PANEL = { 1: "designer", 2: "auto", 3: "ready" };
let activeStep = 1;
let mountTimer = null;
let observer = null;
let refreshing = false;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const esc = (value) => text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const money = (value, currency = "EUR") => Number(value || 0).toLocaleString("de-DE", { style: "currency", currency: currency || "EUR" });

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
  return [
    sellerProductIdentity(product || {}),
    product?.id,
    product?.sellerToolMasterProductId,
    server.id,
    server.companyOsProductId,
  ].map(text).includes(text(id));
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
  window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
  return data;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}.focused-selling-active{gap:14px}
    #${ROOT_ID}.focused-selling-active > .card:first-child{display:none!important}
    .focused-selling-header{padding:18px;border-radius:24px;background:linear-gradient(155deg,rgba(15,23,42,.96),rgba(30,41,59,.92));border:1px solid rgba(148,163,184,.18);box-shadow:0 20px 60px rgba(0,0,0,.24)}
    .focused-selling-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start}
    .focused-selling-product{display:grid;grid-template-columns:78px minmax(0,1fr);gap:14px;align-items:center;min-width:0}
    .focused-selling-image{width:78px;height:78px;border-radius:18px;object-fit:cover;background:rgba(2,6,23,.7);border:1px solid rgba(255,255,255,.12)}
    .focused-selling-image-empty{display:grid;place-items:center;font-size:28px;color:#94a3b8}
    .focused-selling-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#93c5fd;font-weight:900;margin-bottom:5px}
    .focused-selling-title{font-size:22px;font-weight:950;line-height:1.25;letter-spacing:-.025em;overflow-wrap:anywhere}
    .focused-selling-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
    .focused-selling-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);color:#cbd5e1;font-size:11px}
    .focused-selling-chip.good{color:#bbf7d0;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.22)}
    .focused-selling-chip.warn{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.22)}
    .focused-selling-safety{max-width:260px;text-align:right;color:#94a3b8;font-size:11px;line-height:1.45}
    .focused-selling-wizard{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:17px;padding-top:15px;border-top:1px solid rgba(255,255,255,.08)}
    .focused-selling-step{display:grid;grid-template-columns:32px minmax(0,1fr);gap:9px;align-items:center;padding:11px 12px;text-align:left;border-radius:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}
    .focused-selling-step-number{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:rgba(148,163,184,.13);font-size:12px;font-weight:950}
    .focused-selling-step strong,.focused-selling-step small{display:block}.focused-selling-step strong{font-size:13px}.focused-selling-step small{margin-top:2px;color:#94a3b8;font-size:10px;line-height:1.35}
    .focused-selling-step.active{background:linear-gradient(135deg,rgba(37,99,235,.9),rgba(124,58,237,.9));border-color:rgba(147,197,253,.35);box-shadow:0 12px 30px rgba(37,99,235,.2)}
    .focused-selling-step.active .focused-selling-step-number{background:rgba(255,255,255,.18)}
    .focused-selling-card{padding:18px;border-radius:24px;background:rgba(15,23,42,.76);border:1px solid rgba(148,163,184,.16);box-shadow:0 16px 48px rgba(0,0,0,.18)}
    .focused-selling-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:15px}
    .focused-selling-card-head h3{margin:0 0 5px;font-size:20px}.focused-selling-card-head p{margin:0;color:#94a3b8;font-size:12px;line-height:1.5;max-width:720px}
    .focused-selling-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:16px;align-items:start}
    .focused-selling-form{display:grid;gap:12px}.focused-selling-form label{margin:0 0 6px;color:#bfdbfe;font-size:12px;font-weight:850}
    .focused-selling-form input,.focused-selling-form textarea{margin:0}.focused-selling-form textarea{min-height:190px;line-height:1.55}
    .focused-selling-field-note{display:flex;justify-content:space-between;gap:8px;margin-top:5px;color:#94a3b8;font-size:10px}
    .focused-selling-side{display:grid;gap:11px}.focused-selling-metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .focused-selling-metric{padding:12px;border-radius:16px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.08)}.focused-selling-metric small{display:block;color:#94a3b8;font-size:10px}.focused-selling-metric strong{display:block;margin-top:5px;font-size:15px}
    .focused-selling-gallery{display:flex;gap:8px;overflow-x:auto;padding-bottom:3px}.focused-selling-gallery img{width:74px;height:74px;flex:0 0 auto;border-radius:14px;object-fit:cover;background:#020617;border:1px solid rgba(255,255,255,.1)}
    .focused-selling-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.focused-selling-actions button{min-height:42px}.focused-selling-actions .primary-next{margin-left:auto}
    .focused-selling-status{margin-top:11px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1;font-size:11px;line-height:1.45}
    .focused-selling-status.good{color:#bbf7d0;background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.24)}.focused-selling-status.bad{color:#fecaca;background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.24)}
    .focused-selling-advanced{margin-top:14px;border-radius:18px;background:rgba(2,6,23,.34);border:1px solid rgba(255,255,255,.08);overflow:hidden}.focused-selling-advanced summary{cursor:pointer;list-style:none;padding:14px 15px;font-size:12px;font-weight:900;color:#bfdbfe}.focused-selling-advanced summary::-webkit-details-marker{display:none}.focused-selling-advanced summary::after{content:'▾';float:right;color:#94a3b8}.focused-selling-advanced[open] summary::after{content:'▴'}.focused-selling-advanced-body{padding:0 15px 15px;color:#94a3b8;font-size:11px;line-height:1.5}
    .focused-selling-check-summary{display:grid;grid-template-columns:110px minmax(0,1fr);gap:13px;align-items:center;padding:14px;border-radius:18px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.18);margin-bottom:13px}.focused-selling-check-summary strong{font-size:28px}.focused-selling-check-summary span{font-size:12px;color:#cbd5e1;line-height:1.45}
    .focused-selling-checks{display:grid;gap:8px}.focused-selling-check{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;align-items:start;padding:11px 12px;border-radius:15px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}
    .focused-selling-check-icon{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:rgba(239,68,68,.12);color:#fecaca;font-weight:950}.focused-selling-check.ok .focused-selling-check-icon{background:rgba(34,197,94,.12);color:#bbf7d0}.focused-selling-check strong{display:block;font-size:12px}.focused-selling-check small{display:block;margin-top:3px;color:#94a3b8;font-size:10px;line-height:1.4}
    .focused-selling-blocker-title{margin:15px 0 9px;color:#bfdbfe;font-size:12px;font-weight:900}.focused-selling-empty{padding:22px;text-align:center;border-radius:18px;border:1px dashed rgba(148,163,184,.22);color:#94a3b8}
    #${ROOT_ID}.focused-selling-active [data-selling-panel="designer"]>#sellerDesignerContext,
    #${ROOT_ID}.focused-selling-active [data-selling-panel="designer"]>#sellerVisualDesignerModule,
    #${ROOT_ID}.focused-selling-active [data-selling-panel="designer"]>#sellerDesignerOriginalHost,
    #${ROOT_ID}.focused-selling-active [data-selling-panel="auto"]>#sellerAutoListerRoot{display:none!important}
    #${ROOT_ID}.focused-selling-active.focused-show-advanced-designer [data-selling-panel="designer"]>#sellerDesignerContext,
    #${ROOT_ID}.focused-selling-active.focused-show-advanced-designer [data-selling-panel="designer"]>#sellerVisualDesignerModule,
    #${ROOT_ID}.focused-selling-active.focused-show-advanced-designer [data-selling-panel="designer"]>#sellerDesignerOriginalHost,
    #${ROOT_ID}.focused-selling-active.focused-show-advanced-auto [data-selling-panel="auto"]>#sellerAutoListerRoot{display:block!important;margin-top:14px}
    #${ROOT_ID}.focused-selling-active [data-selling-panel="ready"]>#sellerReadyRoot>.seller-selling-toolhead,
    #${ROOT_ID}.focused-selling-active [data-selling-panel="ready"]>#sellerReadyRoot>.seller-selling-summary{display:none!important}
    @media(max-width:900px){.focused-selling-grid{grid-template-columns:1fr}.focused-selling-safety{text-align:left;max-width:none}.focused-selling-top{grid-template-columns:1fr}}
    @media(max-width:680px){.focused-selling-header,.focused-selling-card{padding:14px;border-radius:20px}.focused-selling-product{grid-template-columns:64px minmax(0,1fr)}.focused-selling-image{width:64px;height:64px}.focused-selling-title{font-size:18px}.focused-selling-wizard{grid-template-columns:1fr}.focused-selling-step{grid-template-columns:30px minmax(0,1fr)}.focused-selling-metrics{grid-template-columns:1fr 1fr}.focused-selling-actions{display:grid;grid-template-columns:1fr}.focused-selling-actions .primary-next{margin-left:0}.focused-selling-check-summary{grid-template-columns:86px minmax(0,1fr)}}
  `;
  document.head.appendChild(style);
}

function stepFromPanel(panel) {
  return panel === "auto" ? 2 : panel === "ready" ? 3 : 1;
}

function activePanel() {
  const panel = document.querySelector(`#${ROOT_ID} [data-selling-panel].active`);
  return panel?.dataset.sellingPanel || "designer";
}

function riskLabel(view) {
  if (view.minimumRulePassed && (!view.blockers || view.blockers.length === 0)) return { label: "✅ wirtschaftlich geeignet", className: "good" };
  if (view.minimumRulePassed) return { label: "🟡 noch prüfen", className: "warn" };
  return { label: "🟠 Marge/Risiko offen", className: "warn" };
}

function headerHtml(product) {
  const view = product ? buildSellerListingView(product) : null;
  const image = view?.images?.[0];
  const risk = view ? riskLabel(view) : { label: "Kein Produkt ausgewählt", className: "warn" };
  return `
    <section class="focused-selling-header" id="${HEADER_ID}">
      <div class="focused-selling-top">
        <div class="focused-selling-product">
          ${image ? `<img class="focused-selling-image" src="${esc(image)}" alt="Produktbild" referrerpolicy="no-referrer">` : '<div class="focused-selling-image focused-selling-image-empty">📦</div>'}
          <div>
            <div class="focused-selling-eyebrow">Verkauf vorbereiten</div>
            <div class="focused-selling-title">${esc(view?.title || "Noch keine Seller-Arbeitskopie ausgewählt")}</div>
            <div class="focused-selling-meta">
              <span class="focused-selling-chip ${risk.className}">${esc(risk.label)}</span>
              <span class="focused-selling-chip">${view ? `${view.readinessScore} % Product-Master-Status` : "Produkt fehlt"}</span>
              <span class="focused-selling-chip">${view ? `${money(view.profit)} Gewinn · ${Number(view.marginPercent || 0).toFixed(1)} % Marge` : "Wirtschaftlichkeit offen"}</span>
            </div>
          </div>
        </div>
        <div class="focused-selling-safety"><strong>Kontrollierter Ablauf</strong><br>Das Seller Tool erstellt und speichert nur interne Listing-Pakete. Eine automatische eBay-Veröffentlichung bleibt gesperrt.</div>
      </div>
      <nav class="focused-selling-wizard" aria-label="Verkaufsschritte">
        ${wizardButton(1, "Listing erstellen", "Titel, Preis und Beschreibung")}
        ${wizardButton(2, "Pflichtangaben prüfen", "Nur offene Punkte bearbeiten")}
        ${wizardButton(3, "Abschluss", "Paket kopieren und dokumentieren")}
      </nav>
    </section>`;
}

function wizardButton(step, label, description) {
  return `<button type="button" class="focused-selling-step ${activeStep === step ? "active" : ""}" data-focused-step="${step}"><span class="focused-selling-step-number">${step}</span><span><strong>${esc(label)}</strong><small>${esc(description)}</small></span></button>`;
}

function ensureHeader(root) {
  let header = document.getElementById(HEADER_ID);
  const product = selectedProduct();
  if (!header) {
    root.insertAdjacentHTML("afterbegin", headerHtml(product));
    header = document.getElementById(HEADER_ID);
  } else {
    const replacement = document.createElement("div");
    replacement.innerHTML = headerHtml(product).trim();
    header.replaceWith(replacement.firstElementChild);
  }
}

function stepOneHtml(product) {
  if (!product) return `<section class="focused-selling-card" id="focusedSellingStep1"><div class="focused-selling-empty">Öffne zuerst unter „Produkte“ eine freigegebene Seller-Arbeitskopie.</div></section>`;
  const view = buildSellerListingView(product);
  return `
    <section class="focused-selling-card" id="focusedSellingStep1">
      <div class="focused-selling-card-head"><div><h3>1 · Listing erstellen</h3><p>Bearbeite nur die Kernangaben. Produktdaten, vorhandene Artikelmerkmale und Bilder bleiben erhalten.</p></div><span class="focused-selling-chip">${view.listingTitle.length}/80 Zeichen</span></div>
      <div class="focused-selling-grid">
        <div class="focused-selling-form">
          <div><label for="focusedSellingTitle">eBay-Titel</label><input id="focusedSellingTitle" maxlength="80" value="${esc(view.listingTitle)}"><div class="focused-selling-field-note"><span>25–80 Zeichen empfohlen</span><span id="focusedSellingTitleCount">${view.listingTitle.length}/80</span></div></div>
          <div><label for="focusedSellingPrice">Verkaufspreis</label><input id="focusedSellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${view.price || ""}"></div>
          <div><label for="focusedSellingDescription">Beschreibung</label><textarea id="focusedSellingDescription">${esc(view.descriptionHtml)}</textarea><div class="focused-selling-field-note"><span>Faktengebunden und ohne Lieferantennamen</span><span id="focusedSellingDescriptionCount">${view.descriptionHtml.length} Zeichen</span></div></div>
        </div>
        <aside class="focused-selling-side">
          <div class="focused-selling-metrics">
            <div class="focused-selling-metric"><small>Gewinn</small><strong>${money(view.profit, view.currency)}</strong></div>
            <div class="focused-selling-metric"><small>Marge</small><strong>${Number(view.marginPercent || 0).toFixed(1)} %</strong></div>
            <div class="focused-selling-metric"><small>Bilder</small><strong>${view.images.length}</strong></div>
            <div class="focused-selling-metric"><small>Lieferzeit</small><strong>${esc(view.deliveryTime || "offen")}</strong></div>
          </div>
          <div><label>Produktbilder</label><div class="focused-selling-gallery">${view.images.map((url) => `<img src="${esc(url)}" alt="Produktbild" referrerpolicy="no-referrer">`).join("") || '<span class="focused-selling-chip warn">Keine HTTPS-Bilder</span>'}</div></div>
          <details class="focused-selling-advanced"><summary>Weitere Angaben und Design</summary><div class="focused-selling-advanced-body">Der vollständige Titel-/KI-Generator, Themes, Live-Vorschau, Bildreihenfolge, HTML und JSON bleiben verfügbar, sind aber aus dem normalen Ablauf ausgeblendet.<div class="focused-selling-actions"><button type="button" class="secondary" data-focused-action="toggle-designer">Erweiterte Werkzeuge öffnen</button><button type="button" class="secondary" data-focused-action="open-visual">Visual Designer öffnen</button></div></div></details>
        </aside>
      </div>
      <div class="focused-selling-actions"><button type="button" class="secondary" data-focused-action="deepseek">✨ Mit DeepSeek verbessern</button><button type="button" data-focused-action="save-listing">Entwurf speichern</button><button type="button" class="primary-next" data-focused-step="2">Weiter zur Prüfung →</button></div>
      <div class="focused-selling-status" id="focusedSellingStep1Status">Noch keine Änderung gespeichert. Keine eBay-Live-Aktion.</div>
    </section>`;
}

function combinedChecks(product) {
  if (!product) return { checks: [], readiness: { score: 0, ready: false, blockers: [] } };
  const view = buildSellerListingView(product);
  const state = buildAdvancedAutoListerState(product, view);
  const checks = [...buildAutoListerChecks(view), ...buildAdvancedChecks(product, view, state)];
  return { checks, readiness: autoListerReadiness(checks) };
}

function checkHtml(check) {
  return `<div class="focused-selling-check ${check.ok ? "ok" : ""}"><span class="focused-selling-check-icon">${check.ok ? "✓" : "!"}</span><span><strong>${esc(check.label)}</strong><small>${esc(check.detail)}</small></span></div>`;
}

function stepTwoHtml(product) {
  if (!product) return `<section class="focused-selling-card" id="focusedSellingStep2"><div class="focused-selling-empty">Noch keine Seller-Arbeitskopie ausgewählt.</div></section>`;
  const { checks, readiness } = combinedChecks(product);
  const blocking = checks.filter((check) => check.blocking !== false);
  const open = blocking.filter((check) => !check.ok);
  const passed = blocking.filter((check) => check.ok);
  return `
    <section class="focused-selling-card" id="focusedSellingStep2">
      <div class="focused-selling-card-head"><div><h3>2 · Pflichtangaben prüfen</h3><p>Elyon zeigt zuerst nur offene Punkte. Technische IDs, Roh-JSON und vollständige GPSR-Formulare liegen unter den erweiterten Werkzeugen.</p></div><span class="focused-selling-chip ${readiness.ready ? "good" : "warn"}">${readiness.ready ? "Bereit" : `${open.length} offen`}</span></div>
      <div class="focused-selling-check-summary"><strong>${readiness.score} %</strong><span>${readiness.ready ? "Alle blockierenden Seller-Prüfungen sind erfüllt. Prüfe die Angaben dennoch bewusst vor eBay." : `${passed.length} von ${blocking.length} Pflichtprüfungen sind erfüllt.`}</span></div>
      <div class="focused-selling-blocker-title">${open.length ? "Offene Punkte" : "Keine offenen Pflichtpunkte"}</div>
      <div class="focused-selling-checks">${open.length ? open.slice(0, 10).map(checkHtml).join("") : '<div class="focused-selling-empty">✅ Das Listing-Paket ist intern vollständig genug für die manuelle eBay-Übertragung.</div>'}</div>
      ${passed.length ? `<details class="focused-selling-advanced"><summary>${passed.length} erfüllte Prüfungen anzeigen</summary><div class="focused-selling-advanced-body"><div class="focused-selling-checks">${passed.map(checkHtml).join("")}</div></div></details>` : ""}
      <details class="focused-selling-advanced"><summary>Pflichtangaben bearbeiten</summary><div class="focused-selling-advanced-body">Hier öffnest du bei Bedarf eBay-Kategorie, Zustand, Artikelmerkmale, Richtlinienprofile, GPSR, Hersteller, EU-verantwortliche Person und Varianten.<div class="focused-selling-actions"><button type="button" class="secondary" data-focused-action="toggle-auto">Erweiterte eBay-Daten öffnen</button><button type="button" class="secondary" data-focused-action="run-check">Prüfung aktualisieren</button><button type="button" data-focused-action="save-auto">Internen Entwurf speichern</button></div></div></details>
      <div class="focused-selling-actions"><button type="button" class="secondary" data-focused-step="1">← Zurück zum Listing</button><button type="button" class="primary-next" data-focused-step="3">Weiter zum Abschluss →</button></div>
      <div class="focused-selling-status" id="focusedSellingStep2Status">Keine automatische Veröffentlichung. Nur interne Prüfung und Speicherung.</div>
    </section>`;
}

function stepThreeHtml(product) {
  if (!product) return `<section class="focused-selling-card" id="focusedSellingStep3"><div class="focused-selling-empty">Noch keine Seller-Arbeitskopie ausgewählt.</div></section>`;
  const { readiness } = combinedChecks(product);
  return `
    <section class="focused-selling-card" id="focusedSellingStep3">
      <div class="focused-selling-card-head"><div><h3>3 · Abschluss</h3><p>Kopiere das fertige Listing-Paket nach eBay und dokumentiere anschließend Artikelnummer und Status. Die Veröffentlichung bleibt bewusst manuell.</p></div><span class="focused-selling-chip ${readiness.ready ? "good" : "warn"}">${readiness.ready ? "Paket bereit" : "Noch nicht vollständig"}</span></div>
      ${readiness.ready ? '<div class="focused-selling-status good">Das Paket ist intern vollständig. Kontrolliere Titel, Preis, Bilder, GPSR- und Lieferangaben vor dem manuellen Einstellen.</div>' : `<div class="focused-selling-status bad">Noch offene Blocker: ${esc(readiness.blockers.slice(0, 6).join(" · ") || "Pflichtprüfung nicht abgeschlossen")}</div>`}
      <div class="focused-selling-actions"><button type="button" class="secondary" data-focused-step="2">← Zurück zur Prüfung</button></div>
    </section>`;
}

function ensureStepPanels(root) {
  const product = selectedProduct();
  const designerPanel = root.querySelector('[data-selling-panel="designer"]');
  const autoPanel = root.querySelector('[data-selling-panel="auto"]');
  const readyPanel = root.querySelector('[data-selling-panel="ready"]');
  if (designerPanel) {
    const current = document.getElementById("focusedSellingStep1");
    const holder = document.createElement("div");
    holder.innerHTML = stepOneHtml(product).trim();
    current ? current.replaceWith(holder.firstElementChild) : designerPanel.prepend(holder.firstElementChild);
  }
  if (autoPanel) {
    const current = document.getElementById("focusedSellingStep2");
    const holder = document.createElement("div");
    holder.innerHTML = stepTwoHtml(product).trim();
    current ? current.replaceWith(holder.firstElementChild) : autoPanel.prepend(holder.firstElementChild);
  }
  if (readyPanel) {
    const current = document.getElementById("focusedSellingStep3");
    const holder = document.createElement("div");
    holder.innerHTML = stepThreeHtml(product).trim();
    current ? current.replaceWith(holder.firstElementChild) : readyPanel.prepend(holder.firstElementChild);
    postProcessReadyPanel();
  }
}

function setStatus(id, message, type = "") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.className = `focused-selling-status ${type}`.trim();
}

function fieldValue(id) {
  return text(document.getElementById(id)?.value);
}

function numberValue(id) {
  const value = Number(fieldValue(id).replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

async function saveFocusedListing() {
  const product = selectedProduct();
  if (!product) return setStatus("focusedSellingStep1Status", "Keine Seller-Arbeitskopie ausgewählt.", "bad");
  const button = document.querySelector('[data-focused-action="save-listing"]');
  if (button) button.disabled = true;
  try {
    const view = buildSellerListingView(product);
    const draft = buildInternalAutoListerDraft(view, {
      listingTitle: fieldValue("focusedSellingTitle") || view.listingTitle,
      descriptionHtml: fieldValue("focusedSellingDescription") || view.descriptionHtml,
      price: numberValue("focusedSellingPrice") || view.price,
      itemSpecifics: view.itemSpecifics,
      images: view.images,
    });
    const updated = mergeSellerProductWithDraft(product, draft);
    replaceStoredProduct(updated);
    setStatus("focusedSellingStep1Status", "Lokal gespeichert. Seller Product Master wird aktualisiert …");
    await persistProduct(updated);
    setStatus("focusedSellingStep1Status", "Listing-Entwurf gespeichert. Keine eBay-Live-Aktion ausgeführt.", "good");
    scheduleRefresh();
  } catch (error) {
    setStatus("focusedSellingStep1Status", `Speichern fehlgeschlagen: ${error.message}`, "bad");
  } finally {
    if (button) button.disabled = false;
  }
}

async function runDeepSeek() {
  const product = selectedProduct();
  if (!product) return setStatus("focusedSellingStep1Status", "Keine Seller-Arbeitskopie ausgewählt.", "bad");
  const button = document.querySelector('[data-focused-action="deepseek"]');
  if (button) button.disabled = true;
  setStatus("focusedSellingStep1Status", "DeepSeek erstellt einen faktengebundenen Vorschlag …");
  try {
    const view = buildSellerListingView(product);
    const response = await fetch("/api/seller-listing-ai", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        strength: 45,
        product: view,
        draft: {
          title: fieldValue("focusedSellingTitle") || view.listingTitle,
          longDescription: fieldValue("focusedSellingDescription") || view.descriptionHtml,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    const titleInput = document.getElementById("focusedSellingTitle");
    const descriptionInput = document.getElementById("focusedSellingDescription");
    if (titleInput && text(data.result?.title)) titleInput.value = text(data.result.title).slice(0, 80);
    if (descriptionInput) descriptionInput.value = text(data.result?.longDescription || data.result?.shortDescription || descriptionInput.value);
    updateCounters();
    setStatus("focusedSellingStep1Status", "DeepSeek-Vorschlag übernommen. Bitte Aussagen kontrollieren und anschließend speichern.", "good");
  } catch (error) {
    setStatus("focusedSellingStep1Status", `${error.message} Die bisherigen Eingaben bleiben erhalten.`, "bad");
  } finally {
    if (button) button.disabled = false;
  }
}

function toggleAdvanced(kind, forceOpen = false) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const className = kind === "auto" ? "focused-show-advanced-auto" : "focused-show-advanced-designer";
  root.classList.toggle(className, forceOpen || !root.classList.contains(className));
  if (kind === "auto") {
    window.ElyonSellerSellingFlow?.setActivePanel?.("auto");
    window.setTimeout(() => document.getElementById("sellerAutoListerRoot")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  } else {
    window.ElyonSellerSellingFlow?.setActivePanel?.("designer");
    window.setTimeout(() => document.getElementById("sellerVisualDesignerModule")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
}

function openVisualDesigner() {
  toggleAdvanced("designer", true);
  window.setTimeout(() => {
    const button = document.querySelector('[data-svd-mode="visual"]');
    button?.click();
    document.getElementById("sellerVisualDesignerModule")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 120);
}

function runExistingCheck() {
  toggleAdvanced("auto", true);
  window.setTimeout(() => {
    document.getElementById("sellerAutoPrepareBtn")?.click();
    setStatus("focusedSellingStep2Status", "Prüfung aktualisiert. Offene Detailangaben stehen im erweiterten Bereich.", "good");
  }, 120);
}

function saveExistingAutoDraft() {
  toggleAdvanced("auto", true);
  window.setTimeout(() => {
    const button = document.getElementById("salpSave") || document.getElementById("sellerAutoSaveBtn");
    if (!button) return setStatus("focusedSellingStep2Status", "Der interne Speicherknopf konnte noch nicht geladen werden.", "bad");
    button.click();
    setStatus("focusedSellingStep2Status", "Interne Speicherung gestartet. Keine eBay-Live-Aktion.", "good");
    window.setTimeout(scheduleRefresh, 500);
  }, 140);
}

function postProcessReadyPanel() {
  const root = document.getElementById("sellerReadyRoot");
  if (!root) return;
  root.querySelectorAll("small").forEach((node) => {
    if (text(node.textContent) === "Auto-Lister-Score") node.textContent = "Paket-Vollständigkeit";
  });
  root.querySelectorAll("h3").forEach((node) => {
    if (text(node.textContent) === "Listing-Paket") node.textContent = "Fertiges eBay-Listing-Paket";
  });
}

function setStep(step) {
  const next = [1, 2, 3].includes(Number(step)) ? Number(step) : 1;
  activeStep = next;
  const panel = STEP_TO_PANEL[next];
  window.ElyonSellerSellingFlow?.setActivePanel?.(panel);
  window.setTimeout(() => {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      ensureHeader(root);
      ensureStepPanels(root);
    }
    document.getElementById(`focusedSellingStep${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 30);
}

function updateCounters() {
  const title = document.getElementById("focusedSellingTitle");
  const description = document.getElementById("focusedSellingDescription");
  const titleCount = document.getElementById("focusedSellingTitleCount");
  const descriptionCount = document.getElementById("focusedSellingDescriptionCount");
  if (titleCount) titleCount.textContent = `${text(title?.value).length}/80`;
  if (descriptionCount) descriptionCount.textContent = `${text(description?.value).length} Zeichen`;
}

function bindEvents() {
  if (document.documentElement.dataset.focusedSellingBound === "1") return;
  document.documentElement.dataset.focusedSellingBound = "1";
  document.addEventListener("click", (event) => {
    const stepButton = event.target.closest("[data-focused-step]");
    if (stepButton) {
      event.preventDefault();
      setStep(Number(stepButton.dataset.focusedStep));
      return;
    }
    const action = event.target.closest("[data-focused-action]")?.dataset.focusedAction;
    if (!action) return;
    event.preventDefault();
    if (action === "save-listing") saveFocusedListing();
    if (action === "deepseek") runDeepSeek();
    if (action === "toggle-designer") toggleAdvanced("designer");
    if (action === "open-visual") openVisualDesigner();
    if (action === "toggle-auto") toggleAdvanced("auto");
    if (action === "run-check") runExistingCheck();
    if (action === "save-auto") saveExistingAutoDraft();
  });
  document.addEventListener("input", (event) => {
    if (["focusedSellingTitle", "focusedSellingDescription"].includes(event.target?.id)) updateCounters();
  });
}

function scheduleRefresh() {
  clearTimeout(mountTimer);
  mountTimer = window.setTimeout(() => {
    if (refreshing) return;
    refreshing = true;
    try { mount(); } finally { refreshing = false; }
  }, 80);
}

function observe() {
  if (observer) return;
  observer = new MutationObserver(() => {
    const root = document.getElementById(ROOT_ID);
    if (root && !root.classList.contains("focused-selling-active")) scheduleRefresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function mount() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return false;
  installStyles();
  bindEvents();
  root.classList.add("focused-selling-active");
  activeStep = stepFromPanel(activePanel());
  ensureHeader(root);
  ensureStepPanels(root);
  observe();
  return true;
}

function boot() {
  if (!mount()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (mount() || attempts > 80) window.clearInterval(timer);
    }, 100);
  }
  window.addEventListener("elyon:seller-product-selected", scheduleRefresh);
  window.addEventListener("storage", (event) => {
    if ([PRODUCTS_KEY, SELECTED_KEY].includes(event.key)) scheduleRefresh();
  });
  window.setTimeout(scheduleRefresh, 600);
  window.setTimeout(scheduleRefresh, 1800);
}

window.ElyonSellerFocusedSellingUI = { mount, refresh: scheduleRefresh, setStep };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();