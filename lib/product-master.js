import { categoryState } from "../seller-category-engine-core.js";

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function moneyOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = toText(value);
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function nonNegative(value) {
  const parsed = moneyOrNull(value);
  return parsed === null ? 0 : Math.max(0, parsed);
}

function firstMoney(...values) {
  for (const value of values) {
    const parsed = moneyOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const parsed = toText(value);
    if (parsed) return parsed;
  }
  return "";
}

function hasAnyOwn(source, names) {
  return names.some((name) => Object.prototype.hasOwnProperty.call(source, name));
}

function roundCommercial(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return 0;
  const rounded = Math.ceil(Number(value)) - 0.01;
  return Number(Math.max(rounded, 0.99).toFixed(2));
}

function buildPriceSuggestions(fixedCosts, feePercent = 13) {
  const base = Math.max(0, Number(fixedCosts || 0));
  const feeRate = Math.max(0, Math.min(0.7, Number(feePercent || 0) / 100));
  if (!base || feeRate >= 0.8) return [];

  const forFiveEuroProfit = roundCommercial((base + 5) / Math.max(0.01, 1 - feeRate));
  const forTwentyPercentMargin = roundCommercial(base / Math.max(0.01, 1 - feeRate - 0.2));
  return [
    {
      label: "Mindestens 5 € Gewinn",
      price: forFiveEuroProfit,
      note: "Technische Mindestschätzung aus den bekannten Kosten; Company-OS-Kalkulation bleibt verbindlich.",
    },
    {
      label: "Mindestens 20 % Marge",
      price: forTwentyPercentMargin,
      note: "Technische Mindestschätzung aus den bekannten Kosten; Company-OS-Kalkulation bleibt verbindlich.",
    },
  ];
}

