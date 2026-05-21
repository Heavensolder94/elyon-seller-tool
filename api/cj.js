function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "cj-search",
    sandbox: true,
    cjConnected: Boolean(process.env.CJ_API_KEY),
    status,
    error,
    details: details ?? null,
  });
}

function readText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(",", ".").replace(/[^\d.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\s+/g, " ").replace(/""/g, '"').trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.join(" ");
    } catch (err) {
      return text.replace(/[\[\]"]/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return text;
}

const SOURCE_ANALYSIS_SUPPLIERS = [
  { name: "CJdropshipping", domains: ["cjdropshipping.com"] },
  { name: "AliExpress", domains: ["aliexpress.com"] },
  { name: "BigBuy", domains: ["bigbuy.eu", "bigbuy.com"] },
  { name: "Amazon.de", domains: ["amazon.de"] },
  { name: "Temu", domains: ["temu.com"] },
  { name: "Alibaba", domains: ["alibaba.com"] },
  { name: "dropxl.com", domains: ["dropxl.com"] },
  { name: "vidaXL", domains: ["vidaxl.de", "vidaxl.com"] },
];

function normalizeSourceUrl(value) {
  const raw = readText(value);
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function detectSourceSupplier(url) {
  const domain = url.hostname.replace(/^www\./i, "").toLowerCase();
  const found = SOURCE_ANALYSIS_SUPPLIERS.find((supplier) =>
    supplier.domains.some((item) => domain === item || domain.endsWith(`.${item}`))
  );
  return { domain, supplier: found ? found.name : "Unbekannter Supplier" };
}

function sourceTextBetween(html, regex) {
  const match = String(html || "").match(regex);
  return match && match[1] ? cleanText(match[1]) : "";
}

function humanVerificationDetected(text) {
  return /\b(human verification|verify you are human|captcha|bot detection|access denied|forbidden)\b/i.test(String(text || ""));
}

function getMetaContent(html, key) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const property = sourceTextBetween(tag, /\bproperty=["']([^"']+)["']/i);
    const name = sourceTextBetween(tag, /\bname=["']([^"']+)["']/i);
    if (property.toLowerCase() !== key.toLowerCase() && name.toLowerCase() !== key.toLowerCase()) continue;
    return sourceTextBetween(tag, /\bcontent=["']([^"']*)["']/i);
  }
  return "";
}

function sourceAbsoluteUrl(value, baseUrl) {
  const raw = readText(value);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function readJsonLdValues(value) {
  if (Array.isArray(value)) return value.flatMap(readJsonLdValues);
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value["@graph"])) return value["@graph"].flatMap(readJsonLdValues);
  return [value];
}

function findJsonLdProduct(html) {
  const blocks = String(html || "").match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const jsonText = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const nodes = readJsonLdValues(JSON.parse(jsonText));
      const product = nodes.find((node) => {
        const type = node && node["@type"];
        return Array.isArray(type) ? type.includes("Product") : type === "Product";
      });
      if (product) return product;
    } catch {
      // Ignore invalid JSON-LD blocks and continue with other metadata.
    }
  }
  return null;
}

function firstJsonLdImage(image) {
  if (Array.isArray(image)) return readText(image[0]);
  if (image && typeof image === "object") return readText(image.url || image.contentUrl);
  return readText(image);
}

function getJsonLdOffer(product) {
  const offers = product && product.offers;
  if (Array.isArray(offers)) return offers[0] || {};
  return offers && typeof offers === "object" ? offers : {};
}

function extractBasicSourceMetadata(html, baseUrl) {
  const jsonLdProduct = findJsonLdProduct(html);
  const jsonLdOffer = getJsonLdOffer(jsonLdProduct);
  const title =
    cleanText(jsonLdProduct?.name) ||
    getMetaContent(html, "og:title") ||
    getMetaContent(html, "twitter:title") ||
    sourceTextBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    cleanText(jsonLdProduct?.description) ||
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description");
  const image =
    firstJsonLdImage(jsonLdProduct?.image) ||
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image");
  const price =
    readText(jsonLdOffer.price || jsonLdProduct?.price) ||
    getMetaContent(html, "product:price:amount") ||
    sourceTextBetween(html, /"price"\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)/i);
  const currency =
    readText(jsonLdOffer.priceCurrency || jsonLdProduct?.priceCurrency) ||
    getMetaContent(html, "product:price:currency") ||
    sourceTextBetween(html, /"priceCurrency"\s*:\s*"([^"]+)"/i);
  const availability = (readText(jsonLdOffer.availability) || sourceTextBetween(html, /"availability"\s*:\s*"([^"]+)"/i)).split("/").pop();
  const category = cleanText(jsonLdProduct?.category) || sourceTextBetween(html, /"category"\s*:\s*"([^"]+)"/i);

  return {
    title,
    price,
    currency,
    image: sourceAbsoluteUrl(image, baseUrl),
    availability,
    shipping: "",
    description,
    category,
  };
}

