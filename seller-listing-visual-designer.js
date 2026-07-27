import {
  THEMES,
  normalizeVisualDraft,
  visualDraftFromListingView,
  mergeVisualDraft,
  evaluateVisualDraft,
  buildVisualListingHtml,
  mergeProductWithVisualDraft,
  esc,
  text,
} from "/seller-listing-visual-core.js";
import {
  buildSellerListingView,
  sellerProductIdentity,
  sellerProductPayload,
} from "/seller-selling-flow-core.js";

const PRODUCTS_KEY = "elyonProducts";
const SELECTED_KEY = "elyonSelectedSellerProductId";
const UI_KEY = "elyon_seller_visual_designer_v1";
const ROOT_ID = "sellerVisualDesignerModule";
let currentProduct = null;
let draft = null;
let activeMode = "generator";
let previewMode = "desktop";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

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
  const server = object(product.rawServerProduct || product.raw || product);
  return [sellerProductIdentity(product), product.id, product.sellerToolMasterProductId, server.id, server.companyOsProductId]
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
  window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
  return data;
}

function readUi() {
  try {
    return object(JSON.parse(localStorage.getItem(UI_KEY) || "{}"));
  } catch {
    return {};
  }
}

function saveUi(patch = {}) {
  localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch, updatedAt: new Date().toISOString() }));
}

function storedDesign(product) {
  const server = object(product?.rawServerProduct || product?.raw || product);
  const listing = object(server.listing || product?.listing);
  return listing.descriptionDesignDraft || listing.descriptionDesign || null;
}

function loadDraft() {
  currentProduct = selectedProduct();
  if (!currentProduct) {
    draft = normalizeVisualDraft({});
    return;
  }
  const view = buildSellerListingView(currentProduct);
  draft = normalizeVisualDraft(storedDesign(currentProduct) || visualDraftFromListingView(view));
}

function installStyles() {
  if (document.getElementById("sellerVisualDesignerStyles")) return;
  const style = document.createElement("style");
  style.id = "sellerVisualDesignerStyles";
  style.textContent = `
    .svd-switch{display:flex;gap:8px;flex-wrap:wrap;padding:10px;margin:0 0 14px;border-radius:18px;background:rgba(2,6,23,.38);border:1px solid rgba(255,255,255,.09)}
    .svd-switch button{flex:1;min-width:190px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);text-align:left}
    .svd-switch button.active{background:linear-gradient(135deg,#2563eb,#7c3aed)}
    .svd-switch button strong,.svd-switch button span{display:block}.svd-switch button span{font-size:11px;color:#cbd5e1;margin-top:3px}
    .svd-shell{display:grid;grid-template-columns:minmax(390px,.86fr) minmax(460px,1.14fr);gap:16px;align-items:start}
    .svd-editor,.svd-preview{padding:17px;border-radius:22px;background:rgba(2,6,23,.38);border:1px solid rgba(255,255,255,.09)}
    .svd-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}.svd-toolbar h3{margin:0 0 4px}.svd-toolbar p{margin:0;color:#94a3b8;font-size:12px;line-height:1.45}.svd-actions{display:flex;gap:7px;flex-wrap:wrap}
    .svd-score{padding:12px 14px;border-radius:16px;background:rgba(59,130,246,.1);border:1px solid rgba(96,165,250,.2);margin-bottom:12px}.svd-score-top{display:flex;justify-content:space-between;gap:10px}.svd-score strong{font-size:20px}.svd-score small{color:#cbd5e1}.svd-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.1);margin-top:8px;overflow:hidden}.svd-bar span{display:block;height:100%;background:linear-gradient(90deg,#ef4444,#facc15,#22c55e)}.svd-warnings{margin:8px 0 0;padding-left:18px;color:#fde68a;font-size:11px;line-height:1.5}.svd-warnings.good{list-style:none;padding-left:0;color:#86efac}
    .svd-themes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.svd-theme{padding:9px;border-radius:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);cursor:pointer}.svd-theme.active{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.2)}.svd-swatch{height:23px;border-radius:7px;margin-bottom:6px}.svd-theme strong{font-size:11px}.svd-theme small{display:block;color:#94a3b8;font-size:9px;margin-top:2px}
    .svd-section{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}.svd-section h4{margin:0 0 10px;color:#bfdbfe}.svd-section label{font-size:11px}.svd-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.svd-repeat{display:grid;gap:8px}.svd-repeat-row{display:grid;grid-template-columns:minmax(120px,.7fr) minmax(160px,1.3fr) auto;gap:8px;align-items:start;padding:9px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.svd-repeat-row input{margin:0}.svd-repeat-row button{padding:10px 11px}
    .svd-images{display:grid;gap:8px}.svd-image{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.svd-image img{width:70px;height:70px;object-fit:cover;border-radius:10px}.svd-image small{overflow-wrap:anywhere;color:#94a3b8}.svd-image-actions{display:grid;grid-template-columns:repeat(2,36px);gap:5px}.svd-image-actions button{padding:8px 5px;font-size:12px}
    .svd-ai{padding:13px;border-radius:17px;background:rgba(139,92,246,.1);border:1px solid rgba(167,139,250,.2)}.svd-ai-range{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.svd-ai-range input{margin:0}.svd-ai-output{margin-top:8px;font-size:11px;color:#cbd5e1;line-height:1.45}
    .svd-preview{position:sticky;top:14px}.svd-preview-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.svd-device{display:flex;gap:5px}.svd-device button{padding:8px 10px;font-size:11px}.svd-device button.active{background:linear-gradient(135deg,#2563eb,#7c3aed)}.svd-stage{margin-top:12px;height:720px;padding:13px;border-radius:18px;background:#dce2e9;overflow:auto;text-align:center}.svd-stage iframe{width:100%;height:100%;border:0;background:#fff;box-shadow:0 8px 24px rgba(16,24,40,.15);transition:width .2s}.svd-stage iframe.mobile{width:390px;max-width:100%}.svd-code{display:none;margin-top:12px}.svd-code.open{display:block}.svd-code textarea{min-height:240px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;background:#07101f}.svd-status{margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);font-size:11px;color:#cbd5e1}.svd-status.good{color:#bbf7d0;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.08)}.svd-status.bad{color:#fecaca;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08)}
    @media(max-width:1020px){.svd-shell{grid-template-columns:1fr}.svd-preview{position:relative}.svd-stage{height:650px}}
    @media(max-width:680px){.svd-themes{grid-template-columns:1fr 1fr}.svd-row{grid-template-columns:1fr}.svd-repeat-row{grid-template-columns:1fr}.svd-image{grid-template-columns:62px minmax(0,1fr)}.svd-image img{width:62px;height:62px}.svd-image-actions{grid-column:1/-1;display:flex}.svd-stage{padding:5px;height:600px}}
  `;
  document.head.appendChild(style);
}

