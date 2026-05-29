function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return "";
}

function decodeHtmlEntities(value) {
  return toText(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function isHumanVerificationText(value) {
  return /\b(human verification|verify you are human|captcha|bot detection|access denied|forbidden)\b/i.test(toText(value));
}

function cleanTitle(value) {
  const text = decodeHtmlEntities(value);
  if (isHumanVerificationText(text)) return "";
  return text
    .replace(/\s*:\s*Amazon\.[^:]+(?::.*)?$/i, "")
    .replace(/\s*-\s*AliExpress.*$/i, "")
    .replace(/\s*\|\s*eBay.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

function cleanDescription(value) {
  const text = toText(value);
  return isHumanVerificationText(text) ? "" : text;
}

function cleanAvailability(value) {
  let text = toText(value);
  if (!text) return "";
  text = text.replace(/\{[\s\S]*$/, "").trim();
  text = text.replace(/\[[\s\S]*$/, "").trim();
  text = text.replace(/"\s*,?\s*".*$/g, "").trim();
  text = text.replace(/\b(isInternal|showInsightsHub|isRobot|showFaceout|merchantId|availableBadges|loggedIn|asin|showBadge|ingressFaceout|availableFaceouts)\b[\s\S]*$/i, "").trim();
  return text.replace(/\s{2,}/g, " ").slice(0, 220);
}

function normalizeImageUrl(value) {
  const text = decodeHtmlEntities(value);
  if (!text || /^data:/i.test(text) || /^blob:/i.test(text)) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeImages(primary, images) {
  const list = [primary, ...toArray(images)]
    .map(normalizeImageUrl)
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0, 40);
}

function normalizeDomain(value) {
  const text = toText(value).toLowerCase();
  try {
    const url = text.includes("://") ? new URL(text) : new URL(`https://${text}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return text.replace(/^www\./, "");
  }
}

function detectCurrency(value, fallback = "") {
  const text = toText(value);
  if (/€|\bEUR\b|\bEuro\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/¥|\bJPY\b/i.test(text)) return "JPY";
  return toText(fallback);
}

function normalizePrice(value, fallbackCurrency = "") {
  const text = toText(value);
  const currency = detectCurrency(text, fallbackCurrency);
  if (!text) return { price: "", currency };
  const clean = text.replace(/\b(EUR|Euro|USD|GBP|JPY)\b/gi, "").replace(/[€$£¥]/g, "").trim();
  const match = clean.match(/[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|[\d]+/);
  return { price: match ? match[0].replace(/\s+/g, "") : clean, currency };
}

function normalizeVariants(value) {
  if (Array.isArray(value)) return value.slice(0, 100);
  const obj = toObject(value);
  if (Array.isArray(obj.variantItems)) return obj.variantItems.slice(0, 100);
  if (Array.isArray(obj.variantGroups)) return obj.variantGroups.slice(0, 100);
  if (!Object.keys(obj).length) return [];
  return [obj].slice(0, 100);
}

function normalizeWarnings(...lists) {
  return Array.from(new Set(lists.flatMap((list) => toArray(list).map(toText).filter(Boolean)))).slice(0, 50);
}

const SUPPLIER_MAP = [
  { id: "supplier-cjdropshipping", name: "CJdropshipping", domains: ["cjdropshipping.com"] },
  { id: "supplier-aliexpress", name: "AliExpress", domains: ["aliexpress.com"] },
  { id: "supplier-amazon-de", name: "Amazon.de", domains: ["amazon.de"] },
  { id: "supplier-amazon", name: "Amazon", domains: ["amazon.com"] },
  { id: "supplier-temu", name: "Temu", domains: ["temu.com"] },
  { id: "supplier-alibaba", name: "Alibaba", domains: ["alibaba.com"] },
  { id: "supplier-bigbuy", name: "BigBuy", domains: ["bigbuy.eu", "bigbuy.com"] },
  { id: "supplier-dropxl", name: "dropXL", domains: ["dropxl.com"] },
  { id: "supplier-vidaxl", name: "vidaXL", domains: ["vidaxl.de", "vidaxl.com", "dropshippingxl.com"] }
];

function resolveSupplier(domain, supplier) {
  const domainValue = normalizeDomain(domain);
  const supplierValue = toText(supplier).toLowerCase();
  const found = SUPPLIER_MAP.find((entry) =>
    entry.domains.some((candidate) => domainValue === candidate || domainValue.endsWith(`.${candidate}`) || supplierValue.includes(entry.name.toLowerCase()))
  );
  return found ? { linkedSupplierId: found.id, linkedSupplierName: found.name } : { linkedSupplierId: "", linkedSupplierName: "" };
}

export function normalizeBrowserImport(input = {}) {
  const wrapper = toObject(input);
  const product = toObject(wrapper.product || wrapper.item || wrapper.data || wrapper);
  const elyonProduct = toObject(product.elyonProduct || product.normalizedProduct || product.product || wrapper.elyonProduct || wrapper.normalizedProduct);
  const identity = toObject(elyonProduct.identity);
  const content = toObject(elyonProduct.content);
  const media = toObject(elyonProduct.media);
  const pricing = toObject(elyonProduct.pricing);
  const availabilityObj = toObject(elyonProduct.availability);
  const supplierObj = toObject(elyonProduct.supplier);
  const reviews = toObject(elyonProduct.reviews);
  const variantsObj = toObject(elyonProduct.variants);
  const risk = toObject(elyonProduct.risk);
  const raw = toObject(product.raw || elyonProduct.raw || product.extractionDebug || wrapper.raw);
  const now = new Date().toISOString();
  const sourceUrl = toText(firstValue(product.url, elyonProduct.meta?.sourceUrl, wrapper.url));
  let urlDomain = "";
  try {
    urlDomain = sourceUrl ? new URL(sourceUrl).hostname : "";
  } catch {
    urlDomain = "";
  }
  const domain = normalizeDomain(firstValue(product.domain, elyonProduct.meta?.sourceDomain, urlDomain));
  const supplierName = toText(firstValue(product.supplier, supplierObj.supplierName, supplierObj.storeName, wrapper.supplier));
  const supplierMatch = resolveSupplier(domain, supplierName);
  const priceParts = normalizePrice(firstValue(product.price, pricing.currentPrice, pricing.priceText, wrapper.price), firstValue(product.currency, pricing.currency, wrapper.currency));
  const images = normalizeImages(firstValue(product.image, media.mainImage, wrapper.image), firstValue(product.images, media.images, wrapper.images));
  const descriptionCandidates = [
    ...toArray(product.descriptionCandidates),
    ...toArray(content.descriptionCandidates),
    content.longDescription,
    content.shortDescription,
    product.description,
    wrapper.description
  ].map(toText).filter(Boolean).slice(0, 20);
  const variants = normalizeVariants(firstValue(product.variants, product.platformVariants, product.aliexpressVariants, product.sourceOnlineVariants, variantsObj.variantItems, variantsObj.variantGroups, variantsObj));
  const productDetails = toObject(firstValue(product.productDetails, content.productDetails, content.specifications, wrapper.productDetails));
  const complianceRisks = normalizeWarnings(product.complianceRisks, risk.warningTexts, wrapper.complianceRisks);
  const blocked = isHumanVerificationText(product.title || identity.title || "") || isHumanVerificationText(product.description || content.longDescription || "");
  const title = cleanTitle(firstValue(product.title, identity.title, product.name, wrapper.title)) || "Nicht erkannt";
  const warnings = normalizeWarnings(
    product.warnings,
    raw.extractionWarnings,
    blocked ? ["Human verification / blocked page detected"] : [],
    title === "Nicht erkannt" ? ["Produkt ohne Titel"] : [],
    !sourceUrl ? ["Produkt ohne URL"] : []
  );

  return {
    id: toText(firstValue(product.id, product.productId, sourceUrl, `${now}-${Math.random().toString(36).slice(2, 10)}`)),
    source: "chrome-extension",
    status: blocked ? "blocked" : toText(firstValue(product.status, wrapper.status, "draft")) || "draft",
    importedAt: toText(firstValue(product.importedAt, product.detectedAt, wrapper.importedAt, now)) || now,
    updatedAt: toText(firstValue(product.updatedAt, wrapper.updatedAt, now)) || now,
    title,
    price: priceParts.price,
    currency: priceParts.currency,
    image: images[0] || "",
    images,
    url: sourceUrl,
    domain,
    supplier: supplierName || supplierMatch.linkedSupplierName || "",
    description: cleanDescription(firstValue(product.description, content.longDescription, content.shortDescription, wrapper.description)),
    descriptionCandidates,
    descriptionSource: toText(firstValue(product.descriptionSource, wrapper.descriptionSource, content.descriptionSource)),
    shipping: toObject(firstValue(product.shipping, { cost: pricing.shippingCost, deliveryText: availabilityObj.deliveryText, shipsFrom: availabilityObj.shipsFrom })),
    availability: cleanAvailability(firstValue(product.availability, availabilityObj.stockText, availabilityObj.deliveryText, wrapper.availability)),
    category: toText(firstValue(product.category, identity.category, elyonProduct.marketplace?.marketplaceCategory, wrapper.category)),
    rating: toText(firstValue(product.rating, reviews.ratingValue, wrapper.rating)),
    reviewsCount: toText(firstValue(product.reviewsCount, reviews.reviewsCount, wrapper.reviewsCount)),
    soldCount: toText(firstValue(product.soldCount, wrapper.soldCount)),
    variants,
    productDetails,
    complianceRisks,
    elyonProduct: Object.keys(elyonProduct).length ? elyonProduct : {},
    raw,
    linkedSupplierId: toText(firstValue(product.linkedSupplierId, wrapper.linkedSupplierId, supplierMatch.linkedSupplierId)),
    linkedSupplierName: toText(firstValue(product.linkedSupplierName, wrapper.linkedSupplierName, supplierMatch.linkedSupplierName)),
    notes: toText(firstValue(product.notes, wrapper.notes)),
    errorState: toObject(product.errorState || wrapper.errorState),
    warnings,
    blockedByHumanVerification: blocked
  };
}

export function normalizeBrowserImportList(list) {
  return Array.isArray(list) ? list.map(normalizeBrowserImport) : [];
}