function normalizeSourceAnalysisResult({ url, supplier, domain, metadata, message, ok = true, reason = "", httpStatus = 200, contentType = "" }) {
  const detectedData = Object.fromEntries(
    Object.entries(metadata || {}).filter(([, value]) => value !== undefined && value !== null && readText(value) !== "")
  );
  const productDataFound = Boolean(detectedData.title || detectedData.price || detectedData.image || detectedData.description);
  const confidence = Object.keys(detectedData).length >= 4 ? "medium" : "low";
  return {
    ok,
    mode: "online",
    onlineChecked: true,
    productDataFound,
    supplier,
    domain,
    title: metadata.title || "",
    price: metadata.price || "",
    currency: metadata.currency || "",
    image: metadata.image || "",
    availability: metadata.availability || "",
    shipping: metadata.shipping || "",
    description: metadata.description || "",
    category: metadata.category || "",
    detectedData,
    confidence,
    warnings: [],
    reason,
    status: ok ? "done" : "failed",
    httpStatus,
    contentType,
    checkedAt: new Date().toISOString(),
    message,
    url,
  };
}

function blockedSourceAnalysisResult({ url, supplier, domain, message, reason = "blocked_by_human_verification", httpStatus = 200, contentType = "text/html", mode = "online", identifiers = {} }) {
  return {
    ok: true,
    mode,
    onlineChecked: true,
    productDataFound: false,
    supplier,
    domain,
    title: "",
    price: "",
    currency: "",
    image: "",
    images: [],
    availability: "",
    shipping: "",
    description: "",
    category: "",
    variants: [],
    detectedData: {},
    confidence: "low",
    warnings: ["human_verification_detected"],
    reason,
    status: "blockiert",
    httpStatus,
    contentType,
    checkedAt: new Date().toISOString(),
    message,
    url,
    identifiers,
  };
}

function isBadSourceMetadata(metadata) {
  const title = readText(metadata?.title).toLowerCase();
  const description = readText(metadata?.description).toLowerCase();
  const text = `${title} ${description}`;
  if (!title && !metadata?.price && !metadata?.image && !metadata?.description) return true;
  return /\b(404|not found|page not found|access denied|forbidden|captcha|bot detection|seite nicht gefunden|nicht gefunden)\b/i.test(text);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = readText(value);
    if (text) return text;
  }
  return "";
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = readText(value);
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function slugToKeywords(value) {
  const raw = readText(value)
    .replace(/[-_+/]+/g, " ")
    .replace(/\b(p|pid|sku|spu|vid|variant|product|detail|item|goods)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  return uniqueStrings(
    raw
      .split(" ")
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && !/^\d+$/.test(item))
  );
}

function extractCjIdentifiers(sourceUrl) {
  const normalized = normalizeSourceUrl(sourceUrl);
  if (!normalized) return { pid: "", productSku: "", variantSku: "", sku: "", sourceUrl: "", searchTerms: [] };

  const readParam = (...names) => {
    for (const name of names) {
      const value = readText(normalized.searchParams.get(name));
      if (value) return value;
    }
    return "";
  };

  const path = normalized.pathname || "";
  const segments = path.split("/").filter(Boolean);
  const lastSegment = readText(segments[segments.length - 1] || "");
  const pidFromSlugMatch =
    path.match(/(?:^|[-_/])p[-_](\d{10,})(?:\.html?)?$/i) ||
    path.match(/(?:^|[-_/])p[-_]([A-Za-z0-9]{10,})(?:\.html?)?$/i);
  const pidFromPathMatch =
    path.match(/(?:product|detail|item|goods)\/[^?]*?[-_/]p[-_](\d{10,})(?:\.html?)?$/i) ||
    path.match(/(?:product|detail|item|goods)\/[^?]*?[-_/]p[-_]([A-Za-z0-9]{10,})(?:\.html?)?$/i);
  const skuFromPathMatch =
    path.match(/(?:^|[-_/])(sku|spu)[-_]([A-Za-z0-9_-]{5,})(?:\.html?)?$/i) ||
    path.match(/(?:sku|variant|vid)[\/-]([A-Za-z0-9_-]{5,})/i);
  const vidFromPathMatch =
    path.match(/(?:^|[-_/])v(?:id)?[-_]([A-Za-z0-9_-]{5,})(?:\.html?)?$/i) ||
    path.match(/(?:variant|vid)[\/-]([A-Za-z0-9_-]{5,})/i);
  const slugSearchTerms = uniqueStrings(
    segments.flatMap((segment) => slugToKeywords(segment))
  );
  const paramSearchTerms = uniqueStrings([
    ...slugToKeywords(readParam("title", "name", "productName", "product_name", "keyword", "keyWord", "q")),
    ...slugToKeywords(lastSegment),
  ]);

  const pid = firstNonEmpty(
    readParam("pid", "productId", "product_id", "id"),
    pidFromPathMatch && pidFromPathMatch[1],
    pidFromSlugMatch && pidFromSlugMatch[1],
    /^[A-Za-z0-9_-]{5,}$/.test(lastSegment) && /product|detail|item|goods/i.test(path) ? lastSegment : ""
  );
  const productSku = firstNonEmpty(
    readParam("productSku", "product_sku", "sku", "spu"),
    skuFromPathMatch && (skuFromPathMatch[2] || skuFromPathMatch[1])
  );
  const variantSku = firstNonEmpty(
    readParam("variantSku", "variant_sku", "vid"),
    vidFromPathMatch && vidFromPathMatch[1]
  );

  return {
    pid,
    productSku,
    variantSku,
    sku: firstNonEmpty(productSku, variantSku),
    sourceUrl: normalized.toString(),
    searchTerms: uniqueStrings([...paramSearchTerms, ...slugSearchTerms]).slice(0, 8),
  };
}

