(() => {
  "use strict";

  const ROOT_ID = "elyonApprovedCompanyOsInbox";
  const LIST_ID = "elyonApprovedCompanyOsInboxList";
  const STATUS_ID = "elyonApprovedCompanyOsInboxStatus";
  const REFRESH_ID = "elyonApprovedCompanyOsInboxRefresh";
  const LOCAL_KEY = "elyonProducts";
  const SELECTED_KEY = "elyonSelectedSellerProductId";
  const STYLE_ID = "elyonApprovedCompanyOsInboxStyles";
  let loading = false;
  let lastProducts = [];

  const text = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function money(value) {
    const number = Number(value || 0);
    return Number.isFinite(number)
      ? number.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
      : "0,00 €";
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{margin:0 0 18px;padding:20px;border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(30,41,59,.84));border:1px solid rgba(34,197,94,.28);box-shadow:0 18px 56px rgba(0,0,0,.22)}
      .elyon-approved-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
      .elyon-approved-head h2{margin:0 0 7px}.elyon-approved-head p{margin:0;max-width:760px;color:#cbd5e1;font-size:13px;line-height:1.55}
      .elyon-approved-status{margin-top:14px;padding:10px 12px;border-radius:13px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.22);color:#dbeafe;font-size:12px;line-height:1.45}
      .elyon-approved-status.ok{background:rgba(34,197,94,.09);border-color:rgba(34,197,94,.3);color:#bbf7d0}.elyon-approved-status.error{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.32);color:#fecaca}
      .elyon-approved-list{display:grid;gap:11px;margin-top:14px}.elyon-approved-empty{padding:16px;border-radius:15px;border:1px dashed rgba(148,163,184,.24);color:#94a3b8;font-size:12px}
      .elyon-approved-item{display:grid;grid-template-columns:64px minmax(0,1fr) minmax(150px,auto);gap:13px;align-items:center;padding:13px;border-radius:17px;background:rgba(2,6,23,.46);border:1px solid rgba(34,197,94,.18)}
      .elyon-approved-image{width:64px;height:64px;border-radius:14px;display:grid;place-items:center;overflow:hidden;background:#020617;border:1px solid rgba(255,255,255,.1);font-size:25px}.elyon-approved-image img{width:100%;height:100%;object-fit:cover}
      .elyon-approved-copy{display:grid;gap:4px;min-width:0}.elyon-approved-copy strong{color:#f8fafc;font-size:15px;overflow-wrap:anywhere}.elyon-approved-copy span{color:#cbd5e1;font-size:11px;line-height:1.4;overflow-wrap:anywhere}
      .elyon-approved-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}.elyon-approved-pill{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#dbeafe!important;font-size:10px!important;font-weight:850}
      .elyon-approved-pill.ready{color:#bbf7d0!important;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.23)}.elyon-approved-pill.blocked{color:#fecaca!important;background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.22)}
      .elyon-approved-actions{display:grid;gap:8px}.elyon-approved-actions button{padding:9px 11px;border-radius:12px;font-size:11px;white-space:nowrap}
      @media(max-width:760px){.elyon-approved-item{grid-template-columns:52px minmax(0,1fr)}.elyon-approved-image{width:52px;height:52px}.elyon-approved-actions{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr))}.elyon-approved-actions button{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    installStyles();
    const tab = document.getElementById("productListTab");
    if (!tab) return null;
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="elyon-approved-head">
        <div><div class="badge">Freigegebener Eingang</div><h2>Company OS → Seller Tool</h2><p>Hier erscheinen ausschließlich final freigegebene Produkte aus Company OS. Erst dein Klick erstellt eine lokale Arbeitskopie. Rohimporte aus Nova werden im Seller Tool nicht angenommen.</p></div>
        <button type="button" class="secondary" id="${REFRESH_ID}">Neu laden</button>
      </div>
      <div id="${STATUS_ID}" class="elyon-approved-status">Product Master wird geladen …</div>
      <div id="${LIST_ID}" class="elyon-approved-list"><div class="elyon-approved-empty">Noch keine Daten geladen.</div></div>
    `;
    tab.insertBefore(root, tab.firstChild);
    root.querySelector(`#${REFRESH_ID}`)?.addEventListener("click", () => refresh(true));
    return root;
  }

  function setStatus(message, tone = "") {
    ensureRoot();
    const node = document.getElementById(STATUS_ID);
    if (!node) return;
    node.className = `elyon-approved-status ${tone}`.trim();
    node.textContent = message;
  }

  function readWorkingCopies() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function idsOf(product) {
    const raw = product?.rawServerProduct || product?.raw || product || {};
    return [product?.id, product?.sellerToolMasterProductId, raw.id, raw.companyOsProductId, raw.sourceImportId]
      .map(text)
      .filter(Boolean);
  }

  function workingCopyExists(product) {
    const targetIds = new Set(idsOf(product));
    return readWorkingCopies().some((entry) => idsOf(entry).some((id) => targetIds.has(id)));
  }

  function normalizeWorkingCopy(product) {
    const pricing = product.pricing || {};
    const supplier = product.supplier || {};
    const listing = product.listing || {};
    return {
      id: text(product.id),
      sellerToolMasterProductId: text(product.id),
      companyOsProductId: text(product.raw?.companyOsProductId || product.companyOsProductId),
      name: text(product.title),
      title: text(product.title),
      description: text(product.description),
      supplier: text(supplier.name || "Company OS"),
      supplierName: text(supplier.name || "Company OS"),
      supplierUrl: text(supplier.url),
      url: text(supplier.url),
      buy: Number(pricing.buyPrice || 0),
      buyPrice: Number(pricing.buyPrice || 0),
      ship: Number(pricing.shippingCost || 0),
      shippingCost: Number(pricing.shippingCost || 0),
      sell: Number(pricing.salePrice || 0),
      salePrice: Number(pricing.salePrice || 0),
      fee: Number(pricing.marketplaceFeePercent || 0),
      margin: Number(pricing.marginPercent || 0),
      profit: Number(pricing.profit || 0),
      status: text(listing.status || product.status || "draft"),
      image: Array.isArray(product.images) ? text(product.images[0]) : "",
      images: Array.isArray(product.images) ? product.images : [],
      sourceSystem: "Elyon Company OS",
      serverProductMaster: true,
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
      rawServerProduct: product,
      updatedAt: new Date().toISOString(),
    };
  }

  function adopt(product, openListing = false) {
    const copies = readWorkingCopies();
    const copy = normalizeWorkingCopy(product);
    const targetIds = new Set(idsOf(copy));
    const index = copies.findIndex((entry) => idsOf(entry).some((id) => targetIds.has(id)));
    if (index >= 0) {
      const existing = copies[index];
      copies[index] = {
        ...copy,
        notes: existing.notes || copy.notes || "",
        ebayItemId: existing.ebayItemId || copy.ebayItemId || "",
        localCreatedAt: existing.localCreatedAt || new Date().toISOString(),
      };
    } else {
      copies.unshift({ ...copy, localCreatedAt: new Date().toISOString() });
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(copies));
    localStorage.setItem(SELECTED_KEY, copy.id);
    render(lastProducts);
    try { if (typeof window.render === "function") window.render(); } catch {}
    window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { id: copy.id } }));

    if (openListing) {
      try {
        if (typeof window.showTab === "function") window.showTab("ebayListingTab");
        else if (typeof showTab === "function") showTab("ebayListingTab");
      } catch {}
      window.setTimeout(() => window.ElyonSellerRolePolicy?.renderListingPackage?.(), 80);
    } else {
      try {
        if (typeof window.showTab === "function") window.showTab("productListTab");
        else if (typeof showTab === "function") showTab("productListTab");
      } catch {}
    }
  }

  function render(products) {
    lastProducts = Array.isArray(products) ? products : [];
    ensureRoot();
    const list = document.getElementById(LIST_ID);
    if (!list) return;
    if (!lastProducts.length) {
      list.innerHTML = '<div class="elyon-approved-empty">Noch kein final freigegebenes Produkt aus Company OS übertragen.</div>';
      return;
    }

    list.innerHTML = lastProducts.map((product, index) => {
      const pricing = product.pricing || {};
      const readiness = product.readiness || {};
      const ready = readiness.state === "ready_for_manual_listing" && !(readiness.blockers || []).length;
      const exists = workingCopyExists(product);
      const image = Array.isArray(product.images) && product.images[0]
        ? `<div class="elyon-approved-image"><img src="${escapeHtml(product.images[0])}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
        : '<div class="elyon-approved-image">📦</div>';
      return `
        <article class="elyon-approved-item" data-approved-index="${index}">
          ${image}
          <div class="elyon-approved-copy">
            <strong>${escapeHtml(product.title)}</strong>
            <span>${escapeHtml(product.supplier?.name || "Lieferant offen")} · ${escapeHtml(money(pricing.buyPrice))} EK · ${escapeHtml(money(pricing.salePrice))} VK</span>
            <div class="elyon-approved-meta">
              <span class="elyon-approved-pill ${ready ? "ready" : "blocked"}">${ready ? "Bereit" : "Blockiert"}</span>
              <span class="elyon-approved-pill">Score ${Number(readiness.score || 0)} %</span>
              <span class="elyon-approved-pill">${exists ? "Arbeitskopie vorhanden" : "Noch nicht übernommen"}</span>
            </div>
          </div>
          <div class="elyon-approved-actions">
            <button type="button" data-approved-adopt="${index}">${exists ? "Arbeitskopie aktualisieren" : "Arbeitskopie übernehmen"}</button>
            <button type="button" class="secondary" data-approved-listing="${index}">Listing-Paket öffnen</button>
          </div>
        </article>
      `;
    }).join("");

    list.querySelectorAll("[data-approved-adopt]").forEach((button) => {
      button.addEventListener("click", () => adopt(lastProducts[Number(button.dataset.approvedAdopt)], false));
    });
    list.querySelectorAll("[data-approved-listing]").forEach((button) => {
      button.addEventListener("click", () => adopt(lastProducts[Number(button.dataset.approvedListing)], true));
    });
  }

  async function refresh(manual = false) {
    if (loading) return;
    loading = true;
    ensureRoot();
    const button = document.getElementById(REFRESH_ID);
    if (button) { button.disabled = true; button.textContent = "Lädt …"; }
    setStatus("Freigegebene Company-OS-Produkte werden sicher vom Product Master geladen …");
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
      const products = (Array.isArray(data.products) ? data.products : [])
        .filter((product) => product?.source === "elyon_company_os" || product?.approval?.companyOsApproved === true);
      render(products);
      const ready = products.filter((product) => product?.readiness?.state === "ready_for_manual_listing").length;
      setStatus(`🟢 ${products.length} freigegebene${products.length === 1 ? "s" : ""} Produkt${products.length === 1 ? "" : "e"} geladen · ${ready} ohne Seller-Blocker.`, "ok");
      if (manual) document.getElementById(ROOT_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      const hint = error.status === 403 ? " Bitte erneut mit dem Seller-Sicherheitscode anmelden." : "";
      setStatus(`🔴 Product Master konnte nicht geladen werden: ${error.message}.${hint}`, "error");
      render([]);
    } finally {
      loading = false;
      if (button) { button.disabled = false; button.textContent = "Neu laden"; }
    }
  }

  function install() {
    ensureRoot();
    window.setTimeout(() => refresh(false), 450);
  }

  window.ElyonCompanyOsInbox = { install, refresh, adopt };
  window.addEventListener("elyon:seller-authenticated", () => window.setTimeout(() => refresh(false), 200));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
