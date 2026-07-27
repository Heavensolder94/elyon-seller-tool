import {
  buildSellerListingView,
  buildAutoListerChecks,
  autoListerReadiness,
  buildInternalAutoListerDraft,
  mergeSellerProductWithDraft,
  mergeSellerManualListingMeta,
  sellerProductIdentity,
  sellerProductPayload,
} from "/seller-selling-flow-core.js";

const LOCAL_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";
const UI_KEY = "elyon_seller_selling_flow_v1";
const STYLE_ID = "elyonSellerSellingFlowStyles";
const ROOT_ID = "elyonSellerSellingFlow";

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const escapeHtml = (value) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function readProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function selectedProduct() {
  const products = readProducts();
  const selectedId = text(localStorage.getItem(SELECTED_KEY));
  if (!selectedId) return products[0] || null;
  return products.find((product) => {
    const view = buildSellerListingView(product);
    const server = object(product.rawServerProduct || product.raw || product);
    return [
      sellerProductIdentity(product),
      product.id,
      product.sellerToolMasterProductId,
      server.id,
      server.companyOsProductId,
    ].map(text).includes(selectedId) || view.id === selectedId;
  }) || products[0] || null;
}

function readUiState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveUiState(patch = {}) {
  const current = readUiState();
  localStorage.setItem(UI_KEY, JSON.stringify({ ...current, ...patch, updatedAt: new Date().toISOString() }));
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .seller-selling-shell{display:grid;gap:16px}
    .seller-selling-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .seller-selling-head h2{margin:0 0 6px;font-size:27px;letter-spacing:-.035em}
    .seller-selling-head p{margin:0;max-width:780px;color:#cbd5e1;line-height:1.55}
    .seller-selling-status{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .seller-selling-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:10px;border-radius:20px;background:rgba(2,6,23,.36);border:1px solid rgba(255,255,255,.09)}
    .seller-selling-nav button{display:grid;gap:4px;text-align:left;padding:13px 14px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09)}
    .seller-selling-nav button strong{font-size:14px}
    .seller-selling-nav button span{color:#cbd5e1;font-size:11px;line-height:1.35}
    .seller-selling-nav button.active{background:linear-gradient(135deg,#2563eb,#7c3aed);border-color:rgba(147,197,253,.36);box-shadow:0 14px 34px rgba(37,99,235,.18)}
    .seller-selling-panel{display:none}
    .seller-selling-panel.active{display:block}
    .seller-selling-toolhead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;padding:16px 18px;margin-bottom:16px;border-radius:20px;background:linear-gradient(135deg,rgba(59,130,246,.13),rgba(139,92,246,.1));border:1px solid rgba(96,165,250,.2)}
    .seller-selling-toolhead h3{margin:0 0 5px;font-size:19px}
    .seller-selling-toolhead p{margin:0;color:#cbd5e1;font-size:13px;line-height:1.5;max-width:760px}
    .seller-selling-actions{display:flex;gap:8px;flex-wrap:wrap}
    .seller-selling-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(330px,.95fr);gap:16px;align-items:start}
    .seller-selling-box{padding:16px;border-radius:20px;background:rgba(2,6,23,.36);border:1px solid rgba(255,255,255,.09)}
    .seller-selling-box h3,.seller-selling-box h4{margin:0 0 10px}
    .seller-selling-box label{display:block;margin:10px 0 6px;color:#bfdbfe;font-size:12px;font-weight:800}
    .seller-selling-box input,.seller-selling-box textarea{margin-bottom:0}
    .seller-selling-box textarea{min-height:130px}
    .seller-selling-checks{display:grid;gap:8px}
    .seller-selling-check{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border-radius:15px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
    .seller-selling-check-icon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-weight:950;background:rgba(239,68,68,.12);color:#fecaca}
    .seller-selling-check.ok .seller-selling-check-icon{background:rgba(34,197,94,.12);color:#bbf7d0}
    .seller-selling-check strong{display:block;font-size:13px}
    .seller-selling-check small{display:block;margin-top:2px;color:#94a3b8;font-size:11px;line-height:1.35}
    .seller-selling-check em{font-style:normal;font-size:11px;color:#cbd5e1}
    .seller-selling-score{display:grid;grid-template-columns:100px minmax(0,1fr);gap:14px;align-items:center;padding:15px;border-radius:18px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.16);margin-bottom:12px}
    .seller-selling-score strong{font-size:30px;letter-spacing:-.04em}
    .seller-selling-score span{display:block;color:#cbd5e1;font-size:12px;line-height:1.45}
    .seller-selling-images{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
    .seller-selling-images img{width:88px;height:88px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#020617;flex:0 0 auto}
    .seller-selling-json{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;min-height:180px!important;font-size:12px}
    .seller-selling-preview{white-space:pre-wrap;overflow-wrap:anywhere;max-height:380px;overflow:auto;color:#e2e8f0;font-size:13px;line-height:1.55}
    .seller-selling-lock{padding:14px 16px;border-radius:18px;background:rgba(245,158,11,.11);border:1px solid rgba(245,158,11,.22);color:#fde68a;font-size:13px;line-height:1.5}
    .seller-selling-lock strong{display:block;margin-bottom:4px}
    .seller-selling-disabled{opacity:.55;cursor:not-allowed!important;filter:none!important;transform:none!important}
    .seller-selling-statusline{margin-top:10px;padding:11px 13px;border-radius:15px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;line-height:1.45}
    .seller-selling-statusline.good{background:rgba(34,197,94,.09);border-color:rgba(34,197,94,.22);color:#bbf7d0}
    .seller-selling-statusline.bad{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.22);color:#fecaca}
    .seller-selling-manual-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:16px}
    .seller-selling-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
    .seller-selling-summary div{padding:12px 13px;border-radius:16px;background:rgba(2,6,23,.34);border:1px solid rgba(255,255,255,.08)}
    .seller-selling-summary small{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
    .seller-selling-summary strong{font-size:14px;line-height:1.35}
    .seller-designer-original{min-width:0}
    .seller-designer-original .generator-shell{margin-top:0}
    @media(max-width:960px){.seller-selling-grid,.seller-selling-manual-grid{grid-template-columns:1fr}.seller-selling-summary{grid-template-columns:1fr 1fr}}
    @media(max-width:680px){.seller-selling-nav{grid-template-columns:1fr}.seller-selling-summary{grid-template-columns:1fr}.seller-selling-check{grid-template-columns:32px minmax(0,1fr)}.seller-selling-check em{grid-column:2}.seller-selling-actions{width:100%}.seller-selling-actions button{flex:1}}
  `;
  document.head.appendChild(style);
}

function statusClass(ok) {
  return ok ? "good" : "bad";
}

function checksHtml(checks) {
  return checks.map((check) => `
    <div class="seller-selling-check ${check.ok ? "ok" : ""}">
      <span class="seller-selling-check-icon">${check.ok ? "✓" : "!"}</span>
      <span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></span>
      <em>${check.blocking === false ? "Hinweis" : check.ok ? "bereit" : "offen"}</em>
    </div>
  `).join("");
}

function productMatches(product, id) {
  if (!id) return false;
  const view = buildSellerListingView(product);
  const server = object(product.rawServerProduct || product.raw || product);
  return [
    view.id,
    product.id,
    product.sellerToolMasterProductId,
    server.id,
    server.companyOsProductId,
  ].map(text).includes(text(id));
}

function replaceStoredProduct(updated) {
  const id = sellerProductIdentity(updated);
  const products = readProducts();
  const next = products.map((product) => productMatches(product, id) ? updated : product);
  if (!next.some((product) => productMatches(product, id))) next.unshift(updated);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
}

async function persistProduct(updated) {
  replaceStoredProduct(updated);
  const payload = sellerProductPayload(updated);
  const response = await fetch("/api/products", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ product: payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
  return data;
}

function parseJsonField(id, fallback = {}) {
  const raw = text(document.getElementById(id)?.value);
  if (!raw) return fallback;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Artikelmerkmale müssen ein JSON-Objekt sein.");
  return parsed;
}

function fieldValue(id) {
  return text(document.getElementById(id)?.value);
}

function numberValue(id) {
  const value = Number(String(document.getElementById(id)?.value || "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

function currentAutoListerOverrides(view) {
  return {
    listingTitle: fieldValue("sellerAutoTitle") || view.listingTitle,
    descriptionHtml: fieldValue("sellerAutoDescription") || view.descriptionHtml,
    categoryId: fieldValue("sellerAutoCategoryId") || view.categoryId,
    categoryName: fieldValue("sellerAutoCategoryName") || view.categoryName,
    conditionId: fieldValue("sellerAutoConditionId") || view.conditionId,
    price: numberValue("sellerAutoPrice") || view.price,
    quantity: Math.max(1, Math.floor(numberValue("sellerAutoQuantity") || view.quantity || 1)),
    shippingProfile: fieldValue("sellerAutoShippingProfile") || view.shippingProfile,
    returnProfile: fieldValue("sellerAutoReturnProfile") || view.returnProfile,
    paymentProfile: fieldValue("sellerAutoPaymentProfile") || view.paymentProfile,
    itemSpecifics: parseJsonField("sellerAutoSpecifics", view.itemSpecifics),
    images: view.images,
  };
}

function setStatus(message, type = "") {
  const node = document.getElementById("sellerSellingStatusLine");
  if (!node) return;
  node.textContent = message;
  node.className = `seller-selling-statusline ${type}`.trim();
}

function setActivePanel(panel) {
  const valid = ["designer", "auto", "ready"].includes(panel) ? panel : "designer";
  document.querySelectorAll("[data-selling-panel]").forEach((node) => node.classList.toggle("active", node.dataset.sellingPanel === valid));
  document.querySelectorAll("[data-selling-nav]").forEach((node) => node.classList.toggle("active", node.dataset.sellingNav === valid));
  saveUiState({ activePanel: valid });
  if (valid === "auto") renderAutoListerPanel();
  if (valid === "ready") renderReadyPanel();
}

function keywordFromTitle(title) {
  return text(title).split(/\s+/).filter((word) => word.length > 2).slice(0, 4).join(" ");
}

function fillIfEmpty(id, value) {
  const input = document.getElementById(id);
  if (!input || !text(value) || text(input.value)) return false;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillDesignerFromSelectedProduct() {
  const product = selectedProduct();
  if (!product) {
    setStatus("Noch keine Seller-Arbeitskopie ausgewählt.", "bad");
    return;
  }
  const view = buildSellerListingView(product);
  const specifics = Object.entries(view.itemSpecifics).flatMap(([name, values]) => {
    const list = Array.isArray(values) ? values : [values];
    return list.map((value) => `${name}: ${value}`);
  });
  const featureText = specifics.slice(0, 6).join(", ");
  const keywords = [...new Set(text(view.listingTitle).toLowerCase().split(/[^a-z0-9äöüß]+/i).filter((word) => word.length >= 3))].slice(0, 10).join(", ");
  const fields = [
    ["gMainKeyword", keywordFromTitle(view.listingTitle)],
    ["gName", view.title],
    ["gFeature", featureText],
    ["gKeywords", keywords],
    ["listingTitle", view.listingTitle],
    ["listingBody", view.descriptionHtml],
    ["descScope", specifics.slice(0, 4).join(", ")],
  ];
  const filled = fields.reduce((count, [id, value]) => count + (fillIfEmpty(id, value) ? 1 : 0), 0);
  setStatus(
    filled
      ? `${filled} leere Designer-Felder wurden aus dem Seller Product Master ergänzt. Bestehende Eingaben blieben erhalten.`
      : "Alle passenden Designer-Felder enthalten bereits Werte. Es wurde nichts überschrieben.",
    "good"
  );
}

function designerHeaderHtml(view) {
  return `
    <div class="seller-selling-toolhead">
      <div><h3>🎨 Elyon Listing Designer</h3><p>Nutze den bestehenden vollständigen Titel-, SEO-, KI- und Beschreibungsgenerator. Produktdaten werden nur nach deinem Klick übernommen; bestehende Eingaben werden nicht überschrieben.</p></div>
      <div class="seller-selling-actions">
        <button type="button" class="secondary" id="sellerDesignerFillBtn">Produktdaten übernehmen</button>
        <button type="button" class="secondary" data-selling-nav-jump="auto">Weiter zum Auto Lister</button>
      </div>
    </div>
    <div class="seller-selling-summary">
      <div><small>Ausgewähltes Produkt</small><strong>${escapeHtml(view?.title || "Noch keine Arbeitskopie")}</strong></div>
      <div><small>Readiness</small><strong>${escapeHtml(view ? `${view.readinessScore} % · ${view.readinessState}` : "offen")}</strong></div>
      <div><small>Gewinn</small><strong>${view ? `${Number(view.profit || 0).toFixed(2)} €` : "offen"}</strong></div>
      <div><small>Veröffentlichung</small><strong>Nur manuell</strong></div>
    </div>
  `;
}

function renderDesignerContext() {
  const host = document.getElementById("sellerDesignerContext");
  if (!host) return;
  const product = selectedProduct();
  host.innerHTML = designerHeaderHtml(product ? buildSellerListingView(product) : null);
  document.getElementById("sellerDesignerFillBtn")?.addEventListener("click", fillDesignerFromSelectedProduct);
  host.querySelector('[data-selling-nav-jump="auto"]')?.addEventListener("click", () => setActivePanel("auto"));
}

function renderAutoListerPanel() {
  const root = document.getElementById("sellerAutoListerRoot");
  if (!root) return;
  const product = selectedProduct();
  if (!product) {
    root.innerHTML = '<div class="card"><h3>eBay Auto Lister</h3><div class="empty">Noch keine Seller-Arbeitskopie ausgewählt. Öffne zuerst „Produkte“ und übernimm ein freigegebenes Company-OS-Produkt.</div></div>';
    return;
  }
  const view = buildSellerListingView(product);
  const checks = buildAutoListerChecks(view);
  const readiness = autoListerReadiness(checks);
  const specifics = JSON.stringify(view.itemSpecifics, null, 2);
  root.innerHTML = `
    <div class="seller-selling-toolhead">
      <div><h3>⚡ eBay Auto Lister</h3><p>Erstellt einen strukturierten internen Seller-Entwurf, prüft Pflichtfelder und speichert ihn im Product Master. Es wird kein eBay-Angebot veröffentlicht.</p></div>
      <div class="seller-selling-actions"><button type="button" class="secondary" id="sellerAutoReloadBtn">Produkt neu laden</button><button type="button" data-selling-nav-jump="ready">Zum Abschluss</button></div>
    </div>
    <div class="seller-selling-grid">
      <section class="seller-selling-box">
        <h3>Entwurfsdaten</h3>
        <label>eBay-Titel · maximal 80 Zeichen</label><input id="sellerAutoTitle" maxlength="80" value="${escapeHtml(view.listingTitle)}">
        <label>Beschreibung</label><textarea id="sellerAutoDescription">${escapeHtml(view.descriptionHtml)}</textarea>
        <div class="row"><div><label>eBay Kategorie-ID</label><input id="sellerAutoCategoryId" inputmode="numeric" value="${escapeHtml(view.categoryId)}" placeholder="z. B. 12345"></div><div><label>Kategoriename</label><input id="sellerAutoCategoryName" value="${escapeHtml(view.categoryName)}"></div></div>
        <div class="row"><div><label>Condition ID</label><input id="sellerAutoConditionId" inputmode="numeric" value="${escapeHtml(view.conditionId)}" placeholder="z. B. 1000 für Neu – manuell prüfen"></div><div><label>Menge</label><input id="sellerAutoQuantity" type="number" min="1" step="1" value="${view.quantity}"></div></div>
        <div class="row"><div><label>Verkaufspreis €</label><input id="sellerAutoPrice" type="number" min="0" step="0.01" value="${view.price || ""}"></div><div><label>Bilder</label><input value="${view.images.length} HTTPS-Bild(er)" readonly></div></div>
        <label>Artikelmerkmale als JSON</label><textarea class="seller-selling-json" id="sellerAutoSpecifics">${escapeHtml(specifics)}</textarea>
        <details class="settings-dropdown" style="margin-top:12px"><summary>eBay-Richtlinienprofile</summary><div class="settings-dropdown-content"><label>Versandprofil</label><input id="sellerAutoShippingProfile" value="${escapeHtml(view.shippingProfile)}"><label>Rückgabeprofil</label><input id="sellerAutoReturnProfile" value="${escapeHtml(view.returnProfile)}"><label>Zahlungsprofil</label><input id="sellerAutoPaymentProfile" value="${escapeHtml(view.paymentProfile)}"></div></details>
        <div class="seller-selling-images" style="margin-top:14px">${view.images.map((url) => `<img src="${escapeHtml(url)}" alt="Produktbild" referrerpolicy="no-referrer">`).join("") || '<span class="hint">Keine geprüften HTTPS-Bilder vorhanden.</span>'}</div>
        <div class="seller-selling-actions" style="margin-top:16px"><button type="button" id="sellerAutoPrepareBtn">Entwurf prüfen</button><button type="button" class="secondary" id="sellerAutoSaveBtn">Internen Entwurf speichern</button></div>
        <div id="sellerAutoStatus" class="seller-selling-statusline">Noch keine Änderung gespeichert.</div>
      </section>
      <aside>
        <div class="seller-selling-score"><strong id="sellerAutoScore">${readiness.score}%</strong><span id="sellerAutoScoreText">${readiness.ready ? "Alle blockierenden Seller-Prüfungen sind erfüllt." : `${readiness.blockers.length} blockierende Punkte sind offen.`}</span></div>
        <div class="seller-selling-checks" id="sellerAutoChecks">${checksHtml(checks)}</div>
        <div class="seller-selling-lock" style="margin-top:12px"><strong>🔒 eBay-API-Übergabe gesperrt</strong>Das Seller Tool besitzt aktuell noch keinen geprüften Inventory-Entwurfsendpunkt mit vollständigen Policies und Scopes. Diese Sperre verhindert eine unbeabsichtigte Live-Aktion.</div>
        <button type="button" class="secondary full seller-selling-disabled" disabled style="margin-top:10px">eBay-Entwurf per API erstellen · noch nicht freigeschaltet</button>
      </aside>
    </div>
  `;

  const updateChecks = () => {
    try {
      const overrides = currentAutoListerOverrides(view);
      const draft = buildInternalAutoListerDraft(view, overrides);
      const checksRoot = document.getElementById("sellerAutoChecks");
      const score = document.getElementById("sellerAutoScore");
      const scoreText = document.getElementById("sellerAutoScoreText");
      if (checksRoot) checksRoot.innerHTML = checksHtml(draft.checks);
      if (score) score.textContent = `${draft.readiness.score}%`;
      if (scoreText) scoreText.textContent = draft.readiness.ready
        ? "Alle blockierenden Seller-Prüfungen sind erfüllt."
        : `${draft.readiness.blockers.length} blockierende Punkte sind offen.`;
      const status = document.getElementById("sellerAutoStatus");
      if (status) {
        status.className = `seller-selling-statusline ${statusClass(draft.readiness.ready)}`;
        status.textContent = draft.readiness.ready
          ? "Interner Entwurf ist vollständig genug für die bewusste manuelle eBay-Übertragung."
          : "Entwurf bleibt gespeichert möglich, aber noch nicht bereit zum manuellen Einstellen.";
      }
      return draft;
    } catch (error) {
      const status = document.getElementById("sellerAutoStatus");
      if (status) {
        status.className = "seller-selling-statusline bad";
        status.textContent = error.message;
      }
      return null;
    }
  };

  document.getElementById("sellerAutoPrepareBtn")?.addEventListener("click", updateChecks);
  document.getElementById("sellerAutoReloadBtn")?.addEventListener("click", renderAutoListerPanel);
  root.querySelector('[data-selling-nav-jump="ready"]')?.addEventListener("click", () => setActivePanel("ready"));
  document.getElementById("sellerAutoSaveBtn")?.addEventListener("click", async () => {
    const draft = updateChecks();
    if (!draft) return;
    const button = document.getElementById("sellerAutoSaveBtn");
    button.disabled = true;
    try {
      const updated = mergeSellerProductWithDraft(product, draft);
      replaceStoredProduct(updated);
      const status = document.getElementById("sellerAutoStatus");
      if (status) status.textContent = "Lokal gespeichert. Product Master wird aktualisiert …";
      await persistProduct(updated);
      if (status) {
        status.className = "seller-selling-statusline good";
        status.textContent = "Interner Auto-Lister-Entwurf wurde im Seller Product Master gespeichert. Keine eBay-Live-Aktion ausgeführt.";
      }
      renderDesignerContext();
    } catch (error) {
      const status = document.getElementById("sellerAutoStatus");
      if (status) {
        status.className = "seller-selling-statusline bad";
        status.textContent = `Lokal gespeichert, Serveraktualisierung fehlgeschlagen: ${error.message}`;
      }
    } finally {
      button.disabled = false;
    }
  });
}

async function copyText(value, statusNode, label) {
  try {
    await navigator.clipboard.writeText(text(value));
    statusNode.textContent = `${label} kopiert.`;
    statusNode.className = "seller-selling-statusline good";
  } catch {
    statusNode.textContent = `${label} konnte nicht kopiert werden.`;
    statusNode.className = "seller-selling-statusline bad";
  }
}

function renderReadyPanel() {
  const root = document.getElementById("sellerReadyRoot");
  if (!root) return;
  const product = selectedProduct();
  if (!product) {
    root.innerHTML = '<div class="card"><h3>Bereit zum Einstellen</h3><div class="empty">Noch keine Seller-Arbeitskopie ausgewählt.</div></div>';
    return;
  }
  const view = buildSellerListingView(product);
  const checks = buildAutoListerChecks(view);
  const readiness = autoListerReadiness(checks);
  const specifics = JSON.stringify(view.itemSpecifics, null, 2);
  const packageText = [
    `Produkt: ${view.title}`,
    `eBay-Titel: ${view.listingTitle}`,
    `Preis: ${view.price.toLocaleString("de-DE", { style: "currency", currency: view.currency || "EUR" })}`,
    `Kategorie-ID: ${view.categoryId || "offen"}`,
    `Condition ID: ${view.conditionId || "offen"}`,
    `Lieferzeit: ${view.deliveryTime || "offen"}`,
    `Rücksendeadresse: ${view.returnAddress || "offen"}`,
    `Artikelmerkmale: ${specifics}`,
    `Beschreibung:\n${view.descriptionHtml}`,
  ].join("\n\n");

  root.innerHTML = `
    <div class="seller-selling-toolhead">
      <div><h3>✅ Bereit zum Einstellen</h3><p>Finale Seller-Prüfung, Kopieransicht und Dokumentation nach deinem bewusst manuellen eBay-Listing.</p></div>
      <span class="status ${readiness.ready ? "good" : "bad"}">${readiness.ready ? "Bereit zum manuellen Einstellen" : "Noch blockiert"}</span>
    </div>
    <div class="seller-selling-summary">
      <div><small>Auto-Lister-Score</small><strong>${readiness.score} %</strong></div>
      <div><small>Blocker</small><strong>${readiness.blockers.length}</strong></div>
      <div><small>Readiness</small><strong>${escapeHtml(view.readinessState)}</strong></div>
      <div><small>Status</small><strong>${escapeHtml(view.listingStatus)}</strong></div>
    </div>
    ${readiness.ready ? '<div class="seller-selling-statusline good" style="margin-bottom:14px">Das Paket ist intern vollständig. Prüfe alle Angaben trotzdem bewusst, bevor du sie manuell bei eBay einträgst.</div>' : `<div class="seller-selling-statusline bad" style="margin-bottom:14px">${escapeHtml(readiness.blockers.join(" · ") || "Readiness ist noch nicht freigegeben.")}</div>`}
    <div class="seller-selling-manual-grid">
      <section class="seller-selling-box">
        <h3>Listing-Paket</h3>
        <div class="seller-selling-box"><h4>eBay-Titel</h4><div class="seller-selling-preview">${escapeHtml(view.listingTitle)}</div><div class="seller-selling-actions" style="margin-top:10px"><button type="button" class="secondary" data-ready-copy="title">Titel kopieren</button></div></div>
        <div class="seller-selling-box" style="margin-top:12px"><h4>Beschreibung</h4><div class="seller-selling-preview">${escapeHtml(view.descriptionHtml)}</div><div class="seller-selling-actions" style="margin-top:10px"><button type="button" class="secondary" data-ready-copy="description">Beschreibung kopieren</button></div></div>
        <div class="seller-selling-box" style="margin-top:12px"><h4>Artikelmerkmale</h4><pre class="seller-selling-preview">${escapeHtml(specifics)}</pre><div class="seller-selling-actions" style="margin-top:10px"><button type="button" class="secondary" data-ready-copy="all">Gesamtes Paket kopieren</button></div></div>
      </section>
      <aside class="seller-selling-box">
        <h3>Manuelles eBay-Listing dokumentieren</h3>
        <p class="hint">Diese Angaben werden nur intern gespeichert. Es wird kein Angebot erstellt, geändert oder veröffentlicht.</p>
        <label>eBay-Artikelnummer</label><input id="sellerReadyItemId" value="${escapeHtml(view.ebayItemId)}" placeholder="Nach dem manuellen Einstellen eintragen">
        <label>Status</label><select id="sellerReadyStatus"><option value="draft">Entwurf</option><option value="manually_listed">Manuell eingestellt</option><option value="live">Live</option><option value="ended">Beendet</option></select>
        <button type="button" class="full" id="sellerReadySaveBtn">Intern speichern</button>
        <div id="sellerReadyStatusLine" class="seller-selling-statusline">Keine Live-Aktion. Nur interne Dokumentation.</div>
        <div class="seller-selling-lock" style="margin-top:12px"><strong>Veröffentlichung bleibt manuell</strong>Eine automatische eBay-Veröffentlichung ist im Elyon Seller Tool weiterhin gesperrt.</div>
      </aside>
    </div>
  `;
  const select = document.getElementById("sellerReadyStatus");
  if (select) select.value = ["draft", "manually_listed", "live", "ended"].includes(view.listingStatus) ? view.listingStatus : "draft";
  const statusNode = document.getElementById("sellerReadyStatusLine");
  root.querySelector('[data-ready-copy="title"]')?.addEventListener("click", () => copyText(view.listingTitle, statusNode, "Titel"));
  root.querySelector('[data-ready-copy="description"]')?.addEventListener("click", () => copyText(view.descriptionHtml, statusNode, "Beschreibung"));
  root.querySelector('[data-ready-copy="all"]')?.addEventListener("click", () => copyText(packageText, statusNode, "Listing-Paket"));
  document.getElementById("sellerReadySaveBtn")?.addEventListener("click", async () => {
    const button = document.getElementById("sellerReadySaveBtn");
    button.disabled = true;
    const itemId = fieldValue("sellerReadyItemId");
    const status = fieldValue("sellerReadyStatus") || "draft";
    try {
      const updated = mergeSellerManualListingMeta(product, itemId, status);
      replaceStoredProduct(updated);
      statusNode.textContent = "Lokal gespeichert. Product Master wird aktualisiert …";
      await persistProduct(updated);
      statusNode.className = "seller-selling-statusline good";
      statusNode.textContent = "Seller-Status und eBay-Artikelnummer wurden intern gespeichert. Keine eBay-Live-Aktion ausgeführt.";
    } catch (error) {
      statusNode.className = "seller-selling-statusline bad";
      statusNode.textContent = `Lokal gespeichert, Serveraktualisierung fehlgeschlagen: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
}

function buildShell(tab) {
  if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
  installStyles();
  const original = document.createElement("div");
  original.className = "seller-designer-original";
  original.id = "sellerOriginalDesigner";
  while (tab.firstChild) original.appendChild(tab.firstChild);

  const shell = document.createElement("section");
  shell.id = ROOT_ID;
  shell.className = "seller-selling-shell";
  shell.innerHTML = `
    <div class="card">
      <div class="seller-selling-head">
        <div><div class="badge">Elyon Seller Tool</div><h2>Verkaufen</h2><p>Vom freigegebenen Product-Master-Datensatz über den Listing Designer und Auto Lister bis zum kontrollierten manuellen eBay-Listing.</p></div>
        <div class="seller-selling-status"><span class="pill">Keine automatische Veröffentlichung</span><span class="pill">Product Master bleibt Hauptquelle</span></div>
      </div>
      <nav class="seller-selling-nav" aria-label="Verkaufsbereiche">
        <button type="button" data-selling-nav="designer"><strong>1 · Listing Designer</strong><span>Titel, Beschreibung, SEO und Design bearbeiten</span></button>
        <button type="button" data-selling-nav="auto"><strong>2 · eBay Auto Lister</strong><span>Pflichtfelder prüfen und internen Entwurf speichern</span></button>
        <button type="button" data-selling-nav="ready"><strong>3 · Bereit zum Einstellen</strong><span>Paket kopieren und manuelles Listing dokumentieren</span></button>
      </nav>
      <div id="sellerSellingStatusLine" class="seller-selling-statusline">Seller-Verkaufsflow geladen. Keine Live-Aktion.</div>
    </div>
    <div class="seller-selling-panel" data-selling-panel="designer"><div id="sellerDesignerContext"></div><div id="sellerDesignerOriginalHost"></div></div>
    <div class="seller-selling-panel" data-selling-panel="auto"><div id="sellerAutoListerRoot"></div></div>
    <div class="seller-selling-panel" data-selling-panel="ready"><div id="sellerReadyRoot"></div></div>
  `;
  tab.appendChild(shell);
  shell.querySelector("#sellerDesignerOriginalHost")?.appendChild(original);
  shell.querySelectorAll("[data-selling-nav]").forEach((button) => button.addEventListener("click", () => setActivePanel(button.dataset.sellingNav)));
  renderDesignerContext();
  setActivePanel(readUiState().activePanel || "designer");
  return shell;
}

function render() {
  const tab = document.getElementById("ebayListingTab");
  if (!tab) return false;
  buildShell(tab);
  renderDesignerContext();
  const active = readUiState().activePanel || "designer";
  if (active === "auto") renderAutoListerPanel();
  if (active === "ready") renderReadyPanel();
  return true;
}

function boot() {
  render();
  window.addEventListener("elyon:seller-product-selected", () => {
    renderDesignerContext();
    const active = readUiState().activePanel || "designer";
    if (active === "auto") renderAutoListerPanel();
    if (active === "ready") renderReadyPanel();
  });
  window.addEventListener("storage", (event) => {
    if ([LOCAL_KEY, SELECTED_KEY].includes(event.key)) {
      renderDesignerContext();
      const active = readUiState().activePanel || "designer";
      if (active === "auto") renderAutoListerPanel();
      if (active === "ready") renderReadyPanel();
    }
  });
  window.setTimeout(render, 500);
  window.setTimeout(render, 1600);
}

window.ElyonSellerSellingFlow = { render, setActivePanel, buildSellerListingView };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

export { render as renderSellerSellingFlow };