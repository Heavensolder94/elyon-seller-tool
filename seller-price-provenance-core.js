function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function moneyOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? Number(value.toFixed(2)) : null;
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.replace(/\s/g, "");
  const normalized = compact.includes(",") && compact.includes(".")
    ? compact.lastIndexOf(",") > compact.lastIndexOf(".")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "")
    : compact.replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
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
    const parsed = text(value);
    if (parsed) return parsed;
  }
  return "";
}

function sourceIsPreliminary(value) {
  const source = text(value).toLowerCase();
  if (!source) return false;
  return source.includes("nova") || source.includes("preliminary") || source.includes("price_idea") || source.includes("priceidea");
}

function sourceLabel(source, finalSalePrice, companyOsRecommendedPrice) {
  const normalized = text(source).toLowerCase();
  if (!finalSalePrice) return "Noch nicht bestätigt";
  if (normalized.includes("manual")) return "Manuell bestätigt";
  if (normalized.includes("company_os_recommendation") || normalized.includes("elyon_recommendation")) return "Elyon-Empfehlung bestätigt";
  if (normalized.includes("company_os")) return "In Company OS bestätigt";
  if (companyOsRecommendedPrice && Math.abs(finalSalePrice - companyOsRecommendedPrice) < 0.005) return "Elyon-Empfehlung bestätigt";
  return "Final in Company OS bestätigt";
}

export function extractPriceProvenance(input = {}) {
  const product = object(input);
  const normalizedPricing = object(product.pricing);
  const serverProduct = object(product.rawServerProduct || product.raw || product);
  const raw = object(serverProduct.raw || serverProduct);
  const rawPricing = object(raw.pricing);
  const economics = object(raw.economics || raw.costCalculation);
  const meta = object(raw.meta);
  const metaPriceIdea = object(meta.priceIdea);
  const metaSellingPrice = object(meta.sellingPrice);
  const autoLister = object(raw.autoLister);
  const autoDraft = object(autoLister.draft || raw.autoListerDraft || object(raw.listing).autoListerDraft);
  const margin = object(autoDraft.margin || autoLister.margin);

  const currency = firstText(
    normalizedPricing.currency,
    rawPricing.currency,
    economics.currency,
    raw.currency,
    "EUR"
  ) || "EUR";

  const buyPrice = firstMoney(
    normalizedPricing.buyPrice,
    economics.purchasePrice,
    economics.buyPrice,
    rawPricing.buyPrice,
    raw.buyPrice,
    raw.costPrice,
    raw.purchasePrice,
    raw.price
  );

  const legacySource = firstText(
    raw.salePriceSource,
    raw.sellPriceSource,
    rawPricing.salePriceSource,
    metaSellingPrice.source,
    autoDraft.salePriceSource
  );

  const legacyNovaPrice = sourceIsPreliminary(legacySource)
    ? firstMoney(raw.salePrice, raw.sellingPrice, raw.sellPrice, raw.targetPrice, raw.priceSuggestion, normalizedPricing.salePrice)
    : null;

  const novaPriceIdea = firstMoney(
    raw.novaPriceIdea,
    rawPricing.novaPriceIdea,
    metaPriceIdea.value,
    autoDraft.novaPriceIdea,
    legacyNovaPrice
  );

  const companyOsRecommendedPrice = firstMoney(
    normalizedPricing.companyOsRecommendedPrice,
    rawPricing.companyOsRecommendedPrice,
    raw.companyOsRecommendedPrice,
    raw.elyonRecommendedPrice,
    raw.recommendedPrice,
    margin.recommendedPrice,
    autoDraft.recommendedPrice
  );

  const sellerValidationSuggestion = firstMoney(normalizedPricing.suggestedSalePrice);
  const explicitFinalSalePrice = firstMoney(
    normalizedPricing.finalSalePrice,
    rawPricing.finalSalePrice,
    raw.finalSalePrice,
    raw.confirmedSalePrice,
    autoDraft.finalSalePrice
  );

  const normalizedSalePrice = firstMoney(normalizedPricing.salePrice);
  const approved = product.approval?.companyOsApproved === true || raw.reviewApproved === true || raw.approval?.approved === true;
  const finalSalePrice = explicitFinalSalePrice ?? (
    normalizedSalePrice && !sourceIsPreliminary(legacySource) && approved
      ? normalizedSalePrice
      : null
  );

  const finalSource = finalSalePrice
    ? firstText(
        normalizedPricing.salePriceSource,
        rawPricing.salePriceSource,
        raw.salePriceSource,
        raw.sellPriceSource,
        autoDraft.salePriceSource,
        finalSalePrice === companyOsRecommendedPrice ? "company_os_recommendation" : "company_os_confirmed"
      )
    : "missing";

  return Object.freeze({
    schemaVersion: "elyon-price-provenance-v1",
    currency,
    buyPrice,
    novaPriceIdea,
    companyOsRecommendedPrice,
    sellerValidationSuggestion,
    finalSalePrice,
    finalSource,
    finalSourceLabel: sourceLabel(finalSource, finalSalePrice, companyOsRecommendedPrice),
    novaPriceIdeaBinding: false,
    companyOsRecommendationBinding: false,
    finalSalePriceBinding: Boolean(finalSalePrice),
  });
}

export function enrichWorkingCopy(copy = {}, sourceProduct = copy) {
  const provenance = extractPriceProvenance(sourceProduct);
  const pricing = { ...object(copy.pricing), priceProvenance: provenance };
  return {
    ...copy,
    pricing: {
      ...pricing,
      novaPriceIdea: provenance.novaPriceIdea,
      companyOsRecommendedPrice: provenance.companyOsRecommendedPrice,
      finalSalePrice: provenance.finalSalePrice,
      salePriceSource: provenance.finalSource,
    },
    novaPriceIdea: provenance.novaPriceIdea,
    companyOsRecommendedPrice: provenance.companyOsRecommendedPrice,
    finalSalePrice: provenance.finalSalePrice,
    salePriceSource: provenance.finalSource,
    priceProvenance: provenance,
  };
}