function extractDetailPayload(data) {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.data)) return data.data[0] || null;
  if (data.data && typeof data.data === "object") return data.data;
  if (data.result && typeof data.result === "object" && !Array.isArray(data.result)) return data.result;
  return null;
}

function normalizeCjVariants(input) {
  const list = Array.isArray(input) ? input : [];
  return list.slice(0, 100).map((item) => ({
    variantSku: firstNonEmpty(item?.variantSku, item?.vid, item?.sku),
    productSku: firstNonEmpty(item?.productSku, item?.sku),
    title: firstNonEmpty(item?.variantName, item?.name, item?.title),
    price: firstNonEmpty(item?.sellPrice, item?.price, item?.variantSellPrice),
    image: firstNonEmpty(item?.variantImage, item?.image),
    stock: firstNonEmpty(item?.inventory, item?.stock, item?.quantity),
  })).filter((item) => item.variantSku || item.title || item.price || item.image);
}

function normalizeCjDetailProduct(product, identifiers = {}) {
  const pid = firstNonEmpty(product?.pid, product?.productId, product?.id, identifiers.pid);
  const productSku = firstNonEmpty(product?.productSku, product?.sku, identifiers.productSku);
  const variantSku = firstNonEmpty(product?.variantSku, product?.vid, identifiers.variantSku);
  const title = firstNonEmpty(product?.productNameEn, product?.productName, product?.name, product?.title);
  const description = cleanText(firstNonEmpty(product?.description, product?.productDescription, product?.descriptionEn));
  const category = cleanText(firstNonEmpty(product?.categoryName, product?.category, product?.googleCategoryName));
  const image = firstNonEmpty(product?.productImage, product?.image, product?.coverImage);
  const images = uniqueStrings(
    []
      .concat(Array.isArray(product?.productImages) ? product.productImages : [])
      .concat(Array.isArray(product?.images) ? product.images : [])
      .concat(image ? [image] : [])
  );
  const variants = normalizeCjVariants(
    product?.variants || product?.variantList || product?.skuList || product?.productVariants || []
  );
  const shippingCountries = uniqueStrings(product?.shippingCountryCodes || product?.shipToCountries || []);
  const shippingText = shippingCountries.length ? shippingCountries.join(", ") : "";
  const price = firstNonEmpty(product?.sellPrice, product?.price, product?.nowPrice, variants[0]?.price);
  const currency = firstNonEmpty(product?.currency, product?.currencyCode, "USD");

  return {
    pid,
    sku: productSku,
    productSku,
    variantSku,
    title,
    price,
    currency,
    image,
    images,
    availability: firstNonEmpty(product?.saleStatus, product?.availability),
    shipping: shippingText,
    description,
    category,
    variants,
    supplierName: firstNonEmpty(product?.supplierName),
    supplierId: firstNonEmpty(product?.supplierId),
    shippingCountries,
    isFreeShipping: Boolean(product?.isFreeShipping),
    saleStatus: product?.saleStatus ?? null,
    source: "CJ API",
  };
}

