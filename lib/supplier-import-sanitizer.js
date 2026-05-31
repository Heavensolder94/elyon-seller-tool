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
    "questions", "answers", "share", "follow", "support", "help center", "contact us", "track your order",
    "company profile", "buyers show", "related products", "flash deals", "coupon", "chat now"
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
    if (line.length > 500 && /(login|policy|cookie|recommended|customer service|track your order|company profile|contact us)/i.test(line)) {
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
  const limited = kept
    .filter((line) => line.length >= 25)
    .filter((line) => !/(track your order|customer service|company profile|contact us|recommended|related products|buyers show)/i.test(line))
    .slice(0, 12)
    .join("\n\n")
    .slice(0, 4000)
    .trim();
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

function normalizeVariantGroupName(name) {
  const value = cleanWhitespace(name).replace(/:\s*$/, "");
  if (!value) return "";
  if (/color|colour|farbe/i.test(value)) return "Color";
  if (/size|format|groesse/i.test(value)) return "Size";
  if (/style|stil/i.test(value)) return "Style";
  if (/model|modell/i.test(value)) return "Model";
  if (/count|anzahl|pack|menge|quantity/i.test(value)) return "Count";
  if (/specification|spezifikation|spec/i.test(value)) return "Specification";
  if (/ships?\s*from/i.test(value)) return "Ships From";
  return value;
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

  for (const item of fallbackVariants) {
    const title = text(first(item.title, item.name, item.label, item.variantName));
    if (!title) continue;
    const namedParts = Array.from(title.matchAll(/(color|colour|farbe|size|gr[oö]sse|größe|style|material)\s*[:=-]\s*([^,|/;]+)/gi));
    if (namedParts.length) {
      namedParts.forEach((match) => {
        const rawGroup = text(match[1]);
        const optionValue = text(match[2]);
        if (!optionValue) return;
        const groupName = /color|colour|farbe/i.test(rawGroup)
          ? "Color"
          : /size|gr[oö]sse|größe/i.test(rawGroup)
            ? "Size"
            : /style/i.test(rawGroup)
              ? "Style"
              : "Material";
        const existing = groups.get(groupName) || new Set();
        existing.add(optionValue);
        groups.set(groupName, existing);
      });
      continue;
    }

    if (item.color || item.colour || item.size || item.style || item.material) continue;
    const slashParts = title.split(/\s*[/|,;]+\s*/).map((part) => text(part)).filter(Boolean);
    if (slashParts.length === 2) {
      const colorGroup = groups.get("Color") || new Set();
      const sizeGroup = groups.get("Size") || new Set();
      colorGroup.add(slashParts[0]);
      sizeGroup.add(slashParts[1]);
      groups.set("Color", colorGroup);
      groups.set("Size", sizeGroup);
    }
  }

  const variantGroups = Array.from(groups.entries()).map(([name, options]) => ({
    name: normalizeVariantGroupName(name),
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
  const rawVariantGroups = toArray(first(source.rawVariantGroups, source.rawVariants, source.raw?.rawVariantGroups));
  const variantGroupsAfterSanitize = variantInfo.variants;
  const jsonSourceUsed = text(first(
    source.aliexpressJsonSourceUsed,
    source.raw?.platformSpecificData?.aliexpress?.aliexpressJsonSourceUsed,
    source.raw?.platformSpecificData?.amazon?.amazonJsonSourceUsed
  ));
  const descriptionSource = text(first(source.descriptionSource, source.raw?.debugSelectors?.descriptionSource, source.description, source.longDescription, source.sourceOnlineDescription, "raw"));

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
      cleanedDescriptionLength: descriptionInfo.cleanedLength,
      rawVariantGroups,
      variantGroupsAfterSanitize,
      rawVariantGroupsCount: rawVariantGroups.length,
      variantGroupsAfterSanitizeCount: variantGroupsAfterSanitize.length,
      variantSource,
      variantsFound: variantInfo.variantsFound,
      jsonDataUsed: jsonSourceUsed ? "yes" : "no",
      jsonSourceUsed,
      domOnlyUsed: jsonSourceUsed ? "no" : "yes",
      amazonAsin: text(first(source.amazonAsin, source.asin, source.raw?.platformSpecificData?.amazon?.amazonAsin)),
      amazonVariantSelectorsUsed: first(source.amazonVariantSelectorsUsed, source.raw?.platformSpecificData?.amazon?.amazonVariantSelectorsUsed, []),
      amazonVariantsFound: first(source.amazonVariantsFound, source.raw?.platformSpecificData?.amazon?.amazonVariantsFound, variantInfo.variantsFound),
      aliexpressProductId: text(first(source.aliexpressProductId, source.productId, source.raw?.platformSpecificData?.aliexpress?.aliexpressProductId)),
      aliexpressSkuSelectorsUsed: first(source.aliexpressSkuSelectorsUsed, source.raw?.platformSpecificData?.aliexpress?.aliexpressSkuSelectorsUsed, []),
      aliexpressJsonSourceUsed: jsonSourceUsed,
      aliexpressVariantsFound: first(source.aliexpressVariantsFound, source.raw?.platformSpecificData?.aliexpress?.aliexpressVariantsFound, variantInfo.variantsFound),
      noiseRemoved: descriptionInfo.noiseRemoved,
      duplicatesRemoved: descriptionInfo.duplicatesRemoved,
      originalDescriptionLength: descriptionInfo.originalLength,
      supplierRecognized: supplierName || matchedSupplier?.name || "",
    },
  };
}