function setStatus(message, type = "") {
  const node = document.getElementById("svdStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `svd-status ${type}`.trim();
}

function generatorValues() {
  return {
    title: text(document.getElementById("listingTitle")?.value || document.getElementById("gName")?.value),
    longDescription: text(document.getElementById("listingBody")?.value || document.getElementById("descScope")?.value),
    shortDescription: text(document.getElementById("gFeature")?.value),
    subtitle: text(document.getElementById("gFeature")?.value),
  };
}

function syncForm() {
  const value = (id) => text(document.getElementById(id)?.value);
  draft = normalizeVisualDraft({
    ...draft,
    category: value("svdCategory"),
    title: value("svdTitle"),
    subtitle: value("svdSubtitle"),
    imageUrl: value("svdImageUrl"),
    shortDescription: value("svdShort"),
    longDescription: value("svdLong"),
    packageContents: value("svdPackage"),
    importantNotes: value("svdNotes"),
    shippingText: value("svdShipping"),
    returnsText: value("svdReturns"),
    serviceText: value("svdService"),
    features: [...document.querySelectorAll("[data-svd-feature]")].map((row) => ({ title: value(row.dataset.titleId), text: value(row.dataset.textId) })),
    specs: [...document.querySelectorAll("[data-svd-spec]")].map((row) => ({ name: value(row.dataset.nameId), value: value(row.dataset.valueId) })),
  });
}

function repeatHtml(entries, type) {
  return entries.map((entry, index) => {
    const firstId = `svd-${type}-a-${index}`;
    const secondId = `svd-${type}-b-${index}`;
    const first = type === "feature" ? entry.title : entry.name;
    const second = type === "feature" ? entry.text : entry.value;
    const attrs = type === "feature" ? `data-svd-feature data-title-id="${firstId}" data-text-id="${secondId}"` : `data-svd-spec data-name-id="${firstId}" data-value-id="${secondId}"`;
    return `<div class="svd-repeat-row" ${attrs}><input id="${firstId}" value="${esc(first)}" placeholder="${type === "feature" ? "Vorteil" : "Merkmal"}"><input id="${secondId}" value="${esc(second)}" placeholder="${type === "feature" ? "Nutzen erklären" : "Wert"}"><button type="button" class="danger" data-svd-remove="${type}" data-index="${index}">×</button></div>`;
  }).join("");
}

function imagesHtml() {
  return draft.images.map((url, index) => `<div class="svd-image"><img src="${esc(url)}" alt="Bild ${index + 1}" referrerpolicy="no-referrer"><small>${index === 0 ? "Hauptbild · " : ""}${esc(url)}</small><div class="svd-image-actions"><button type="button" class="secondary" data-svd-image="left" data-index="${index}">←</button><button type="button" class="secondary" data-svd-image="right" data-index="${index}">→</button><button type="button" class="secondary" data-svd-image="main" data-index="${index}">★</button><button type="button" class="danger" data-svd-image="remove" data-index="${index}">×</button></div></div>`).join("") || '<div class="hint">Noch keine HTTPS-Bilder.</div>';
}

function themesHtml() {
  return Object.entries(THEMES).map(([key, theme]) => `<button type="button" class="svd-theme ${draft.theme === key ? "active" : ""}" data-svd-theme="${key}"><span class="svd-swatch" style="background:linear-gradient(90deg,${theme.brand} 58%,${theme.accent} 58%)"></span><strong>${esc(theme.label)}</strong><small>${esc(theme.category)}</small></button>`).join("");
}

function updatePreview() {
  syncForm();
  const html = buildVisualListingHtml(draft);
  const frame = document.getElementById("svdPreviewFrame");
  const code = document.getElementById("svdCode");
  if (frame) {
    frame.srcdoc = html;
    frame.classList.toggle("mobile", previewMode === "mobile");
  }
  if (code) code.value = html;
  const quality = evaluateVisualDraft(draft);
  const score = document.getElementById("svdScore");
  const bar = document.getElementById("svdScoreBar");
  const warnings = document.getElementById("svdWarnings");
  if (score) score.textContent = `${quality.score} %`;
  if (bar) bar.style.width = `${quality.score}%`;
  if (warnings) {
    warnings.className = `svd-warnings ${quality.ready ? "good" : ""}`;
    warnings.innerHTML = quality.ready ? "<li>Visuelles Listing-Paket vollständig.</li>" : quality.warnings.map((item) => `<li>${esc(item)}</li>`).join("");
  }
}

function renderVisual() {
  const root = document.getElementById("svdVisualPanel");
  if (!root) return;
  const quality = evaluateVisualDraft(draft);
  root.innerHTML = `<div class="svd-shell"><section class="svd-editor"><div class="svd-toolbar"><div><h3>🎨 Elyon Visual Designer</h3><p>Themes, Live-Vorschau, HTML-Paket, Bildreihenfolge und Product-Master-Speicherung.</p></div><div class="svd-actions"><button type="button" class="secondary" id="svdProductFill">Produktdaten</button><button type="button" class="secondary" id="svdGeneratorFill">KI-Generator übernehmen</button></div></div><div class="svd-score"><div class="svd-score-top"><strong id="svdScore">${quality.score} %</strong><small>Design- und Inhaltsprüfung</small></div><div class="svd-bar"><span id="svdScoreBar" style="width:${quality.score}%"></span></div><ul id="svdWarnings" class="svd-warnings ${quality.ready ? "good" : ""}">${quality.ready ? "<li>Visuelles Listing-Paket vollständig.</li>" : quality.warnings.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div><div class="svd-section"><h4>Design</h4><div class="svd-themes">${themesHtml()}</div></div><div class="svd-section"><h4>Produkt und Text</h4><label>Kategorie</label><input id="svdCategory" value="${esc(draft.category)}"><label>eBay-Titel · maximal 80 Zeichen</label><input id="svdTitle" maxlength="80" value="${esc(draft.title)}"><label>Untertitel</label><input id="svdSubtitle" maxlength="180" value="${esc(draft.subtitle)}"><label>Hauptbild-URL</label><input id="svdImageUrl" value="${esc(draft.imageUrl)}"><label>Kurze Einleitung</label><textarea id="svdShort">${esc(draft.shortDescription)}</textarea><label>Ausführliche Beschreibung</label><textarea id="svdLong" style="min-height:180px">${esc(draft.longDescription)}</textarea></div><div class="svd-section svd-ai"><h4>DeepSeek-Optimierung</h4><div class="svd-ai-range"><input id="svdAiStrength" type="range" min="0" max="100" value="${Number(readUi().aiStrength ?? 45)}"><strong id="svdAiStrengthLabel">${Number(readUi().aiStrength ?? 45)} %</strong></div><div class="svd-actions" style="margin-top:10px"><button type="button" id="svdAiRun">Mit DeepSeek verbessern</button><button type="button" class="secondary" id="svdAiCheck">Status prüfen</button></div><div id="svdAiOutput" class="svd-ai-output">Nur faktengebundene Vorschläge; bestehender Seller-KI-Generator bleibt als Fallback erhalten.</div></div><div class="svd-section"><h4>Produktvorteile</h4><div class="svd-repeat" id="svdFeatures">${repeatHtml(draft.features, "feature")}</div><button type="button" class="secondary" data-svd-add="feature">+ Vorteil</button></div><div class="svd-section"><h4>Artikelmerkmale</h4><div class="svd-repeat" id="svdSpecs">${repeatHtml(draft.specs, "spec")}</div><button type="button" class="secondary" data-svd-add="spec">+ Merkmal</button></div><div class="svd-section"><h4>Lieferumfang und Hinweise</h4><label>Lieferumfang</label><textarea id="svdPackage">${esc(draft.packageContents)}</textarea><label>Wichtige Hinweise</label><textarea id="svdNotes">${esc(draft.importantNotes)}</textarea></div><div class="svd-section"><h4>Versand, Rückgabe und Service</h4><label>Versand</label><textarea id="svdShipping">${esc(draft.shippingText)}</textarea><label>Rückgabe</label><textarea id="svdReturns">${esc(draft.returnsText)}</textarea><label>Service</label><textarea id="svdService">${esc(draft.serviceText)}</textarea></div><div class="svd-section"><h4>Bilder</h4><div class="svd-images" id="svdImages">${imagesHtml()}</div><div class="svd-row" style="margin-top:9px"><input id="svdNewImage" placeholder="HTTPS-Bild-URL"><button type="button" class="secondary" id="svdAddImage">Bild hinzufügen</button></div></div><div class="svd-actions" style="margin-top:16px"><button type="button" id="svdSave">Im Seller Product Master speichern</button><button type="button" class="secondary" id="svdExportJson">JSON exportieren</button><button type="button" class="secondary" id="svdImportJson">JSON importieren</button><input type="file" id="svdImportFile" accept="application/json" hidden></div><div id="svdStatus" class="svd-status">Keine automatische Veröffentlichung.</div></section><aside class="svd-preview"><div class="svd-preview-head"><div><h3>Live-Vorschau</h3><p class="hint">Das HTML enthält keine Skripte oder externen Tracking-Code.</p></div><div class="svd-device"><button type="button" class="secondary ${previewMode === "desktop" ? "active" : ""}" data-svd-device="desktop">Desktop</button><button type="button" class="secondary ${previewMode === "mobile" ? "active" : ""}" data-svd-device="mobile">Mobil</button></div></div><div class="svd-stage"><iframe id="svdPreviewFrame" title="Listing-Vorschau" sandbox="allow-same-origin"></iframe></div><div class="svd-actions" style="margin-top:10px"><button type="button" class="secondary" id="svdToggleCode">HTML anzeigen</button><button type="button" class="secondary" id="svdCopyHtml">HTML kopieren</button><button type="button" class="secondary" id="svdDownloadHtml">HTML herunterladen</button></div><div class="svd-code" id="svdCodeBox"><textarea id="svdCode" readonly></textarea></div></aside></div>`;
  bindVisualEvents();
  updatePreview();
}

function switchMode(mode) {
  activeMode = mode === "visual" ? "visual" : "generator";
  saveUi({ activeMode });
  document.querySelectorAll("[data-svd-mode]").forEach((button) => button.classList.toggle("active", button.dataset.svdMode === activeMode));
  document.getElementById("sellerDesignerOriginalHost")?.classList.toggle("hidden", activeMode !== "generator");
  document.getElementById("svdVisualPanel")?.classList.toggle("hidden", activeMode !== "visual");
  if (activeMode === "visual") renderVisual();
}

async function copy(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(`${label} kopiert.`, "good");
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    setStatus(`${label} kopiert.`, "good");
  }
}