async function cjApiRequest(path, { method = "GET", token, query, body } = {}) {
  const url = new URL(`https://developers.cjdropshipping.com/api2.0/v1${path}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && readText(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "CJ-Access-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });

  const { rawText, data } = await parseUpstreamResponse(response);
  return { response, rawText, data };
}

async function fetchCjProductByIdentifiers(identifiers) {
  const token = await getCjAccessToken();
  const attempts = [
    identifiers?.pid ? { label: "pid", body: { pid: identifiers.pid } } : null,
    identifiers?.productSku ? { label: "productSku", body: { productSku: identifiers.productSku } } : null,
    identifiers?.variantSku ? { label: "variantSku", body: { variantSku: identifiers.variantSku } } : null,
  ].filter(Boolean);

  if (!attempts.length) {
    return {
      ok: false,
      found: false,
      reason: "missing_cj_identifier",
      message: "CJ-Link erkannt, aber es konnte keine Produkt-ID aus der URL extrahiert werden.",
      identifiers,
    };
  }

  const errors = [];
  for (const attempt of attempts) {
    const { response, rawText, data } = await cjApiRequest("/product/query", { method: "POST", token, body: attempt.body });
    if (!response.ok || data?.result === false) {
      errors.push({
        identifier: attempt.label,
        status: response.status,
        message: data?.message || data?.error || rawText || "CJ product query failed",
      });
      continue;
    }
    const detail = extractDetailPayload(data);
    if (detail) {
      return {
        ok: true,
        found: true,
        identifier: attempt.label,
        identifiers,
        raw: data,
        product: normalizeCjDetailProduct(detail, identifiers),
      };
    }
  }

  return {
    ok: false,
    found: false,
    reason: "cj_product_not_found",
    message: "CJ API konnte keine Produktdaten laden.",
    identifiers,
    errors,
  };
}

async function searchCjProductsByKeyword(keyword, token) {
  const normalizedKeyword = readText(keyword);
  if (!normalizedKeyword) return [];

  const cjUrl = new URL("https://developers.cjdropshipping.com/api2.0/v1/product/listV2");
  cjUrl.search = new URLSearchParams({
    page: "1",
    size: "10",
    keyWord: normalizedKeyword,
  }).toString();

  const response = await fetch(cjUrl.toString(), {
    method: "GET",
    headers: {
      "CJ-Access-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  const { rawText, data } = await parseUpstreamResponse(response);
  if (!response.ok || data?.result === false || !data) return [];
  return extractProductList(data).map(normalizeCjProduct);
}

function scoreCjSearchCandidate(product, identifiers) {
  const haystack = [
    product?.title,
    product?.productName,
    product?.productNameEn,
    product?.sku,
    product?.productSku,
    product?.pid,
  ].map((item) => readText(item).toLowerCase()).join(" ");
  let score = 0;
  for (const term of identifiers?.searchTerms || []) {
    const value = readText(term).toLowerCase();
    if (!value) continue;
    if (haystack.includes(value)) score += value.length >= 6 ? 3 : 1;
  }
  return score;
}

async function fetchCjProductBySearchTerms(identifiers) {
  const searchTerms = Array.isArray(identifiers?.searchTerms) ? identifiers.searchTerms.filter(Boolean) : [];
  if (!searchTerms.length) {
    return {
      ok: false,
      found: false,
      reason: "missing_cj_search_terms",
      message: "CJ-Link erkannt, aber es konnten keine Suchbegriffe aus der URL abgeleitet werden.",
      identifiers,
    };
  }

  const token = await getCjAccessToken();
  const candidates = [];
  for (const term of searchTerms.slice(0, 3)) {
    const products = await searchCjProductsByKeyword(term, token);
    products.forEach((product) => {
      candidates.push({ product, score: scoreCjSearchCandidate(product, identifiers), term });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.find((entry) => entry.score > 0) || candidates[0];
  if (!best || !best.product) {
    return {
      ok: false,
      found: false,
      reason: "cj_search_no_results",
      message: "CJ API konnte keine Produktdaten laden.",
      identifiers,
    };
  }

  const detailResult = await fetchCjProductByIdentifiers({
    pid: best.product.pid || "",
    productSku: best.product.productSku || best.product.sku || "",
    variantSku: "",
    sku: best.product.productSku || best.product.sku || "",
    sourceUrl: identifiers?.sourceUrl || "",
    searchTerms,
  });

  if (detailResult?.found) {
    return {
      ...detailResult,
      via: "search-term",
      matchedKeyword: best.term,
    };
  }

  return {
    ok: true,
    found: true,
    via: "search-list",
    matchedKeyword: best.term,
    identifiers,
    raw: null,
    product: {
      ...best.product,
      title: best.product.title || best.product.productName || best.product.productNameEn || "",
      description: "",
      images: best.product.image ? [best.product.image] : [],
      variants: [],
      shipping: "",
      currency: best.product.currency || "USD",
    },
  };
}

function normalizeCjApiAnalysisResult({ url, supplier, domain, product, identifiers, raw }) {
  const metadata = {
    title: product?.title || "",
    price: product?.price || "",
    currency: product?.currency || "",
    image: product?.image || "",
    availability: product?.availability || "",
    shipping: product?.shipping || "",
    description: product?.description || "",
    category: product?.category || "",
  };
  const base = normalizeSourceAnalysisResult({
    url,
    supplier,
    domain,
    metadata,
    ok: true,
    reason: "",
    httpStatus: 200,
    contentType: "application/json",
    message: "CJ API erfolgreich verwendet. Produktdaten wurden ueber die API geladen.",
  });
  return {
    ...base,
    mode: "cj-api",
    source: "cj-api",
    images: Array.isArray(product?.images) ? product.images : [],
    variants: Array.isArray(product?.variants) ? product.variants : [],
    identifiers,
    cj: {
      pid: product?.pid || "",
      sku: product?.sku || "",
      productSku: product?.productSku || "",
      variantSku: product?.variantSku || "",
      supplierName: product?.supplierName || "",
      supplierId: product?.supplierId || "",
      shippingCountries: Array.isArray(product?.shippingCountries) ? product.shippingCountries : [],
      saleStatus: product?.saleStatus ?? null,
      isFreeShipping: Boolean(product?.isFreeShipping),
    },
    raw: raw || undefined,
  };
}

async function handleSourceAnalyze(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, mode: "online", reason: "method_not_allowed", message: "Bitte POST verwenden." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const url = normalizeSourceUrl(body.url);
  if (!url) {
    return res.status(400).json({ ok: false, mode: "online", reason: "invalid_url", message: "Bitte gueltigen Produktlink uebergeben." });
  }

  const detected = detectSourceSupplier(url);
  const supplier = readText(body.supplier) || detected.supplier;
  const isCjLink = detected.domain === "cjdropshipping.com" || supplier.toLowerCase().includes("cj");
  const cjIdentifiers = isCjLink ? extractCjIdentifiers(url.toString()) : null;

  if (isCjLink) {
    try {
      const cjApiResult = await fetchCjProductByIdentifiers(cjIdentifiers);
      if (cjApiResult?.found && cjApiResult.product) {
        return res.status(200).json(
          normalizeCjApiAnalysisResult({
            url: url.toString(),
            supplier,
            domain: detected.domain,
            product: cjApiResult.product,
            identifiers: cjApiResult.identifiers,
            raw: cjApiResult.raw,
          })
        );
      }
      const cjSearchResult = await fetchCjProductBySearchTerms(cjIdentifiers);
      if (cjSearchResult?.found && cjSearchResult.product) {
        return res.status(200).json(
          normalizeCjApiAnalysisResult({
            url: url.toString(),
            supplier,
            domain: detected.domain,
            product: cjSearchResult.product,
            identifiers: {
              ...(cjSearchResult.identifiers || cjIdentifiers || {}),
              matchedKeyword: cjSearchResult.matchedKeyword || "",
              via: cjSearchResult.via || "search-term",
            },
            raw: cjSearchResult.raw,
          })
        );
      }
    } catch (error) {
      // Continue with HTML fallback, but do not fail the whole analysis path.
    }
  }

  try {
    const response = await fetch(url.toString(), { redirect: "follow" });
    if (!response.ok) {
      return res.status(200).json(normalizeSourceAnalysisResult({
        url: url.toString(),
        supplier,
        domain: detected.domain,
        metadata: {},
        ok: true,
        reason: "source_reached_but_blocked",
        httpStatus: response.status,
        contentType: String(response.headers.get("content-type") || ""),
        message: "Onlineanalyse wurde ausgefuehrt, aber die Quelle hat den automatischen Zugriff blockiert oder keine Produktdaten geliefert.",
      }));
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      return res.status(200).json(normalizeSourceAnalysisResult({
        url: url.toString(),
        supplier,
        domain: detected.domain,
        metadata: {},
        ok: true,
        reason: "unsupported_content_type",
        httpStatus: response.status,
        contentType,
        message: "Diese Quelle liefert keine auswertbare HTML-Produktseite.",
      }));
    }

    const html = (await response.text()).slice(0, 600000);
    if (humanVerificationDetected(html)) {
      const blocked = blockedSourceAnalysisResult({
        url: url.toString(),
        supplier,
        domain: detected.domain,
        message: isCjLink
          ? "CJ API konnte keine Produktdaten laden. Die HTML-Seite wurde durch Human Verification blockiert."
          : "Die Quelle blockiert den automatischen Zugriff mit Human Verification.",
        httpStatus: response.status,
        contentType,
        mode: isCjLink ? "cj-fallback" : "online",
        identifiers: cjIdentifiers || {},
      });
      return res.status(200).json(blocked);
    }
    const metadata = extractBasicSourceMetadata(html, url.toString());
    const badMetadata = isBadSourceMetadata(metadata);
    const hasData = !badMetadata && Boolean(metadata.title || metadata.price || metadata.image || metadata.description);

    return res.status(200).json(normalizeSourceAnalysisResult({
      url: url.toString(),
      supplier,
      domain: detected.domain,
      metadata,
      ok: true,
      reason: hasData ? "" : "no_product_metadata_found",
      httpStatus: response.status,
      contentType,
      message: hasData
        ? "Onlineanalyse abgeschlossen. Es wurden oeffentliche Metadaten erkannt."
        : isCjLink
          ? "CJ API konnte keine Produktdaten laden."
          : "Onlineanalyse abgeschlossen. Es wurden keine echten Produktdaten erkannt. Bitte Produktdaten manuell ergaenzen oder spaeter API-Anbindung nutzen.",
    }));
  } catch {
    return res.status(200).json({
      ok: false,
      mode: "online",
      supplier,
      domain: detected.domain,
      reason: "unsupported_supplier_or_blocked",
      message: "Fuer diese Quelle konnten noch keine Produktdaten automatisch gelesen werden.",
      confidence: "low",
      warnings: [],
      detectedData: {},
      status: "failed",
      checkedAt: new Date().toISOString(),
      ...(isCjLink ? { message: "CJ API konnte keine Produktdaten laden." } : {}),
    });
  }
}

function normalizeCjProduct(product) {
  const pid = product.pid || product.productId || product.id || "";
  const title = cleanText(product.nameEn) || cleanText(product.productNameEn) || cleanText(product.productName) || "CJ Produkt";
  const sku = product.sku || product.productSku || "";
  const image = product.bigImage || product.productImage || product.image || "";
  const priceRaw = product.sellPrice ?? product.price ?? product.nowPrice ?? "";
  const price = toNumber(priceRaw);
  const weight = toNumber(product.productWeight || product.weight);
  const supplierName = cleanText(product.supplierName) || "";
  const supplierId = product.supplierId || "";
  const categoryName = cleanText(product.categoryName) || cleanText(product.categoryId) || "";
  const shippingCountries = Array.isArray(product.shippingCountryCodes) ? product.shippingCountryCodes : [];
  const isFreeShipping = Boolean(product.isFreeShipping);
  const saleStatus = product.saleStatus ?? null;
  const listedNum = product.listedNum ?? null;
  const warehouseInventoryNum = product.warehouseInventoryNum ?? null;
  const categoryId = product.categoryId ?? null;

  return {
    pid,
    title,
    productName: title,
    productNameEn: title,
    sku,
    productSku: sku,
    image,
    productImage: image,
    price,
    priceRaw: priceRaw === null || priceRaw === undefined ? "" : String(priceRaw),
    sellPrice: price,
    weight,
    productWeight: weight,
    supplierName,
    supplierId,
    categoryName,
    listedNum,
    warehouseInventoryNum,
    categoryId,
    shippingCountries,
    isFreeShipping,
    saleStatus,
    source: "CJ Dropshipping",
  };
}

function normalizeShippingCountries(value) {
  return Array.isArray(value)
    ? value.map((item) => readText(item)).filter(Boolean)
    : [];
}

function normalizeProductVariants(product) {
  const variants = Array.isArray(product?.variants)
    ? product.variants
    : Array.isArray(product?.variantList)
      ? product.variantList
      : Array.isArray(product?.skuList)
        ? product.skuList
        : [];

  return variants.slice(0, 50).map((item, index) => ({
    id: readText(item?.variantSku || item?.vid || item?.sku || `variant-${index + 1}`),
    title: readText(item?.variantName || item?.name || item?.title || ""),
    image: readText(item?.variantImage || item?.image || ""),
    price: readText(item?.sellPrice || item?.price || item?.variantSellPrice || ""),
  })).filter((item) => item.id || item.title || item.image || item.price);
}

function toCjSearchProduct(product) {
  const normalized = normalizeCjProduct(product || {});
  const productLink = normalized.pid
    ? `https://www.cjdropshipping.com/product/-p-${encodeURIComponent(normalized.pid)}.html`
    : "";
  const shippingCountries = normalizeShippingCountries(product?.shippingCountryCodes || normalized.shippingCountries);
  const variants = normalizeProductVariants(product);
  const title = readText(product?.productName || product?.productNameEn || normalized.title || "CJ Produkt");
  const image = readText(product?.productImage || product?.image || normalized.image || "");
  const supplier = readText(product?.supplierName || normalized.supplierName || "CJ Dropshipping");
  const category = readText(product?.categoryName || normalized.categoryName || "");
  const rawPrice = product?.sellPrice ?? product?.price ?? product?.nowPrice ?? normalized.sellPrice;
  const price = rawPrice === null || rawPrice === undefined || rawPrice === "" ? "" : String(rawPrice);
  const deliveryInfo = readText(product?.deliveryTime || product?.shipping || product?.logisticInfo || "");

  return {
    id: readText(normalized.pid || normalized.productSku || normalized.sku || ""),
    title,
    image,
    price,
    productLink,
    shipping: deliveryInfo,
    supplier,
    category,
    shippingCountries,
    variants,
    productName: title,
    productImage: image,
    sellPrice: price,
    priceRaw: normalized.priceRaw || price,
    supplierName: supplier,
    categoryName: category,
    pid: normalized.pid || "",
    sku: normalized.productSku || normalized.sku || "",
    listedNum: normalized.listedNum,
    warehouseInventoryNum: normalized.warehouseInventoryNum,
    categoryId: normalized.categoryId,
    saleStatus: normalized.saleStatus,
    source: normalized.source || "CJ Dropshipping",
    status: "prepared",
  };
}

function sandboxSearchResponse(query, products = [], extra = {}) {
  return {
    ok: true,
    service: "CJ",
    apiReady: true,
    futureLiveMode: false,
    query,
    sandbox: true,
    cjConnected: Boolean(process.env.CJ_API_KEY),
    products,
    ...extra,
  };
}

function createPreparedSearchProduct(query) {
  const safeQuery = readText(query);
  return {
    id: "cj-demo-1",
    title: safeQuery ? `Demo Produkt: ${safeQuery}` : "Demo Produkt",
    image: "",
    price: "",
    shipping: "",
    supplier: "CJ Dropshipping",
    status: "prepared",
  };
}

function extractProductList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.products)) return data.products;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.data?.list)) return data.data.list;
  if (Array.isArray(data?.data?.content)) {
    return data.data.content.flatMap((entry) =>
      Array.isArray(entry?.productList) ? entry.productList : entry
    );
  }
  if (Array.isArray(data.result)) return data.result;
  return [];
}

