(() => {
  "use strict";

  const LOCAL_KEY = "elyonProducts";
  const PANEL_ID = "elyonProductMasterPanelV2";
  const LIST_ID = "elyonProductMasterPanelListV2";
  const STATUS_ID = "elyonProductMasterPanelStatusV2";
  const COUNT_ID = "elyonProductMasterPanelCountV2";
  const REFRESH_ID = "elyonProductMasterPanelRefreshV2";
  const LAUNCHER_ID = "elyonProductMasterLauncherV2";
  let lastItems = [];
  let refreshRunning = false;
  let autoRefreshStarted = false;

  const text = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function number(value) {
    if (value && typeof value === "object") return number(value.value ?? value.cost ?? value.amount ?? value.price);
    const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function money(value) {
    return number(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function parseList(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function stableKey(item) {
    return text(item?.companyOsProductId || item?.sellerToolMasterProductId || item?.id || item?.supplierUrl || item?.url);
  }

  function mapProduct(item) {
    const images = Array.isArray(item?.images) ? item.images.filter(Boolean) : [];
    const id = text(item?.id || item?.companyOsProductId || item?.supplierUrl || item?.url);
    const title = text(item?.title || item?.name || "Produkt");
    const buy = number(item?.buyPrice ?? item?.costPrice ?? item?.buy ?? item?.cost ?? item?.purchasePrice);
    const sell = number(item?.salePrice ?? item?.sellPrice ?? item?.sell ?? item?.price);
    const shipping = number(item?.shippingCost ?? item?.ship ?? item?.shipping);
    const supplier = text(item?.supplier || item?.supplierName || "Company OS");
    const now = new Date().toISOString();

    return {
      ...item,
      id,
      sellerToolMasterProductId: id,
      name: title,
      title,
      buy,
      buyPrice: buy,
      cost: buy,
      purchasePrice: buy,
      sell,
      salePrice: sell,
      price: sell,
      ship: shipping,
      shippingCost: shipping,
      supplier,
      supplierName: supplier,
      url: text(item?.supplierUrl || item?.url),
      supplierUrl: text(item?.supplierUrl || item?.url),
      image: text(item?.image || images[0]),
      images,
      productStatus: text(item?.productStatus || item?.status || "Draft") || "Draft",
      status: text(item?.productStatus || item?.status || "Draft") || "Draft",
      sourceSystem: "Elyon Company OS",
      serverProductMaster: true,
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
      updatedAt: text(item?.updatedAt || item?.companyOsTransferredAt || now),
      createdAt: text(item?.createdAt || item?.companyOsTransferredAt || now),
    };
  }

  function mergeProducts(localProducts, masterProducts) {
    const masterKeys = new Set(masterProducts.map(stableKey).filter(Boolean));
    const localOnly = localProducts.filter((item) => {
      const key = stableKey(item);
      return !key || !masterKeys.has(key);
    });

    const mergedMaster = masterProducts.map((serverItem) => {
      const key = stableKey(serverItem);
      const existing = localProducts.find((item) => stableKey(item) === key);
      if (!existing) return serverItem;
      return {
        ...existing,
        ...serverItem,
        id: serverItem.id,
        sellerToolMasterProductId: serverItem.sellerToolMasterProductId,
        companyOsProductId: serverItem.companyOsProductId,
        serverProductMaster: true,
        sourceSystem: "Elyon Company OS",
        updatedAt: serverItem.updatedAt,
      };
    });

    return [...mergedMaster, ...localOnly];
  }

  function installStyles() {
    if (document.getElementById("elyonProductMasterPanelStylesV2")) return;
    const style = document.createElement("style");
    style.id = "elyonProductMasterPanelStylesV2";
    style.textContent = `
      #${PANEL_ID}{margin:16px 0 18px;padding:20px;border-radius:22px;background:linear-gradient(180deg,rgba(30,41,59,.96),rgba(15,23,42,.96));border:1px solid rgba(96,165,250,.3);box-shadow:0 18px 50px rgba(0,0,0,.2)}
      .elyon-pm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.elyon-pm-head h2{margin:0}.elyon-pm-head p{margin:6px 0 0;color:#cbd5e1;line-height:1.5}
      .elyon-pm-actions{display:flex;gap:9px;flex-wrap:wrap}.elyon-pm-status{margin-top:14px;padding:11px 13px;border-radius:14px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.22);color:#dbeafe;font-size:13px;line-height:1.45}.elyon-pm-status.ok{background:rgba(34,197,94,.09);border-color:rgba(34,197,94,.3);color:#bbf7d0}.elyon-pm-status.error{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.32);color:#fecaca}
      .elyon-pm-list{display:grid;gap:10px;margin-top:14px}.elyon-pm-empty{padding:15px;border-radius:16px;border:1px dashed rgba(148,163,184,.25);color:#94a3b8}
      .elyon-pm-item{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:13px;align-items:center;padding:13px;border-radius:17px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.09)}
      .elyon-pm-image{width:56px;height:56px;border-radius:13px;display:grid;place-items:center;overflow:hidden;background:#020617;border:1px solid rgba(255,255,255,.1);font-size:24px}.elyon-pm-image img{width:100%;height:100%;object-fit:cover}
      .elyon-pm-copy{min-width:0;display:grid;gap:4px}.elyon-pm-copy strong{font-size:15px;color:#f8fafc;overflow-wrap:anywhere}.elyon-pm-copy span{font-size:12px;color:#cbd5e1;line-height:1.4;overflow-wrap:anywhere}.elyon-pm-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#86efac!important}
      .elyon-pm-values{display:grid;grid-template-columns:repeat(2,minmax(74px,1fr));gap:7px}.elyon-pm-value{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);text-align:right}.elyon-pm-value small{display:block;color:#94a3b8;font-size:10px}.elyon-pm-value b{display:block;margin-top:2px;font-size:13px;color:#e2e8f0}
      #${LAUNCHER_ID}{position:fixed;left:18px;bottom:18px;z-index:9000;display:inline-flex;align-items:center;gap:8px;padding:11px 14px;border-radius:16px;border:1px solid rgba(96,165,250,.45);background:linear-gradient(135deg,#1d4ed8,#7c3aed);color:#fff;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);cursor:pointer}#${LAUNCHER_ID} span{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.18);font-size:11px}
      @media(max-width:720px){.elyon-pm-item{grid-template-columns:48px minmax(0,1fr)}.elyon-pm-image{width:48px;height:48px}.elyon-pm-values{grid-column:1/-1}.elyon-pm-value{text-align:left}#${LAUNCHER_ID}{left:12px;bottom:12px}}
    `;
    document.head.appendChild(style);
  }

  function showProductMaster() {
    try {
      if (typeof window.showTab === "function") window.showTab("productListTab");
      else if (typeof showTab === "function") showTab("productListTab");
    } catch {}
    const panel = document.getElementById(PANEL_ID);
    if (panel) window.setTimeout(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function ensureLauncher() {
    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.id = LAUNCHER_ID;
      launcher.innerHTML = '📦 Product Master <span id="elyonProductMasterLauncherCountV2">0</span>';
      launcher.addEventListener("click", showProductMaster);
      document.body.appendChild(launcher);
    }
    return launcher;
  }

  function ensurePanel() {
    installStyles();
    ensureLauncher();
    const tab = document.getElementById("productListTab");
    if (!tab) return null;

    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="elyon-pm-head">
        <div>
          <div class="badge">Company OS → Seller Tool</div>
          <h2>📦 Product Master</h2>
          <p>Hier stehen alle serverseitig übertragenen Company-OS-Produkte mit ihrer Product-Master-ID.</p>
        </div>
        <div class="elyon-pm-actions">
          <button type="button" class="secondary" id="${REFRESH_ID}">Product Master laden</button>
          <button type="button" class="secondary" data-elyon-pm-board>Normales Produkt-Board</button>
        </div>
      </div>
      <div id="${STATUS_ID}" class="elyon-pm-status">Product Master wird vorbereitet …</div>
      <div id="${LIST_ID}" class="elyon-pm-list"><div class="elyon-pm-empty">Noch keine Serverdaten geladen.</div></div>
    `;

    const dashboard = tab.querySelector(":scope > .dashboard");
    if (dashboard) dashboard.insertAdjacentElement("afterend", panel);
    else tab.prepend(panel);

    panel.querySelector(`#${REFRESH_ID}`)?.addEventListener("click", () => refresh({ manual: true }));
    panel.querySelector("[data-elyon-pm-board]")?.addEventListener("click", () => {
      const board = document.querySelector("#productListTab .card");
      board?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return panel;
  }

  function setStatus(message, tone = "info") {
    ensurePanel();
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    status.className = `elyon-pm-status ${tone === "info" ? "" : tone}`.trim();
    status.textContent = message;
  }

  function renderItems(items) {
    lastItems = items;
    ensurePanel();
    const list = document.getElementById(LIST_ID);
    const count = document.getElementById("elyonProductMasterLauncherCountV2");
    if (count) count.textContent = String(items.length);
    if (!list) return;

    if (!items.length) {
      list.innerHTML = '<div class="elyon-pm-empty">Noch kein Company-OS-Produkt im serverseitigen Product Master.</div>';
      return;
    }

    list.innerHTML = items.map((item) => {
      const image = text(item.image || item.images?.[0]);
      const imageHtml = image
        ? `<div class="elyon-pm-image"><img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
        : '<div class="elyon-pm-image">📦</div>';
      return `
        <article class="elyon-pm-item" data-product-master-id="${escapeHtml(item.sellerToolMasterProductId)}">
          ${imageHtml}
          <div class="elyon-pm-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.supplier || "Company OS")} · Status: ${escapeHtml(item.status || "Draft")}</span>
            <span class="elyon-pm-id">Product-Master-ID: ${escapeHtml(item.sellerToolMasterProductId)}</span>
          </div>
          <div class="elyon-pm-values">
            <div class="elyon-pm-value"><small>EK</small><b>${escapeHtml(money(item.buyPrice))}</b></div>
            <div class="elyon-pm-value"><small>VK</small><b>${escapeHtml(money(item.salePrice))}</b></div>
          </div>
        </article>
      `;
    }).join("");
  }

  async function refresh({ manual = false } = {}) {
    if (refreshRunning) return;
    refreshRunning = true;
    ensurePanel();
    const button = document.getElementById(REFRESH_ID);
    const oldLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "Lädt …";
    }
    setStatus("Product Master wird sicher vom Server geladen …");

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
        const error = new Error(data.message || data.error || raw || `Product Master HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const items = (Array.isArray(data.products) ? data.products : [])
        .filter((item) => item && (item.companyOsProductId || item.source === "elyon_company_os" || item.sourceProvider === "company-os" || item.sourceType === "company_os_review"))
        .map(mapProduct);

      const local = parseList(localStorage.getItem(LOCAL_KEY));
      const merged = mergeProducts(local, items);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
      renderItems(items);
      setStatus(`🟢 Product Master geladen: ${items.length} Company-OS-Produkt${items.length === 1 ? "" : "e"}.`, "ok");

      if (manual) showProductMaster();
    } catch (error) {
      const loginHint = error?.status === 403 ? " Bitte zuerst im Seller Tool anmelden und danach erneut laden." : "";
      setStatus(`🔴 Product Master konnte nicht geladen werden: ${error.message}.${loginHint}`, "error");
    } finally {
      refreshRunning = false;
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel || "Product Master laden";
      }
    }
  }

  function install() {
    ensurePanel();
    ensureLauncher();
    if (!autoRefreshStarted) {
      autoRefreshStarted = true;
      window.setTimeout(() => refresh(), 500);
      window.setTimeout(() => {
        if (!lastItems.length && document.body?.dataset?.sellerAuthenticated === "true") refresh();
      }, 1800);
    }
  }

  window.ElyonProductMasterPanel = { install, refresh, show: showProductMaster };
  window.addEventListener("elyon:seller-authenticated", () => window.setTimeout(() => refresh(), 250));

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  let tries = 0;
  const retry = window.setInterval(() => {
    tries += 1;
    install();
    if (document.getElementById(PANEL_ID) || tries >= 20) window.clearInterval(retry);
  }, 350);
})();