function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function runDeepSeek() {
  syncForm();
  const strength = Number(document.getElementById("svdAiStrength")?.value || 45);
  saveUi({ aiStrength: strength });
  const output = document.getElementById("svdAiOutput");
  const button = document.getElementById("svdAiRun");
  button.disabled = true;
  output.textContent = "DeepSeek erstellt einen faktengebundenen Vorschlag …";
  try {
    const view = currentProduct ? buildSellerListingView(currentProduct) : {};
    const response = await fetch("/api/seller-listing-ai", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ strength, product: view, draft }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    const proposed = normalizeVisualDraft({ ...draft, ...data.result });
    draft = mergeVisualDraft(draft, proposed, confirm("DeepSeek-Vorschlag vollständig übernehmen? Abbrechen = nur bisher leere Felder ergänzen.") ? "all" : "missing");
    renderVisual();
    setStatus("DeepSeek-Vorschlag übernommen. Bitte alle Aussagen kontrollieren.", "good");
    const warnings = Array.isArray(data.result?.warnings) ? data.result.warnings : [];
    document.getElementById("svdAiOutput").textContent = warnings.length ? `Prüfhinweise: ${warnings.join(" · ")}` : `DeepSeek ${data.model || ""} · Vorschlag erstellt.`;
  } catch (error) {
    output.textContent = `${error.message} Nutze alternativ den bestehenden Seller-KI-Generator und „KI-Generator übernehmen“.`;
    setStatus("DeepSeek-Vorschlag nicht verfügbar; bestehende Designer-Daten bleiben unverändert.", "bad");
  } finally {
    button.disabled = false;
  }
}

