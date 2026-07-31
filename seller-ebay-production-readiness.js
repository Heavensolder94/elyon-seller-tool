(() => {
  "use strict";

  const ROOT_ID = "elyonEbayProductionReadiness";
  const STYLE_ID = "elyonEbayProductionReadinessStyles";
  const PRODUCT_KEY = "elyonProducts";
  const SELECTED_KEY = "elyonSelectedSellerProductId";
  const SETTINGS_KEY = "elyonEbayProductionSelectionV1";
  let observer = null;
  let installing = false;

  const text = (value) => String(value ?? "").trim();
  const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const esc = (value) => text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function readProducts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCT_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function productIds(product = {}) {
    const server = object(product.rawServerProduct || product.raw || product);
    return [
      product.id,
      product.sellerToolMasterProductId,
      product.companyOsProductId,
      server.id,
      server.companyOsProductId,
      server.sellerToolMasterProductId,
      server.supplier?.url,
      product.supplierLink,
    ].map(text).filter(Boolean);
  }

  function selectedProduct() {
    const products = readProducts();
    const selectedId = text(localStorage.getItem(SELECTED_KEY));
    return products.find((product) => productIds(product).includes(selectedId)) || products[0] || null;
  }

  function replaceStoredProduct(updated) {
    const ids = productIds(updated);
    const products = readProducts();
    const next = products.map((product) => productIds(product).some((id) => ids.includes(id)) ? updated : product);
    if (!next.some((product) => productIds(product).some((id) => ids.includes(id)))) next.unshift(updated);
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(next));
  }

  function readSelections() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return object(parsed);
    } catch {
      return {};
    }
  }

  function saveSelections(patch = {}) {
    const next = { ...readSelections(), ...patch, updatedAt: new Date().toISOString() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-ebay-production{margin-top:14px;padding:16px;border-radius:20px;background:linear-gradient(145deg,rgba(15,23,42,.95),rgba(30,41,59,.9));border:1px solid rgba(96,165,250,.24);box-shadow:0 18px 45px rgba(0,0,0,.22)}
      .elyon-ebay-production-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}
      .elyon-ebay-production-head h3{margin:0 0 5px;font-size:18px}.elyon-ebay-production-head p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.5;max-width:760px}
      .elyon-ebay-badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:850;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.24);color:#fde68a}
      .elyon-ebay-badge.good{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.22);color:#bbf7d0}.elyon-ebay-badge.bad{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.22);color:#fecaca}
      .elyon-ebay-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.elyon-ebay-field label{display:block;margin-bottom:5px;color:#bfdbfe;font-size:11px;font-weight:850}.elyon-ebay-field select{width:100%;margin:0}
      .elyon-ebay-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.elyon-ebay-actions button{min-height:40px}.elyon-ebay-actions button.danger{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.26);color:#fecaca}
      .elyon-ebay-status{margin-top:12px;padding:11px 13px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1;font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.elyon-ebay-status.good{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.22);color:#bbf7d0}.elyon-ebay-status.bad{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.22);color:#fecaca}
      .elyon-ebay-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.elyon-ebay-summary div{padding:10px;border-radius:14px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.08)}.elyon-ebay-summary small{display:block;color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:.05em}.elyon-ebay-summary strong{display:block;margin-top:4px;font-size:12px;overflow-wrap:anywhere}
      @media(max-width:760px){.elyon-ebay-grid{grid-template-columns:1fr}.elyon-ebay-summary{grid-template-columns:1fr 1fr}.elyon-ebay-actions{display:grid;grid-template-columns:1fr}.elyon-ebay-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function listingState(product = {}) {
    const server = object(product.rawServerProduct || product.raw || product);
    const listing = object(server.listing || product.listing);
    const draft = object(listing.autoListerDraft || product.autoListerDraft);
    return {
      offerId: text(draft.offerId || listing.offerId || product.offerId),
      sku: text(draft.sku || listing.sku || product.sku),
      listingId: text(draft.listingId || listing.ebayItemId || product.ebayItemId),
      status: text(listing.status || product.status || "seller_draft"),
    };
  }

  function optionHtml(items, valueKey, selectedValue, fallbackLabel) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return `<option value="">${esc(fallbackLabel)}</option>`;
    return list.map((item) => {
      const value = text(item?.[valueKey]);
      const label = text(item?.name || item?.location?.address?.city || item?.merchantLocationKey || value);
      return `<option value="${esc(value)}" ${value === text(selectedValue) ? "selected" : ""}>${esc(label)} · ${esc(value)}</option>`;
    }).join("");
  }

  function rootHost() {
    const autoRoot = document.getElementById("sellerAutoListerRoot");
    if (!autoRoot) return null;
    return autoRoot.querySelector("aside") || autoRoot;
  }

  function hideLegacyLock(host) {
    host.querySelectorAll(".seller-selling-disabled").forEach((node) => { node.style.display = "none"; });
    host.querySelectorAll(".seller-selling-lock").forEach((node) => {
      if (/API-Übergabe gesperrt|noch keinen geprüften Inventory/i.test(node.textContent || "")) node.style.display = "none";
    });
  }

  function renderShell() {
    const host = rootHost();
    if (!host) return null;
    hideLegacyLock(host);
    let root = document.getElementById(ROOT_ID);
    if (root && root.parentElement !== host) root.remove();
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.className = "elyon-ebay-production";
      host.appendChild(root);
    }
    const product = selectedProduct();
    const state = listingState(product || {});
    root.innerHTML = `
      <div class="elyon-ebay-production-head">
        <div><h3>🚀 eBay-Veröffentlichung</h3><p>Prüft dein eBay-Konto, erstellt zuerst einen kontrollierten Inventory-Entwurf und veröffentlicht erst nach deiner ausdrücklichen Bestätigung.</p></div>
        <span class="elyon-ebay-badge" id="elyonEbayBadge">Setup noch nicht geprüft</span>
      </div>
      <div class="elyon-ebay-grid" id="elyonEbayPolicyGrid">
        <div class="elyon-ebay-field"><label>Versandrichtlinie</label><select id="elyonEbayFulfillment"><option value="">Setup prüfen</option></select></div>
        <div class="elyon-ebay-field"><label>Zahlungsrichtlinie</label><select id="elyonEbayPayment"><option value="">Setup prüfen</option></select></div>
        <div class="elyon-ebay-field"><label>Rücknahmerichtlinie</label><select id="elyonEbayReturn"><option value="">Setup prüfen</option></select></div>
        <div class="elyon-ebay-field"><label>Lagerstandort</label><select id="elyonEbayLocation"><option value="">Setup prüfen</option></select></div>
      </div>
      <div class="elyon-ebay-summary">
        <div><small>SKU</small><strong id="elyonEbaySku">${esc(state.sku || "noch offen")}</strong></div>
        <div><small>Offer ID</small><strong id="elyonEbayOffer">${esc(state.offerId || "noch offen")}</strong></div>
        <div><small>Listing ID</small><strong id="elyonEbayListing">${esc(state.listingId || "noch nicht live")}</strong></div>
        <div><small>Status</small><strong id="elyonEbayState">${esc(state.status)}</strong></div>
      </div>
      <div class="elyon-ebay-actions">
        <button type="button" class="secondary" id="elyonEbaySetupBtn">eBay-Setup prüfen</button>
        <button type="button" id="elyonEbayDraftBtn">eBay-Entwurf erstellen</button>
        <button type="button" id="elyonEbayPublishBtn" ${state.offerId ? "" : "disabled"}>Kostenpflichtig veröffentlichen</button>
        <button type="button" class="danger" id="elyonEbayWithdrawBtn" ${state.offerId && state.listingId ? "" : "disabled"}>Angebot zurücknehmen</button>
      </div>
      <div class="elyon-ebay-status" id="elyonEbayStatus">Prüfe zuerst das Setup. Es wird dabei nichts veröffentlicht.</div>
    `;
    bindEvents(root);
    return root;
  }

  function status(message, kind = "") {
    const node = document.getElementById("elyonEbayStatus");
    if (!node) return;
    node.textContent = message;
    node.className = `elyon-ebay-status ${kind}`.trim();
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  async function api(action, options = {}) {
    const response = await fetch(`/api/ebay?action=${encodeURIComponent(action)}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.data = data;
      throw error;
    }
    return data;
  }

  function selectedSetupPayload() {
    return {
      fulfillmentPolicyId: text(document.getElementById("elyonEbayFulfillment")?.value),
      paymentPolicyId: text(document.getElementById("elyonEbayPayment")?.value),
      returnPolicyId: text(document.getElementById("elyonEbayReturn")?.value),
      merchantLocationKey: text(document.getElementById("elyonEbayLocation")?.value),
    };
  }

  function productPayload(extra = {}) {
    const product = selectedProduct();
    if (!product) throw new Error("Noch kein Produkt im Seller Product Master ausgewählt.");
    const state = listingState(product);
    return {
      product,
      environment: "production",
      ...readSelections(),
      ...selectedSetupPayload(),
      offerId: state.offerId,
      sku: state.sku,
      ...extra,
    };
  }

  async function persistResult(result, nextStatus) {
    const product = selectedProduct();
    if (!product) return;
    const server = object(product.rawServerProduct || product.raw || product);
    const listing = object(server.listing || product.listing);
    const draft = object(listing.autoListerDraft || product.autoListerDraft);
    const now = new Date().toISOString();
    const nextDraft = {
      ...draft,
      sku: text(result.sku || draft.sku),
      offerId: text(result.offerId || draft.offerId),
      listingId: text(result.listingId || draft.listingId),
      marketplaceId: text(result.marketplaceId || draft.marketplaceId || "EBAY_DE"),
      ebayInventoryDraftCreated: Boolean(result.draftCreated || draft.ebayInventoryDraftCreated),
      publishEndpointAvailable: true,
      automaticPublishingAllowed: false,
      setupSelection: selectedSetupPayload(),
      updatedAt: now,
    };
    const nextListing = {
      ...listing,
      sku: nextDraft.sku,
      offerId: nextDraft.offerId,
      ebayItemId: nextDraft.listingId || listing.ebayItemId,
      status: nextStatus || listing.status,
      autoListerDraft: nextDraft,
      updatedAt: now,
    };
    const updated = {
      ...product,
      sku: nextDraft.sku,
      offerId: nextDraft.offerId,
      ebayItemId: nextListing.ebayItemId,
      status: nextListing.status,
      listing: nextListing,
      autoListerDraft: nextDraft,
      rawServerProduct: { ...server, listing: nextListing, sku: nextDraft.sku, offerId: nextDraft.offerId, ebayItemId: nextListing.ebayItemId, listingStatus: nextListing.status, updatedAt: now },
      updatedAt: now,
    };
    replaceStoredProduct(updated);
    const response = await fetch("/api/products", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ product: updated.rawServerProduct }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Seller Product Master konnte nicht aktualisiert werden.");
    window.dispatchEvent(new CustomEvent("elyon:seller-product-selected", { detail: { product: updated } }));
    return updated;
  }

  async function checkSetup(button) {
    setBusy(button, true, "Setup wird geprüft …");
    status("eBay-Verbindung, Business Policies, Scopes und Lagerstandorte werden geprüft …");
    try {
      const data = await api("setup");
      const saved = readSelections();
      const selected = data.selected || {};
      const fulfillmentId = saved.fulfillmentPolicyId || selected.fulfillmentPolicy?.fulfillmentPolicyId || "";
      const paymentId = saved.paymentPolicyId || selected.paymentPolicy?.paymentPolicyId || "";
      const returnId = saved.returnPolicyId || selected.returnPolicy?.returnPolicyId || "";
      const locationKey = saved.merchantLocationKey || selected.location?.merchantLocationKey || "";
      document.getElementById("elyonEbayFulfillment").innerHTML = optionHtml(data.fulfillmentPolicies, "fulfillmentPolicyId", fulfillmentId, "Keine Versandrichtlinie gefunden");
      document.getElementById("elyonEbayPayment").innerHTML = optionHtml(data.paymentPolicies, "paymentPolicyId", paymentId, "Keine Zahlungsrichtlinie gefunden");
      document.getElementById("elyonEbayReturn").innerHTML = optionHtml(data.returnPolicies, "returnPolicyId", returnId, "Keine Rücknahmerichtlinie gefunden");
      document.getElementById("elyonEbayLocation").innerHTML = optionHtml(data.locations, "merchantLocationKey", locationKey, "Kein Lagerstandort gefunden");
      saveSelections({ fulfillmentPolicyId: fulfillmentId, paymentPolicyId: paymentId, returnPolicyId: returnId, merchantLocationKey: locationKey });
      const badge = document.getElementById("elyonEbayBadge");
      badge.textContent = data.ready && data.scopesComplete ? "eBay bereit" : "Setup unvollständig";
      badge.className = `elyon-ebay-badge ${data.ready && data.scopesComplete ? "good" : "bad"}`;
      const notes = [];
      if (!data.scopesComplete) notes.push("eBay muss mit den vollständigen Verkaufs-Scopes neu verbunden werden.");
      if (Array.isArray(data.blockers)) notes.push(...data.blockers);
      status(notes.length ? notes.join("\n") : "eBay ist verbunden. Richtlinien und Lagerstandort sind vorhanden. Du kannst jetzt einen Entwurf erstellen.", notes.length ? "bad" : "good");
      return data;
    } catch (error) {
      const details = error.data?.details?.blockers || error.data?.details || [];
      status([error.message, ...(Array.isArray(details) ? details : [])].filter(Boolean).join("\n"), "bad");
      throw error;
    } finally {
      setBusy(button, false);
    }
  }

  async function createDraft(button) {
    setBusy(button, true, "Entwurf wird erstellt …");
    status("Produktdaten werden vollständig geprüft und als unveröffentlichter eBay-Entwurf übertragen …");
    try {
      const data = await api("create-draft", { method: "POST", body: productPayload() });
      await persistResult(data, "ebay_draft_created");
      document.getElementById("elyonEbaySku").textContent = data.sku || "offen";
      document.getElementById("elyonEbayOffer").textContent = data.offerId || "offen";
      document.getElementById("elyonEbayState").textContent = "ebay_draft_created";
      document.getElementById("elyonEbayPublishBtn").disabled = !data.offerId;
      status("eBay-Entwurf wurde erstellt und von eBay zurückgelesen. Das Angebot ist noch nicht live.", "good");
    } catch (error) {
      const blockers = error.data?.details?.blockers || [];
      status([error.message, ...blockers].filter(Boolean).join("\n"), "bad");
    } finally {
      setBusy(button, false);
    }
  }

  async function publish(button) {
    const state = listingState(selectedProduct() || {});
    if (!state.offerId) {
      status("Erstelle zuerst einen eBay-Entwurf.", "bad");
      return;
    }
    const confirmed = window.confirm("Dieses Angebot wird jetzt kostenpflichtig und öffentlich bei eBay eingestellt. Alle Daten wurden von dir geprüft. Wirklich veröffentlichen?");
    if (!confirmed) return;
    setBusy(button, true, "Veröffentlichung läuft …");
    status("eBay führt die finale Prüfung und Veröffentlichung aus …");
    try {
      const data = await api("publish", { method: "POST", body: productPayload({ confirmation: "PUBLISH_EBAY_OFFER", offerId: state.offerId }) });
      await persistResult(data, "active");
      document.getElementById("elyonEbayListing").textContent = data.listingId || "live";
      document.getElementById("elyonEbayState").textContent = "active";
      document.getElementById("elyonEbayWithdrawBtn").disabled = false;
      status(`Angebot erfolgreich veröffentlicht. eBay Listing-ID: ${data.listingId}`, "good");
    } catch (error) {
      const blockers = error.data?.details?.blockers || [];
      status([error.message, ...blockers].filter(Boolean).join("\n"), "bad");
    } finally {
      setBusy(button, false);
    }
  }

  async function withdraw(button) {
    const state = listingState(selectedProduct() || {});
    if (!state.offerId) return;
    const confirmed = window.confirm("Das aktive eBay-Angebot wirklich zurücknehmen?");
    if (!confirmed) return;
    setBusy(button, true, "Rücknahme läuft …");
    try {
      const data = await api("withdraw", { method: "POST", body: { environment: "production", offerId: state.offerId, confirmation: "WITHDRAW_EBAY_OFFER" } });
      await persistResult(data, "withdrawn");
      document.getElementById("elyonEbayState").textContent = "withdrawn";
      document.getElementById("elyonEbayWithdrawBtn").disabled = true;
      status("Das eBay-Angebot wurde erfolgreich zurückgenommen.", "good");
    } catch (error) {
      status(error.message, "bad");
    } finally {
      setBusy(button, false);
    }
  }

  function bindEvents(root) {
    root.querySelector("#elyonEbaySetupBtn")?.addEventListener("click", (event) => checkSetup(event.currentTarget).catch(() => {}));
    root.querySelector("#elyonEbayDraftBtn")?.addEventListener("click", (event) => createDraft(event.currentTarget));
    root.querySelector("#elyonEbayPublishBtn")?.addEventListener("click", (event) => publish(event.currentTarget));
    root.querySelector("#elyonEbayWithdrawBtn")?.addEventListener("click", (event) => withdraw(event.currentTarget));
    ["elyonEbayFulfillment", "elyonEbayPayment", "elyonEbayReturn", "elyonEbayLocation"].forEach((id) => {
      root.querySelector(`#${id}`)?.addEventListener("change", () => saveSelections(selectedSetupPayload()));
    });
  }

  function install() {
    if (installing) return;
    installing = true;
    try {
      installStyles();
      renderShell();
      if (!observer) {
        observer = new MutationObserver(() => {
          if (!document.getElementById(ROOT_ID) || !document.getElementById(ROOT_ID)?.isConnected) renderShell();
          const host = rootHost();
          if (host) hideLegacyLock(host);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } finally {
      installing = false;
    }
  }

  window.addEventListener("elyon:seller-product-selected", () => setTimeout(renderShell, 0));
  window.addEventListener("elyon:runtime-group-loaded", (event) => {
    if (event.detail?.tabId === "ebayListingTab") setTimeout(install, 0);
  });
  window.addEventListener("storage", (event) => {
    if ([PRODUCT_KEY, SELECTED_KEY].includes(event.key)) setTimeout(renderShell, 0);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.ElyonEbayProductionReadiness = { install, render: renderShell, checkSetup: () => checkSetup(document.getElementById("elyonEbaySetupBtn")) };
})();