function detectCurrency(...values) {
  const text = values.map(toText).join(" ");
  if (/€|\bEUR\b|\bEuro\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  return "EUR";
}

function inferSource(product = {}) {
  const source = toText(product.source || product.sourceType || product.sourceProvider || "").toLowerCase();
  const url = toText(product.url || product.sourceUrl || product.supplierLink || "").toLowerCase();
  const domain = toText(product.domain || product.sourceDomain || "").toLowerCase();
  const haystack = `${source} ${url} ${domain}`;
  if (source === "elyon_company_os" || source.includes("company_os") || source.includes("company-os")) return "elyon_company_os";
  if (haystack.includes("cjdropshipping") || /(^|\s)cj($|\s)/.test(haystack)) return "cj";
  if (haystack.includes("aliexpress")) return "aliexpress";
  if (haystack.includes("amazon")) return "amazon";
  if (haystack.includes("temu")) return "temu";
  if (source.includes("chrome_extension")) return "browser_extension";
  return source || "manual";
}

function productIdFrom(product = {}) {
  const candidates = [
    product.productId,
    product.masterProductId,
    product.companyOsProductId,
    product.id,
    product.pid,
    product.sku,
    product.productSku,
    product.url,
    product.sourceUrl,
    product.supplierLink,
  ].map(toText).filter(Boolean);
  const base = candidates[0] || `product-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return base.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || `product-${Date.now()}`;
}

function normalizedStatus(value) {
  return toText(value).toLocaleLowerCase("de-DE").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function finalCompanyApproval(product, listingPackage) {
  const approval = toObject(product.approval);
  const reviewStatus = normalizedStatus(product.reviewStatus);
  const processingStatus = normalizedStatus(product.processingStatus);
  const status = normalizedStatus(product.status);
  const hasExplicitApproval = Boolean(
    product.reviewApproved === true ||
    approval.approved === true ||
    approval.manualApproved === true ||
    ["approved", "freigegeben"].includes(reviewStatus)
  );
  const hasFinalHandoffStatus = Boolean(
    ["ready for seller tool", "bereit fürs seller tool", "bereit fuer seller tool", "bereit manuell einstellen"].includes(processingStatus) ||
    ["ready for seller tool", "bereit fürs seller tool", "bereit fuer seller tool", "bereit manuell einstellen"].includes(status)
  );
  return hasExplicitApproval && hasFinalHandoffStatus;
}

export function normalizeProduct(input = {}) {
  const product = toObject(input);
  const pricingSource = toObject(product.pricing);
  const economics = toObject(product.economics || product.costCalculation);
  const logisticsSource = toObject(product.logistics || product.shipping);
  const complianceSource = toObject(product.compliance);
  const reviewSource = toObject(product.review || product.riskChecks);
  const existingListing = toObject(product.listing);
  const listingPackage = toObject(product.listingPackage || product.listingTask);
  const category = categoryState({ ...product, listing: { ...existingListing, ...listingPackage } });

  const source = inferSource(product);
  const productImages = toArray(product.images || product.sourceOnlineImages || product.imageUrls || product.gallery);
  const packageImages = toArray(listingPackage.images || existingListing.images);
  const image = firstText(product.image, product.sourceOnlineImage, productImages[0], packageImages[0]);
  const images = image
    ? Array.from(new Set([image, ...productImages, ...packageImages].map(toText).filter(Boolean)))
    : Array.from(new Set([...productImages, ...packageImages].map(toText).filter(Boolean)));

  const title = firstText(product.title, product.productName, product.productNameEn, product.sourceOnlineTitle, product.name, listingPackage.title, listingPackage.titleDraft) || "Unbenanntes Produkt";
  const description = firstText(product.description, product.sourceOnlineDescription, product.cleanDescription, product.notes, listingPackage.descriptionHtml, listingPackage.descriptionDraft);
  const supplierUrl = firstText(product.supplierLink, product.url, product.sourceUrl, product.productUrl, toObject(product.supplier).url);

  const buyPriceValue = firstMoney(
    economics.purchasePrice,
    economics.buyPrice,
    pricingSource.buyPrice,
    product.buyPrice,
    product.costPrice,
    product.purchasePrice,
    product.sourceOnlinePrice
  );
  const salePriceValue = firstMoney(
    economics.salePrice,
    economics.sellingPrice,
    pricingSource.salePrice,
    product.salePrice,
    product.targetPrice,
    product.ebayPrice,
    product.retailPrice
  );
  const shippingCostValue = firstMoney(
    economics.supplierShipping,
    economics.shippingCost,
    pricingSource.shippingCost,
    product.shippingCost,
    logisticsSource.cost,
    product.deliveryCost
  );
  const importCostsValue = firstMoney(
    economics.importCosts,
    economics.estimatedImportCost,
    pricingSource.importCosts,
    product.importCosts,
    product.estimatedImportCost
  );
  const returnReserveValue = firstMoney(
    economics.returnReserve,
    pricingSource.returnReserve,
    product.returnReserve,
    product.returnsReserve
  );
  const otherCostsValue = firstMoney(
    economics.otherCosts,
    pricingSource.otherCosts,
    product.otherCosts,
    product.additionalCosts
  );

  const buyPrice = Math.max(0, buyPriceValue ?? 0);
  const salePrice = Math.max(0, salePriceValue ?? 0);
  const shippingCost = Math.max(0, shippingCostValue ?? 0);
  const importCosts = Math.max(0, importCostsValue ?? 0);
  const returnReserve = Math.max(0, returnReserveValue ?? 0);
  const otherCosts = Math.max(0, otherCostsValue ?? 0);
  const marketplaceFeePercent = Number.isFinite(Number(economics.marketplaceFeePercent ?? pricingSource.marketplaceFeePercent ?? product.marketplaceFeePercent))
    ? Math.max(0, Number(economics.marketplaceFeePercent ?? pricingSource.marketplaceFeePercent ?? product.marketplaceFeePercent))
    : 13;
  const paymentFeePercent = Number.isFinite(Number(economics.paymentFeePercent ?? pricingSource.paymentFeePercent ?? product.paymentFeePercent))
    ? Math.max(0, Number(economics.paymentFeePercent ?? pricingSource.paymentFeePercent ?? product.paymentFeePercent))
    : 0;
  const explicitFees = firstMoney(economics.estimatedEbayFees, economics.ebayFees, pricingSource.estimatedFees, product.estimatedEbayFees, product.ebayFees);
  const estimatedFees = explicitFees !== null
    ? Math.max(0, explicitFees)
    : salePrice > 0 ? salePrice * ((marketplaceFeePercent + paymentFeePercent) / 100) : 0;
  const fixedCosts = buyPrice + shippingCost + importCosts + returnReserve + otherCosts;
  const calculatedProfit = salePrice > 0 ? salePrice - fixedCosts - estimatedFees : 0;
  const explicitProfit = firstMoney(economics.realisticProfit, economics.estimatedProfit, pricingSource.profit, product.realisticProfit, product.estimatedProfit);
  const profit = explicitProfit !== null ? explicitProfit : calculatedProfit;
  const explicitMargin = firstMoney(economics.marginPercent, pricingSource.marginPercent, product.marginPercent);
  const marginPercent = explicitMargin !== null ? explicitMargin : salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const priceSuggestions = buildPriceSuggestions(fixedCosts, marketplaceFeePercent + paymentFeePercent);
  const suggestedSalePrice = priceSuggestions.length ? Math.max(...priceSuggestions.map((item) => item.price)) : 0;
  const minimumRulePassed = profit >= 5 || marginPercent >= 20;

  const deliveryTime = firstText(logisticsSource.deliveryTime, logisticsSource.shippingInfo, product.deliveryTime, product.shippingInfo, product.sourceOnlineAvailability, product.availability);
  const returnAddress = firstText(logisticsSource.returnAddress, product.returnAddress, reviewSource.returnAddress, product.returns?.address);
  const itemSpecifics = toObject(listingPackage.itemSpecifics || existingListing.itemSpecifics || product.itemSpecifics);
  const conditionId = firstText(listingPackage.conditionId, existingListing.conditionId, product.conditionId);
  const listingTitle = firstText(listingPackage.title, listingPackage.titleDraft, existingListing.title, product.listingTitle, title);
  const listingDescription = firstText(listingPackage.descriptionHtml, listingPackage.descriptionDraft, existingListing.descriptionHtml, existingListing.description, product.listingDescription, description);
  const approved = finalCompanyApproval(product, listingPackage);

  const warnings = [];
  const blockers = [];

  if (!approved) blockers.push("Finale Company-OS-Freigabe fehlt.");
  if (!title || title === "Unbenanntes Produkt") blockers.push("Produkttitel fehlt oder ist unklar.");
  if (!description) blockers.push("Produktbeschreibung fehlt.");
  if (!images.length) blockers.push("Geprüfte Bilder fehlen.");
  if (!supplierUrl) blockers.push("Lieferanten-Link fehlt.");
  if (buyPriceValue === null || buyPrice <= 0) blockers.push("Einkaufspreis fehlt.");
  if (salePriceValue === null || salePrice <= 0) blockers.push("Finaler Verkaufspreis fehlt.");
  if (!deliveryTime) blockers.push("Realistische Lieferzeit fehlt.");
  if (!returnAddress) blockers.push("Geprüfte Rücksendeadresse fehlt.");
  if (!listingTitle) blockers.push("Listing-Titel fehlt.");
  if (!listingDescription) blockers.push("Listing-Beschreibung fehlt.");
  if (!Object.keys(itemSpecifics).length) blockers.push("Artikelmerkmale fehlen.");
  if (!conditionId) blockers.push("eBay Condition ID fehlt.");
  if (!category.valid) blockers.push("Offizielle eBay-Kategorie fehlt.");

  const costFields = {
    shipping: shippingCostValue !== null || hasAnyOwn(economics, ["supplierShipping", "shippingCost"]),
    import: importCostsValue !== null || hasAnyOwn(economics, ["importCosts", "estimatedImportCost"]),
    fees: explicitFees !== null || hasAnyOwn(economics, ["marketplaceFeePercent", "paymentFeePercent"]),
    returns: returnReserveValue !== null || hasAnyOwn(economics, ["returnReserve"]),
    other: otherCostsValue !== null || hasAnyOwn(economics, ["otherCosts"]),
  };
  if (!costFields.shipping) blockers.push("Lieferantenversand wurde nicht ausdrücklich kalkuliert.");
  if (!costFields.import) blockers.push("Einfuhr-/Zollkosten wurden nicht ausdrücklich kalkuliert.");
  if (!costFields.fees) blockers.push("eBay-Gebühren wurden nicht ausdrücklich kalkuliert.");
  if (!costFields.returns) blockers.push("Retouren-/Defektreserve wurde nicht ausdrücklich kalkuliert.");
  if (!costFields.other) blockers.push("Weitere Kosten wurden nicht ausdrücklich geprüft.");
  if (salePrice > 0 && !minimumRulePassed) blockers.push("Elyon-Mindestregel nicht erreicht: mindestens 20 % Marge oder 5 € realistischer Gewinn.");

  const complianceRisks = toArray(product.complianceRisks || product.complianceHints || product.aiPrepared?.complianceHints || complianceSource.risks)
    .map(toText)
    .filter(Boolean)
    .slice(0, 20);
  const complianceStatus = normalizedStatus(complianceSource.status || product.complianceStatus);
  if (["blocked", "rejected", "risk", "risiko", "nicht freigegeben"].includes(complianceStatus)) {
    blockers.push("Compliance-Status blockiert das Listing.");
  }
  if (complianceRisks.length) warnings.push(...complianceRisks.map((risk) => `Compliance-Hinweis: ${risk}`));
  if (explicitFees === null) warnings.push("eBay-Gebühren wurden nur aus dem Prozentsatz geschätzt.");
  if (!toText(listingPackage.schemaVersion || listingPackage.version || product.schemaVersion)) warnings.push("Listing-Paket besitzt keine eindeutige Version.");

  const allWarnings = [...blockers, ...warnings];
  const readinessState = blockers.length ? "not_ready" : warnings.length ? "needs_review" : "ready_for_manual_listing";
  const readinessScore = readinessState === "ready_for_manual_listing"
    ? 100
    : readinessState === "needs_review"
      ? Math.max(60, 90 - warnings.length * 5)
      : Math.max(0, 55 - blockers.length * 7 - warnings.length * 2);

  return {
    id: productIdFrom(product),
    title,
    description,
    images,
    sourceCategory: category.sourceCategory?.name || firstText(product.sourceCategoryName, product.sourceCategory),
    sourceCategoryName: category.sourceCategory?.name || firstText(product.sourceCategoryName, product.sourceCategory),
    categoryData: category.categoryData,
    ebayCategoryId: category.categoryId,
    ebayCategoryName: category.categoryName,
    ebayCategoryPath: category.categoryPath,
    source,
    supplier: {
      id: firstText(product.linkedSupplierId, product.supplierId, toObject(product.supplier).id),
      name: firstText(product.linkedSupplierName, product.supplierName, toObject(product.supplier).name, typeof product.supplier === "string" ? product.supplier : ""),
      url: supplierUrl,
      domain: firstText(product.domain, product.sourceDomain, toObject(product.supplier).domain),
    },
    pricing: {
      currency: firstText(economics.currency, pricingSource.currency, product.currency, product.sourceOnlineCurrency) || detectCurrency(product.price, product.sourceOnlinePrice),
      buyPrice,
      salePrice,
      suggestedSalePrice,
      priceSuggestions,
      shippingCost,
      importCosts,
      returnReserve,
      otherCosts,
      marketplaceFeePercent,
      paymentFeePercent,
      estimatedFees: Number(estimatedFees.toFixed(2)),
      totalKnownCost: Number((fixedCosts + estimatedFees).toFixed(2)),
      profit: Number(profit.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(2)),
      minimumRulePassed,
      calculationSource: explicitProfit !== null && explicitMargin !== null ? "company_os" : "seller_validation",
    },
    logistics: {
      shippingInfo: deliveryTime,
      deliveryTime,
      returnAddress,
      variants: toArray(product.variants || logisticsSource.variants).slice(0, 80),
      stock: firstText(product.stock, product.inventory, product.warehouseInventoryNum, logisticsSource.stock),
    },
    compliance: {
      risks: complianceRisks,
      status: firstText(complianceSource.status, product.complianceStatus) || (approved ? "approved_by_company_os" : "needs_review"),
    },
    listing: {
      ebayItemId: firstText(product.ebayItemId, product.listingId, existingListing.ebayItemId),
      status: firstText(product.listingStatus, existingListing.status, listingPackage.status) || "draft",
      title: listingTitle,
      descriptionHtml: listingDescription,
      itemSpecifics,
      conditionId,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryData: category.categoryData,
      categoryMetadata: category.metadata,
      ebayCategoryId: category.categoryId,
      ebayCategoryName: category.categoryName,
      ebayCategoryPath: category.categoryPath,
      shippingProfile: firstText(listingPackage.shippingProfile, existingListing.shippingProfile),
      returnProfile: firstText(listingPackage.returnProfile, existingListing.returnProfile),
      packageVersion: firstText(listingPackage.schemaVersion, listingPackage.version, product.schemaVersion),
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
    },
    status: firstText(product.sellerStatus, product.status) || "new",
    approval: {
      companyOsApproved: approved,
      manualListingRequired: true,
      automaticListingAllowed: false,
    },
    readiness: {
      score: Math.round(readinessScore),
      state: readinessState,
      warnings: allWarnings,
      blockers,
      reviewItems: warnings,
    },
    raw: product,
    createdAt: firstText(product.createdAt, product.importedAt, product.detectedAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeProductList(items = []) {
  return Array.isArray(items) ? items.map(normalizeProduct) : [];
}

export function mergeProductLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const product of normalizeProductList(list)) {
      const key = product.raw?.sourceImportId || product.raw?.companyOsProductId || product.supplier.url || product.id;
      const current = map.get(key);
      map.set(key, current ? { ...current, ...product, raw: { ...current.raw, ...product.raw } } : product);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