async function checkDeepSeek() {
  const output = document.getElementById("svdAiOutput");
  try {
    const response = await fetch("/api/seller-listing-ai", { credentials: "same-origin", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    output.textContent = data.configured ? `DeepSeek bereit · ${data.model}` : "DeepSeek noch nicht serverseitig konfiguriert. Der Seller-KI-Generator bleibt nutzbar.";
  } catch {
    output.textContent = "DeepSeek-Status konnte nicht geladen werden.";
  }
}

function moveImage(action, index) {
  syncForm();
  const items = [...draft.images];
  if (!items[index]) return;
  if (action === "left" && index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]];
  if (action === "right" && index < items.length - 1) [items[index + 1], items[index]] = [items[index], items[index + 1]];
  if (action === "main") items.unshift(items.splice(index, 1)[0]);
  if (action === "remove") items.splice(index, 1);
  draft.images = items;
  draft.imageUrl = items[0] || "";
  renderVisual();
}

function bindVisualEvents() {
  const root = document.getElementById("svdVisualPanel");
  root?.addEventListener("input", (event) => {
    if (event.target.id === "svdAiStrength") {
      document.getElementById("svdAiStrengthLabel").textContent = `${event.target.value} %`;
      return;
    }
    clearTimeout(root._previewTimer);
    root._previewTimer = setTimeout(updatePreview, 120);
  });
  root?.addEventListener("click", async (event) => {
    const theme = event.target.closest("[data-svd-theme]");
    if (theme) { syncForm(); draft.theme = theme.dataset.svdTheme; renderVisual(); return; }
    const add = event.target.closest("[data-svd-add]");
    if (add) { syncForm(); add.dataset.svdAdd === "feature" ? draft.features.push({ title: "", text: "" }) : draft.specs.push({ name: "", value: "" }); renderVisual(); return; }
    const remove = event.target.closest("[data-svd-remove]");
    if (remove) { syncForm(); remove.dataset.svdRemove === "feature" ? draft.features.splice(Number(remove.dataset.index), 1) : draft.specs.splice(Number(remove.dataset.index), 1); renderVisual(); return; }
    const image = event.target.closest("[data-svd-image]");
    if (image) { moveImage(image.dataset.svdImage, Number(image.dataset.index)); return; }
    const device = event.target.closest("[data-svd-device]");
    if (device) { previewMode = device.dataset.svdDevice; saveUi({ previewMode }); renderVisual(); return; }
    if (event.target.closest("#svdProductFill")) { syncForm(); const proposed = currentProduct ? visualDraftFromListingView(buildSellerListingView(currentProduct)) : {}; draft = mergeVisualDraft(draft, proposed, confirm("Produktdaten vollständig übernehmen? Abbrechen = nur Lücken ergänzen.") ? "all" : "missing"); renderVisual(); return; }
    if (event.target.closest("#svdGeneratorFill")) { syncForm(); draft = mergeVisualDraft(draft, generatorValues(), confirm("KI-Generator-Texte vollständig übernehmen? Abbrechen = nur Lücken ergänzen.") ? "all" : "missing"); renderVisual(); return; }
    if (event.target.closest("#svdAiRun")) { await runDeepSeek(); return; }
    if (event.target.closest("#svdAiCheck")) { await checkDeepSeek(); return; }
    if (event.target.closest("#svdAddImage")) { syncForm(); const url = text(document.getElementById("svdNewImage")?.value); try { if (new URL(url).protocol !== "https:") throw new Error(); } catch { setStatus("Nur gültige HTTPS-Bilder sind erlaubt.", "bad"); return; } if (!draft.images.includes(url)) draft.images.push(url); draft.imageUrl ||= url; renderVisual(); return; }
    if (event.target.closest("#svdToggleCode")) { document.getElementById("svdCodeBox")?.classList.toggle("open"); return; }
    if (event.target.closest("#svdCopyHtml")) { syncForm(); await copy(buildVisualListingHtml(draft), "HTML"); return; }
    if (event.target.closest("#svdDownloadHtml")) { syncForm(); downloadFile(buildVisualListingHtml(draft), "elyon-listing.html", "text/html;charset=utf-8"); return; }
    if (event.target.closest("#svdExportJson")) { syncForm(); downloadFile(JSON.stringify(draft, null, 2), "elyon-listing-design.json", "application/json;charset=utf-8"); return; }
    if (event.target.closest("#svdImportJson")) { document.getElementById("svdImportFile")?.click(); return; }
    if (event.target.closest("#svdSave")) {
      syncForm();
      if (!currentProduct) { setStatus("Keine Seller-Arbeitskopie ausgewählt.", "bad"); return; }
      const button = document.getElementById("svdSave");
      button.disabled = true;
      try {
        const updated = mergeProductWithVisualDraft(currentProduct, draft);
        replaceStoredProduct(updated);
        setStatus("Lokal gespeichert. Product Master wird aktualisiert …");
        await persistProduct(updated);
        currentProduct = updated;
        draft = normalizeVisualDraft(storedDesign(updated));
        setStatus("Visuelles Listing-Paket im Seller Product Master gespeichert. Keine eBay-Live-Aktion ausgeführt.", "good");
      } catch (error) {
        setStatus(`Lokal gespeichert, Serveraktualisierung fehlgeschlagen: ${error.message}`, "bad");
      } finally {
        button.disabled = false;
      }
    }
  });
  document.getElementById("svdImportFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { draft = normalizeVisualDraft(JSON.parse(await file.text())); renderVisual(); setStatus("JSON-Entwurf importiert. Bitte kontrollieren und speichern.", "good"); } catch { setStatus("JSON-Datei ist ungültig.", "bad"); }
    event.target.value = "";
  });
}