function createPreparedProductsFromCjData(rawProducts, fallbackQuery) {
  const items = Array.isArray(rawProducts) ? rawProducts.map((item) => toCjSearchProduct(item)).filter(Boolean) : [];
  if (items.length) return items;
  return [createPreparedSearchProduct(fallbackQuery)];
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { response, data, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCjProductsWithAccessToken(query) {
  const token = readText(process.env.CJ_ACCESS_TOKEN);
  if (!token) {
    throw new Error("CJ_ACCESS_TOKEN fehlt.");
  }

  const keyword = readText(query);
  if (!keyword) return [];

  const cjUrl = new URL("https://developers.cjdropshipping.com/api2.0/v1/product/listV2");
  cjUrl.search = new URLSearchParams({
    page: "1",
    size: "10",
    keyWord: keyword,
  }).toString();

  const { response, data, text } = await fetchJsonWithTimeout(cjUrl.toString(), {
    method: "GET",
    headers: {
      "CJ-Access-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  console.log("CJ RAW RESPONSE:", data);

  if (!response.ok) {
    throw new Error(text || `CJ search failed with status ${response.status}`);
  }

  if (!data || data.result === false) {
    throw new Error((data && (data.message || data.error)) || "CJ search returned no usable data.");
  }

  return extractProductList(data);
}

async function getCjAccessToken() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error("CJ_API_KEY fehlt in Vercel.");
  }

  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ apiKey }),
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  let data = null;
  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      data = null;
    }
  }

  if (!response.ok || data?.result === false) {
    const message = data?.message || data?.error || rawText || "CJ Access Token konnte nicht erstellt werden.";
    const error = new Error(message);
    error.status = response.status || 502;
    error.details = {
      upstreamStatus: response.status,
      upstreamStatusText: response.statusText || "",
      upstreamBody: data || rawText || null,
    };
    throw error;
  }

  const token = data?.data?.accessToken;
  if (!token) {
    throw new Error("CJ Access Token fehlt in der CJ-Antwort.");
  }

  return token;
}

