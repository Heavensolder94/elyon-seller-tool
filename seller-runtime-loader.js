(() => {
  "use strict";

  const VERSION = "seller-operations-20260810-5";
  const LEGACY_QUICKSTART_BRIDGE_FLAG = "__elyonModernQuickstartBridge";
  const DRAFT_TAB_ID = "draftsTab";
  const ACTIVE_TAB_ID = "activeListingsTab";
  const LISTING_STYLE_ID = "elyonSellerListingWorkspaceStyles";
  const loaded = new Map();
  const groupLoads = new Map();
  const AI_MODEL_GUARD = { src: "/seller-ai-provider-model-guard.js" };
  const PRICE_PROVENANCE = { src: "/seller-price-provenance.js", type: "module" };
  let listingLoading = false;
  let draftProducts = [];
  let activeProducts = [];
  let productIntakeOverview = null;
  let productIntakeError = "";
  let ebayListingStatusOk = false;
  let ebayDraftStatusOk = false;

  const GROUPS = {
    quickstart: [
      { src: "/seller-quickstart-menu.js", type: "module" },
    ],
    draftsTab: [],
    activeListingsTab: [],
    ebayListingTab: [
      PRICE_PROVENANCE,
      { src: "/seller-selling-flow-capture.js" },
      { src: "/seller-selling-flow.js", type: "module" },
      { src: "/seller-selling-flow-event-guard.js" },
      { src: "/seller-listing-visual-designer.js", type: "module" },
      { src: "/seller-auto-lister-parity.js", type: "module" },
      { src: "/seller-category-engine.js", type: "module" },
      { src: "/seller-selling-flow-resilience.js" },
      { src: "/seller-selling-flow-visibility-fix.js" },
      { src: "/seller-selling-flow-focused-ui.js", type: "module" },
    ],
    productListTab: [
      PRICE_PROVENANCE,
      { src: "/seller-company-os-inbox.js" },
      { src: "/seller-product-health-state.js", type: "module" },
      { src: "/seller-product-board-accordion.js" },
      { src: "/seller-product-board-accordion-compat.js" },
      { src: "/seller-product-delete.js" },
      { src: "/seller-button-integrity.js" },
    ],
    financeTab: [
      { src: "/seller-finance.js", type: "module" },
      { src: "/seller-order-invoices.js", type: "module" },
    ],
    settingsTab: [
      { src: "/seller-system-status-settings.js" },
      { src: "/seller-settings-layout-experiment.js" },
      { src: "/seller-ai-settings-label.js" },
      { src: "/seller-ebay-api-status.js" },
    ],
    virtualAgentsTab: [
      { src: "/seller-virtual-agents-legacy.js" },
      { src: "/ai-workforce-client.js" },
      { src: "/ai-workforce-mount-fix.js" },
      { src: "/seller-ai-workforce-advanced-settings.js" },
      { src: "/seller-ai-workforce-team-v6.js" },
      { src: "/seller-ai-task-prompt-helper.js" },
    ],
  };

  const text = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return numberValue(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function normalizedSrc(src) {
    return `${src}?v=${VERSION}`;
  }

  function findExisting(src) {
    return [...document.scripts].find((script) => {
      try {
        return new URL(script.src, window.location.href).pathname === src;
      } catch {
        return false;
      }
    }) || null;
  }

  function loadScript(entry) {
    const src = entry.src;
    if (loaded.has(src)) return loaded.get(src);

    const existing = findExisting(src);
    if (existing) {
      const ready = Promise.resolve(existing);
      loaded.set(src, ready);
      return ready;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = normalizedSrc(src);
      script.dataset.elyonRuntimeModule = src;
      script.async = true;
      if (entry.type === "module") script.type = "module";
      script.addEventListener("load", () => resolve(script), { once: true });
      script.addEventListener("error", () => {
        loaded.delete(src);
        reject(new Error(`Modul konnte nicht geladen werden: ${src}`));
      }, { once: true });
      document.head.appendChild(script);
    });

    loaded.set(src, promise);
    return promise;
  }

  function ensureGroup(groupId) {
    if (groupLoads.has(groupId)) return groupLoads.get(groupId);
    const entries = GROUPS[groupId];
    if (!entries) return Promise.resolve([]);

    const promise = (async () => {
      const scripts = [];
      for (const entry of entries) scripts.push(await loadScript(entry));
      if (groupId === "settingsTab" || groupId === "virtualAgentsTab") {
        scripts.push(await loadScript(AI_MODEL_GUARD));
      }
      return scripts;
    })().catch((error) => {
      groupLoads.delete(groupId);
      throw error;
    });

    groupLoads.set(groupId, promise);
    return promise;
  }

  function listingStatus(item) {
    return text(item?.status || item?.ebayStatus || item?.listing?.ebayStatus).toUpperCase();
  }

  function listingItemId(item) {
    return text(item?.listingId || item?.ebayItemId || item?.listing?.listingId || item?.listing?.ebayItemId);
  }

  // Only strong identifiers from Company OS are used. Never match products by title.
  function productMatchId(value) {
    const raw = text(value).toUpperCase();
    const amazonSource = raw.match(/^AMAZON:([A-Z0-9]{10})$/);
    return amazonSource ? "AMZ-" + amazonSource[1] : raw;
  }

  function productIdentityValues(product) {
    const identity = product?.identity && typeof product.identity === "object" ? product.identity : {};
    const listing = product?.listing && typeof product.listing === "object" ? product.listing : {};
    const channel = product?.channels?.ebay && typeof product.channels.ebay === "object" ? product.channels.ebay : {};
    const raw = product?.raw && typeof product.raw === "object" ? product.raw : {};
    const rawIdentity = raw?.identity && typeof raw.identity === "object" ? raw.identity : {};
    const rawListing = raw?.listing && typeof raw.listing === "object" ? raw.listing : {};
    const draft = raw?.autoListerDraft && typeof raw.autoListerDraft === "object" ? raw.autoListerDraft : {};
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return new Set([
      product?.articleNumber,
      product?.sku,
      product?.supplierSku,
      product?.sourceImportId,
      product?.productKey,
      product?.offerId,
      product?.ebayItemId,
      product?.listingId,
      identity.articleNumber,
      identity.sku,
      identity.supplierSku,
      identity.sourceImportId,
      listing.sku,
      listing.offerId,
      listing.ebayItemId,
      listing.listingId,
      channel.sku,
      channel.offerId,
      channel.listingId,
      raw.articleNumber,
      raw.sku,
      raw.supplierSku,
      raw.sourceImportId,
      raw.offerId,
      raw.ebayItemId,
      raw.listingId,
      rawIdentity.supplierSku,
      rawIdentity.sourceImportId,
      rawListing.sku,
      rawListing.offerId,
      rawListing.ebayItemId,
      rawListing.listingId,
      draft.sku,
      draft.offerId,
      draft.listingId,
      ...variants.flatMap((variant) => [
        variant?.sku, variant?.supplierSku, variant?.supplierSkuId, variant?.skuId,
      ]),
    ].map(productMatchId).filter(Boolean));
  }

  function matchProductMaster(item, products) {
    const ebayIds = [item?.sku, item?.offerId, item?.listingId].map(productMatchId).filter(Boolean);
    if (!ebayIds.length) return { state: "unmatched", product: null };
    const matches = products.filter((product) => {
      const ids = productIdentityValues(product);
      return ebayIds.some((id) => ids.has(id));
    });
    // One eBay item must not be silently bound to multiple master identities.
    if (matches.length === 1) return { state: "matched", product: matches[0] };
    if (matches.length > 1) return { state: "ambiguous", product: null };
    return { state: "unmatched", product: null };
  }

  function optionalAmount(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function optionalSignedAmount(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function matchedPricing(item, product) {
    const price = product?.pricing && typeof product.pricing === "object" ? product.pricing : {};
    const economics = product?.economics && typeof product.economics === "object" ? product.economics : {};
    const actualSalePrice = optionalAmount(item?.price);
    const companyOsSalePrice = optionalAmount(price.salePrice ?? economics.salePrice);
    const buyPrice = optionalAmount(price.buyPrice ?? economics.buyPrice);
    const supplierShipping = optionalAmount(price.shippingCost ?? economics.shippingCost);
    const estimatedFees = optionalAmount(price.estimatedFees ?? economics.fees);
    // Company OS owns economics. Never calculate or reuse a master profit for a different eBay price.
    const samePrice = actualSalePrice !== null && companyOsSalePrice !== null
      && Math.abs(actualSalePrice - companyOsSalePrice) < 0.005;
    const hasFullCostData = buyPrice !== null && supplierShipping !== null && estimatedFees !== null;
    const freshMaster = product?.sellerView?.freshness !== "stale";
    const profit = samePrice && hasFullCostData && freshMaster
      ? optionalSignedAmount(price.profit ?? economics.profit) : null;
    const marginPercent = samePrice && hasFullCostData && freshMaster
      ? optionalSignedAmount(price.marginPercent ?? economics.marginPercent) : null;
    return {
      buyPrice,
      salePrice: actualSalePrice,
      companyOsSalePrice,
      supplierShipping,
      estimatedFees,
      profit,
      marginPercent,
      profitSource: samePrice && profit !== null && marginPercent !== null ? "company_os" : "not_verified",
      calculationSource: text(price.calculationSource || economics.source || ""),
      priceAligned: samePrice,
      sourceFreshness: text(product?.sellerView?.freshness || "unknown"),
      costsComplete: hasFullCostData,
    };
  }

  function supplierName(product) {
    if (!product) return "";
    if (typeof product.supplier === "string") return text(product.supplier);
    return text(product?.supplier?.name || product?.supplierName);
  }

  function productImages(product) {
    const direct = Array.isArray(product?.images) ? product.images : [];
    const listing = Array.isArray(product?.listing?.images) ? product.listing.images : [];
    return [...direct, ...listing].map((entry) => typeof entry === "string" ? text(entry) : text(entry?.url)).filter(Boolean);
  }

  function enrichEbayListing(item, products) {
    const match = matchProductMaster(item, products);
    const product = match.product;
    const title = text(item?.title || product?.title || product?.listing?.title || product?.name)
      || `eBay-Angebot ${text(item?.sku || item?.offerId) || "ohne Titel"}`;
    return {
      ...item,
      status: listingStatus(item),
      title,
      // eBay-side images are authoritative for a listing; Product Master is enrichment only.
      images: Array.isArray(item?.images) && item.images.length ? item.images : productImages(product),
      supplierName: supplierName(product),
      pricing: matchedPricing(item, product),
      productMasterMatch: match.state,
      productMasterId: text(product?.id || product?.sellerToolMasterProductId || product?.companyOsProductId),
      productMasterArticleNumber: text(product?.articleNumber || product?.identity?.articleNumber),
      productReviewApproved: product?.readiness?.state === "ready_for_manual_listing",
    };
  }

  function installListingStyles() {
    if (document.getElementById(LISTING_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = LISTING_STYLE_ID;
    style.textContent = `
      #${DRAFT_TAB_ID},#${ACTIVE_TAB_ID}{display:none}
      #${DRAFT_TAB_ID}.active,#${ACTIVE_TAB_ID}.active{display:block}
      .elyon-listings-shell{display:grid;gap:16px}
      .elyon-intake-lines{display:grid;gap:8px;margin-top:12px}
      .elyon-intake-line{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .elyon-intake-line span{font-size:12px;color:#cbd5e1;padding:5px 9px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:rgba(255,255,255,.035)}
      .elyon-intake-hint{color:#94a3b8;font-size:11px;line-height:1.55;margin:8px 0 0}
      .elyon-intake-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .elyon-intake-heading h3{margin:0;font-size:16px;color:#e2e8f0}

      .elyon-status-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin-top:19px;padding-top:15px;border-top:1px solid rgba(148,163,184,.16)}
      .elyon-status-kpi{min-width:0;padding:8px 22px 10px 0}
      .elyon-status-kpi+.elyon-status-kpi{padding-left:22px;border-left:1px solid rgba(148,163,184,.14)}
      .elyon-status-kpi-head{display:flex;gap:7px;align-items:center}
      .elyon-status-kpi-head small{color:#a7b9ce;font-size:12px;font-weight:650}
      .elyon-status-kpi strong{display:block;font-size:31px;line-height:1.2;font-weight:800;color:#f8fafc;margin:8px 0 4px}
      .elyon-status-kpi p{margin:0;color:#94a3b8;font-size:11px;line-height:1.45}
      .elyon-intake-summary{padding:20px 24px}
      .elyon-intake-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .elyon-intake-heading h3{font-size:17px}
      .elyon-status-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;margin-top:20px}
      .elyon-status-group{min-width:0}
      .elyon-status-group h4{margin:0 0 10px;color:#e2e8f0;font-size:13px;font-weight:700}
      .elyon-status-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;min-width:0;border-bottom:1px solid rgba(148,163,184,.1);font-size:12px;color:#bdcce0}
      .elyon-status-row:last-child{border-bottom:0}
      .elyon-status-row strong{color:#f8fafc;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
      .elyon-status-foot{color:#94a3b8;font-size:11px;line-height:1.55;margin:14px 0 0}
      .elyon-intake-summary .elyon-metric-info-btn{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;padding:0;margin:0;border:1px solid rgba(148,163,184,.4);border-radius:50%;background:transparent;color:#94a3b8;font:700 10px/1 Arial,sans-serif;cursor:pointer;box-shadow:none}
      .elyon-intake-summary .elyon-metric-info-btn:hover{border-color:#94a3b8;color:#e2e8f0}
      .elyon-intake-summary .elyon-metric-info-btn:focus-visible{outline:2px solid #93c5fd;outline-offset:3px}
      @media(max-width:900px){.elyon-status-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.elyon-status-kpi{padding-right:14px}.elyon-status-kpi+.elyon-status-kpi{padding-left:14px}.elyon-status-kpi:nth-child(odd){padding-left:0;border-left:0}.elyon-status-kpi:nth-child(n+3){padding-top:15px;border-top:1px solid rgba(148,163,184,.14)}.elyon-status-kpi strong{font-size:27px}}
      @media(max-width:680px){.elyon-status-kpi-head small{font-size:10px}.elyon-status-groups{grid-template-columns:minmax(0,1fr);gap:24px}.elyon-intake-summary{padding:17px}}
      @media(max-width:400px){.elyon-status-kpis{grid-template-columns:minmax(0,1fr)}.elyon-status-kpi,.elyon-status-kpi+.elyon-status-kpi{padding:10px 0;border-left:0;border-bottom:1px solid rgba(148,163,184,.12)}.elyon-status-kpi:last-child{border-bottom:0}}
      .elyon-listings-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
      .elyon-listings-head h2{margin:0 0 7px;font-size:28px;letter-spacing:-.035em}
      .elyon-listings-head p{margin:0;max-width:800px;color:#cbd5e1;font-size:13px;line-height:1.55}
      .elyon-listings-list{display:grid;gap:12px}
      .elyon-listing-card{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;align-items:center;padding:15px;border-radius:20px;background:rgba(2,6,23,.45);border:1px solid rgba(96,165,250,.18)}
      .elyon-listing-card.active{border-color:rgba(34,197,94,.26);background:linear-gradient(145deg,rgba(2,6,23,.48),rgba(20,83,45,.12))}
      .elyon-listing-image{width:76px;height:76px;border-radius:16px;display:grid;place-items:center;overflow:hidden;background:#020617;border:1px solid rgba(255,255,255,.1);font-size:28px}
      .elyon-listing-image img{width:100%;height:100%;object-fit:cover}
      .elyon-listing-copy{min-width:0}.elyon-listing-copy strong{display:block;color:#f8fafc;font-size:16px;line-height:1.35;overflow-wrap:anywhere}
      .elyon-listing-copy p{margin:5px 0 0;color:#94a3b8;font-size:11px;line-height:1.45}
      .elyon-listing-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      .elyon-listing-pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#dbeafe;font-size:10px;font-weight:850}
      .elyon-listing-pill.ready,.elyon-listing-pill.live{color:#bbf7d0;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.23)}
      .elyon-listing-pill.blocked{color:#fde68a;background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.22)}
      .elyon-review-intake-btn{display:inline-flex;margin-top:10px;padding:9px 12px;font-size:12px;border-radius:10px;max-width:100%;white-space:normal;text-align:left}
      .elyon-listings-status{padding:12px 14px;border-radius:15px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.2);color:#dbeafe;font-size:12px;line-height:1.45}
      .elyon-listings-status.error{color:#fecaca;background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.25)}
      .elyon-listings-empty{padding:28px 18px;text-align:center;border-radius:18px;border:1px dashed rgba(148,163,184,.22);color:#94a3b8;font-size:12px;line-height:1.55}
      @media(max-width:760px){.elyon-listing-card{grid-template-columns:58px minmax(0,1fr)}.elyon-listing-image{width:58px;height:58px}}
    `;
    document.head.appendChild(style);
  }

  function numberProductPipelineMenu(menu) {
    if (!menu) return;
    [...menu.options]
      .filter((option) => !option.disabled && text(option.value))
      .forEach((option, index) => {
        const label = text(option.textContent).replace(/^\d+\.\s*/, "");
        option.textContent = `${index + 1}. ${label}`;
      });
  }

  function ensureListingWorkspaces() {
    installListingStyles();
    const menu = document.getElementById("mainMenu");
    const productOption = menu?.querySelector('option[value="productListTab"]');

    if (menu && !menu.querySelector(`option[value="${DRAFT_TAB_ID}"]`)) {
      const option = document.createElement("option");
      option.value = DRAFT_TAB_ID;
      option.textContent = "📝 Listing-Entwürfe";
      if (productOption) productOption.insertAdjacentElement("afterend", option);
      else menu.appendChild(option);
    }

    if (menu && !menu.querySelector(`option[value="${ACTIVE_TAB_ID}"]`)) {
      const option = document.createElement("option");
      option.value = ACTIVE_TAB_ID;
      option.textContent = "🟢 Aktive Listings";
      const draftOption = menu.querySelector(`option[value="${DRAFT_TAB_ID}"]`);
      if (draftOption) draftOption.insertAdjacentElement("afterend", option);
      else menu.appendChild(option);
    }
    numberProductPipelineMenu(menu);

    let draftTab = document.getElementById(DRAFT_TAB_ID);
    if (!draftTab) {
      draftTab = document.createElement("section");
      draftTab.id = DRAFT_TAB_ID;
      draftTab.className = "tab";
      const productTab = document.getElementById("productListTab");
      if (productTab) productTab.insertAdjacentElement("afterend", draftTab);
      else document.querySelector("main.container")?.appendChild(draftTab);
    }

    let activeTab = document.getElementById(ACTIVE_TAB_ID);
    if (!activeTab) {
      activeTab = document.createElement("section");
      activeTab.id = ACTIVE_TAB_ID;
      activeTab.className = "tab";
      draftTab.insertAdjacentElement("afterend", activeTab);
    }

    return { draftTab, activeTab };
  }

  function showListingWorkspace(tabId) {
    const { draftTab, activeTab } = ensureListingWorkspaces();
    const target = tabId === ACTIVE_TAB_ID ? activeTab : draftTab;
    if (!target) return;
    document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node === target));
    const menu = document.getElementById("mainMenu");
    if (menu) menu.value = target.id;
  }

  function matchLabel(state) {
    if (state === "matched") return { label: "Product-Master-Match", className: "ready" };
    if (state === "ambiguous") return { label: "Mehrdeutiger Product-Master-Match", className: "blocked" };
    return { label: "Kein Product-Master-Match", className: "blocked" };
  }

  function listingCard(product, mode) {
    const pricing = product?.pricing || {};
    const match = matchLabel(product?.productMasterMatch);
    const imageUrl = Array.isArray(product?.images) ? text(product.images[0]) : "";
    const image = imageUrl
      ? `<div class="elyon-listing-image"><img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : `<div class="elyon-listing-image">${mode === "active" ? "🟢" : "📝"}</div>`;
    const status = listingStatus(product);
    const itemId = listingItemId(product);
    const offerId = text(product?.offerId);
    const sku = text(product?.sku);
    const matched = product?.productMasterMatch === "matched";
    const supplier = text(product?.supplierName) || "Lieferant offen";
    const ebayPrice = pricing.salePrice === null ? "eBay VK offen" : "eBay VK " + money(pricing.salePrice);
    const cost = pricing.buyPrice === null ? "EK offen" : "Company-OS-EK " + money(pricing.buyPrice);
    const shipping = pricing.supplierShipping === null ? "Versand offen" : "Versand " + money(pricing.supplierShipping);
    const fees = pricing.estimatedFees === null ? "Gebühren offen" : "Gebühren " + money(pricing.estimatedFees);
    const hasVerifiedEstimate = pricing.profitSource === "company_os";
    const profit = hasVerifiedEstimate
      ? "Company-OS-Prognose " + money(pricing.profit) + " · " +
        Number(pricing.marginPercent).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " % Marge"
      : "Gewinn/Marge offen";
    const priceNotice = matched && pricing.companyOsSalePrice !== null && !pricing.priceAligned
      ? " · Preisabweichung: Company OS " + money(pricing.companyOsSalePrice) + "; Gewinn dort nicht für aktuellen eBay-VK gültig"
      : "";
    const pricingLine = matched
      ? [ebayPrice, supplier, cost, shipping, fees, profit].join(" · ") + priceNotice
      : ebayPrice + " · Kein eindeutiger Company-OS-Product-Master-Match";
    const reviewNote = matched
      ? (pricing.sourceFreshness === "stale"
        ? "Product-Master-Daten stammen aus einem veralteten Cache. Live-Abgleich zu Company OS erneut prüfen."
        : !product?.productReviewApproved
        ? "Company OS: Produktprüfung offen. Noch keine Verkaufsfreigabe; Lieferant, EK, Bilderrechte und Versand prüfen."
        : hasVerifiedEstimate
        ? "Schätzung aus Company OS – Kosten und Gebühren vor Veröffentlichung prüfen."
        : "Für einen verlässlichen Gewinn fehlen geprüfte Company-OS-Daten oder die Preise stimmen nicht überein.")
      : product?.productMasterMatch === "ambiguous"
        ? "Mehrere Company-OS-Produkte passen zu dieser Kennung. Bitte Produktidentität im Company OS prüfen."
        : "Zuerst im Company OS unter Produktprüfung erfassen und eine ELY-Artikelnummer zuweisen. Keine automatische Veröffentlichung.";


    return `
      <article class="elyon-listing-card ${mode === "active" ? "active" : ""}">
        ${image}
        <div class="elyon-listing-copy">
          <strong>${escapeHtml(product?.title || "Unbenanntes eBay-Angebot")}</strong>
          <p>${escapeHtml(pricingLine)}</p>
          <p>${escapeHtml(reviewNote)}</p>
          <div class="elyon-listing-meta">
            <span class="elyon-listing-pill ${mode === "active" ? "live" : ""}">${escapeHtml(status)}</span>
            <span class="elyon-listing-pill ${match.className}">${escapeHtml(match.label)}</span>
            ${product?.productMasterArticleNumber ? `<span class="elyon-listing-pill ready">ELY ${escapeHtml(product.productMasterArticleNumber)}</span>` : ""}
            ${matched && !product?.productReviewApproved ? '<span class="elyon-listing-pill blocked">Produktprüfung offen – nicht freigegeben</span>' : ""}
            ${product?.feedVerification === "feed_processed_not_live_checked" ? '<span class="elyon-listing-pill">Feed verarbeitet · Seller Hub bitte prüfen</span>' : ""}
            ${sku ? `<span class="elyon-listing-pill">SKU ${escapeHtml(sku)}</span>` : ""}
            ${offerId ? `<span class="elyon-listing-pill">Offer ${escapeHtml(offerId)}</span>` : ""}
            ${mode === "active" && itemId ? `<span class="elyon-listing-pill live">eBay ${escapeHtml(itemId)}</span>` : ""}
          </div>
          ${mode === "draft" && product?.productMasterMatch === "unmatched" && /^AMZ-[A-Z0-9]{10}$/i.test(sku)
            ? `<button type="button" class="secondary elyon-review-intake-btn" data-elyon-review-sku="${escapeHtml(sku)}">↗ In Company OS zur Produktprüfung</button>`
            : ""}
        </div>
      </article>`;
  }


  function intakeCountLabel() {
    if (!productIntakeOverview) return "–";
    const amount = Number(productIntakeOverview.total);
    if (!Number.isSafeInteger(amount) || amount < 0) return "–";
    return productIntakeOverview.complete === true && productIntakeOverview.dedupeVerified === true
      ? String(amount) : "~" + amount;
  }


  function statusKpisHtml() {
    const apiDraftLabel = !listingLoading && ebayDraftStatusOk
      ? String(draftProducts.filter((item) => item?.source === "elyon_inventory_draft").length)
      : "–";
    const reviewCount = productIntakeOverview?.stages?.review;
    const reviewLabel = Number.isSafeInteger(reviewCount) && reviewCount >= 0 ? String(reviewCount) : "–";
    const activeLabel = !listingLoading && ebayListingStatusOk ? String(activeProducts.length) : "–";
    const popup = (id, label, help) =>
      '<button type="button" class="elyon-metric-info-btn" aria-label="' + label +
      '" aria-haspopup="true" popovertarget="' + id + '">i</button>' +
      '<div id="' + id + '" class="elyon-metric-popover" popover="auto" role="note">' + help + '</div>';
    const kpi = (title, amount, description, id, help) =>
      '<div class="elyon-status-kpi"><div class="elyon-status-kpi-head"><small>' + title + '</small>' +
      popup(id, 'Info zu ' + title, help) + '</div><strong>' + amount +
      '</strong><p>' + description + '</p></div>';
    return '<div class="elyon-status-kpis">' +
      kpi('Importiert', intakeCountLabel(), 'Einmalige Produktzugänge', 'elyon-draft-info-import',
        'Einmalig erfasste Produkte aus ELYON Nova, Amazon Importer und Company OS. Herkunft und Bearbeitungsstand stehen darunter.') +
      kpi('In Prüfung', reviewLabel, 'Company OS · Produktprüfung', 'elyon-draft-info-review',
        'Produkte in der Company-OS-Produktprüfung. Das ist keine Verkaufsfreigabe.') +
      kpi('API-Entwürfe', apiDraftLabel, 'Unveröffentlicht · Seller Hub ungeprüft', 'elyon-draft-info-api',
        'Von ELYON registrierte eBay-Inventory-API-Angebote mit Status UNPUBLISHED. Das ist kein Beweis für einen sichtbaren Seller-Hub-Entwurf. Verarbeitete Feed-Aufträge zählen hier nicht mit.') +
      kpi('Live auf eBay', activeLabel, 'Tatsächlich veröffentlichte Listings', 'elyon-draft-info-live',
        'Aktive Angebote aus dem verbundenen eBay-Verkäuferkonto. Unveröffentlichte API-Angebote und Feed-Aufträge zählen nicht dazu.') +
      '</div>';
  }

  function renderIntakeDetails() {
    const overview = productIntakeOverview;
    const ebayAvailable = !listingLoading && ebayListingStatusOk;
    const draftAvailable = !listingLoading && ebayDraftStatusOk;
    const label = (value) => Number.isSafeInteger(value) && value >= 0 ? String(value) : "–";
    const apiOffers = draftProducts.filter((item) => item?.source === "elyon_inventory_draft").length;
    const feeds = draftProducts.filter((item) => item?.source === "elyon_seller_hub_feed" &&
      item?.feedVerification === "feed_processed_not_live_checked").length;
    const matched = draftProducts.filter((item) => item?.productMasterMatch === "matched").length;
    const row = (name, value) => '<div class="elyon-status-row"><span>' + name +
      '</span><strong>' + value + '</strong></div>';
    const source = overview?.sources || {};
    const stages = overview?.stages || {};
    const issue = overview && (overview.complete !== true || Number(overview.identityUnverified) > 0);
    const status = !overview ? "Nicht abrufbar" : issue ? "Teilweise" : "Abgeglichen";
    const sourceRows = overview
      ? row('ELYON Nova', label(source.nova)) + row('Amazon Importer', label(source.amazonImporter)) +
        row('Company OS (direkt)', label(source.companyOs)) +
        (source.unclassified ? row('Weitere Quellen', label(source.unclassified)) : "")
      : '<p class="elyon-intake-hint">' + escapeHtml(
          listingLoading ? "Produktzugänge werden geladen …" : "Company OS momentan nicht erreichbar. " +
            (productIntakeError || "Verbindung prüfen.")) + '</p>';
    const eBayRows = ebayAvailable
      ? row('Unveröffentlichte API-Angebote', draftAvailable ? label(apiOffers) : '–') +
        row('Verarbeitete Feed-Aufträge', draftAvailable ? label(feeds) : '–') +
        row('Aktive eBay-Listings', label(activeProducts.length)) +
        row('Mit Company OS verknüpft', draftAvailable ? label(matched) : '–') +
        row('Seller-Hub-Entwürfe', 'Nicht live prüfbar')
      : '<p class="elyon-intake-hint">eBay-Status nicht vollständig prüfbar.</p>';
    const stageFoot = overview
      ? '<p class="elyon-status-foot">Im Eingang: ' + label(stages.inbox) +
        ' · Listing vorbereitet: ' + label(stages.listingPrepared) + '</p>' : "";
    const issueNote = !overview
      ? "Fehlende Daten werden nicht als Null dargestellt."
      : overview.complete !== true
        ? "Der Nova-Eingang ist möglicherweise länger als das abrufbare Fenster. Gesamtzahl unvollständig."
        : Number(overview.identityUnverified) > 0
          ? "Bei Produkten ohne stabile ID ist eine Doppelzählung nicht vollständig auszuschließen."
          : "Produktquellen anhand stabiler Import- und Produkt-IDs abgeglichen.";
    return '<section class="card elyon-intake-summary">' +
      '<div class="elyon-intake-heading"><h3>Produktübersicht</h3><span class="elyon-listing-pill">' + status + '</span></div>' +
      '<div class="elyon-status-groups">' +
      '<div class="elyon-status-group"><h4>Woher kommen deine Produkte?</h4>' +
      sourceRows + stageFoot + '</div>' +
      '<div class="elyon-status-group"><h4>eBay-Verkaufsstatus</h4>' + eBayRows +
      '<p class="elyon-status-foot">API-Entwürfe und verarbeitete Feed-Aufträge sind unterschiedliche Nachweise. Ein Seller-Hub-Entwurf ist hier nicht live bestätigt.</p></div>' +
      '</div><p class="elyon-status-foot">' + escapeHtml(issueNote) +
      ' Feed-Aufträge beweisen keinen bestätigten Seller-Hub-Entwurf. Abgelehnte oder archivierte Produkte sind nicht im aktiven Eingang enthalten.</p>' +
      '</section>';
  }

  function renderDraftWorkspace(message = "") {
    const { draftTab } = ensureListingWorkspaces();
    if (!draftTab) return;
    const matchedCount = draftProducts.filter((product) => product.productMasterMatch === "matched").length;
    const unmatchedCount = draftProducts.length - matchedCount;
    draftTab.innerHTML = `
      <div class="elyon-listings-shell">
        <section class="card">
          <div class="elyon-listings-head">
            <div><div class="badge">📝 eBay · UNPUBLISHED</div><h2>Listing-Entwürfe</h2><p>Diese Liste kommt direkt aus der eBay Inventory API. Angezeigt werden ausschließlich eBay-Angebote mit Status UNPUBLISHED. Der Product Master liefert nur zusätzliche Daten wie Lieferant, EK, Gewinn und Marge und bestimmt niemals, ob ein Entwurf existiert.</p></div>
            <button type="button" class="secondary" id="elyonDraftsRefresh">${listingLoading ? "Lädt …" : "Neu laden"}</button>
          </div>
          <div class="dashboard" style="margin-top:16px;margin-bottom:0">
            <div class="metric"><small>eBay-Entwürfe</small><strong>${draftProducts.length}</strong></div>
            <div class="metric"><small>Mit Product-Master-Match</small><strong>${matchedCount}</strong></div>
            <div class="metric"><small>Ohne Match</small><strong>${unmatchedCount}</strong></div>
            <div class="metric"><small>Datenquelle</small><strong style="font-size:14px">eBay Inventory API</strong></div>
          </div>
        </section>
        ${typeof renderIntakeDetails === "function" ? renderIntakeDetails() : ""}
        <p class="small">Feed-Entwürfe aus dem Amazon Importer werden nach bestätigter Verarbeitung zusätzlich angezeigt. Ihr aktueller Bestand im eBay Seller Hub kann über die Inventory API nicht live geprüft werden. Product-Master-Zuordnung und Company-OS-Gewinnprognosen werden bei jedem Öffnen oder Klick auf „Neu laden“ aus der kanonischen Quelle aktualisiert; unbestätigte Kosten bleiben offen.</p>
        ${message ? `<div class="elyon-listings-status ${message.startsWith("Fehler:") ? "error" : ""}">${escapeHtml(message)}</div>` : ""}
        <section class="card"><div class="elyon-listings-list">${listingLoading
          ? '<div class="elyon-listings-empty">Echte eBay-Entwürfe werden geladen …</div>'
          : draftProducts.length
            ? draftProducts.map((product) => listingCard(product, "draft")).join("")
            : '<div class="elyon-listings-empty">eBay meldet aktuell 0 UNPUBLISHED-Angebote. Deshalb zeigt Elyon 0 Listing-Entwürfe.</div>'}</div></section>
      </div>`;
    draftTab.querySelector("#elyonDraftsRefresh")?.addEventListener("click", () => refreshListingWorkspaces(true, DRAFT_TAB_ID));
    draftTab.querySelectorAll?.("[data-elyon-review-sku]").forEach((button) => {
      button.addEventListener("click", () => startCompanyOsReview(button.dataset.elyonReviewSku, button));
    });
  }

  function renderActiveWorkspace(message = "") {
    const { activeTab } = ensureListingWorkspaces();
    if (!activeTab) return;
    const matchedCount = activeProducts.filter((product) => product.productMasterMatch === "matched").length;
    const withItemId = activeProducts.filter((product) => listingItemId(product)).length;
    activeTab.innerHTML = `
      <div class="elyon-listings-shell">
        <section class="card">
          <div class="elyon-listings-head">
            <div><div class="badge">🟢 eBay · PUBLISHED</div><h2>Aktive Listings</h2><p>Diese Liste kommt direkt aus der eBay Inventory API. Angezeigt werden ausschließlich eBay-Angebote mit Status PUBLISHED. Product-Master-Daten werden nur ergänzend zugespielt; auch eBay-Angebote ohne Match bleiben sichtbar.</p></div>
            <button type="button" class="secondary" id="elyonActiveRefresh">${listingLoading ? "Lädt …" : "Neu laden"}</button>
          </div>
          <div class="dashboard" style="margin-top:16px;margin-bottom:0">
            <div class="metric"><small>Aktive eBay-Listings</small><strong>${activeProducts.length}</strong></div>
            <div class="metric"><small>Mit eBay-ID</small><strong>${withItemId}</strong></div>
            <div class="metric"><small>Mit Product-Master-Match</small><strong>${matchedCount}</strong></div>
            <div class="metric"><small>Datenquelle</small><strong style="font-size:14px">eBay Inventory API</strong></div>
          </div>
        </section>
        ${message ? `<div class="elyon-listings-status ${message.startsWith("Fehler:") ? "error" : ""}">${escapeHtml(message)}</div>` : ""}
        <section class="card"><div class="elyon-listings-list">${listingLoading
          ? '<div class="elyon-listings-empty">Aktive eBay-Listings werden geladen …</div>'
          : activeProducts.length
            ? activeProducts.map((product) => listingCard(product, "active")).join("")
            : '<div class="elyon-listings-empty">eBay meldet aktuell 0 PUBLISHED-Angebote. Deshalb zeigt Elyon 0 aktive Listings.</div>'}</div></section>
      </div>`;
    activeTab.querySelector("#elyonActiveRefresh")?.addEventListener("click", () => refreshListingWorkspaces(true, ACTIVE_TAB_ID));
  }

  async function startCompanyOsReview(sku, button) {
    if (!/^AMZ-[A-Z0-9]{10}$/i.test(text(sku))) return;
    if (!draftProducts.some((item) => text(item?.sku).toUpperCase() === text(sku).toUpperCase()
      && item.productMasterMatch === "unmatched")) return;
    if (button.disabled) return;
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "Company-OS-Prüfung wird angelegt …";
    try {
      const response = await fetch("/api/products/review-intake", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sku }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.message || result.error || "Produktprüfung fehlgeschlagen");
      const label = text(result.articleNumber);
      window.alert?.((result.alreadyExists ? "Company-OS-Produkt bereits vorhanden: " : "Produktprüfung in Company OS angelegt: ")
        + label + "\nDie Lieferantenprüfung, Kosten und Bilderrechte bleiben offen. Nichts wurde bei eBay veröffentlicht.");
      await refreshListingWorkspaces(true, DRAFT_TAB_ID);
    } catch (error) {
      button.disabled = false;
      button.textContent = previousText;
      window.alert?.("Company-OS-Produktprüfung nicht übernommen: " + text(error?.message || "Unbekannter Fehler")
        + "\nDer eBay-Entwurf wurde nicht verändert.");
    }
  }

  async function getJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function refreshListingWorkspaces(manual = false, requestedTab = DRAFT_TAB_ID) {
    if (listingLoading) return;
    listingLoading = true;
    ebayListingStatusOk = false;
    ebayDraftStatusOk = false;
    renderDraftWorkspace();
    renderActiveWorkspace();
    let message = "";
    try {
      const [listingResult, productResult, intakeResult] = await Promise.allSettled([
        getJson("/api/ebay/listings?environment=production"),
        getJson("/api/products"),
        getJson("/api/product-imports/overview"),
      ]);
      productIntakeOverview = intakeResult.status === "fulfilled" && intakeResult.value?.overview
        ? intakeResult.value.overview : null;
      productIntakeError = intakeResult.status === "fulfilled" ? ""
        : text(intakeResult.reason?.message || "Company OS derzeit nicht erreichbar");
      // Active listings are verified by a successful seller-state response, even
      // if the independent Inventory-API draft snapshot is unavailable.
      ebayListingStatusOk = listingResult.status === "fulfilled";
      ebayDraftStatusOk = listingResult.status === "fulfilled" && listingResult.value?.draftsAvailable !== false;
      if (listingResult.status !== "fulfilled") throw listingResult.reason;

      const items = Array.isArray(listingResult.value?.items) ? listingResult.value.items : [];
      const products = productResult.status === "fulfilled" && Array.isArray(productResult.value?.products)
        ? productResult.value.products
        : [];
      const enriched = items.map((item) => enrichEbayListing(item, products));
      draftProducts = enriched.filter((item) => listingStatus(item) === "UNPUBLISHED");
      activeProducts = enriched.filter((item) => listingStatus(item) === "PUBLISHED");

      const enrichmentNote = productResult.status === "fulfilled"
        ? " Product Master wurde ausschließlich zur Anreicherung verwendet."
        : " Product Master war nicht erreichbar; die eBay-Listings bleiben trotzdem vollständig sichtbar.";
      message = `${draftProducts.length} eBay-Entwurf${draftProducts.length === 1 ? "" : "e"} · ${activeProducts.length} aktive${activeProducts.length === 1 ? "s" : ""} eBay-Listing${activeProducts.length === 1 ? "" : "s"}.${enrichmentNote}`;
    } catch (error) {
      draftProducts = [];
      activeProducts = [];
      ebayListingStatusOk = false;
      ebayDraftStatusOk = false;
      const authHint = error?.status === 403 ? " Bitte Seller-Sitzung erneut anmelden." : "";
      message = `Fehler: eBay Listing-Bestand konnte nicht geladen werden: ${text(error?.message) || "Unbekannter Fehler"}.${authHint}`;
    } finally {
      listingLoading = false;
      renderDraftWorkspace(message);
      renderActiveWorkspace(message);
      if (manual) document.getElementById(requestedTab)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function isDashboardDraftTaskClick(target) {
    if (!(target instanceof Element)) return false;
    const button = target.closest("#dashboardTab [data-sd-tab], #dashboardTab [data-seller-open-tab]");
    if (!button) return false;
    const task = button.closest(".sd-task,.seller-task");
    const title = text(task?.querySelector("strong")?.textContent);
    return /Listing-Entwurf/i.test(title);
  }

  function activateGroup(groupId) {
    if (groupId === DRAFT_TAB_ID || groupId === ACTIVE_TAB_ID) {
      showListingWorkspace(groupId);
      refreshListingWorkspaces(false, groupId);
    } else if (groupId === "ebayListingTab") {
      window.ElyonSellerPriceProvenance?.enrichSelectedWorkingCopy?.();
      window.ElyonSellerPriceProvenance?.render?.();
      window.ElyonSellerSellingFlowCapture?.restore?.();
      window.ElyonSellerSellingFlow?.render?.();
    } else if (groupId === "productListTab") {
      window.ElyonSellerPriceProvenance?.enrichSelectedWorkingCopy?.();
      window.ElyonCompanyOsInbox?.install?.();
      window.ElyonProductBoardAccordion?.refresh?.();
      window.ElyonProductHealthState?.refresh?.();
    } else if (groupId === "financeTab") {
      window.ElyonSellerFinance?.open?.();
      window.ElyonOrderInvoices?.mount?.();
    } else if (groupId === "settingsTab") {
      window.ElyonSystemStatusSettings?.install?.();
      window.ElyonSystemStatusSettings?.move?.();
      window.ElyonSettingsLayoutExperiment?.refresh?.();
      window.ElyonAiSettingsLabel?.apply?.();
      window.ElyonAiProviderModelGuard?.apply?.();
      window.ElyonEbayApiStatus?.status?.();
    } else if (groupId === "virtualAgentsTab") {
      window.ElyonAIWorkforce?.mount?.();
      window.ElyonAIWorkforceMountFix?.refresh?.();
      window.ElyonAIWorkforceAdvancedSettings?.refresh?.();
      window.ElyonAIWorkforceTeamV6?.render?.();
      window.ElyonAITaskPromptHelper?.refresh?.();
      window.ElyonAiProviderModelGuard?.apply?.();
      window.ElyonAiProviderModelGuard?.syncWorkforce?.();
    }
  }

  async function loadGroup(groupId) {
    const entries = GROUPS[groupId];
    if (!entries) return [];
    const scripts = await ensureGroup(groupId);
    activateGroup(groupId);
    window.dispatchEvent(new CustomEvent("elyon:runtime-group-loaded", {
      detail: { tabId: groupId, modules: entries.map((entry) => entry.src) },
    }));
    return scripts;
  }

  function activeTabId() {
    const menuValue = document.getElementById("mainMenu")?.value;
    if (menuValue && GROUPS[menuValue]) return menuValue;
    const active = document.querySelector(".tab.active[id]");
    return active?.id && GROUPS[active.id] ? active.id : "";
  }

  function requestGroup(groupId) {
    if (!GROUPS[groupId]) return Promise.resolve([]);
    return loadGroup(groupId).catch((error) => {
      console.error("[Elyon Runtime Loader]", error);
      window.dispatchEvent(new CustomEvent("elyon:runtime-group-error", {
        detail: { tabId: groupId, message: error.message },
      }));
      throw error;
    });
  }

  function requestQuickstart(manual = true) {
    return requestGroup("quickstart")
      .then(() => window.ElyonSellerQuickstart?.open?.({ manual }))
      .catch(() => false);
  }

  function installLegacyQuickstartBridge() {
    const legacyOpen = window.openStartLauncher;
    if (typeof legacyOpen !== "function") return false;
    if (legacyOpen[LEGACY_QUICKSTART_BRIDGE_FLAG] === true) return true;

    function openModernQuickstartFromLegacy() {
      requestQuickstart(false);
    }

    Object.defineProperty(openModernQuickstartFromLegacy, LEGACY_QUICKSTART_BRIDGE_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(openModernQuickstartFromLegacy, "legacyOpenStartLauncher", {
      value: legacyOpen,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    window.openStartLauncher = openModernQuickstartFromLegacy;
    return window.openStartLauncher === openModernQuickstartFromLegacy;
  }

  function installFinanceEntry() {
    const menu = document.getElementById("mainMenu");
    if (menu && !menu.querySelector('option[value="financeTab"]')) {
      const option = document.createElement("option");
      option.value = "financeTab";
      option.textContent = "Finanzen & Buchhaltung";
      menu.appendChild(option);
      numberProductPipelineMenu(menu);
    }

    const nav = document.querySelector(".nav-menu");
    if (nav && !document.getElementById("elyonFinanceRuntimeNav")) {
      const link = document.createElement("a");
      link.id = "elyonFinanceRuntimeNav";
      link.href = "#finance";
      link.className = "nav-item";
      link.dataset.tab = "financeTab";
      link.innerHTML = '<span class="nav-icon">€</span><span>Finanzen</span>';
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (menu) menu.value = "financeTab";
        requestGroup("financeTab").catch(() => {});
      });
      nav.appendChild(link);
    }
  }

  function tabFromClick(target) {
    if (!(target instanceof Element)) return "";
    const explicit = target.closest("[data-tab],[data-tab-id],[data-target-tab],[data-sd-tab],[data-seller-open-tab]");
    const candidate = explicit?.dataset.tab || explicit?.dataset.tabId || explicit?.dataset.targetTab || explicit?.dataset.sdTab || explicit?.dataset.sellerOpenTab;
    if (candidate && GROUPS[candidate]) return candidate;

    if (target.closest("#settingsBtn,#openAiDashboardBtn")) return "settingsTab";
    if (target.closest("#launcherGenerator")) return "ebayListingTab";
    if (target.closest("#launcherBoard")) return "productListTab";

    const inline = target.closest("[onclick]")?.getAttribute("onclick") || "";
    const match = inline.match(/showTab\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    return match && GROUPS[match[1]] ? match[1] : "";
  }

  function quickstartIsOpen() {
    const modal = document.getElementById("startLauncherModal");
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function install() {
    installLegacyQuickstartBridge();
    installFinanceEntry();
    ensureListingWorkspaces();

    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu") requestGroup(event.target.value).catch(() => {});
    }, true);

    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("#startLauncherBtn")) {
        event.preventDefault();
        event.stopPropagation();
        requestQuickstart(true);
        return;
      }
      if (isDashboardDraftTaskClick(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestGroup(DRAFT_TAB_ID).catch(() => {});
        return;
      }
      const tabId = tabFromClick(event.target);
      if (tabId) requestGroup(tabId).catch(() => {});
    }, true);

    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (typeof tabId === "string") requestGroup(tabId).catch(() => {});
    });

    window.addEventListener("elyon:seller-authenticated", () => {
      const activeId = document.querySelector(".tab.active[id]")?.id;
      if (activeId === DRAFT_TAB_ID || activeId === ACTIVE_TAB_ID) refreshListingWorkspaces(false, activeId);
    });

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#finance") requestGroup("financeTab").catch(() => {});
    });

    const initial = window.location.hash === "#finance" ? "financeTab" : activeTabId();
    if (initial) {
      const start = () => requestGroup(initial).catch(() => {});
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(start, { timeout: 700 });
      } else {
        window.setTimeout(start, 0);
      }
    }

    if (quickstartIsOpen()) requestQuickstart(false);

    window.ElyonRuntimeLoader = {
      loadGroup,
      loadScript: (src, type = "") => loadScript({ src, type }),
      openQuickstart: requestQuickstart,
      openDrafts: () => requestGroup(DRAFT_TAB_ID),
      openActiveListings: () => requestGroup(ACTIVE_TAB_ID),
      refreshDrafts: () => refreshListingWorkspaces(true, DRAFT_TAB_ID),
      refreshListings: refreshListingWorkspaces,
      loaded: () => [...loaded.keys()],
      loadedGroups: () => [...groupLoads.keys()],
      groups: GROUPS,
    };
  }

  installLegacyQuickstartBridge();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
