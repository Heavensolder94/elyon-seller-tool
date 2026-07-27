function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}
    return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = text(value).replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function dedupe(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function httpsImages(values) {
  return dedupe(values).filter((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }).slice(0, 12);
}

export function sellerServerProduct(product = {}) {
  return object(product.rawServerProduct || product.raw || product);
}

export function sellerProductIdentity(product = {}) {
  const server = sellerServerProduct(product);
  return text(
    product.sellerToolMasterProductId ||
    server.id ||
    server.companyOsProductId ||
    product.id ||
    server.supplier?.url ||
    product.supplierLink
  );
}

export function buildSellerListingView(product = {}) {
  const local = object(product);
  const server = sellerServerProduct(local);
  const listing = object(server.listing || local.listing);
  const pricing = object(server.pricing || local.pricing);
  const logistics = object(server.logistics || local.logistics);
  const readiness = object(server.readiness || local.readiness);
  const approval = object(server.approval || local.approval);
  const raw = object(server.raw || local.raw);
  const itemSpecifics = object(
    listing.itemSpecifics ||
    server.itemSpecifics ||
    local.itemSpecifics ||
    raw.itemSpecifics
  );
  const images = httpsImages([
    ...array(server.images),
    ...array(local.images),
    ...array(listing.images),
    server.image,
    local.image,
    local.imageUrl,
  ]);
  const autoListerDraft = object(listing.autoListerDraft || local.autoListerDraft);
  const blockers = dedupe(readiness.blockers);
  const warnings = dedupe(readiness.warnings || readiness.reviewItems);
  const title = text(server.title || local.title || local.name || raw.title) || "Unbenanntes Produkt";
  const listingTitle = text(
    autoListerDraft.title ||
    listing.title ||
    server.listingTitle ||
    local.listingTitle ||
    title
  );
  const descriptionHtml = text(
    autoListerDraft.descriptionHtml ||
    listing.descriptionHtml ||
    listing.description ||
    server.listingDescription ||
    local.listingDescription ||
    server.description ||
    local.description
  );
  const price = numeric(
    autoListerDraft.price ||
    pricing.salePrice ||
    local.salePrice ||
    local.sell ||
    server.salePrice
  );
  const profit = numeric(pricing.profit ?? local.profit);
  const marginPercent = numeric(pricing.marginPercent ?? local.marginPercent ?? local.margin);
  const companyOsApproved = Boolean(
    approval.companyOsApproved === true ||
    approval.approved === true ||
    server.reviewApproved === true
  );

  return {
    id: sellerProductIdentity(local),
    title,
    listingTitle,
    descriptionHtml,
    categoryId: text(autoListerDraft.categoryId || listing.categoryId || server.categoryId || raw.categoryId),
    categoryName: text(autoListerDraft.categoryName || listing.categoryName || server.category || local.category),
    conditionId: text(autoListerDraft.conditionId || listing.conditionId || server.conditionId),
    itemSpecifics,
    images,
    price,
    currency: text(pricing.currency || local.currency) || "EUR",
    quantity: Math.max(1, Math.floor(numeric(autoListerDraft.quantity || listing.quantity || server.quantity || local.quantity || 1))),
    deliveryTime: text(logistics.deliveryTime || logistics.shippingInfo || server.deliveryTime || local.deliveryTime),
    returnAddress: text(logistics.returnAddress || server.returnAddress || local.returnAddress),
    shippingProfile: text(autoListerDraft.shippingProfile || listing.shippingProfile),
    returnProfile: text(autoListerDraft.returnProfile || listing.returnProfile),
    paymentProfile: text(autoListerDraft.paymentProfile || listing.paymentProfile),
    profit,
    marginPercent,
    minimumRulePassed: pricing.minimumRulePassed === true || profit >= 5 || marginPercent >= 20,
    companyOsApproved,
    readinessState: text(readiness.state || "not_ready"),
    readinessScore: Math.max(0, Math.min(100, Math.round(numeric(readiness.score)))),
    blockers,
    warnings,
    ebayItemId: text(listing.ebayItemId || server.ebayItemId || local.ebayItemId),
    listingStatus: text(listing.status || server.listingStatus || local.status || "draft"),
    autoListerDraft,
    server,
    local,
  };
}

export function buildAutoListerChecks(view = {}) {
  const titleLength = text(view.listingTitle).length;
  const specifics = object(view.itemSpecifics);
  const checks = [
    {
      key: "company_approval",
      label: "Company-OS-Freigabe",
      ok: view.companyOsApproved === true,
      detail: view.companyOsApproved ? "Freigabe vorhanden" : "Finale Company-OS-Freigabe fehlt",
      blocking: true,
    },
    {
      key: "readiness",
      label: "Übergabeblocker",
      ok: Array.isArray(view.blockers) && view.blockers.length === 0,
      detail: view.blockers?.length ? `${view.blockers.length} Blocker offen` : "Keine offenen Übergabeblocker",
      blocking: true,
    },
    {
      key: "title",
      label: "eBay-Titel",
      ok: titleLength >= 25 && titleLength <= 80,
      detail: `${titleLength}/80 Zeichen`,
      blocking: true,
    },
    {
      key: "description",
      label: "Beschreibung",
      ok: text(view.descriptionHtml).length >= 80,
      detail: text(view.descriptionHtml) ? `${text(view.descriptionHtml).length} Zeichen` : "fehlt",
      blocking: true,
    },
    {
      key: "category",
      label: "eBay-Kategorie",
      ok: /^\d+$/.test(text(view.categoryId)),
      detail: view.categoryId ? `ID ${view.categoryId}` : "Kategorie-ID fehlt",
      blocking: true,
    },
    {
      key: "condition",
      label: "Artikelzustand",
      ok: /^\d+$/.test(text(view.conditionId)),
      detail: view.conditionId ? `Condition ID ${view.conditionId}` : "Condition ID fehlt",
      blocking: true,
    },
    {
      key: "images",
      label: "Produktbilder",
      ok: Array.isArray(view.images) && view.images.length > 0,
      detail: `${view.images?.length || 0} HTTPS-Bild(er)`,
      blocking: true,
    },
    {
      key: "specifics",
      label: "Artikelmerkmale",
      ok: Object.keys(specifics).length > 0,
      detail: `${Object.keys(specifics).length} Merkmal(e)`,
      blocking: true,
    },
    {
      key: "price",
      label: "Verkaufspreis",
      ok: numeric(view.price) > 0,
      detail: numeric(view.price) > 0 ? `${numeric(view.price).toFixed(2)} ${text(view.currency || "EUR")}` : "Preis fehlt",
      blocking: true,
    },
    {
      key: "margin",
      label: "Elyon-Mindestregel",
      ok: view.minimumRulePassed === true,
      detail: `${numeric(view.profit).toFixed(2)} € Gewinn · ${numeric(view.marginPercent).toFixed(1)} % Marge`,
      blocking: true,
    },
    {
      key: "delivery",
      label: "Lieferzeit",
      ok: Boolean(text(view.deliveryTime)),
      detail: text(view.deliveryTime) || "fehlt",
      blocking: true,
    },
    {
      key: "returns",
      label: "Rücksendeadresse",
      ok: Boolean(text(view.returnAddress)),
      detail: text(view.returnAddress) || "fehlt",
      blocking: true,
    },
    {
      key: "policies",
      label: "eBay-Richtlinienprofile",
      ok: Boolean(text(view.shippingProfile) && text(view.returnProfile) && text(view.paymentProfile)),
      detail: text(view.shippingProfile) && text(view.returnProfile) && text(view.paymentProfile)
        ? "Versand, Rückgabe und Zahlung vorhanden"
        : "Mindestens ein Profil fehlt",
      blocking: false,
    },
  ];
  return checks;
}

export function autoListerReadiness(checks = []) {
  const list = Array.isArray(checks) ? checks : [];
  const blocking = list.filter((check) => check.blocking !== false);
  const passed = blocking.filter((check) => check.ok).length;
  return {
    ready: blocking.length > 0 && passed === blocking.length,
    score: blocking.length ? Math.round((passed / blocking.length) * 100) : 0,
    blockers: blocking.filter((check) => !check.ok).map((check) => check.detail || check.label),
    warnings: list.filter((check) => check.blocking === false && !check.ok).map((check) => check.detail || check.label),
  };
}

export function buildInternalAutoListerDraft(view = {}, overrides = {}) {
  const merged = {
    ...view,
    ...object(overrides),
    itemSpecifics: object(overrides.itemSpecifics || view.itemSpecifics),
    images: httpsImages(overrides.images || view.images),
  };
  const checks = buildAutoListerChecks(merged);
  const readiness = autoListerReadiness(checks);
  const now = new Date().toISOString();
  return {
    schemaVersion: "elyon-seller-auto-lister-v1",
    source: "elyon_seller_tool",
    sourceProductId: text(view.id),
    preparedAt: now,
    updatedAt: now,
    title: text(merged.listingTitle).slice(0, 80),
    descriptionHtml: text(merged.descriptionHtml).slice(0, 60000),
    categoryId: text(merged.categoryId).slice(0, 50),
    categoryName: text(merged.categoryName).slice(0, 300),
    conditionId: text(merged.conditionId).slice(0, 20),
    itemSpecifics: object(merged.itemSpecifics),
    images: httpsImages(merged.images),
    price: Math.max(0, numeric(merged.price)),
    currency: text(merged.currency || "EUR").slice(0, 3).toUpperCase(),
    quantity: Math.max(1, Math.floor(numeric(merged.quantity || 1))),
    shippingProfile: text(merged.shippingProfile).slice(0, 120),
    returnProfile: text(merged.returnProfile).slice(0, 120),
    paymentProfile: text(merged.paymentProfile).slice(0, 120),
    checks,
    readiness,
    manualApprovalRequired: true,
    automaticPublishingAllowed: false,
    ebayInventoryDraftCreated: false,
    publishEndpointAvailable: false,
    status: readiness.ready ? "ready_for_manual_ebay_draft" : "seller_draft",
  };
}

export function mergeSellerProductWithDraft(product = {}, draft = {}) {
  const local = object(product);
  const server = sellerServerProduct(local);
  const existingListing = object(server.listing || local.listing);
  const now = new Date().toISOString();
  const nextListing = {
    ...existingListing,
    title: text(draft.title || existingListing.title),
    descriptionHtml: text(draft.descriptionHtml || existingListing.descriptionHtml),
    categoryId: text(draft.categoryId || existingListing.categoryId),
    categoryName: text(draft.categoryName || existingListing.categoryName),
    conditionId: text(draft.conditionId || existingListing.conditionId),
    itemSpecifics: object(draft.itemSpecifics || existingListing.itemSpecifics),
    images: httpsImages(draft.images || existingListing.images || server.images),
    quantity: Math.max(1, Math.floor(numeric(draft.quantity || existingListing.quantity || 1))),
    shippingProfile: text(draft.shippingProfile || existingListing.shippingProfile),
    returnProfile: text(draft.returnProfile || existingListing.returnProfile),
    paymentProfile: text(draft.paymentProfile || existingListing.paymentProfile),
    autoListerDraft: { ...object(existingListing.autoListerDraft), ...object(draft), updatedAt: now },
    status: text(draft.status || existingListing.status || "seller_draft"),
    manualApprovalRequired: true,
    autonomousPostingAllowed: false,
    updatedAt: now,
  };
  const nextServer = {
    ...server,
    listing: nextListing,
    listingTitle: nextListing.title,
    listingDescription: nextListing.descriptionHtml,
    listingStatus: nextListing.status,
    updatedAt: now,
  };
  return {
    ...local,
    listing: nextListing,
    listingTitle: nextListing.title,
    listingDescription: nextListing.descriptionHtml,
    status: nextListing.status,
    autoListerDraft: nextListing.autoListerDraft,
    rawServerProduct: nextServer,
    updatedAt: now,
  };
}

export function mergeSellerManualListingMeta(product = {}, itemId = "", status = "draft") {
  const local = object(product);
  const server = sellerServerProduct(local);
  const listing = object(server.listing || local.listing);
  const now = new Date().toISOString();
  const nextListing = {
    ...listing,
    ebayItemId: text(itemId).slice(0, 40),
    status: text(status || "draft"),
    manualApprovalRequired: true,
    autonomousPostingAllowed: false,
    updatedAt: now,
  };
  return {
    ...local,
    ebayItemId: nextListing.ebayItemId,
    status: nextListing.status,
    listing: nextListing,
    rawServerProduct: {
      ...server,
      ebayItemId: nextListing.ebayItemId,
      listingStatus: nextListing.status,
      listing: nextListing,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function sellerProductPayload(product = {}) {
  const server = sellerServerProduct(product);
  return {
    ...server,
    listing: object(product.rawServerProduct?.listing || product.listing || server.listing),
    updatedAt: text(product.updatedAt || server.updatedAt) || new Date().toISOString(),
  };
}

export const SellerSellingFlowCore = {
  buildSellerListingView,
  buildAutoListerChecks,
  autoListerReadiness,
  buildInternalAutoListerDraft,
  mergeSellerProductWithDraft,
  mergeSellerManualListingMeta,
  sellerProductIdentity,
  sellerProductPayload,
  sellerServerProduct,
};