async function parseUpstreamResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  if (!rawText) return { rawText: "", data: null };

  if (contentType.includes("application/json")) {
    try {
      return { rawText, data: JSON.parse(rawText) };
    } catch (err) {
      return { rawText, data: null };
    }
  }

  return { rawText, data: null };
}

export default async function handler(req, res) {
  const action = readText(req.query.action || req.query.endpoint || "search");

  if (action === "source-analyze") {
    return handleSourceAnalyze(req, res);
  }

  if (req.method !== "GET") {
    return jsonError(res, 405, "Nur GET erlaubt.", "METHOD_NOT_ALLOWED");
  }

  if (action === "status") {
    return res.status(200).json({
      ok: true,
      service: "CJ",
      source: "cj",
      tokenConfigured: Boolean(readText(process.env.CJ_ACCESS_TOKEN) || readText(process.env.CJ_API_KEY)),
    });
  }

  if (action === "product" || action === "detail") {
    const identifiers = {
      pid: readText(req.query.pid || req.query.productId || ""),
      productSku: readText(req.query.productSku || req.query.sku || ""),
      variantSku: readText(req.query.variantSku || req.query.vid || ""),
    };

    if (!identifiers.pid && !identifiers.productSku && !identifiers.variantSku) {
      return jsonError(res, 400, "pid, productSku oder variantSku fehlt.", "QUERY_MISSING");
    }

    try {
      const result = await fetchCjProductByIdentifiers(identifiers);
      if (!result?.found || !result.product) {
        return res.status(404).json({
          ok: false,
          source: "cj-detail",
          status: 404,
          error: "CJ API konnte keine Produktdaten laden.",
          details: result?.errors || null,
          identifiers,
        });
      }

      return res.status(200).json({
        ok: true,
        source: action === "detail" ? "cj-detail" : "cj-product",
        status: 200,
        identifiers: result.identifiers || identifiers,
        product: result.product,
      });
    } catch (error) {
      return jsonError(res, 502, error?.message || "CJ Detail Fehler", {
        identifiers,
        ...(error?.details ? { upstream: error.details } : {}),
      });
    }
  }

  if (action !== "search") {
    return res.status(400).json({
      ok: false,
      source: "cj",
      error: `Unknown action: ${action || "(empty)"}`,
    });
  }

  const keyword = readText(req.query.keyword || req.query.q || "");
  const page = Math.max(Number(req.query.page || 1), 1);
  const size = Math.min(Math.max(Number(req.query.size || req.query.limit || 10), 1), 50);
  const rawMode = req.query.raw === "1";

  if (!keyword) {
    return jsonError(res, 400, "Query Parameter q fehlt.", "QUERY_MISSING");
  }

  try {
    if (!process.env.CJ_API_KEY && !process.env.CJ_ACCESS_TOKEN) {
      return res.status(200).json(
        sandboxSearchResponse(keyword, [], {
          source: "cj-search",
          status: 200,
          message: "CJ Suchroute ist vorbereitet. Echte API-Requests bleiben im Sicherheitsmodus defensiv und koennen spaeter erweitert werden.",
          placeholder: true,
        })
      );
    }

    const token = await getCjAccessToken();
    const cjUrl = new URL("https://developers.cjdropshipping.com/api2.0/v1/product/listV2");
    cjUrl.search = new URLSearchParams({
      page: String(page),
      size: String(size),
      keyWord: keyword,
    }).toString();

    const response = await fetch(cjUrl.toString(), {
      method: "GET",
      headers: {
        "CJ-Access-Token": token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    const { rawText, data } = await parseUpstreamResponse(response);

    if (!response.ok || data?.result === false) {
      const upstreamError = data?.message || data?.error || rawText || "CJ Produktsuche Fehler";
      return jsonError(res, response.status || 502, upstreamError, {
        upstreamStatus: response.status,
        upstreamStatusText: response.statusText || "",
        upstreamBody: data || rawText || null,
      });
    }

    if (!data) {
      return jsonError(res, 502, "CJ API lieferte keine JSON-Antwort.", {
        upstreamStatus: response.status,
        upstreamStatusText: response.statusText || "",
        upstreamBody: rawText || null,
      });
    }

    const rawProducts = extractProductList(data);
    const products = rawProducts.map(normalizeCjProduct);
    const searchProducts = rawProducts.map(toCjSearchProduct);

    return res.status(200).json({
      ok: true,
      source: "cj-search",
      status: 200,
      keyword,
      page,
      size,
      total: data.data?.total || products.length,
      count: products.length,
      products: searchProducts,
      raw: rawMode ? data : undefined,
    });
  } catch (error) {
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : (/CJ_API_KEY/.test(error?.message || "") ? 500 : 502);
    return jsonError(res, status, error?.message || "Unbekannter CJ Search Fehler", {
      ...(error?.details ? { upstream: error.details } : {}),
      hint: "Prüfe CJ_API_KEY und die CJ API-Erreichbarkeit.",
    });
  }
}