function mount() {
  const context = document.getElementById("sellerDesignerContext");
  const originalHost = document.getElementById("sellerDesignerOriginalHost");
  if (!context || !originalHost) return false;
  installStyles();
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `<nav class="svd-switch"><button type="button" data-svd-mode="generator"><strong>✨ Titel & KI-Generator</strong><span>Bestehende Seller-Funktionen unverändert nutzen</span></button><button type="button" data-svd-mode="visual"><strong>🎨 Elyon Visual Designer</strong><span>Themes, Vorschau, Bilder, HTML und Listing-Paket</span></button></nav><div id="svdVisualPanel" class="hidden"></div>`;
    context.insertAdjacentElement("afterend", root);
    root.querySelectorAll("[data-svd-mode]").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.svdMode)));
  }
  loadDraft();
  const ui = readUi();
  previewMode = ui.previewMode === "mobile" ? "mobile" : "desktop";
  switchMode(ui.activeMode || "generator");
  return true;
}

function refresh() {
  const next = selectedProduct();
  if (sellerProductIdentity(next || {}) !== sellerProductIdentity(currentProduct || {})) {
    loadDraft();
    if (activeMode === "visual") renderVisual();
  }
  mount();
}

if (!mount()) {
  let tries = 0;
  const timer = setInterval(() => { tries += 1; if (mount() || tries > 50) clearInterval(timer); }, 100);
}
window.addEventListener("elyon:seller-product-selected", refresh);
window.addEventListener("storage", (event) => { if ([PRODUCTS_KEY, SELECTED_KEY].includes(event.key)) refresh(); });
window.ElyonSellerVisualDesigner = { mount, refresh, getDraft: () => draft, buildHtml: () => buildVisualListingHtml(draft || {}) };