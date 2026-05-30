import { detectSupplierByUrl, getSupplierByKey } from "./supplier-registry.js";

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function first(...values) {
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
  return text(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function cleanWhitespace(value) {
  return decodeHtmlEntities(value).replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s{2,}/g, " ").trim();
}

function normalizeImageUrl(value) {
  const raw = decodeHtmlEntities(value);
  if (!raw || /^data:/i.test(raw) || /^blob:/i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isNoiseLine(line) {
  const value = text(line).toLowerCase();
  if (!value) return true;
  return [
    "breadcrumb", "home", "header", "footer", "navigation", "privacy", "terms", "policy", "cookie",
    "seller", "verkaeufer", "shop", "store", "login", "sign in", "wishlist", "cart", "warenkorb",
    "buy now", "add to cart", "recommended", "similar products", "sponsored", "customer reviews",
    "questions", "answers", "share", "follow", "support", "help center"
  ].some((token) => value.includes(token));
}

function cleanDescription(value) {
  const raw = cleanWhitespace(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[\s\S]{20,}\}/g, " ")
    .replace(/\[[\s\S]{20,}\]/g, " ")
    .replace(/\b(document\.body\.innerText|window\.|__NEXT_DATA__|merchantId|csrf|token)\b/gi, " ");
  if (!raw) {
    return { text: "", noiseRemoved: 0, duplicatesRemoved: 0, originalLength: 0, cleanedLength: 0 };
  }
  const originalLength = raw.length;
  const lines = raw.split(/\n+/).map((line) => cleanWhitespace(line)).filter(Boolean);
  const seen = new Set();
  const kept = [];
  let noiseRemoved = 0;
  let duplicatesRemoved = 0;
  for (const line of lines) {
    if (isNoiseLine(line)) {
      noiseRemoved += 1;
      continue;
    }
    const key = line.toLowerCase();
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    kept.push(line);
  }
  const limited = kept.filter((line) => line.length >= 25).slice(0, 12).join("\n\n").slice(0, 4000).trim();
  return {
    text: limited,
    noiseRemoved,
    duplicatesRemoved,
    originalLength,
    cleanedLength: limited.length,
  };
}

function dedupeStrings(values, max = 40) {
  const seen = new Set();
  const items = [];
  for (const value of values) {
    const next = cleanWhitespace(value);
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(next);
    if (items.length >= max) break;
  }
  return items;
}

function normalizeVariantGroups(rawVariants) {
  const list = Array.isArray(rawVariants) ? rawVariants : [];
  const groups = new Map();
  const fallbackVariants = [];

  for (const entry of list) {
    const item = toObject(entry);
    if (item.name && Array.isArray(item.options)) {
      const key = text(item.name) || "Variant";
      const existing = groups.get(key) || new Set();
      item.options.forEach((option) => {
        const value = text(option && typeof option === "object" ? first(option.label, option.value, option.name) : option);
        if (value) existing.add(value);
      });
      groups.set(key, existing);
      continue;
    }

    const groupName = text(first(item.groupName, item.variantGroup, item.dimension, item.attribute, item.type, item.name));
    const optionValue = text(first(item.option, item.value, item.label, item.title, item.variantName));
    if (groupName && optionValue) {
      const existing = groups.get(groupName) || new Set();
      existing.add(optionValue);
      groups.set(groupName, existing);
      continue;
    }

    const optionPairs = [
      ["Color", first(item.color, item.colour)],
      ["Size", first(item.size)],
      ["Style", first(item.style)],
      ["Material", first(item.material)],
    ];
    let matched = false;
    for (const [name, value] of optionPairs) {
      const next = text(value);
      if (!next) continue;
      const existing = groups.get(name) || new Set();
      existing.add(next);
      groups.set(name, existing);
      matched = true;
    }
    if (!matched && Object.keys(item).length) fallbackVariants.push(item);
  }

  const variantGroups = Array.from(groups.entries()).map(([name, options]) => ({
    name,
    options: Array.from(options).filter(Boolean).slice(0, 100),
  })).filter((group) => group.options.length);

  return {
    variants: variantGroups,
    variantsFound: variantGroups.reduce((sum, group) => sum + group.options.length, 0) || fallbackVariants.length,
    rawVariants: fallbackVariants.slice(0, 100),
  };
}

export function sanitizeSupplierProductImport(rawProduct = {}, supplierHint = "") {
  const source = toObject(rawProduct);
  const sourceUrl = text(first(source.sourceUrl, source.url, source.supplierLink));
  const detected = detectSupplierByUrl(sourceUrl || first(source.domain, supplierHint, source.supplier));
  const matchedSupplier = detected.supplier || getSupplierByKey(supplierHint) || getSupplierByKey(source.supplier) || null;
  const supplierName = text(first(source.supplier, supplierHint, matchedSupplier?.name));
  const descriptionSource = text(first(source.descriptionSource, source.description, source.longDescription, source.sourceOnlineDescription, "raw"));
  const variantSource = text(first(source.variantSource, "raw"));
  const imageCandidates = [
    first(source.image, source.sourceOnlineImage),
    ...toArray(first(source.images, source.sourceOnlineImages)),
  ];
  const images = Array.from(new Set(imageCandidates.map(normalizeImageUrl).filter(Boolean))).slice(0, 40);
  const descriptions = dedupeStrings([
    source.description,
    source.longDescription,
    source.shortDescription,
    source.sourceOnlineDescription,
    ...toArray(source.descriptionCandidates),
  ], 20);
  const descriptionInfo = cleanDescription(descriptions.join("\n\n"));
  const variantInfo = normalizeVariantGroups(first(source.variants, source.variantGroups, source.variantItems, source.sourceOnlineVariants, []));

  return {
    ...source,
    supplierDetected: supplierName || matchedSupplier?.name || "",
    extractorUsed: text(first(source.extractorUsed, source.extractor, "generic")),
    title: cleanWhitespace(first(source.title, source.name)),
    sourceUrl,
    description: descriptionInfo.text,
    descriptionCandidates: descriptions,
    descriptionSource,
    images,
    image: images[0] || "",
    variants: variantInfo.variants,
    rawVariants: variantInfo.rawVariants,
    variantSource,
    debug: {
      supplierDetected: supplierName || matchedSupplier?.name || "",
      extractorUsed: text(first(source.extractorUsed, source.extractor, "generic")),
      descriptionSource,
      variantSource,
      variantsFound: variantInfo.variantsFound,
      noiseRemoved: descriptionInfo.noiseRemoved,
      duplicatesRemoved: descriptionInfo.duplicatesRemoved,
      originalDescriptionLength: descriptionInfo.originalLength,
      cleanedDescriptionLength: descriptionInfo.cleanedLength,
    },
  };
}
