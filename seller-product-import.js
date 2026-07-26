(() => {
  "use strict";

  const ROOT_ID = "elyonCompanyOsProductImport";
  const LIST_ID = "elyonCompanyOsProductImportList";
  const STATUS_ID = "elyonCompanyOsProductImportStatus";
  const BUTTON_ID = "elyonCompanyOsProductImportRefresh";
  const LOCAL_KEY = "elyonProducts";
  let loading = false;

  const text = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function number(value) {
    if (value && typeof value === "object") return number(value.value ?? value.amount ?? value.cost ?? value.price);
    const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function money(value) {
    return number(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function layers(item) {
    const result = [];
    let current = item;
    for (let index = 0; index < 5; index += 1) {
      if (!current || typeof current !== "object" || Array.isArray(current) || result.includes(current)) break;
      result.push(current);
      current = current.raw;
    }
    return result;
  }

  function first(item, reader) {
    for (const layer of layers(item)) {
      const value = reader(layer);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  function isCompanyOs(item) {
    return layers(item).some((layer) => {
      const source = text(layer.source).toLowerCase();
      const provider = text(layer.sourceProvider).toLowerCase();
      const type = text(layer.sourceType).toLowerCase();
      return Boolean(
        layer.companyOsProductId ||
        source === "elyon_company_os" ||
        provider === "company-os" ||
        type === "company_os_review"
      );
    });
  }

  function normalize(item) {
    const id = text(first(item, (layer) => layer.id || layer.masterProductId || layer.productId));
    const companyOsProductId = text(first(item, (layer) => layer.companyOsProductId));
    const title = text(first(item, (layer) => layer.title || layer.name || layer.productName)) || "Unbenanntes Produkt";
    const supplier = text(first(item, (layer) => {
      if (layer.supplier && typeof layer.supplier === "object") return layer.supplier.name;
      return layer.supplier || layer.supplierName || layer.sourceLabel;
    })) || "Quelle offen";
    const supplierUrl = text(first(item, (layer) => {
      if (layer.supplier && typeof layer.supplier === "object") return layer.supplier.url;
      return layer.supplierUrl || layer.url || layer.productUrl || layer.sourceUrl;
    }));
    const buyPrice = number(first(item, (layer) => layer.pricing?.buyPrice ?? layer.buyPrice ?? layer.costPrice ?? layer.buy ?? layer.cost ?? layer.purchasePrice));
    const salePrice = number(first(item, (layer) => layer.pricing?.salePrice ?? layer.salePrice ?? layer.sellPrice ?? layer.sell ?? layer.price));
    const status = text(first(item, (layer) => layer.listing?.status || layer.listingStatus || layer.productStatus || layer.status)) || "Draft";
    const images = [];
    for (const layer of layers(item)) {
      if (Array.isArray(layer.images)) images.push(...layer.images);
      if (layer.image) images.push(layer.image);
    }
    const cleanImages = [...new Set(images
      .map((entry) => typeof entry === "string" ? entry : entry?.url || entry?.src || "")
      .map(text)
      .filter((url) => /^https?:\/\//i.test(url)))];

    return {
      id: id || companyOsProductId || supplierUrl || `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sellerToolMasterProductId: id || companyOsProductId,
      companyOsProductId,
      title,
      name: title,
      supplier,
      supplierName: supplier,
      supplierUrl,
      url: supplierUrl,
      buyPrice,
      buy: buyPrice,
      cost: buyPrice,
      salePrice,
      sell: salePrice,
      price: salePrice,
      status,
      productStatus: status,
      image: cleanImages[0] || "",
      images: cleanImages,
      sourceSystem: isCompanyOs(item) ? "Elyon Company OS" : text(first(item, (layer) => layer.source)) || "Serverimport",
      serverProductMaster: true,
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
      rawServerProduct: item,
    };
  }

  function removeLegacyUi() {
    [
      "elyonProductMasterPanelV2",
      "elyonProductMasterLauncherV2",
      "elyonProductMasterV3",
      "elyonProductMasterV3Launcher",
      "elyonProductMasterSyncBanner",
      "elyonProductMasterRefreshBtn",
    ].forEach((id) => document.getElementById(id)?.remove());
  }

  function installStyles() {
    if (document.getElementById("elyonCompanyOsProductImportStyles")) return;
    const style = document.createElement("style");
    style.id = "elyonCompanyOsProductImportStyles";
    style.textContent = `
      #${ROOT_ID}{margin:16px 0;padding:17px;border-radius:18px;background:rgba(2,6,23,.34);border:1px solid rgba(34,197,94,.25)}
      .elyon-import-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.elyon-import-head h3{margin:0 0 5px;color:#d1fae5}.elyon-import-head p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.45}.elyon-import-actions{display:flex;gap:8px;flex-wrap:wrap}
      .elyon-import-status{margin-top:12px;padding:10px 12px;border-radius:13px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.22);color:#dbeafe;font-size:12px;line-height:1.45}.elyon-import-status.ok{background:rgba(34,197,94,.09);border-color:rgba(34,197,94,.3);color:#bbf7d0}.elyon-import-status.error{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.32);color:#fecaca}
      .elyon-import-list{display:grid;gap:9px;margin-top:12px}.elyon-import-empty{padding:13px;border-radius:14px;border:1px dashed rgba(148,163,184,.24);color:#94a3b8;font-size:12px}
      .elyon-import-item{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border-radius:15px;background:rgba(15,23,42,.72);border:1px solid rgba(34,197,94,.2)}
      .elyon-import-image{width:54px;height:54px;border-radius:12px;display:grid;place-items:center;overflow:hidden;background:#020617;border:1px solid rgba(255,255,255,.1);font-size:23px}.elyon-import-image img{width:100%;height:100%;object-fit:cover}
      .elyon-import-copy{display:grid;gap:3px;min-width:0}.elyon-import-copy strong{color:#f8fafc;font-size:14px;overflow-wrap:anywhere}.elyon-import-copy span{color:#cbd5e1;font-size:11px;line-height:1.4;overflow-wrap:anywhere}.elyon-import-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#86efac!important}
      .elyon-import-values{display:grid;grid-template-columns:repeat(2,minmax(72px,1fr));gap:7px}.elyon-import-value{padding:7px 9px;border-radius:11px;background:rgba(255,255,255,.05);text-align:right}.elyon-import-value small{display:block;color:#94a3b8;font-size:9px}.elyon-import-value b{display:block;margin-top:2px;color:#e2e8f0;font-size:12px}
      @media(max-width:720px){.elyon-import-item{grid-template-columns:46px minmax(0,1fr)}.elyon-import-image{width:46px;height:46px}.elyon-import-values{grid-column:1/-1}.elyon-import-value{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function findImportCard() {
    const badge = document.getElementById("browserImportsBadge");
    if (badge) return badge.closest(".card");
    const headings = [...document.querySelectorAll("h1,h2,h3,h4")];
    const heading = headings.find((node) => /produkt\s*import|browser\s*imports?/i.test(text(node.textContent)));
    return heading?.closest(".card,section") || null;
  }

  function prepareImportCard(card) {
    const head = card.querySelector(".start-focus-head") || card.firstElementChild;
    const title = head?.querySelector("h2") || card.querySelector("h2");
    const hint = head?.querySelector(".hint") || card.querySelector(".hint");
    if (title) title.textContent = "Produkt Import";
    if (hint) hint.textContent = "Zentraler Eingang für geprüfte Produkte aus Company OS und für Importe aus der Chrome Extension.";
    const browserRefresh = document.getElementById("browserImportsRefreshBtn");
    if (browserRefresh) browserRefresh.textContent = "Chrome-Importe aktualisieren";
    const browserOpen = document.getElementById("browserImportsOpenBtn");
    if (browserOpen) browserOpen.textContent = "Chrome-Import öffnen";
  }

  function ensureUi() {
    removeLegacyUi();
    installStyles();
    const card = findImportCard();
    if (!card) return null;
    prepareImportCard(card);

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.innerHTML = `
        <div class="elyon-import-head">
          <div><h3>Company OS Eingänge</h3><p>Hier erscheinen Produkte direkt nach der bestätigten Übergabe aus Company OS.</p></div>
          <div class="elyon-import-actions"><button type="button" class="secondary" id="${BUTTON_ID}">Company-OS-Importe laden</button></div>
        </div>
        <div id="${STATUS_ID}" class="elyon-import-status">Company-OS-Importe werden geladen …</div>
        <div id="${LIST_ID}" class="elyon-import-list"><div class="elyon-import-empty">Noch keine Serverdaten geladen.</div></div>
      `;
      const head = card.querySelector(".start-focus-head");
      if (head) head.insertAdjacentElement("afterend", root);
      else card.prepend(root);
      root.querySelector(`#${BUTTON_ID}`)?.addEventListener("click", () => refresh(true));
    }
    return root;
  }

  function setStatus(message, tone = "") {
    ensureUi();
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    status.className = `elyon-import-status ${tone}`.trim();
    status.textContent = message;
  }

  function renderItems(items) {
    ensureUi();
    const list = document.getElementById(LIST_ID);
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="elyon-import-empty">Noch kein Produkt aus Company OS übertragen.</div>';
      return;
    }
    list.innerHTML = items.map((item) => {
      const image = item.image
        ? `<div class="elyon-import-image"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
        : '<div class="elyon-import-image">📦</div>';
      return `
        <article class="elyon-import-item">
          ${image}
          <div class="elyon-import-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.supplier)} · Status: ${escapeHtml(item.status)}</span>
            <span class="elyon-import-id">Interne Seller-ID: ${escapeHtml(item.sellerToolMasterProductId || item.id)}</span>
          </div>
          <div class="elyon-import-values">
            <div class="elyon-import-value"><small>EK</small><b>${escapeHtml(money(item.buyPrice))}</b></div>
            <div class="elyon-import-value"><small>VK</small><b>${escapeHtml(money(item.salePrice))}</b></div>
          </div>
        </article>
      `;
    }).join("");
  }

  function syncLocal(items) {
    let local = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      local = Array.isArray(parsed) ? parsed : [];
    } catch {}
    const byKey = new Map();
    for (const item of [...items, ...local]) {
      const key = text(item.sellerToolMasterProductId || item.companyOsProductId || item.id || item.supplierUrl || item.url);
      if (key && !byKey.has(key)) byKey.set(key, item);
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...byKey.values()]));
    try { if (typeof render === "function") render(); } catch {}
  }

  function showImport() {
    try {
      if (typeof window.showTab === "function") window.showTab("productListTab");
      else if (typeof showTab === "function") showTab("productListTab");
    } catch {}
    window.setTimeout(() => document.getElementById(ROOT_ID)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function refresh(manual = false) {
    if (loading) return;
    loading = true;
    ensureUi();
    const button = document.getElementById(BUTTON_ID);
    if (button) { button.disabled = true; button.textContent = "Lädt …"; }
    setStatus("Company-OS-Importe werden sicher vom Server geladen …");
    try {
      const response = await fetch("/api/products", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || raw || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const serverProducts = Array.isArray(data.products) ? data.products : [];
      const items = serverProducts.filter(isCompanyOs).map(normalize);
      renderItems(items);
      syncLocal(items);
      setStatus(`🟢 ${items.length} Produkt${items.length === 1 ? "" : "e"} aus Company OS geladen.`, "ok");
      if (manual) showImport();
    } catch (error) {
      const hint = error.status === 403 ? " Bitte erneut mit dem Seller-Sicherheitscode anmelden." : "";
      setStatus(`🔴 Company-OS-Importe konnten nicht geladen werden: ${error.message}.${hint}`, "error");
    } finally {
      loading = false;
      if (button) { button.disabled = false; button.textContent = "Company-OS-Importe laden"; }
    }
  }

  function install() {
    ensureUi();
    window.setTimeout(() => refresh(false), 500);
  }

  window.ElyonProductImport = { install, refresh, show: showImport };
  window.addEventListener("elyon:seller-authenticated", () => window.setTimeout(() => refresh(false), 250));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  let tries = 0;
  const retry = window.setInterval(() => {
    tries += 1;
    ensureUi();
    if (document.getElementById(ROOT_ID) || tries >= 20) window.clearInterval(retry);
  }, 350);
})();
