(() => {
  "use strict";

  const LOCAL_KEY = "elyonProducts";
  const BANNER_ID = "elyonProductMasterSyncBanner";
  const BUTTON_ID = "elyonProductMasterRefreshBtn";

  function text(value) {
    return String(value ?? "").trim();
  }

  function number(value) {
    if (value && typeof value === "object") {
      return number(value.value ?? value.cost ?? value.amount ?? value.price);
    }
    const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function parseList(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function deliveryDays(value) {
    const match = text(value).match(/\d+/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
  }

  function stableKey(item) {
    return text(item?.companyOsProductId || item?.sellerToolMasterProductId || item?.id || item?.supplierUrl || item?.url);
  }

  function mapMasterProduct(item) {
    const title = text(item.title || item.name || "Produkt");
    const buy = number(item.buyPrice ?? item.costPrice ?? item.buy ?? item.cost ?? item.purchasePrice);
    const sell = number(item.salePrice ?? item.sellPrice ?? item.sell ?? item.price);
    const ship = number(item.shippingCost ?? item.ship ?? item.shipping);
    const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
    const id = text(item.id || item.companyOsProductId || item.supplierUrl || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const supplier = text(item.supplier || item.supplierName || "Company OS");
    const sourceStatus = text(item.processingStatus || item.reviewStatus || item.status);
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
      ship,
      shippingCost: ship,
      delivery: deliveryDays(item.deliveryTime || item.deliveryDays || item.delivery),
      deliveryDays: deliveryDays(item.deliveryTime || item.deliveryDays || item.delivery),
      supplier,
      supplierName: supplier,
      url: text(item.supplierUrl || item.url),
      supplierUrl: text(item.supplierUrl || item.url),
      image: text(item.image || images[0]),
      images,
      productStatus: "Draft",
      status: "Draft",
      sourceStatus,
      sourceSystem: "Elyon Company OS",
      serverProductMaster: true,
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
      updatedAt: text(item.updatedAt || item.companyOsTransferredAt || now),
      createdAt: text(item.createdAt || item.companyOsTransferredAt || now),
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
        ...serverItem,
        ...existing,
        id: serverItem.id,
        sellerToolMasterProductId: serverItem.sellerToolMasterProductId,
        companyOsProductId: serverItem.companyOsProductId,
        serverProductMaster: true,
        sourceSystem: serverItem.sourceSystem,
        manualApprovalRequired: true,
        autonomousPostingAllowed: false,
        updatedAt: serverItem.updatedAt,
      };
    });

    return [...mergedMaster, ...localOnly];
  }

  function setBanner(message, tone = "info") {
    const board = document.getElementById("productListTab");
    if (!board) return;
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.style.cssText = "margin:0 0 14px;padding:12px 14px;border-radius:16px;border:1px solid rgba(96,165,250,.28);background:rgba(59,130,246,.09);color:#dbeafe;font-size:13px;line-height:1.45";
      const firstCard = board.querySelector(".card");
      board.insertBefore(banner, firstCard || board.firstChild);
    }
    if (tone === "ok") {
      banner.style.borderColor = "rgba(34,197,94,.32)";
      banner.style.background = "rgba(34,197,94,.09)";
      banner.style.color = "#bbf7d0";
    } else if (tone === "error") {
      banner.style.borderColor = "rgba(239,68,68,.32)";
      banner.style.background = "rgba(239,68,68,.09)";
      banner.style.color = "#fecaca";
    }
    banner.textContent = message;
  }

  function installRefreshButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const anchor = document.getElementById("newProductBtn");
    if (!anchor?.parentElement) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = "secondary";
    button.textContent = "Product Master aktualisieren";
    button.addEventListener("click", () => refresh({ forceReload: true, button }));
    anchor.parentElement.appendChild(button);
  }

  async function refresh(options = {}) {
    const button = options.button || document.getElementById(BUTTON_ID);
    const oldLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "Product Master lädt …";
    }
    setBanner("Product Master wird vom Server geladen …");

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
        throw new Error(data.message || data.error || raw || `Product Master HTTP ${response.status}`);
      }

      const serverItems = (Array.isArray(data.products) ? data.products : [])
        .filter((item) => item && (item.companyOsProductId || item.source === "elyon_company_os" || item.sourceProvider === "company-os" || item.sourceType === "company_os_review"))
        .map(mapMasterProduct);
      const localItems = parseList(localStorage.getItem(LOCAL_KEY));
      const nextItems = mergeProducts(localItems, serverItems);
      const before = JSON.stringify(localItems);
      const after = JSON.stringify(nextItems);
      const changed = before !== after;

      if (changed) localStorage.setItem(LOCAL_KEY, after);
      setBanner(`🟢 Product Master synchronisiert: ${serverItems.length} Company-OS-Produkt(e).`, "ok");

      if (changed || options.forceReload) {
        window.setTimeout(() => window.location.reload(), 250);
      }
    } catch (error) {
      setBanner(`🔴 Product Master konnte nicht geladen werden: ${error.message}`, "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel || "Product Master aktualisieren";
      }
    }
  }

  function install() {
    installRefreshButton();
    refresh();
  }

  window.elyonProductMasterSync = { refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
