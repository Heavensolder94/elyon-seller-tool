(() => {
  "use strict";

  const PANEL_ID = "elyonProductMasterV3";
  const LIST_ID = "elyonProductMasterV3List";
  const STATUS_ID = "elyonProductMasterV3Status";
  const BUTTON_ID = "elyonProductMasterV3Refresh";
  const LAUNCHER_ID = "elyonProductMasterV3Launcher";
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
    const shippingCost = number(first(item, (layer) => layer.pricing?.shippingCost ?? layer.shippingCost ?? layer.ship));
    const status = text(first(item, (layer) => layer.listing?.status || layer.listingStatus || layer.productStatus || layer.status)) || "Draft";
    const updatedAt = text(first(item, (layer) => layer.updatedAt || layer.companyOsTransferredAt || layer.sellerToolReceivedAt));
    const images = [];
    for (const layer of layers(item)) {
      if (Array.isArray(layer.images)) images.push(...layer.images);
      if (layer.image) images.push(layer.image);
    }
    const cleanImages = [...new Set(images.map((entry) => typeof entry === "string" ? entry : entry?.url || entry?.src || "").map(text).filter((url) => /^https?:\/\//i.test(url)))];

    return {
      id: id || companyOsProductId || supplierUrl || `master-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      shippingCost,
      ship: shippingCost,
      status,
      productStatus: status,
      image: cleanImages[0] || "",
      images: cleanImages,
      updatedAt,
      sourceSystem: isCompanyOs(item) ? "Elyon Company OS" : text(first(item, (layer) => layer.source)) || "Product Master",
      serverProductMaster: true,
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
      rawServerProduct: item,
    };
  }

  function installStyles() {
    if (document.getElementById("elyonProductMasterV3Styles")) return;
    const style = document.createElement("style");
    style.id = "elyonProductMasterV3Styles";
    style.textContent = `
      #${PANEL_ID}{margin:16px 0 20px;padding:20px;border-radius:22px;background:linear-gradient(180deg,rgba(30,41,59,.97),rgba(15,23,42,.97));border:1px solid rgba(96,165,250,.34);box-shadow:0 18px 50px rgba(0,0,0,.22)}
      .elyon-pm3-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.elyon-pm3-head h2{margin:0}.elyon-pm3-head p{margin:6px 0 0;color:#cbd5e1;line-height:1.5}.elyon-pm3-actions{display:flex;gap:9px;flex-wrap:wrap}
      .elyon-pm3-status{margin-top:14px;padding:11px 13px;border-radius:14px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.24);color:#dbeafe;font-size:13px;line-height:1.45}.elyon-pm3-status.ok{background:rgba(34,197,94,.09);border-color:rgba(34,197,94,.32);color:#bbf7d0}.elyon-pm3-status.error{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.34);color:#fecaca}
      .elyon-pm3-list{display:grid;gap:10px;margin-top:14px}.elyon-pm3-empty{padding:15px;border-radius:16px;border:1px dashed rgba(148,163,184,.25);color:#94a3b8}
      .elyon-pm3-item{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:13px;align-items:center;padding:13px;border-radius:17px;background:rgba(2,6,23,.44);border:1px solid rgba(255,255,255,.09)}.elyon-pm3-item.company-os{border-color:rgba(34,197,94,.28)}
      .elyon-pm3-image{width:58px;height:58px;border-radius:13px;display:grid;place-items:center;overflow:hidden;background:#020617;border:1px solid rgba(255,255,255,.1);font-size:25px}.elyon-pm3-image img{width:100%;height:100%;object-fit:cover}
      .elyon-pm3-copy{min-width:0;display:grid;gap:4px}.elyon-pm3-copy strong{font-size:15px;color:#f8fafc;overflow-wrap:anywhere}.elyon-pm3-copy span{font-size:12px;color:#cbd5e1;line-height:1.4;overflow-wrap:anywhere}.elyon-pm3-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#86efac!important}
      .elyon-pm3-values{display:grid;grid-template-columns:repeat(2,minmax(78px,1fr));gap:7px}.elyon-pm3-value{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);text-align:right}.elyon-pm3-value small{display:block;color:#94a3b8;font-size:10px}.elyon-pm3-value b{display:block;margin-top:2px;font-size:13px;color:#e2e8f0}
      #${LAUNCHER_ID}{position:fixed;left:18px;bottom:18px;z-index:9000;display:inline-flex;align-items:center;gap:8px;padding:11px 14px;border-radius:16px;border:1px solid rgba(96,165,250,.45);background:linear-gradient(135deg,#1d4ed8,#7c3aed);color:#fff;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);cursor:pointer}#${LAUNCHER_ID} span{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.18);font-size:11px}
      @media(max-width:720px){.elyon-pm3-item{grid-template-columns:48px minmax(0,1fr)}.elyon-pm3-image{width:48px;height:48px}.elyon-pm3-values{grid-column:1/-1}.elyon-pm3-value{text-align:left}#${LAUNCHER_ID}{left:12px;bottom:12px}}
    `;
    document.head.appendChild(style);
  }

  function showPanel() {
    try {
      if (typeof window.showTab === "function") window.showTab("productListTab");
      else if (typeof showTab === "function") showTab("productListTab");
    } catch {}
    window.setTimeout(() => document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function ensureUi() {
    installStyles();
    document.getElementById("elyonProductMasterPanelV2")?.remove();
    document.getElementById("elyonProductMasterLauncherV2")?.remove();

    const tab = document.getElementById("productListTab");
    if (!tab) return null;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.innerHTML = `
        <div class="elyon-pm3-head">
          <div><div class="badge">Serverbestand</div><h2>📦 Product Master</h2><p>Hier siehst du direkt, was wirklich serverseitig gespeichert wurde. Es wird nichts mehr durch einen Quellenfilter ausgeblendet.</p></div>
          <div class="elyon-pm3-actions"><button type="button" class="secondary" id="${BUTTON_ID}">Serverbestand neu laden</button><button type="button" class="secondary" data-pm3-board>Zum normalen Produkt-Board</button></div>
        </div>
        <div id="${STATUS_ID}" class="elyon-pm3-status">Serverbestand wird geladen …</div>
        <div id="${LIST_ID}" class="elyon-pm3-list"><div class="elyon-pm3-empty">Noch keine Serverantwort.</div></div>
      `;
      const dashboard = tab.querySelector(":scope > .dashboard");
      if (dashboard) dashboard.insertAdjacentElement("afterend", panel);
      else tab.prepend(panel);
      panel.querySelector(`#${BUTTON_ID}`)?.addEventListener("click", () => refresh(true));
      panel.querySelector("[data-pm3-board]")?.addEventListener("click", () => tab.querySelector(".card")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }

    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.id = LAUNCHER_ID;
      launcher.innerHTML = '📦 Product Master <span data-pm3-count>0</span>';
      launcher.addEventListener("click", showPanel);
      document.body.appendChild(launcher);
    }
    return panel;
  }

  function setStatus(message, tone = "") {
    ensureUi();
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    status.className = `elyon-pm3-status ${tone}`.trim();
    status.textContent = message;
  }

  function render(items, serverTotal) {
    ensureUi();
    const list = document.getElementById(LIST_ID);
    const count = document.querySelector("[data-pm3-count]");
    if (count) count.textContent = String(items.length);
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class="elyon-pm3-empty">Der Server hat ${serverTotal} Produkt${serverTotal === 1 ? "" : "e"} gemeldet, aber keine darstellbaren Datensätze geliefert.</div>`;
      return;
    }
    list.innerHTML = items.map((item) => {
      const companyOs = item.sourceSystem === "Elyon Company OS";
      const image = item.image ? `<div class="elyon-pm3-image"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : '<div class="elyon-pm3-image">📦</div>';
      return `
        <article class="elyon-pm3-item ${companyOs ? "company-os" : ""}">
          ${image}
          <div class="elyon-pm3-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.sourceSystem)} · ${escapeHtml(item.supplier)} · Status: ${escapeHtml(item.status)}</span>
            <span class="elyon-pm3-id">Product-Master-ID: ${escapeHtml(item.sellerToolMasterProductId || item.id)}</span>
            ${item.companyOsProductId ? `<span>Company-OS-ID: ${escapeHtml(item.companyOsProductId)}</span>` : ""}
          </div>
          <div class="elyon-pm3-values"><div class="elyon-pm3-value"><small>EK</small><b>${escapeHtml(money(item.buyPrice))}</b></div><div class="elyon-pm3-value"><small>VK</small><b>${escapeHtml(money(item.salePrice))}</b></div></div>
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

  async function refresh(manual = false) {
    if (loading) return;
    loading = true;
    ensureUi();
    const button = document.getElementById(BUTTON_ID);
    if (button) { button.disabled = true; button.textContent = "Lädt …"; }
    setStatus("Product Master wird sicher vom Server geladen …");
    try {
      const response = await fetch("/api/products", { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || raw || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const serverProducts = Array.isArray(data.products) ? data.products : [];
      const items = serverProducts.map(normalize).sort((a, b) => Number(b.sourceSystem === "Elyon Company OS") - Number(a.sourceSystem === "Elyon Company OS"));
      render(items, serverProducts.length);
      syncLocal(items);
      const companyCount = items.filter((item) => item.sourceSystem === "Elyon Company OS").length;
      setStatus(`🟢 Serverbestand geladen: ${items.length} Produkt${items.length === 1 ? "" : "e"}, davon ${companyCount} aus Company OS.`, "ok");
      if (manual) showPanel();
    } catch (error) {
      const hint = error.status === 403 ? " Bitte erneut mit dem Seller-Sicherheitscode anmelden." : "";
      setStatus(`🔴 Serverbestand konnte nicht geladen werden: ${error.message}.${hint}`, "error");
    } finally {
      loading = false;
      if (button) { button.disabled = false; button.textContent = "Serverbestand neu laden"; }
    }
  }

  function install() {
    ensureUi();
    window.setTimeout(() => refresh(false), 500);
  }

  window.ElyonProductMasterV3 = { install, refresh, show: showPanel };
  window.addEventListener("elyon:seller-authenticated", () => window.setTimeout(() => refresh(false), 250));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
