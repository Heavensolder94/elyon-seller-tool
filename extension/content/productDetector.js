const OVERLAY_ID = "elyon-browser-os-overlay";
const COMMAND_BAR_ID = "elyon-browser-os-command-bar";
let commandBarVisible = false;
let mutationObserver = null;
let refreshTimer = null;
let overlayPosition = { left: null, top: null };
let draggingOverlay = false;
let dragOffset = { x: 0, y: 0 };
let lastOverlayScrollTop = 0;
let dismissedOverlayUrl = "";
let overlayEnabled = true;

function safeText(value) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  return text.trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function decodeHtmlEntities(value) {
  const text = safeText(value);
  if (!text) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return safeText(textarea.value || text);
}

function readableText(value) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getDomain(url = location.href) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getSupplier(domain) {
  if (domain.includes("ebay.")) return "eBay";
  if (domain.includes("amazon.")) return "Amazon";
  if (domain.includes("aliexpress")) return "AliExpress";
  if (domain.includes("cjdropshipping")) return "CJ Dropshipping";
  if (domain.includes("temu")) return "Temu";
  if (domain.includes("bigbuy.")) return "BigBuy";
  if (domain.includes("vidaxl.") || domain.includes("dropshippingxl")) return "vidaXL";
  return "Unknown";
}

function getProductType(domain, url = location.href) {
  const source = `${domain} ${url}`.toLowerCase();
  if (source.includes("/itm/") || source.includes("/dp/") || source.includes("/gp/") || source.includes("/product")) return "product";
  return "page";
}

function getCurrencyFromText(text) {
  const value = safeText(text);
  if (/\u20ac/.test(value) || /\bEUR\b/i.test(value) || /\bEuro\b/i.test(value)) return "EUR";
  if (/\$/.test(value)) return "USD";
  if (/£/.test(value) || /\bGBP\b/i.test(value)) return "GBP";
  if (/¥/.test(value) || /\bJPY\b/i.test(value)) return "JPY";
  return null;
}

function normalizePriceText(text) {
  const value = safeText(text).replace(/\s+/g, " ");
  const priceMatch = value.match(/(?:\u20ac|eur|euro|usd|gbp|jpy)?\s*[\d.,]+(?:\s*(?:\u20ac|eur|euro|usd|gbp|jpy))?/i);
  return priceMatch ? safeText(priceMatch[0]) : value;
}

function extractPriceFromText(text) {
  const value = safeText(text);
  if (!value) return "";
  const candidates = [
    value,
    normalizePriceText(value),
    value.replace(/[^\d.,\u20ac$£¥EURGBPJPY ]/gi, " ")
  ];
  for (const candidate of candidates) {
    const match = candidate.match(/(?:\u20ac|eur|euro|usd|gbp|jpy)?\s*[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})?\s*(?:\u20ac|eur|euro|usd|gbp|jpy)?/i);
    if (match && safeText(match[0])) {
      return safeText(match[0]).replace(/\s+/g, " ");
    }
  }
  return "";
}

function normalizePriceCurrency(priceText, fallbackCurrency = "") {
  let price = safeText(priceText);
  let currency = fallbackCurrency || getCurrencyFromText(price) || "";
  if (!price) return { price: "", currency };
  price = price
    .replace(/\b(EUR|Euro)\b/gi, "")
    .replace(/\b(USD|GBP|JPY)\b/gi, "")
    .replace(/[$£¥€]/g, "")
    .trim();
  const match = price.match(/[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|[\d]+/);
  price = match ? match[0].replace(/\s+/g, "") : price;
  return { price, currency };
}

function pickMeta(selectors, root = document) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const value = safeText(node?.content || node?.textContent || node?.getAttribute?.("content"));
    if (value) return value;
  }
  return "";
}

function queryText(selectors, root = document) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const value = safeText(node?.content || node?.textContent);
    if (value) return value;
  }
  return "";
}

function queryLongText(selectors, root = document, maxParts = 8) {
  const parts = [];
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      const value = readableText(node?.innerText || node?.textContent || node?.content || "");
      if (value && value.length > 20) parts.push(value);
    });
  }
  return uniqueList(parts, maxParts).join("\n\n");
}

function uniqueReadableList(values, max = 20) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = limitDescription(value);
    if (!text) continue;
    const key = safeText(text).toLowerCase().slice(0, 300);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= max) break;
  }
  return result;
}

function queryAttr(selectors, attr, root = document) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const value = safeText(node?.getAttribute?.(attr));
    if (value) return value;
  }
  return "";
}

function uniqueList(values, max = 20) {
  return Array.from(new Set(values.map((value) => safeText(value)).filter(Boolean))).slice(0, max);
}

function queryAllText(selectors, root = document, max = 20) {
  const values = [];
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      const text = safeText(node?.textContent || node?.getAttribute?.("aria-label") || node?.getAttribute?.("title"));
      if (text) values.push(text);
    });
  }
  return uniqueList(values, max);
}

function normalizeImageUrl(value) {
  const text = decodeHtmlEntities(value);
  if (!text || /^data:/i.test(text) || /^blob:/i.test(text)) return "";
  const first = text.split(/\s+/)[0];
  try {
    const url = new URL(first, location.href);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isLikelyProductImage(url) {
  const value = String(url || "").toLowerCase();
  if (!/^https?:\/\//i.test(value)) return false;
  if (/\.(svg|gif)(\?|$)/i.test(value)) return false;
  if (/sprite|icon|logo|avatar|badge|pixel|tracking|transparent|placeholder|loading|spinner|grey-pixel|blank/i.test(value)) return false;
  if (/\/(nav|header|footer|banner|ads?|advertising)\//i.test(value)) return false;
  return /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(value) || /images|media|alicdn|ssl-images-amazon|m\.media-amazon|i\.ebayimg|ae01\.alicdn|sc04\.alicdn/i.test(value);
}

function imageScore(url, img) {
  const value = String(url || "").toLowerCase();
  let score = 0;
  if (/og:image|main|landing|hero|large|hires|product|gallery|imageblock|imgtagwrapper|magnifier/i.test(`${img?.id || ""} ${img?.className || ""} ${img?.parentElement?.className || ""}`)) score += 80;
  if (/m\.media-amazon|ssl-images-amazon|i\.ebayimg|alicdn|ae01\.alicdn|sc04\.alicdn|temu/i.test(value)) score += 60;
  if (/\/images\/i\/|\/kf\/|\/imgextra\/|s-l\d+|ul\d+|ac_sl|ac_sx|ac_sy/i.test(value)) score += 35;
  const width = Number(img?.naturalWidth || img?.width || img?.getAttribute?.("width") || 0);
  const height = Number(img?.naturalHeight || img?.height || img?.getAttribute?.("height") || 0);
  if (width >= 250 && height >= 250) score += 45;
  else if (width >= 120 && height >= 120) score += 20;
  if (/thumb|thumbnail|sprite|logo|icon|avatar|badge/i.test(value)) score -= 30;
  return score;
}

function limitDescription(text) {
  const value = readableText(text);
  if (!value) return "";
  return value.slice(0, 50000);
}

function cleanAvailabilityText(text) {
  let value = safeText(text);
  if (!value) return "";
  value = value.replace(/\{[\s\S]*$/, "").trim();
  value = value.replace(/\[[\s\S]*$/, "").trim();
  value = value.replace(/"\s*,?\s*".*$/g, "").trim();
  value = value.replace(/\b(isInternal|showInsightsHub|isRobot|showFaceout|merchantId|availableBadges|loggedIn|asin|showBadge|ingressFaceout|availableFaceouts)\b[\s\S]*$/i, "").trim();
  value = value.replace(/\s{2,}/g, " ");
  return value.slice(0, 160);
}

function getJsonLdDescription() {
  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "{}");
      const entries = Array.isArray(data) ? data : [data];
      const queue = [...entries];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const type = Array.isArray(item["@type"]) ? item["@type"].join(" ") : item["@type"];
        if (String(type || "").toLowerCase().includes("product") && item.description) {
          return limitDescription(item.description);
        }
        for (const value of Object.values(item)) {
          if (Array.isArray(value)) queue.push(...value);
          else if (value && typeof value === "object") queue.push(value);
        }
      }
    } catch {
      // Ignore invalid structured data from marketplace pages.
    }
  }
  return "";
}

function stripHtml(value) {
  const text = String(value || "");
  if (!text) return "";
  const container = document.createElement("div");
  container.innerHTML = text;
  return readableText(container.innerText || container.textContent || text.replace(/<[^>]+>/g, " "));
}

function isUsefulDescriptionText(value) {
  const text = safeText(value);
  if (text.length < 35) return false;
  if (text.length > 8000) return false;
  if (/^\s*[\[{]/.test(text)) return false;
  if (/(captcha|verify you are human|access denied|enable javascript|cookie|privacy policy|dispute policy|newsletter|login|sign in|terms of use|return policy|refund policy|shipping policy|customer service|help center)/i.test(text)) return false;
  if (/^(home|cart|account|search|share|follow|reviews?|rating)$/i.test(text)) return false;
  if (/add to cart|buy now|customers also|similar products|sponsored|recently viewed|recommended|bewertungen|kunden kauften|frequently bought|people also|compare with similar|advertisement/i.test(text)) return false;
  if (/(var |window\.|__NEXT_DATA__|webpack|function\(|merchantId|availableBadges|showFaceout|csrf|session|token)/i.test(text)) return false;
  const uiWordMatches = text.match(/\b(home|shop|cart|login|account|wishlist|share|policy|privacy|terms|help|support|search|filter|sort|recommended|sponsored)\b/gi) || [];
  if (uiWordMatches.length >= 5) return false;
  return true;
}

function descriptionScore(value) {
  const text = safeText(value);
  let score = Math.min(text.length, 4000);
  if (/feature|benefit|description|specification|details|material|package|includes|bullet|product|about this item|info zu diesem artikel|artikelbeschreibung/i.test(text)) score += 700;
  if (/cookie|newsletter|login|recommended|similar items|customers also|policy|support|cart|buy now/i.test(text)) score -= 1800;
  if (/^\s*[\[{]/.test(text)) score -= 2500;
  return score;
}

function trimAfterDescriptionStopBlocks(value) {
  const text = readableText(value);
  if (!text) return "";
  const stopPatterns = [
    /^kundenrezensionen\b/i,
    /^customer reviews\b/i,
    /^bewertungen\b/i,
    /^rezensionen\b/i,
    /^fragen und antworten\b/i,
    /^customer questions\b/i,
    /^ähnliche produkte\b/i,
    /^similar products\b/i,
    /^sponsored\b/i,
    /^gesponsert\b/i,
    /^kunden kauften auch\b/i,
    /^customers also bought\b/i,
    /^häufig zusammen gekauft\b/i,
    /^frequently bought together\b/i,
    /^versand\b/i,
    /^shipping\b/i,
    /^rückgabe\b/i,
    /^returns?\b/i,
    /^verkäuferinformationen\b/i,
    /^seller information\b/i,
    /^shop\b/i,
    /^store\b/i,
    /^empfohlen\b/i,
    /^recommended\b/i
  ];
  const lines = text.split(/\n+/);
  const kept = [];
  for (const line of lines) {
    const cleanLine = safeText(line);
    if (!cleanLine) continue;
    if (kept.length && stopPatterns.some((pattern) => pattern.test(cleanLine))) break;
    kept.push(cleanLine);
  }
  return kept.join("\n");
}

function removeRepeatedUiLines(value) {
  const lines = readableText(value).split(/\n+/);
  const seen = new Map();
  const kept = [];
  for (const line of lines) {
    const text = safeText(line);
    if (!text) continue;
    if (/^(share|teilen|follow|folgen|add to cart|buy now|in den warenkorb|jetzt kaufen|wishlist|merken)$/i.test(text)) continue;
    const key = text.toLowerCase();
    const count = seen.get(key) || 0;
    if (count >= 1 && text.length < 120) continue;
    seen.set(key, count + 1);
    kept.push(text);
  }
  return kept.join("\n");
}

function keepBestDescriptionParagraphs(value) {
  const text = readableText(value);
  if (!text) return "";
  const paragraphs = text.split(/\n{2,}|\n(?=[A-ZÄÖÜ0-9][^:\n]{0,80}:)/).map(safeText).filter(Boolean);
  const good = paragraphs.filter((part) => {
    if (part.length < 25) return false;
    if (/^(price|preis|rating|bewertung|reviews?|sold|verkauft|shipping|versand|return|rückgabe)\b/i.test(part)) return false;
    if (/(add to cart|buy now|similar products|sponsored|recommended|customer reviews|kundenrezensionen)/i.test(part)) return false;
    return true;
  });
  return (good.length ? good : paragraphs).slice(0, 10).join("\n\n");
}

function cleanDescriptionText(value) {
  let text = readableText(stripHtml(value));
  if (!text) return "";
  text = text
    .replace(/\b(Show more|Show less|Mehr anzeigen|Weniger anzeigen|Weitere Produktdetails|See more product details)\b/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  text = trimAfterDescriptionStopBlocks(text);
  text = removeRepeatedUiLines(text);
  text = keepBestDescriptionParagraphs(text);
  return isUsefulDescriptionText(text) ? limitDescription(text) : "";
}

function collectDescriptionSelectorText(selectors, root = document, maxParts = 18) {
  const parts = [];
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      const rect = node.getBoundingClientRect?.();
      const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      const hidden = style && (style.display === "none" || style.visibility === "hidden");
      const tiny = rect && rect.width <= 1 && rect.height <= 1;
      if (hidden || tiny) return;
      const text = cleanDescriptionText(node?.innerText || node?.textContent || node?.content || "");
      if (text) parts.push(text);
    });
  }
  return uniqueReadableList(parts.sort((a, b) => descriptionScore(b) - descriptionScore(a)), maxParts);
}

function sectionTextFromHeadingPatterns(patterns, root = document) {
  const parts = [];
  const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,legend,summary,button,[role='heading'],[class*='title'],[class*='heading']"));
  headings.forEach((heading) => {
    const label = safeText(heading.innerText || heading.textContent || heading.getAttribute?.("aria-label") || "");
    if (!label || !patterns.some((pattern) => pattern.test(label))) return;
    const containers = [
      heading.closest("section"),
      heading.closest("[class*='section']"),
      heading.closest("[class*='panel']"),
      heading.closest("[class*='tab']"),
      heading.parentElement,
      heading.parentElement?.parentElement
    ].filter(Boolean);
    for (const container of containers) {
      const text = cleanDescriptionText(container.innerText || container.textContent || "");
      if (text) {
        parts.push(text);
        break;
      }
    }
  });
  return uniqueReadableList(parts, 8);
}

function getAboutThisItemText() {
  const selectors = [
    "#feature-bullets",
    "#featurebullets_feature_div",
    "[data-feature-name='featurebullets']",
    ".vim.x-about-this-item",
    "[data-testid='x-about-this-item']",
    "[data-testid*='about-this-item']",
    "[class*='about-this-item']"
  ];
  const direct = collectDescriptionSelectorText(selectors, document, 6);
  const headed = sectionTextFromHeadingPatterns([
    /info\s+zu\s+diesem\s+artikel/i,
    /about\s+this\s+item/i,
    /artikelmerkmale/i,
    /item\s+specifics/i
  ]);
  return uniqueReadableList([...direct, ...headed], 8);
}

function getProductDescriptionText() {
  const selectors = [
    "#productDescription",
    "#productDescription_feature_div",
    "#aplus",
    "#aplus_feature_div",
    "#desc_div",
    "#j-product-description",
    "#product-description",
    "#itemDescription",
    "[data-pl='product-description']",
    "[data-widget-type='productDescription']",
    "[data-feature-name='productDescription']",
    "[data-feature-name='aplus']",
    "[class*='product-description']",
    "[class*='ProductDescription']"
  ];
  const direct = collectDescriptionSelectorText(selectors, document, 8);
  const headed = sectionTextFromHeadingPatterns([
    /^produktbeschreibung$/i,
    /^artikelbeschreibung$/i,
    /^beschreibung$/i,
    /^description$/i,
    /product\s+description/i
  ]);
  return uniqueReadableList([...direct, ...headed, ...getFrameDescriptionText()], 10);
}

function getItemSpecificsText() {
  const selectors = [
    "#productOverview_feature_div",
    "#detailBullets_feature_div",
    "#productDetails_feature_div",
    "#productDetails_db_sections",
    "#productDetails_techSpec_section_1",
    "#productDetails_detailBullets_sections1",
    "#viTabs_0_is",
    "[data-feature-name='productOverview']",
    "[data-feature-name='productDetails']",
    "[data-pl='product-specs']",
    "[class*='specification']",
    "[class*='Specification']",
    "[class*='attribute']",
    "[class*='Attribute']"
  ];
  const direct = collectDescriptionSelectorText(selectors, document, 8);
  const headed = sectionTextFromHeadingPatterns([
    /^artikelangaben$/i,
    /^artikeldetails$/i,
    /^produktdetails$/i,
    /^technische\s+details$/i,
    /^spezifikationen$/i,
    /^specifications$/i,
    /^product\s+details$/i,
    /^item\s+specifics$/i
  ]);
  return uniqueReadableList([...direct, ...headed], 10);
}

function getFrameDescriptionText() {
  const parts = [];
  Array.from(document.querySelectorAll("iframe")).slice(0, 8).forEach((frame) => {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;
      const text = cleanDescriptionText(doc.body?.innerText || doc.body?.textContent || "");
      if (text) parts.push(text);
    } catch {
      // Cross-origin description frames cannot be read by the extension on every marketplace.
    }
  });
  return uniqueReadableList(parts, 4);
}

function getEmbeddedProductText() {
  const usefulKeys = /^(description|desc|productDescription|productDesc|longDescription|shortDescription|detail|details|specification|specifications|productDetails|productInfo|features|featureBullets|bulletPoints|sellingPoints|packingList|attributes|props)$/i;
  const blockedKeys = /^(url|image|img|icon|logo|sku|id|token|cookie|href|src)$/i;
  const values = [];
  const seen = new Set();

  function pushValue(value) {
    const text = cleanDescriptionText(value);
    if (!text) return;
    const key = text.slice(0, 300);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(text);
  }

  function walk(value, key = "", depth = 0) {
    if (depth > 8 || value == null) return;
    if (typeof value === "string") {
      if (usefulKeys.test(key) || (value.includes("<") && /description|detail|spec|feature/i.test(value))) {
        pushValue(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach((entry) => walk(entry, key, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    Object.entries(value).forEach(([nextKey, nextValue]) => {
      if (blockedKeys.test(nextKey)) return;
      walk(nextValue, nextKey, depth + 1);
    });
  }

  Array.from(document.querySelectorAll("script")).forEach((script) => {
    const raw = script.textContent || "";
    if (!raw || !/description|productDesc|productDescription|specification|productDetails|productInfo/i.test(raw)) return;

    if (script.type === "application/json" || script.id === "__NEXT_DATA__") {
      try {
        walk(JSON.parse(raw));
      } catch {
        // Some shops ship malformed embedded data; regex fallback below still helps.
      }
    }

    const patterns = [
      /"(?:description|productDescription|productDesc|desc|specification|productDetails|productInfo)"\s*:\s*"((?:\\.|[^"\\]){30,})"/gi,
      /'(?:description|productDescription|productDesc|desc|specification|productDetails|productInfo)'\s*:\s*'((?:\\.|[^'\\]){30,})'/gi
    ];
    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(raw)) && values.length < 12) {
        try {
          pushValue(JSON.parse('"' + match[1].replace(/"/g, '\\"') + '"'));
        } catch {
          pushValue(match[1]);
        }
      }
    });
  });

  return uniqueReadableList(values.map(limitDescription).filter((text) => safeText(text).length <= 6000), 4).join("\n\n");
}

function getCjDescription() {
  const selectors = [
    "#product-detail",
    "#productDetail",
    "#product-description",
    "#description",
    "#specification",
    "[class*='product-detail']",
    "[class*='productDetail']",
    "[class*='product-description']",
    "[class*='ProductDescription']",
    "[class*='goods-description']",
    "[class*='goodsDescription']",
    "[class*='description-content']",
    "[class*='DescriptionContent']",
    "[class*='specification']",
    "[class*='Specification']",
    "[class*='detail-content']",
    "[class*='detailContent']",
    "[class*='goods-detail']",
    "[class*='goodsDetail']",
    "[class*='module-detail']",
    "[class*='tab-content']",
    "[class*='tabContent']"
  ];
  const visibleText = collectDescriptionSelectorText(selectors, document, 14).join("\n\n");
  const embeddedText = getEmbeddedProductText();
  const combined = [visibleText, embeddedText]
    .map(limitDescription)
    .filter(Boolean)
    .join("\n\n");
  return limitDescription(combined);
}

function getTitle() {
  const domain = getDomain();
  const pageTitle = queryText([
    "#productTitle",
    "h1[data-testid*='title']",
    "h1[class*='title']",
    "[data-pl='product-title']",
    ".x-item-title__mainTitle",
    ".x-item-title span",
    "h1"
  ]);
  const metaTitle = pickMeta(["meta[property='og:title']", "meta[name='twitter:title']", "meta[name='title']"]) || safeText(document.title);
  let title = pageTitle || metaTitle;
  if (/amazon\./i.test(domain)) {
    title = title.replace(/\s*:\s*Amazon\.[^:]+(?::.*)?$/i, "").trim();
  }
  if (/aliexpress/i.test(domain)) {
    title = title.replace(/\s*-\s*AliExpress.*$/i, "").trim();
  }
  return title;
}

function getPrice() {
  const direct = pickMeta([
    "meta[property='product:price:amount']",
    "meta[property='og:price:amount']",
    "meta[name='price']"
  ]);
  const fields = [
    direct,
    document.querySelector(".a-price .a-offscreen")?.textContent,
    document.querySelector("#corePriceDisplay_desktop_feature_div .a-offscreen")?.textContent,
    document.querySelector("#priceblock_ourprice")?.textContent,
    document.querySelector("#priceblock_dealprice")?.textContent,
    document.querySelector("[itemprop='price']")?.content,
    document.querySelector("[class*='price']")?.textContent,
    document.querySelector("[data-testid*='price']")?.textContent,
    document.querySelector("[aria-label*='price']")?.getAttribute("aria-label"),
    document.querySelector("[class*='price'] [class*='value']")?.textContent,
    document.querySelector("[class*='price'] [class*='amount']")?.textContent
  ];
  for (const field of fields) {
    const extracted = extractPriceFromText(field);
    if (extracted) return extracted;
  }
  return "";
}

function getImage() {
  return normalizeImageUrl(pickMeta(["meta[property='og:image']", "meta[name='twitter:image']", "meta[property='twitter:image']"]) || "");
}

function getImages() {
  const candidates = [];
  const metaImage = getImage();
  if (metaImage) candidates.push({ url: metaImage, score: 200 });

  const prioritySelectors = [
    "#landingImage",
    "#imgBlkFront",
    "#main-image",
    "#icImg",
    "[data-old-hires]",
    "[data-a-dynamic-image]",
    "[class*='imageBlock'] img",
    "[class*='gallery'] img",
    "[class*='product'] img",
    "[class*='main'] img",
    "[class*='image'] img"
  ];

  document.querySelectorAll(prioritySelectors.join(",")).forEach((img) => {
    const dynamic = img.getAttribute("data-a-dynamic-image");
    if (dynamic) {
      try {
        Object.keys(JSON.parse(dynamic)).forEach((src) => candidates.push({ url: normalizeImageUrl(src), score: imageScore(src, img) + 90 }));
      } catch {
        // Ignore malformed marketplace attributes.
      }
    }
    [
      img.currentSrc,
      img.src,
      img.getAttribute("data-old-hires"),
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("srcset")?.split(",").pop()?.trim()?.split(/\s+/)[0]
    ].forEach((src) => candidates.push({ url: normalizeImageUrl(src), score: imageScore(src, img) + 50 }));
  });

  document.querySelectorAll("img").forEach((img) => {
    [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("srcset")?.split(",").pop()?.trim()?.split(/\s+/)[0]
    ].forEach((src) => candidates.push({ url: normalizeImageUrl(src), score: imageScore(src, img) }));
  });

  const byUrl = new Map();
  candidates
    .filter((item) => item.url && isLikelyProductImage(item.url))
    .forEach((item) => {
      const current = byUrl.get(item.url);
      if (!current || item.score > current.score) byUrl.set(item.url, item);
    });

  return Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url)
    .slice(0, 12);
}

function getNumberFromText(text) {
  const match = safeText(text).match(/[\d.,]+/);
  if (!match) return "";
  return match[0];
}

function getRating() {
  return getNumberFromText(queryText([
    "[class*='rating']",
    "[class*='star']",
    "[aria-label*='star']",
    "[aria-label*='Stern']"
  ]));
}

function getReviewsCount() {
  return getNumberFromText(queryText([
    "[class*='review']",
    "[id*='review']",
    "[data-testid*='review']",
    "[aria-label*='review']",
    "[aria-label*='Bewertung']"
  ]));
}

function getSoldCount() {
  return getNumberFromText(queryText([
    "[class*='sold']",
    "[class*='order']",
    "[data-testid*='sold']"
  ]));
}

function getAvailability() {
  return cleanAvailabilityText(queryText([
    "#availability",
    "#availability span",
    "#outOfStock",
    "[class*='availability']",
    "[class*='stock']",
    "[data-testid*='availability']",
    "[data-testid*='stock']"
  ]) || "");
}

function getCategory() {
  return pickMeta(["meta[property='product:category']", "meta[name='category']"]) || queryText([
    "[class*='breadcrumb']",
    "nav[aria-label*='breadcrumb']",
    "[data-testid*='breadcrumb']"
  ]);
}

function getVariants() {
  const labels = queryAllText([
    "[class*='sku']",
    "[class*='variant']",
    "[class*='option']",
    "[data-testid*='variant']",
    "[aria-label*='Color']",
    "[aria-label*='Farbe']",
    "[aria-label*='Size']",
    "[aria-label*='Größe']"
  ], document, 30);
  return labels
    .filter((text) => text.length <= 160 && !/cookie|login|newsletter/i.test(text))
    .slice(0, 20)
    .map((label) => ({ label }));
}

function getShipping() {
  const text = queryText([
    "[class*='shipping']",
    "[class*='delivery']",
    "[class*='logistic']",
    "[data-testid*='shipping']",
    "[data-testid*='delivery']",
    "[aria-label*='shipping']",
    "[aria-label*='delivery']",
    "[aria-label*='Versand']",
    "[aria-label*='Liefer']"
  ]);
  return {
    text,
    cost: extractPriceFromText(text) || "",
    deliveryTime: safeText(text.match(/(\d+\s*[-–]\s*\d+|\d+)\s*(tage|days|werktage|wochen|weeks)/i)?.[0] || ""),
    shipsFrom: queryText(["[class*='ship-from']", "[class*='shipsFrom']", "[data-testid*='ship-from']"])
  };
}

function getProductDetails() {
  const details = {};
  const rows = Array.from(document.querySelectorAll("tr, li, dl, [class*='spec'], [class*='attribute'], [class*='detail']"));
  for (const row of rows.slice(0, 80)) {
    const text = safeText(row.textContent);
    const match = text.match(/^([^:：]{2,45})[:：]\s*(.{1,180})$/);
    if (match) details[safeText(match[1])] = safeText(match[2]);
  }
  for (const key of ["Brand", "Marke", "Material", "Maße", "Dimensions", "Weight", "Gewicht", "EAN", "GTIN", "MPN"]) {
    if (!details[key]) {
      const found = queryText([`[aria-label*='${key}']`, `[class*='${key.toLowerCase()}']`]);
      if (found && found.length < 180) details[key] = found;
    }
  }
  return details;
}

function getSupplierInfo(domain, supplier) {
  return {
    name: supplier,
    domain,
    shopName: queryText(["[class*='store-name']", "[class*='shop-name']", "[class*='seller']", "[data-testid*='seller']"]),
    rating: getNumberFromText(queryText(["[class*='seller'] [class*='rating']", "[class*='store'] [class*='rating']"])),
    location: queryText(["[class*='seller-location']", "[class*='store-location']", "[class*='ship-from']"])
  };
}

function getComplianceRisks(text) {
  const value = String(text || "").toLowerCase();
  const risks = [
    ["battery", "Akku/Batterie"],
    ["batterie", "Akku/Batterie"],
    ["akku", "Akku/Batterie"],
    ["usb", "Elektro/WEEE"],
    ["electric", "Elektro/WEEE"],
    ["elektr", "Elektro/WEEE"],
    ["ce ", "CE prüfen"],
    ["medical", "Medizinprodukt"],
    ["medizin", "Medizinprodukt"],
    ["cosmetic", "Kosmetik"],
    ["kosmetik", "Kosmetik"],
    ["food", "Lebensmittel"],
    ["lebensmittel", "Lebensmittel"],
    ["kid", "Kinderprodukt"],
    ["baby", "Kinderprodukt"],
    ["toy", "Spielzeug"],
    ["spielzeug", "Spielzeug"],
    ["brand", "Marke/Design prüfen"],
    ["logo", "Marke/Design prüfen"]
  ];
  return uniqueList(risks.filter(([needle]) => value.includes(needle)).map(([, label]) => label), 12);
}

function getDescription() {
  return getDescriptionData().text;
}

function getDescriptionData() {
  const structured = getJsonLdDescription();
  const cjDescription = /cjdropshipping/i.test(getDomain()) ? getCjDescription() : "";
  const primaryCandidates = uniqueReadableList([
    ...getAboutThisItemText(),
    ...getProductDescriptionText(),
    ...getItemSpecificsText(),
    structured,
    cjDescription,
    pickMeta(["meta[property='og:description']", "meta[name='description']"])
  ].filter(Boolean), 20)
    .map(cleanDescriptionText)
    .filter(Boolean)
    .sort((a, b) => descriptionScore(b) - descriptionScore(a));

  const candidates = primaryCandidates.filter((text) => {
    const title = safeText(getTitle()).toLowerCase();
    if (!title || title.length < 12) return true;
    const words = title.split(/\s+/).filter((word) => word.length >= 4).slice(0, 8);
    if (!words.length) return true;
    return words.some((word) => text.toLowerCase().includes(word)) || /material|features?|beschreibung|description|specification|details|package|includes|product/i.test(text);
  });

  const combined = uniqueReadableList(candidates, 6).join("\n\n");
  if (combined && combined.length > 40) {
    return {
      text: limitDescription(combined),
      candidates: candidates.slice(0, 8),
      source: "page_description_candidates"
    };
  }

  return { text: "", candidates: [], source: "not_found" };
}

function expandProductInformationSections(root = document) {
  // Deprecated on purpose: no automatic marketplace UI clicks during scanning.
  return { attempted: 0, opened: 0, blocked: 0, changedUrl: false };
}

function isSafeDetailTrigger(node) {
  const tagName = String(node?.tagName || "").toLowerCase();
  const href = safeText(node?.getAttribute?.("href"));
  if (!node || tagName === "a" || href) return false;
  if (!["button", "summary"].includes(tagName) && node.getAttribute?.("role") !== "button") return false;

  const label = safeText([
    node.textContent,
    node.getAttribute?.("aria-label"),
    node.getAttribute?.("title"),
    node.getAttribute?.("data-action")
  ].filter(Boolean).join(" "));
  if (!label || label.length > 90) return false;
  if (/cart|basket|buy|checkout|order|login|sign in|register|chat|message|contact|support|wishlist|favorite|share|coupon|policy|privacy|terms|dispute|refund|return|shipping policy|cookie/i.test(label)) return false;
  if (!/(info zu diesem artikel|artikelangaben|artikelbeschreibung|produktbeschreibung|description|beschreibung|details?|produktdetails|product details|item specifics|specification|specs|technical|overview|more|mehr anzeigen|show more|read more)/i.test(label)) return false;

  const rect = node.getBoundingClientRect?.();
  const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
  return Boolean(rect && rect.width > 0 && rect.height > 0 && (!style || style.visibility !== "hidden" && style.display !== "none"));
}

async function openDetailsWithUserConsent() {
  return {
    attempted: 0,
    opened: 0,
    blocked: 0,
    changedUrl: false,
    disabled: true
  };
}

function isSupportedPage(domain) {
  return /(^|\.)ebay\./i.test(domain) || /(^|\.)amazon\./i.test(domain) || /aliexpress/i.test(domain) || /cjdropshipping/i.test(domain) || /temu/i.test(domain) || /bigbuy\./i.test(domain) || /vidaxl\./i.test(domain) || /dropshippingxl/i.test(domain);
}

function isAliExpress(domain) {
  return /aliexpress/i.test(domain);
}

function isAliExpressProductPage(url = location.href, root = document) {
  const value = String(url || "").toLowerCase();
  if (!value.includes("aliexpress")) return false;
  if (value.includes("/item/")) return true;
  return Boolean(
    root.querySelector("[data-pl='product-title'], h1, [class*='product-title']") &&
    root.querySelector("[data-pl='product-price'], [class*='price'], [class*='sku'], [class*='variant']")
  );
}

function isProductPageLike(url = location.href, root = document) {
  const domain = getDomain(url);
  if (isAliExpressProductPage(url, root)) return true;
  const value = String(url || "").toLowerCase();
  if (/amazon\./i.test(domain) && (/\/dp\/|\/gp\/product\//i.test(value) || root.querySelector("#productTitle"))) return true;
  if (/ebay\./i.test(domain) && (/\/itm\//i.test(value) || root.querySelector(".x-item-title__mainTitle"))) return true;
  if (/cjdropshipping/i.test(domain) && (/\/product/i.test(value) || root.querySelector("[class*='product'] h1, h1"))) return true;
  if (/temu\./i.test(domain) && (root.querySelector("h1, [class*='goods'], [class*='sku'], [class*='variant']"))) return true;
  if (/bigbuy\.|vidaxl\.|dropshippingxl/i.test(domain) && root.querySelector("h1, [class*='product']")) return true;
  return Boolean(root.querySelector("script[type='application/ld+json']") && root.querySelector("h1"));
}

function findVisiblePopup(root = document) {
  const candidates = Array.from(
    root.querySelectorAll("[role='dialog'], [aria-modal='true'], [class*='popup'], [class*='modal'], [class*='drawer'], [class*='overlay']")
  );
  return candidates.find((node) => {
    const text = safeText(node.textContent);
    const rect = node.getBoundingClientRect?.();
    const visible = rect && rect.width > 180 && rect.height > 120;
    return text && visible;
  }) || null;
}

function getAliExpressPopupData(root = document) {
  const title = queryText(["[class*='product-title']", "[class*='title']", "[data-pl='product-title']", "h1"], root);
  const price = queryText(["[class*='price']", "[data-pl='product-price']", "[class*='product-price']"], root);
  const image = normalizeImageUrl(queryAttr(["img", "[class*='image'] img", "[class*='gallery'] img"], "src", root));
  const description = collectDescriptionSelectorText([
    "[data-pl='product-description']",
    "[class*='product-description']",
    "[class*='description-content']",
    "[class*='product-detail']",
    "[class*='ProductDetail']"
  ], root, 6).join("\n\n");
  return { title, price, image, description };
}

function isVisibleElement(node) {
  const rect = node?.getBoundingClientRect?.();
  const style = node && window.getComputedStyle ? window.getComputedStyle(node) : null;
  return Boolean(node && rect && rect.width > 4 && rect.height > 4 && (!style || (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0")));
}

function isDangerousActionNode(node) {
  const label = safeText([
    node?.textContent,
    node?.getAttribute?.("aria-label"),
    node?.getAttribute?.("title"),
    node?.getAttribute?.("data-action"),
    node?.getAttribute?.("href")
  ].filter(Boolean).join(" ")).toLowerCase();
  return /buy now|add to cart|checkout|order|payment|pay now|warenkorb|jetzt kaufen|kaufen|bestellen|zur kasse|login|sign in|message|chat|contact|coupon|wishlist|favorite|share/i.test(label);
}

function isDisabledVariantNode(node) {
  const value = safeText([
    node?.getAttribute?.("aria-disabled"),
    node?.getAttribute?.("disabled"),
    node?.className,
    node?.getAttribute?.("class")
  ].filter(Boolean).join(" ")).toLowerCase();
  return /true|disabled|disable|soldout|sold-out|unavailable|not-available|out-of-stock|sku-property-item-disabled/i.test(value);
}

function getVariantOptionLabel(node) {
  const imageAlt = queryText(["img"], node);
  return safeText(
    node?.getAttribute?.("title") ||
    node?.getAttribute?.("aria-label") ||
    node?.getAttribute?.("data-title") ||
    node?.getAttribute?.("data-value") ||
    imageAlt ||
    node?.innerText ||
    node?.textContent ||
    ""
  ).replace(/\b(selected|ausgewählt|nicht verfügbar|unavailable)\b/gi, "").trim();
}

function getVariantOptionImage(node) {
  return normalizeImageUrl(
    node?.querySelector?.("img")?.currentSrc ||
    node?.querySelector?.("img")?.src ||
    node?.querySelector?.("img")?.getAttribute?.("data-src") ||
    node?.style?.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/i)?.[1] ||
    ""
  );
}

function getAliExpressVariantContainers(root = document) {
  const selectors = [
    "[class*='sku']",
    "[class*='Sku']",
    "[class*='variant']",
    "[class*='Variant']",
    "[data-pl*='sku']",
    "[data-pl*='variant']",
    "[class*='product-property']",
    "[class*='ProductProperty']"
  ];
  return Array.from(root.querySelectorAll(selectors.join(",")))
    .filter((node) => isVisibleElement(node) && safeText(node.textContent).length >= 2)
    .slice(0, 20);
}

function getGenericVariantContainers(root = document) {
  const selectors = [
    "#variation_color_name",
    "#variation_size_name",
    "[id^='variation_']",
    ".variation",
    ".a-row.a-spacing-small",
    "[data-testid*='variation']",
    "[data-testid*='variant']",
    "[class*='variation']",
    "[class*='Variation']",
    "[class*='variant']",
    "[class*='Variant']",
    "[class*='sku']",
    "[class*='Sku']",
    "[class*='swatch']",
    "[class*='Swatch']",
    "[class*='option']",
    "[class*='Option']",
    "[class*='product-property']",
    "[class*='ProductProperty']"
  ];
  return Array.from(root.querySelectorAll(selectors.join(",")))
    .filter((node) => isVisibleElement(node) && safeText(node.textContent).length >= 1)
    .slice(0, 28);
}

function getVariantGroupsForPlatform(platform = detectPlatform(), root = document) {
  if (platform === "aliexpress") return getAliExpressVariantGroups(root);

  const groups = [];
  const seen = new Set();
  const containers = getGenericVariantContainers(root);
  containers.forEach((container, index) => {
    const optionNodes = Array.from(container.querySelectorAll("button, li, select option, [role='button'], [aria-checked], [aria-selected], [class*='swatch'], [class*='option'], [class*='value'], img"))
      .filter((node) => node !== container)
      .filter((node) => node.tagName?.toLowerCase() === "option" || isVisibleElement(node))
      .filter((node) => !isDangerousActionNode(node))
      .filter((node) => getVariantOptionLabel(node) || getVariantOptionImage(node))
      .slice(0, 70);
    if (!optionNodes.length) return;

    const title = safeText(
      container.querySelector("label, legend, .a-form-label, [class*='title'], [class*='name']")?.textContent ||
      container.getAttribute("aria-label") ||
      container.previousElementSibling?.textContent ||
      `Variante ${groups.length + 1}`
    ).replace(/[:：]\s*$/, "");

    const options = [];
    optionNodes.forEach((node) => {
      const label = getVariantOptionLabel(node) || getVariantOptionImage(node);
      const key = `${index}:${label}:${getVariantOptionImage(node)}`;
      if (!label || seen.has(key)) return;
      seen.add(key);
      const selectedText = safeText([node.className, node.getAttribute("aria-pressed"), node.getAttribute("aria-selected"), node.getAttribute("selected"), node.getAttribute("aria-checked")].join(" ")).toLowerCase();
      options.push({
        label,
        selected: /selected|active|current|checked|true|swatchSelect|a-button-selected/i.test(selectedText),
        disabled: isDisabledVariantNode(node),
        image: getVariantOptionImage(node) || null,
        price: parsePriceNumber(getPrice()),
        originalPrice: null,
        currency: getCurrencyFromText(getPrice()) || null,
        shippingText: getShipping().text || null,
        deliveryText: getShipping().deliveryTime || null,
        stockText: getAvailability() || null,
        _node: node
      });
    });

    if (options.length) groups.push({ name: title || `Variante ${groups.length + 1}`, options });
  });
  return groups.slice(0, 10);
}

function getAliExpressVariantGroups(root = document) {
  const groups = [];
  const seen = new Set();
  const containers = getAliExpressVariantContainers(root);

  containers.forEach((container, index) => {
    const optionNodes = Array.from(container.querySelectorAll("button, li, [role='button'], [class*='item'], [class*='option'], [class*='value'], [data-sku-col], [data-sku-row]"))
      .filter((node) => node !== container)
      .filter(isVisibleElement)
      .filter((node) => !isDangerousActionNode(node))
      .filter((node) => getVariantOptionLabel(node) || getVariantOptionImage(node))
      .slice(0, 60);
    if (!optionNodes.length) return;

    const title = safeText(
      container.querySelector("[class*='title'], [class*='name'], span")?.textContent ||
      container.getAttribute("aria-label") ||
      container.previousElementSibling?.textContent ||
      `Variante ${groups.length + 1}`
    ).replace(/[:：]\s*$/, "");

    const options = [];
    optionNodes.forEach((node) => {
      const label = getVariantOptionLabel(node) || getVariantOptionImage(node);
      const key = `${index}:${label}:${getVariantOptionImage(node)}`;
      if (!label || seen.has(key)) return;
      seen.add(key);
      const selectedText = safeText([node.className, node.getAttribute("aria-pressed"), node.getAttribute("aria-selected")].join(" ")).toLowerCase();
      options.push({
        label,
        selected: /selected|active|current|checked|true|sku-property-item-selected/i.test(selectedText),
        disabled: isDisabledVariantNode(node),
        image: getVariantOptionImage(node) || null,
        price: parsePriceNumber(getPrice()),
        originalPrice: null,
        currency: getCurrencyFromText(getPrice()) || null,
        shippingText: getShipping().text || null,
        deliveryText: getShipping().deliveryTime || null,
        stockText: getAvailability() || null,
        _node: node
      });
    });

    if (options.length) {
      groups.push({ name: title || `Variante ${groups.length + 1}`, options });
    }
  });

  return groups.slice(0, 8);
}

function stripVariantNodes(groups) {
  return groups.map((group) => ({
    name: group.name || null,
    options: (Array.isArray(group.options) ? group.options : []).map((option) => ({
      label: option.label || null,
      selected: option.selected === true,
      disabled: option.disabled === true,
      image: option.image || null,
      price: option.price ?? null,
      originalPrice: option.originalPrice ?? null,
      currency: option.currency || null,
      shippingText: option.shippingText || null,
      deliveryText: option.deliveryText || null,
      stockText: option.stockText || null
    }))
  }));
}

function getSelectedAliExpressCombination(groups) {
  const labels = [];
  groups.forEach((group) => {
    const selected = (group.options || []).find((option) => option.selected) || null;
    if (selected?.label) labels.push(selected.label);
  });
  return {
    labels,
    price: parsePriceNumber(getPrice()),
    currency: getCurrencyFromText(getPrice()) || null,
    image: getImages()[0] || null,
    shippingText: getShipping().text || null,
    deliveryText: getShipping().deliveryTime || null
  };
}

function buildAliExpressVariantDebug(groups, variantItems, manualScanned, warnings = []) {
  const optionsCount = groups.reduce((sum, group) => sum + (Array.isArray(group.options) ? group.options.length : 0), 0);
  return {
    aliexpressProductPage: isAliExpressProductPage(),
    variantAreaFound: groups.length > 0,
    variantGroupCount: groups.length,
    variantOptionCount: optionsCount,
    autoScanned: false,
    manualScanned: manualScanned === true,
    warnings,
    variantItemsCount: Array.isArray(variantItems) ? variantItems.length : 0
  };
}

function buildVariantDebug(platform, groups, variantItems, manualScanned, warnings = []) {
  const optionsCount = groups.reduce((sum, group) => sum + (Array.isArray(group.options) ? group.options.length : 0), 0);
  return {
    platform,
    productPage: isProductPageLike(),
    variantAreaFound: groups.length > 0,
    variantGroupCount: groups.length,
    variantOptionCount: optionsCount,
    autoScanned: false,
    manualScanned: manualScanned === true,
    clickScanEnabled: platform === "aliexpress",
    warnings,
    variantItemsCount: Array.isArray(variantItems) ? variantItems.length : 0
  };
}

function scanVisibleVariantsSnapshot(platform = detectPlatform()) {
  if (!isProductPageLike()) {
    const debug = buildVariantDebug(platform, [], [], true, ["Keine Produktseite erkannt"]);
    return {
      ok: false,
      message: "Keine Produktseite erkannt.",
      variants: { hasVariants: false, variantGroups: [], selectedCombination: null, variantItems: [] },
      debug
    };
  }

  const groupsWithNodes = getVariantGroupsForPlatform(platform);
  const groups = stripVariantNodes(groupsWithNodes);
  const selectedCombination = getSelectedAliExpressCombination(groupsWithNodes);
  const variantItems = groups.flatMap((group) => (group.options || []).map((option) => ({
    combinationKey: [group.name, option.label].filter(Boolean).join("|"),
    labels: [group.name, option.label].filter(Boolean),
    price: option.price ?? parsePriceNumber(getPrice()),
    currency: option.currency || getCurrencyFromText(getPrice()) || null,
    image: option.image || getImages()[0] || null,
    availability: option.stockText || getAvailability() || null,
    shippingText: option.shippingText || getShipping().text || null,
    deliveryText: option.deliveryText || getShipping().deliveryTime || null,
    capturedAt: new Date().toISOString()
  })));
  const variants = {
    hasVariants: groups.length > 0,
    variantGroups: groups,
    selectedCombination,
    variantItems: uniqueVariantItems(variantItems)
  };
  const product = mergePlatformVariantsIntoProduct(detectProduct(), variants, platform);
  const debug = buildVariantDebug(platform, groups, variants.variantItems, true, platform === "aliexpress" ? ["AliExpress Vollscan bitte mit AliExpress Scan starten."] : ["Sicherer Snapshot: keine Varianten angeklickt."]);
  product.platformVariantDebug = debug;
  product.extractionDebug = {
    ...(product.extractionDebug || {}),
    platformVariants: debug
  };
  return { ok: true, product, variants, debug, message: `${variants.variantItems.length || groups.reduce((sum, group) => sum + group.options.length, 0)} Varianten/Sichtoptionen gefunden.` };
}

async function scanAliExpressVariants() {
  if (!isAliExpressProductPage()) {
    return {
      ok: false,
      message: "Keine AliExpress Produktseite erkannt.",
      variants: { hasVariants: false, variantGroups: [], selectedCombination: null, variantItems: [] },
      debug: buildAliExpressVariantDebug([], [], true, ["Keine AliExpress Produktseite erkannt"])
    };
  }

  const beforeUrl = location.href;
  const initialGroups = getAliExpressVariantGroups();
  const initiallySelected = initialGroups.flatMap((group) => (group.options || []).filter((option) => option.selected && option._node));
  const variantItems = [];
  const warnings = [];

  for (const group of initialGroups) {
    for (const option of group.options || []) {
      if (variantItems.length >= 80) {
        warnings.push("Scan bei 80 Varianten begrenzt.");
        break;
      }
      if (!option._node || option.disabled || isDangerousActionNode(option._node) || !isVisibleElement(option._node)) {
        if (option.disabled) warnings.push(`Nicht verfuegbar: ${option.label}`);
        continue;
      }
      try {
        option._node.scrollIntoView({ block: "center", inline: "center" });
        option._node.click();
        await new Promise((resolve) => setTimeout(resolve, 450));
        if (location.href !== beforeUrl) {
          warnings.push("Scan abgebrochen: Klick wollte die Seite wechseln.");
          history.back();
          break;
        }
        const currentGroups = getAliExpressVariantGroups();
        const selectedCombination = getSelectedAliExpressCombination(currentGroups);
        const labels = selectedCombination.labels.length ? selectedCombination.labels : [option.label].filter(Boolean);
        variantItems.push({
          combinationKey: labels.join("|") || option.label || `variant-${variantItems.length + 1}`,
          labels,
          price: parsePriceNumber(getPrice()),
          currency: getCurrencyFromText(getPrice()) || option.currency || null,
          image: getImages()[0] || option.image || null,
          availability: getAvailability() || null,
          shippingText: getShipping().text || null,
          deliveryText: getShipping().deliveryTime || null,
          capturedAt: new Date().toISOString()
        });
      } catch (error) {
        warnings.push(`Variante nicht gescannt: ${option.label || "unbekannt"}`);
      }
    }
  }

  for (const option of initiallySelected.slice(0, 8)) {
    try {
      if (location.href !== beforeUrl || !option._node || isDangerousActionNode(option._node) || !isVisibleElement(option._node)) continue;
      option._node.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    } catch {
      warnings.push("Urspruengliche Variantenauswahl konnte nicht vollstaendig wiederhergestellt werden.");
    }
  }

  const finalGroups = stripVariantNodes(getAliExpressVariantGroups());
  const selectedCombination = getSelectedAliExpressCombination(getAliExpressVariantGroups());
  const variants = {
    hasVariants: finalGroups.length > 0,
    variantGroups: finalGroups,
    selectedCombination,
    variantItems: uniqueVariantItems(variantItems)
  };
  const product = mergeAliExpressVariantsIntoProduct(detectProduct(), variants);
  const debug = buildAliExpressVariantDebug(finalGroups, variants.variantItems, true, warnings);
  product.aliexpressVariantDebug = debug;
  product.extractionDebug = {
    ...(product.extractionDebug || {}),
    aliexpressVariants: debug
  };
  return { ok: true, product, variants, debug, message: `${variants.variantItems.length || finalGroups.reduce((sum, group) => sum + group.options.length, 0)} Varianten gefunden.` };
}

function uniqueVariantItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = item.combinationKey || JSON.stringify(item.labels || []);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAliExpressVariantsIntoProduct(product, variants) {
  return mergePlatformVariantsIntoProduct(product, variants, "aliexpress");
}

function mergePlatformVariantsIntoProduct(product, variants, platform = detectPlatform()) {
  const next = { ...(product || {}) };
  next.variants = Array.isArray(variants?.variantItems) ? variants.variantItems : next.variants;
  next.platformVariants = variants;
  if (platform === "aliexpress") next.aliexpressVariants = variants;
  if (next.elyonProduct) {
    next.elyonProduct = {
      ...next.elyonProduct,
      variants: {
        hasVariants: variants?.hasVariants === true,
        variantGroups: Array.isArray(variants?.variantGroups) ? variants.variantGroups : [],
        variantItems: Array.isArray(variants?.variantItems) ? variants.variantItems : [],
        selectedCombination: variants?.selectedCombination || null
      },
      pricing: {
        ...(next.elyonProduct.pricing || {}),
        currentPrice: variants?.selectedCombination?.price ?? next.elyonProduct.pricing?.currentPrice ?? null,
        currency: variants?.selectedCombination?.currency || next.elyonProduct.pricing?.currency || null
      },
      availability: {
        ...(next.elyonProduct.availability || {}),
        deliveryText: variants?.selectedCombination?.deliveryText || next.elyonProduct.availability?.deliveryText || null,
        stockText: getAvailability() || next.elyonProduct.availability?.stockText || null
      },
      media: {
        ...(next.elyonProduct.media || {}),
        mainImage: variants?.selectedCombination?.image || next.elyonProduct.media?.mainImage || null
      },
      raw: {
        ...(next.elyonProduct.raw || {}),
        platformSpecificData: {
          ...(next.elyonProduct.raw?.platformSpecificData || {}),
          [platform]: {
            variants,
            capturedAt: new Date().toISOString()
          }
        }
      }
    };
  }
  return next;
}

function detectPlatform(domain = getDomain()) {
  const value = String(domain || "").toLowerCase();
  if (/amazon\./i.test(value)) return "amazon";
  if (/aliexpress/i.test(value)) return "aliexpress";
  if (/cjdropshipping/i.test(value)) return "cjdropshipping";
  if (/ebay\./i.test(value)) return "ebay";
  if (/bigbuy\./i.test(value)) return "bigbuy";
  if (/vidaxl\./i.test(value) || /dropshippingxl/i.test(value)) return "vidaxl";
  if (/temu\./i.test(value)) return "temu";
  return "generic";
}

function emptyToNull(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const text = safeText(stripHtml(value));
    return text ? text : null;
  }
  return value;
}

function cleanTextArray(values, max = 40) {
  return uniqueReadableList((Array.isArray(values) ? values : [values]).map(emptyToNull).filter(Boolean), max);
}

function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  Object.entries(value).forEach(([key, entry]) => {
    const cleanKey = safeText(key);
    const cleanValue = emptyToNull(entry);
    if (cleanKey && cleanValue != null) output[cleanKey] = cleanValue;
  });
  return output;
}

function parsePriceNumber(value) {
  const text = safeText(value);
  if (!text) return null;
  const match = text.match(/[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|[\d]+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  let numberText = match[0].replace(/\s/g, "");
  if (numberText.includes(",") && numberText.includes(".")) {
    numberText = numberText.replace(/\./g, "").replace(",", ".");
  } else if (numberText.includes(",")) {
    numberText = numberText.replace(",", ".");
  }
  const number = Number(numberText);
  return Number.isFinite(number) ? number : null;
}

function extractJsonLdProducts() {
  const products = [];
  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));

  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const type = Array.isArray(value["@type"]) ? value["@type"].join(" ") : value["@type"];
    if (String(type || "").toLowerCase().includes("product")) products.push(value);
    Object.values(value).forEach((entry) => {
      if (entry && typeof entry === "object") visit(entry);
    });
  }

  scripts.forEach((script) => {
    try {
      visit(JSON.parse(script.textContent || "{}"));
    } catch {
      // Some supplier pages ship invalid JSON-LD; extraction should continue.
    }
  });
  return products;
}

function firstJsonLdProduct() {
  return extractJsonLdProducts()[0] || {};
}

function getOfferValue(jsonLd, key) {
  const offers = Array.isArray(jsonLd?.offers) ? jsonLd.offers[0] : jsonLd?.offers;
  return offers?.[key] || null;
}

function getBrandValue(jsonLd, details = {}) {
  const brand = jsonLd?.brand;
  if (typeof brand === "string") return brand;
  if (brand?.name) return brand.name;
  return details.Brand || details.Marke || details.brand || details.marke || null;
}

function extractAsin(details = {}) {
  const urlMatch = location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return urlMatch?.[1] || details.ASIN || details.Asin || details.asin || null;
}

function extractEbayItemId(details = {}) {
  const urlMatch = location.href.match(/\/itm\/(?:[^/]+\/)?(\d{7,})/i);
  return urlMatch?.[1] || details["Artikelnummer"] || details["Item number"] || details["eBay item number"] || null;
}

function extractAmazonProduct(base = {}) {
  const details = getProductDetails();
  const descriptionData = getDescriptionData();
  const jsonLd = firstJsonLdProduct();
  const bullets = queryAllText(["#feature-bullets li span.a-list-item", "#feature-bullets li"], document, 20)
    .filter((text) => !/make sure this fits|page|previous|next/i.test(text));
  const breadcrumbs = queryAllText(["#wayfinding-breadcrumbs_feature_div a", "nav[aria-label*='breadcrumb'] a"], document, 12);
  const sellerText = queryText(["#sellerProfileTriggerId", "#merchant-info", "#tabular-buybox-truncate-0", "[data-feature-name='shipsFromSoldBy']"]);
  const fulfilledText = queryText(["#merchant-info", "#tabular-buybox", "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"]);
  const variantGroups = stripVariantNodes(getVariantGroupsForPlatform("amazon"));
  const selectedCombination = getSelectedAliExpressCombination(getVariantGroupsForPlatform("amazon"));

  return {
    ...base,
    parserName: "extractAmazonProduct",
    title: base.title || jsonLd.name || getTitle(),
    brand: getBrandValue(jsonLd, details),
    asin: extractAsin(details),
    model: details["Modellnummer"] || details["Model Number"] || details["Item model number"] || null,
    category: base.category || breadcrumbs.join(" > ") || getCategory(),
    breadcrumbs,
    shortDescription: bullets[0] || pickMeta(["meta[name='description']", "meta[property='og:description']"]),
    longDescription: base.description || descriptionData.text || jsonLd.description || "",
    bulletPoints: bullets,
    productDetails: details,
    specifications: details,
    mainImage: base.image || normalizeImageUrl(Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image),
    images: base.images,
    currentPrice: base.price || getOfferValue(jsonLd, "price"),
    originalPrice: queryText([".basisPrice .a-offscreen", ".a-text-price .a-offscreen", "[data-a-strike='true'] .a-offscreen"]),
    currency: base.currency || getOfferValue(jsonLd, "priceCurrency"),
    stockText: base.availability || getOfferValue(jsonLd, "availability"),
    deliveryText: base.shipping?.deliveryTime || fulfilledText,
    sellerName: sellerText,
    fulfilledBy: fulfilledText,
    prime: /prime/i.test(document.body?.innerText || ""),
    ratingValue: base.rating || jsonLd?.aggregateRating?.ratingValue,
    reviewsCount: base.reviewsCount || jsonLd?.aggregateRating?.reviewCount,
    marketplaceCategory: breadcrumbs.join(" > "),
    variantGroups,
    selectedCombination,
    variants: base.variants,
    warningTexts: getComplianceRisks([base.title, base.description, Object.values(details).join(" ")].join(" "))
  };
}

function extractAliExpressProduct(base = {}) {
  const popupRoot = findVisiblePopup(document);
  const popupData = popupRoot ? getAliExpressPopupData(popupRoot) : {};
  const details = getProductDetails();
  const descriptionData = getDescriptionData();
  const storeUrl = normalizeImageUrl("") || queryAttr(["a[href*='/store/']", "a[href*='store.aliexpress']"], "href");
  const variantGroups = stripVariantNodes(getAliExpressVariantGroups());
  const selectedCombination = getSelectedAliExpressCombination(getAliExpressVariantGroups());
  return {
    ...base,
    parserName: "extractAliExpressProduct",
    title: popupData.title || base.title,
    longDescription: popupData.description || base.description || descriptionData.text,
    bulletPoints: cleanTextArray(descriptionData.candidates, 8),
    productDetails: details,
    specifications: details,
    mainImage: popupData.image || base.image,
    images: base.images,
    currentPrice: popupData.price || base.price,
    originalPrice: queryText(["[class*='original-price']", "[class*='old-price']", "[class*='crossed']"]),
    currency: base.currency,
    shippingCost: base.shipping?.cost || "",
    deliveryText: base.shipping?.deliveryTime || base.shipping?.text || "",
    shipsFrom: base.shipping?.shipsFrom || queryText(["[class*='ship-from']", "[class*='ShipsFrom']"]),
    storeName: queryText(["[class*='store-name']", "[class*='shop-name']", "a[href*='/store/']"]),
    storeUrl,
    supplierRating: getNumberFromText(queryText(["[class*='store'] [class*='rating']", "[class*='seller'] [class*='rating']"])),
    followers: getNumberFromText(queryText(["[class*='followers']", "[class*='follower']"])),
    ratingValue: base.rating,
    reviewsCount: base.reviewsCount,
    variantGroups,
    selectedCombination,
    variantItems: base.variants,
    warningTexts: getComplianceRisks([base.title, base.description, Object.values(details).join(" ")].join(" "))
  };
}

function extractCJProduct(base = {}) {
  const details = getProductDetails();
  const description = getCjDescription() || base.description || getDescriptionData().text;
  const variantGroups = stripVariantNodes(getVariantGroupsForPlatform("cjdropshipping"));
  const selectedCombination = getSelectedAliExpressCombination(getVariantGroupsForPlatform("cjdropshipping"));
  return {
    ...base,
    parserName: "extractCJProduct",
    productId: details["Product ID"] || details["Produkt-ID"] || location.href.match(/product-detail\/([^/?#]+)/i)?.[1] || null,
    sku: details.SKU || details.sku || null,
    longDescription: description,
    productDetails: details,
    specifications: details,
    mainImage: base.image,
    images: base.images,
    currentPrice: base.price,
    currency: base.currency,
    warehouse: queryText(["[class*='warehouse']", "[class*='Warehouse']"]),
    shippingMethods: queryAllText(["[class*='shipping']", "[class*='logistics']", "[class*='delivery']"], document, 12),
    processingTime: queryText(["[class*='processing']", "[class*='Processing']"]),
    shippingCost: base.shipping?.cost || "",
    stockText: base.availability || queryText(["[class*='inventory']", "[class*='stock']"]),
    variantGroups,
    selectedCombination,
    variants: base.variants,
    warningTexts: getComplianceRisks([base.title, description, Object.values(details).join(" ")].join(" "))
  };
}

function extractEbayProduct(base = {}) {
  const details = getProductDetails();
  const descriptionData = getDescriptionData();
  const variantGroups = stripVariantNodes(getVariantGroupsForPlatform("ebay"));
  const selectedCombination = getSelectedAliExpressCombination(getVariantGroupsForPlatform("ebay"));
  return {
    ...base,
    parserName: "extractEbayProduct",
    itemId: extractEbayItemId(details),
    title: base.title,
    longDescription: base.description || descriptionData.text,
    bulletPoints: getAboutThisItemText(),
    productDetails: details,
    specifications: details,
    mainImage: base.image,
    images: base.images,
    currentPrice: base.price,
    currency: base.currency,
    shippingCost: base.shipping?.cost || "",
    deliveryText: base.shipping?.deliveryTime || base.shipping?.text || "",
    sellerName: queryText([".x-sellercard-atf__info__about-seller a", "[data-testid='x-sellercard-atf'] a", "[class*='seller'] a"]),
    supplierRating: getNumberFromText(queryText(["[class*='seller'] [class*='rating']", "[class*='feedback']"])),
    marketplaceCategory: base.category,
    stockText: base.availability,
    variantGroups,
    selectedCombination,
    variants: base.variants,
    soldCount: base.soldCount,
    warningTexts: getComplianceRisks([base.title, base.description, Object.values(details).join(" ")].join(" "))
  };
}

function extractBigBuyProduct(base = {}) {
  const details = getProductDetails();
  const variantGroups = stripVariantNodes(getVariantGroupsForPlatform("bigbuy"));
  const selectedCombination = getSelectedAliExpressCombination(getVariantGroupsForPlatform("bigbuy"));
  return {
    ...base,
    parserName: "extractBigBuyProduct",
    supplierName: "BigBuy",
    longDescription: base.description || getDescriptionData().text,
    productDetails: details,
    specifications: details,
    mainImage: base.image,
    images: base.images,
    currentPrice: base.price,
    currency: base.currency,
    stockText: base.availability,
    variantGroups,
    selectedCombination,
    variantItems: base.variants,
    warningTexts: getComplianceRisks([base.title, base.description, Object.values(details).join(" ")].join(" "))
  };
}

function extractVidaXLProduct(base = {}) {
  const details = getProductDetails();
  const variantGroups = stripVariantNodes(getVariantGroupsForPlatform("vidaxl"));
  const selectedCombination = getSelectedAliExpressCombination(getVariantGroupsForPlatform("vidaxl"));
  return {
    ...base,
    parserName: "extractVidaXLProduct",
    supplierName: /dropshippingxl/i.test(base.domain || "") ? "vidaXL / dropshippingXL" : "vidaXL",
    longDescription: base.description || getDescriptionData().text,
    productDetails: details,
    specifications: details,
    mainImage: base.image,
    images: base.images,
    currentPrice: base.price,
    currency: base.currency,
    stockText: base.availability,
    variantGroups,
    selectedCombination,
    variantItems: base.variants,
    warningTexts: getComplianceRisks([base.title, base.description, Object.values(details).join(" ")].join(" "))
  };
}

function extractGenericProduct(base = {}) {
  const jsonLd = firstJsonLdProduct();
  const jsonImages = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image].filter(Boolean);
  const details = getProductDetails();
  const platform = detectPlatform();
  const variantGroups = stripVariantNodes(getVariantGroupsForPlatform(platform));
  const selectedCombination = getSelectedAliExpressCombination(getVariantGroupsForPlatform(platform));
  return {
    ...base,
    parserName: "extractGenericProduct",
    title: base.title || jsonLd.name || pickMeta(["meta[property='og:title']", "meta[name='twitter:title']"]),
    brand: getBrandValue(jsonLd, details),
    sku: jsonLd.sku || details.SKU || null,
    productId: jsonLd.productID || details["Product ID"] || null,
    shortDescription: pickMeta(["meta[property='og:description']", "meta[name='description']"]),
    longDescription: base.description || jsonLd.description || getDescriptionData().text,
    productDetails: details,
    specifications: details,
    mainImage: base.image || normalizeImageUrl(jsonImages[0]),
    images: uniqueList([...base.images, ...jsonImages.map(normalizeImageUrl)], 12),
    currentPrice: base.price || getOfferValue(jsonLd, "price"),
    currency: base.currency || getOfferValue(jsonLd, "priceCurrency"),
    ratingValue: base.rating || jsonLd?.aggregateRating?.ratingValue,
    reviewsCount: base.reviewsCount || jsonLd?.aggregateRating?.reviewCount,
    stockText: base.availability || getOfferValue(jsonLd, "availability"),
    variantGroups,
    selectedCombination,
    variantItems: base.variants,
    warningTexts: getComplianceRisks([base.title, base.description, Object.values(details).join(" ")].join(" "))
  };
}

function extractProductByPlatform(platform, base) {
  switch (platform) {
    case "amazon":
      return extractAmazonProduct(base);
    case "aliexpress":
      return extractAliExpressProduct(base);
    case "cjdropshipping":
      return extractCJProduct(base);
    case "ebay":
      return extractEbayProduct(base);
    case "bigbuy":
      return extractBigBuyProduct(base);
    case "vidaxl":
      return extractVidaXLProduct(base);
    default:
      return extractGenericProduct(base);
  }
}

function createEmptyElyonProduct() {
  return {
    meta: {
      sourceUrl: null,
      sourceDomain: null,
      detectedPlatform: null,
      extractedAt: null,
      extractorVersion: "1.0.0",
      importSource: "chrome-extension",
      browserMode: true,
      confidenceScore: 0
    },
    identity: {
      title: null,
      brand: null,
      sku: null,
      asin: null,
      itemId: null,
      productId: null,
      model: null,
      category: null,
      breadcrumbs: []
    },
    content: {
      shortDescription: null,
      longDescription: null,
      bulletPoints: [],
      productDetails: {},
      specifications: {},
      materials: [],
      dimensions: null,
      colors: [],
      sizes: [],
      careInstructions: null,
      includedItems: []
    },
    media: {
      mainImage: null,
      images: [],
      videos: []
    },
    pricing: {
      currentPrice: null,
      originalPrice: null,
      currency: null,
      discountPercent: null,
      shippingCost: null,
      totalEstimatedCost: null,
      priceText: null
    },
    availability: {
      inStock: null,
      stockText: null,
      quantityAvailable: null,
      deliveryText: null,
      processingTime: null,
      estimatedDelivery: null,
      shipsFrom: null,
      shipsTo: null
    },
    supplier: {
      supplierName: null,
      storeName: null,
      storeUrl: null,
      supplierRating: null,
      followers: null,
      warehouse: null,
      shippingMethods: [],
      dropshippingAvailable: null
    },
    reviews: {
      ratingValue: null,
      reviewsCount: null,
      ratingsBreakdown: {},
      reviewSnippets: []
    },
    variants: {
      hasVariants: false,
      variantGroups: [],
      variantItems: [],
      selectedCombination: null
    },
    marketplace: {
      sellerName: null,
      fulfilledBy: null,
      prime: null,
      bestsellerRank: null,
      marketplaceCategory: null
    },
    risk: {
      brandRiskHint: null,
      batteryHint: null,
      electronicHint: null,
      medicalHint: null,
      trademarkHint: null,
      eprHint: null,
      warningTexts: []
    },
    workflow: {
      importTarget: "browser-import",
      status: "draft",
      reviewRequired: true,
      liveAction: false,
      automationAllowed: false,
      analysisQueue: {
        soulScout: "pending",
        soulSeo: "pending",
        soulPricing: "pending",
        soulGuard: "pending",
        supplierCheck: "pending"
      }
    },
    notes: [],
    raw: {
      platformSpecificData: {},
      debugSelectors: {},
      extractionWarnings: []
    }
  };
}

function splitBulletText(value) {
  return uniqueList(
    readableText(value)
      .split(/\n|•|·|\*|-{1,2}|;|\u2022/g)
      .map((part) => safeText(part.replace(/^[\s•·*\-–—]+/, "")))
      .filter((part) => part.length > 2),
    40
  );
}

function classifySelectedText(value) {
  const text = readableText(value);
  const lower = text.toLowerCase();
  if (!text) return "note";
  if (/liefer|versand|shipping|delivery|tage|days|warehouse|ships from|zustellung|ankunft/i.test(text)) return "delivery";
  if (/akku|batterie|battery|ce\b|weee|epr|medizin|medical|warn|gefahr|risk|achtung|trademark|marke|logo/i.test(text)) return "risk";
  if (/material|gewicht|maße|masse|dimension|size|größe|groesse|spannung|volt|watt|technical|spezifikation|specification|modell|sku|asin/i.test(text)) return "technical";
  if (/supplier|store|shop|seller|verkäufer|bewertung|rating|followers|lager|warehouse/i.test(text)) return "supplier";
  if (/keyword|seo|suchbegriff|search term|ranking/i.test(text)) return "seo";
  const bulletLines = splitBulletText(text);
  if (bulletLines.length >= 2 && bulletLines.join(" ").length >= 30) return "bullets";
  if (lower.length >= 80) return "description";
  return "note";
}

function applyManualCaptureToProduct(product, capture) {
  const next = { ...(product || detectProduct()) };
  const text = readableText(capture?.text || "");
  const target = capture?.target || classifySelectedText(text);
  const now = new Date().toISOString();
  const note = { type: target, text, capturedAt: now, sourceUrl: location.href };
  next.manualCaptures = [...(Array.isArray(next.manualCaptures) ? next.manualCaptures : []), note].slice(-50);

  if (next.elyonProduct) {
    next.elyonProduct = {
      ...next.elyonProduct,
      notes: [...(Array.isArray(next.elyonProduct.notes) ? next.elyonProduct.notes : []), note].slice(-50),
      raw: {
        ...(next.elyonProduct.raw || {}),
        platformSpecificData: {
          ...(next.elyonProduct.raw?.platformSpecificData || {}),
          manualCaptures: [...(next.elyonProduct.raw?.platformSpecificData?.manualCaptures || []), note].slice(-50)
        }
      }
    };

    if (target === "description") {
      next.description = text;
      next.elyonProduct.content = { ...(next.elyonProduct.content || {}), longDescription: text };
    } else if (target === "bullets") {
      const bullets = splitBulletText(text);
      next.descriptionCandidates = uniqueReadableList([...(next.descriptionCandidates || []), ...bullets], 30);
      next.elyonProduct.content = {
        ...(next.elyonProduct.content || {}),
        bulletPoints: uniqueList([...(next.elyonProduct.content?.bulletPoints || []), ...bullets], 40)
      };
    } else if (target === "technical") {
      next.elyonProduct.content = {
        ...(next.elyonProduct.content || {}),
        specifications: {
          ...(next.elyonProduct.content?.specifications || {}),
          manualTechnicalInfo: text
        }
      };
    } else if (target === "delivery") {
      next.elyonProduct.availability = {
        ...(next.elyonProduct.availability || {}),
        deliveryText: text
      };
    } else if (target === "risk") {
      next.elyonProduct.risk = {
        ...(next.elyonProduct.risk || {}),
        warningTexts: uniqueList([...(next.elyonProduct.risk?.warningTexts || []), text], 30)
      };
    } else if (target === "supplier") {
      next.elyonProduct.supplier = {
        ...(next.elyonProduct.supplier || {}),
        supplierName: next.elyonProduct.supplier?.supplierName || text.slice(0, 120)
      };
    }
  }

  return { product: next, capture: note, classification: target };
}

function captureTextValue(textValue, target = "auto") {
  const text = readableText(stripHtml(textValue || ""));
  if (!text) {
    return { ok: false, message: "Kein Text markiert.", capture: null, product: detectProduct() };
  }
  const classification = target === "auto" ? classifySelectedText(text) : target;
  const result = applyManualCaptureToProduct(detectProduct(), { text, target: classification });
  return { ok: true, message: `Text übernommen als ${classification}.`, ...result };
}

function captureSelectedText(target = "auto") {
  return captureTextValue(window.getSelection?.().toString() || "", target);
}

function captureImageUrl(srcUrl, asMain = false) {
  const imageUrl = normalizeImageUrl(srcUrl || "");
  if (!imageUrl) return { ok: false, message: "Keine Bild-URL erkannt.", product: detectProduct() };
  const product = detectProduct();
  const next = { ...product };
  const images = uniqueList([imageUrl, ...(Array.isArray(product.images) ? product.images : [])], 30);
  next.image = asMain ? imageUrl : product.image || imageUrl;
  next.images = asMain ? uniqueList([imageUrl, ...images], 30) : images;
  if (next.elyonProduct) {
    next.elyonProduct = {
      ...next.elyonProduct,
      media: {
        ...(next.elyonProduct.media || {}),
        mainImage: asMain ? imageUrl : next.elyonProduct.media?.mainImage || imageUrl,
        images: asMain
          ? uniqueList([imageUrl, ...(next.elyonProduct.media?.images || [])], 30)
          : uniqueList([...(next.elyonProduct.media?.images || []), imageUrl], 30)
      },
      notes: [
        ...(Array.isArray(next.elyonProduct.notes) ? next.elyonProduct.notes : []),
        { type: asMain ? "main_image" : "image", text: imageUrl, capturedAt: new Date().toISOString(), sourceUrl: location.href }
      ].slice(-50)
    };
  }
  return { ok: true, message: asMain ? "Hauptbild lokal übernommen." : "Bild lokal übernommen.", product: next };
}

function calculateConfidence(product) {
  const checks = [
    product.identity.title,
    product.pricing.currentPrice,
    product.media.mainImage,
    product.meta.sourceUrl,
    product.content.longDescription,
    product.content.bulletPoints.length,
    Object.keys(product.content.productDetails).length,
    product.supplier.supplierName,
    product.availability.stockText,
    product.reviews.ratingValue
  ];
  const found = checks.filter(Boolean).length;
  return Math.round((found / checks.length) * 100);
}

function buildExtractionWarnings(product) {
  const warnings = [];
  if (!product.identity.title) warnings.push("Titel nicht gefunden");
  if (!product.pricing.currentPrice && !product.pricing.priceText) warnings.push("Preis nicht gefunden");
  if (!product.media.mainImage) warnings.push("Hauptbild nicht gefunden");
  if (!product.content.longDescription && !product.content.bulletPoints.length) warnings.push("Beschreibung nicht gefunden");
  if (!product.meta.detectedPlatform || product.meta.detectedPlatform === "generic") warnings.push("Nur Generic Parser verwendet");
  return warnings;
}

function normalizeProductData(rawData = {}, platform = "generic") {
  const product = createEmptyElyonProduct();
  const images = uniqueList([rawData.mainImage, rawData.image, ...(Array.isArray(rawData.images) ? rawData.images : [])].map(normalizeImageUrl), 20);
  const priceText = rawData.currentPrice || rawData.price || rawData.priceText || "";
  const shippingCostText = rawData.shippingCost || rawData.shipping?.cost || "";
  const details = cleanObject(rawData.productDetails);
  const specifications = cleanObject(rawData.specifications);
  const variants = Array.isArray(rawData.variantItems) ? rawData.variantItems : Array.isArray(rawData.variants) ? rawData.variants : [];
  const warningTexts = cleanTextArray([...(Array.isArray(rawData.warningTexts) ? rawData.warningTexts : []), ...(Array.isArray(rawData.complianceRisks) ? rawData.complianceRisks : [])], 20);

  product.meta.sourceUrl = emptyToNull(rawData.url || location.href);
  product.meta.sourceDomain = emptyToNull(rawData.domain || getDomain());
  product.meta.detectedPlatform = platform || "generic";
  product.meta.extractedAt = rawData.detectedAt || new Date().toISOString();

  product.identity.title = emptyToNull(rawData.title);
  product.identity.brand = emptyToNull(rawData.brand);
  product.identity.sku = emptyToNull(rawData.sku);
  product.identity.asin = emptyToNull(rawData.asin);
  product.identity.itemId = emptyToNull(rawData.itemId);
  product.identity.productId = emptyToNull(rawData.productId);
  product.identity.model = emptyToNull(rawData.model);
  product.identity.category = emptyToNull(rawData.category);
  product.identity.breadcrumbs = cleanTextArray(rawData.breadcrumbs, 20);

  product.content.shortDescription = emptyToNull(rawData.shortDescription);
  product.content.longDescription = emptyToNull(rawData.longDescription || rawData.description);
  product.content.bulletPoints = cleanTextArray(rawData.bulletPoints || rawData.descriptionCandidates, 30);
  product.content.productDetails = details;
  product.content.specifications = Object.keys(specifications).length ? specifications : details;
  product.content.materials = cleanTextArray([details.Material, details.material, rawData.materials].flat(), 10);
  product.content.dimensions = emptyToNull(details.Dimensions || details["Maße"] || details["Masse"] || details.Size);
  product.content.colors = cleanTextArray([details.Color, details.Farbe, rawData.colors].flat(), 20);
  product.content.sizes = cleanTextArray([details.Size, details.Größe, details.Groesse, rawData.sizes].flat(), 20);
  product.content.careInstructions = emptyToNull(details["Care instructions"] || details.Pflegehinweise);
  product.content.includedItems = cleanTextArray([details["Included Components"], details.Lieferumfang, rawData.includedItems].flat(), 20);

  product.media.mainImage = images[0] || null;
  product.media.images = images;
  product.media.videos = cleanTextArray(rawData.videos, 10);

  product.pricing.currentPrice = parsePriceNumber(priceText);
  product.pricing.originalPrice = parsePriceNumber(rawData.originalPrice);
  product.pricing.currency = emptyToNull(rawData.currency || getCurrencyFromText(priceText) || getCurrencyFromText(rawData.originalPrice));
  product.pricing.discountPercent = parsePriceNumber(rawData.discountPercent);
  product.pricing.shippingCost = parsePriceNumber(shippingCostText);
  product.pricing.totalEstimatedCost = product.pricing.currentPrice != null && product.pricing.shippingCost != null
    ? Number((product.pricing.currentPrice + product.pricing.shippingCost).toFixed(2))
    : null;
  product.pricing.priceText = emptyToNull(priceText);

  product.availability.stockText = emptyToNull(rawData.stockText || rawData.availability);
  product.availability.inStock = product.availability.stockText ? !/out of stock|nicht verfügbar|ausverkauft/i.test(product.availability.stockText) : null;
  product.availability.quantityAvailable = parsePriceNumber(rawData.quantityAvailable);
  product.availability.deliveryText = emptyToNull(rawData.deliveryText || rawData.shipping?.deliveryTime || rawData.shipping?.text);
  product.availability.processingTime = emptyToNull(rawData.processingTime);
  product.availability.estimatedDelivery = emptyToNull(rawData.estimatedDelivery);
  product.availability.shipsFrom = emptyToNull(rawData.shipsFrom || rawData.shipping?.shipsFrom);
  product.availability.shipsTo = emptyToNull(rawData.shipsTo);

  product.supplier.supplierName = emptyToNull(rawData.supplierName || rawData.supplier);
  product.supplier.storeName = emptyToNull(rawData.storeName || rawData.supplierInfo?.shopName);
  product.supplier.storeUrl = emptyToNull(rawData.storeUrl);
  product.supplier.supplierRating = emptyToNull(rawData.supplierRating || rawData.supplierInfo?.rating);
  product.supplier.followers = emptyToNull(rawData.followers);
  product.supplier.warehouse = emptyToNull(rawData.warehouse);
  product.supplier.shippingMethods = cleanTextArray(rawData.shippingMethods, 20);
  product.supplier.dropshippingAvailable = /dropshipping|cj|bigbuy|vidaxl|dropxl/i.test(`${rawData.supplier || ""} ${rawData.domain || ""}`) || null;

  product.reviews.ratingValue = emptyToNull(rawData.ratingValue || rawData.rating);
  product.reviews.reviewsCount = emptyToNull(rawData.reviewsCount);
  product.reviews.ratingsBreakdown = cleanObject(rawData.ratingsBreakdown);
  product.reviews.reviewSnippets = cleanTextArray(rawData.reviewSnippets, 10);

  product.variants.variantItems = variants;
  product.variants.variantGroups = Array.isArray(rawData.variantGroups)
    ? rawData.variantGroups.map((group) => (group && typeof group === "object" ? group : { name: safeText(group), options: [] })).slice(0, 30)
    : [];
  product.variants.selectedCombination = rawData.selectedCombination && typeof rawData.selectedCombination === "object" ? rawData.selectedCombination : null;
  product.variants.hasVariants = variants.length > 0 || product.variants.variantGroups.length > 0;

  product.marketplace.sellerName = emptyToNull(rawData.sellerName);
  product.marketplace.fulfilledBy = emptyToNull(rawData.fulfilledBy);
  product.marketplace.prime = typeof rawData.prime === "boolean" ? rawData.prime : null;
  product.marketplace.bestsellerRank = emptyToNull(rawData.bestsellerRank || details["Best Sellers Rank"] || details["Bestseller-Rang"]);
  product.marketplace.marketplaceCategory = emptyToNull(rawData.marketplaceCategory || rawData.category);

  product.risk.warningTexts = warningTexts;
  product.risk.brandRiskHint = warningTexts.find((text) => /marke|brand|trademark|logo/i.test(text)) || null;
  product.risk.batteryHint = warningTexts.find((text) => /akku|battery|batterie/i.test(text)) || null;
  product.risk.electronicHint = warningTexts.find((text) => /elektro|electric|usb|weee/i.test(text)) || null;
  product.risk.medicalHint = warningTexts.find((text) => /medizin|medical/i.test(text)) || null;
  product.risk.trademarkHint = warningTexts.find((text) => /trademark|marke|logo/i.test(text)) || null;
  product.risk.eprHint = warningTexts.find((text) => /epr|weee|verpackung/i.test(text)) || null;

  product.raw.platformSpecificData = { ...rawData, documentTitle: document.title };
  if (platform === "aliexpress") {
    product.raw.platformSpecificData.aliexpress = {
      variantGroups: product.variants.variantGroups,
      variantItems: product.variants.variantItems,
      selectedCombination: product.variants.selectedCombination
    };
  }
  product.raw.debugSelectors = {
    parser: rawData.parserName || "unknown",
    jsonLdProducts: extractJsonLdProducts().length,
    descriptionSource: rawData.descriptionSource || "unknown"
  };
  product.raw.extractionWarnings = buildExtractionWarnings(product);
  product.meta.confidenceScore = calculateConfidence(product);
  return product;
}

function buildExtractionDebug(elyonProduct) {
  const required = {
    title: elyonProduct.identity.title,
    price: elyonProduct.pricing.currentPrice || elyonProduct.pricing.priceText,
    image: elyonProduct.media.mainImage,
    description: elyonProduct.content.longDescription || elyonProduct.content.bulletPoints.length,
    url: elyonProduct.meta.sourceUrl,
    supplier: elyonProduct.supplier.supplierName
  };
  const foundFields = Object.entries(required).filter(([, value]) => Boolean(value)).map(([key]) => key);
  const missingFields = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  return {
    platform: elyonProduct.meta.detectedPlatform,
    parser: elyonProduct.raw.debugSelectors.parser,
    confidenceScore: elyonProduct.meta.confidenceScore,
    foundFields,
    missingFields,
    extractionWarnings: elyonProduct.raw.extractionWarnings,
    rawProduct: elyonProduct
  };
}

function detectProduct() {
  const url = location.href;
  const domain = getDomain(url);
  const supplier = getSupplier(domain);
  const popupRoot = isAliExpress(domain) ? findVisiblePopup(document) : null;
  const popupData = popupRoot ? getAliExpressPopupData(popupRoot) : null;

  const title = popupData?.title || getTitle() || null;
  const rawPrice = extractPriceFromText(popupData?.price || getPrice()) || "";
  const images = uniqueList([popupData?.image, ...getImages()], 12);
  const image = images[0] || null;
  const priceParts = normalizePriceCurrency(rawPrice, getCurrencyFromText(rawPrice) || "");
  const price = priceParts.price || null;
  const currency = priceParts.currency || null;
  const descriptionData = getDescriptionData();
  const description = popupData?.description || descriptionData.text || null;
  const shipping = getShipping();
  const productDetails = getProductDetails();
  const category = getCategory();
  const availability = getAvailability();
  const rating = getRating();
  const reviewsCount = getReviewsCount();
  const soldCount = getSoldCount();
  const variants = getVariants();
  const supplierInfo = getSupplierInfo(domain, supplier);
  const complianceRisks = getComplianceRisks([
    title,
    description,
    category,
    Object.entries(productDetails).map(([key, value]) => `${key}: ${value}`).join(" ")
  ].join(" "));
  const descriptionCandidates = uniqueReadableList([popupData?.description, ...(descriptionData.candidates || [])], 8);

  const legacyProduct = {
    title,
    price,
    image,
    images,
    url: url || null,
    supplier,
    domain,
    currency,
    detectedAt: new Date().toISOString(),
    productType: getProductType(domain, url),
    description,
    descriptionCandidates,
    descriptionSource: popupData?.description ? "visible_popup" : descriptionData.source,
    variants,
    shipping,
    rating,
    reviewsCount,
    soldCount,
    productDetails,
    availability,
    category,
    supplierInfo,
    complianceRisks
  };
  const platform = detectPlatform(domain);
  const rawPlatformProduct = extractProductByPlatform(platform, legacyProduct);
  const elyonProduct = normalizeProductData(rawPlatformProduct, platform);
  const extractionDebug = buildExtractionDebug(elyonProduct);

  return {
    ...legacyProduct,
    detectedPlatform: platform,
    elyonProduct,
    extractionDebug
  };
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.left = "auto";
  overlay.style.top = "auto";
  document.documentElement.appendChild(overlay);
  return overlay;
}

function removeOverlay() {
  dismissedOverlayUrl = location.href;
  document.getElementById(OVERLAY_ID)?.remove();
}

function hideOverlayForCurrentPage() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function ensureCommandBar() {
  let bar = document.getElementById(COMMAND_BAR_ID);
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = COMMAND_BAR_ID;
  bar.innerHTML = `
    <div class="elyon-command-shell" role="dialog" aria-modal="true">
      <div class="elyon-command-header">
        <div>
          <div class="elyon-command-title">Elyon Command Bar</div>
          <div class="elyon-command-subtitle">Nur vorbereitende Aktionen</div>
        </div>
        <button type="button" class="elyon-command-close" data-elyon-command-close>×</button>
      </div>
      <input class="elyon-command-input" type="search" placeholder="Befehl suchen..." data-elyon-command-input />
      <div class="elyon-command-list" data-elyon-command-list></div>
    </div>
  `;
  document.documentElement.appendChild(bar);
  return bar;
}

function removeCommandBar() {
  document.getElementById(COMMAND_BAR_ID)?.remove();
}

async function storeResearch(product) {
  const response = await chrome.runtime.sendMessage({ type: "ELYON_SAVE_PRODUCT", product }).catch(() => null);
  return response || null;
}

function importFeedback(response, fallback) {
  if (!response) return "Keine Antwort von Elyon. Bitte Extension neu laden.";
  if (response.importResult?.serverSaved === false) return response.importResult.message || "Server nicht erreichbar - nicht gespeichert";
  if (response.importResult?.ok) return response.importResult.message || "Browser Import gespeichert.";
  if (response.importResult?.message) return response.importResult.message;
  if (response.ok) return fallback || "Gespeichert";
  return response.error || fallback || "Speichern fehlgeschlagen";
}

async function sendToElyon(product) {
  const response = await chrome.runtime.sendMessage({ type: "ELYON_SAVE_PRODUCT", product }).catch(() => null);
  const message = importFeedback(response, "Gespeichert");
  if (typeof alert === "function") {
    alert(message);
  }
  return response || null;
}

function getCommandItems() {
  const product = detectProduct();
  return [
    {
      id: "analyze",
      label: "Produkt analysieren vorbereiten",
      action: () =>
        chrome.runtime.sendMessage({
          type: "ELYON_RESEARCH_UPSERT",
          product: {
            id: product.url || `analysis-${Date.now()}`,
            title: product.title || "Analyse vorbereitet",
            price: product.price || "",
            currency: product.currency || "",
            image: product.image || "",
            url: product.url || location.href,
            supplier: product.supplier || "",
            domain: product.domain || "",
            status: "new",
            notes: "Analyse vorbereitet",
            score: "",
            detectedAt: product.detectedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
    },
    { id: "save", label: "Produkt speichern", action: () => storeResearch({ ...product, status: "new" }) },
    { id: "send", label: "Zu Elyon senden", action: () => sendToElyon({ ...product, status: "new" }) },
    { id: "overlay", label: "Overlay ein/aus", action: () => chrome.runtime.sendMessage({ type: "ELYON_TOGGLE_OVERLAY" }) },
    { id: "soul-scout", label: "Soul Scout öffnen", action: () => chrome.runtime.sendMessage({ type: "ELYON_OPEN_SOUL_SCOUT" }) },
    { id: "soul-guard", label: "Soul Guard prüfen", action: () => chrome.runtime.sendMessage({ type: "ELYON_CHECK_SOUL_GUARD" }) },
    { id: "security", label: "Security Center öffnen", action: () => chrome.runtime.sendMessage({ type: "ELYON_OPEN_SECURITY_CENTER" }) }
  ];
}

function filterCommands(query) {
  const lower = String(query || "").toLowerCase();
  return getCommandItems().filter((item) => item.label.toLowerCase().includes(lower));
}

function renderCommandBar(query = "") {
  const bar = ensureCommandBar();
  const list = bar.querySelector("[data-elyon-command-list]");
  const input = bar.querySelector("[data-elyon-command-input]");
  const items = filterCommands(query);
  list.innerHTML = items
    .map(
      (item) => `
        <button type="button" class="elyon-command-item" data-command-id="${item.id}">
          <span>${item.label}</span>
        </button>
      `
    )
    .join("");
  if (input) input.value = query;
  list.querySelectorAll("[data-command-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const command = getCommandItems().find((entry) => entry.id === button.getAttribute("data-command-id"));
      if (!command) return;
      if (command.id === "send") {
        const snapshot = await chrome.runtime.sendMessage({ type: "ELYON_GET_SNAPSHOT" }).catch(() => null);
        const security = snapshot?.security || {};
        if (security.securityMode !== false || security.sandboxMode !== false || security.autonomyLocked !== false) {
          return;
        }
      }
      await command.action();
      removeCommandBar();
      commandBarVisible = false;
    });
  });
  bar.querySelector("[data-elyon-command-close]")?.addEventListener("click", () => {
    removeCommandBar();
    commandBarVisible = false;
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      removeCommandBar();
      commandBarVisible = false;
    }
  });
  input?.addEventListener("input", (event) => renderCommandBar(event.target.value));
}

function toggleCommandBar(force) {
  commandBarVisible = typeof force === "boolean" ? force : !commandBarVisible;
  if (!commandBarVisible) {
    removeCommandBar();
    return;
  }
  renderCommandBar();
}

function renderOverlay(product) {
  if (dismissedOverlayUrl === location.href) return;
  const overlay = ensureOverlay();
  const previousShell = overlay.querySelector(".elyon-overlay-shell");
  if (previousShell) {
    lastOverlayScrollTop = previousShell.scrollTop || 0;
  }
  const safeImage = safeHttpUrl(product.image);
  const imageMarkup = safeImage
    ? `<div class="elyon-image-wrap"><img class="elyon-image" src="${escapeHtml(safeImage)}" alt="Produktbild" loading="lazy" referrerpolicy="no-referrer" /><a class="elyon-image-link" href="${escapeHtml(safeImage)}" target="_blank" rel="noreferrer noopener">Bild öffnen</a></div>`
    : `<strong>-</strong>`;
  const descInfo = product.description
    ? `Beschreibung erkannt · ${String(product.description).length} Zeichen`
    : "Noch keine passende Beschreibung erkannt. Bitte Produktdetails auf der Seite manuell aufklappen und neu erfassen.";
  overlay.innerHTML = `
    <div class="elyon-overlay-shell">
      <div class="elyon-overlay-header" data-elyon-drag-handle>
        <div>
          <div class="elyon-overlay-brand">Elyon Browser OS</div>
          <div class="elyon-overlay-sub">Smart Overlay</div>
        </div>
        <div class="elyon-overlay-header-actions">
          <button type="button" class="elyon-overlay-minimize" data-elyon-minimize>–</button>
          <button type="button" class="elyon-overlay-close" data-elyon-close>×</button>
        </div>
      </div>
      <div class="elyon-overlay-card">
        <div class="elyon-field"><span>Title</span><strong>${escapeHtml(product.title || "-")}</strong></div>
        <div class="elyon-field"><span>Price</span><strong>${escapeHtml(product.price || "-")}</strong></div>
        <div class="elyon-field"><span>Image</span>${imageMarkup}</div>
        <div class="elyon-field"><span>URL</span><strong>${escapeHtml(product.url || "-")}</strong></div>
        <div class="elyon-field"><span>Supplier</span><strong>${escapeHtml(product.supplier || "-")}</strong></div>
        <div class="elyon-field"><span>Domain</span><strong>${escapeHtml(product.domain || "-")}</strong></div>
        <div class="elyon-field"><span>Currency</span><strong>${escapeHtml(product.currency || "-")}</strong></div>
        <div class="elyon-field"><span>Description</span><strong>${escapeHtml(product.description || "-")}</strong></div>
        <div class="elyon-field"><span>Status</span><strong data-elyon-status>${escapeHtml(descInfo)}</strong></div>
        <div class="elyon-field"><span>Detected</span><strong>${escapeHtml(product.detectedAt || "-")}</strong></div>
      </div>
      <div class="elyon-overlay-actions">
        <button type="button" data-elyon-action="save">Zu Elyon speichern</button>
        <button type="button" class="elyon-secondary-action" data-elyon-action="rescan">Neu erfassen</button>
        <button type="button" class="elyon-secondary-action" data-elyon-action="capture-text">Markierten Text übernehmen</button>
        <button type="button" class="elyon-secondary-action" data-elyon-action="sidepanel">Side Panel öffnen</button>
        <button type="button" class="elyon-secondary-action" data-elyon-action="watch">Beobachten</button>
        <button type="button" class="elyon-secondary-action" data-elyon-action="open-details">Nach manuellem Aufklappen neu erfassen</button>
        <button type="button" data-elyon-action="research">Research merken</button>
        <button type="button" data-elyon-action="soul">Soul Scout vorbereiten</button>
        <button type="button" data-elyon-action="close">Overlay schließen</button>
      </div>
    </div>
  `;

  applyOverlayPosition(overlay);
  wireOverlayDrag(overlay);
  wireOverlayScroll(overlay);
  const nextShell = overlay.querySelector(".elyon-overlay-shell");
  if (nextShell) {
    nextShell.scrollTop = lastOverlayScrollTop;
  }

  overlay.querySelector("[data-elyon-close]")?.addEventListener("click", removeOverlay);
  overlay.querySelector("[data-elyon-minimize]")?.addEventListener("click", () => {
    const card = overlay.querySelector(".elyon-overlay-card");
    const actions = overlay.querySelector(".elyon-overlay-actions");
    const minimized = overlay.dataset.minimized === "true";
    overlay.dataset.minimized = minimized ? "false" : "true";
    if (card) card.style.display = minimized ? "grid" : "none";
    if (actions) actions.style.display = minimized ? "grid" : "none";
  });
  overlay.querySelector('[data-elyon-action="close"]')?.addEventListener("click", removeOverlay);
  overlay.querySelector('[data-elyon-action="save"]')?.addEventListener("click", async () => {
    const result = await storeResearch({ ...detectProduct(), status: "new" });
    alert(importFeedback(result, "Gespeichert"));
  });
  overlay.querySelector('[data-elyon-action="rescan"]')?.addEventListener("click", () => {
    dismissedOverlayUrl = "";
    renderOverlay(detectProduct());
  });
  overlay.querySelector('[data-elyon-action="capture-text"]')?.addEventListener("click", async () => {
    const result = captureSelectedText("auto");
    if (result.ok) {
      await chrome.runtime.sendMessage({ type: "ELYON_MANUAL_CAPTURE_SAVE", capture: result.capture, product: result.product }).catch(() => null);
    }
    alert(result.message || "Textübernahme abgeschlossen.");
  });
  overlay.querySelector('[data-elyon-action="sidepanel"]')?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "ELYON_OPEN_SIDEPANEL" });
  });
  overlay.querySelector('[data-elyon-action="watch"]')?.addEventListener("click", async () => {
    const product = { ...detectProduct(), notes: "Beobachtung vorbereitet", watchState: "prepared" };
    const result = await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_UPSERT", product }).catch(() => null);
    alert(result?.ok ? "Beobachtung vorbereitet." : "Beobachtung konnte nicht vorbereitet werden.");
  });
  overlay.querySelector('[data-elyon-action="open-details"]')?.addEventListener("click", async () => {
    const status = overlay.querySelector("[data-elyon-status]");
    if (status) status.textContent = "Scanne erneut. Es wird nichts automatisch angeklickt.";
    const result = await openDetailsWithUserConsent();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const nextProduct = detectProduct();
    renderOverlay(nextProduct);
    const nextOverlay = document.getElementById(OVERLAY_ID);
    const nextStatus = nextOverlay?.querySelector("[data-elyon-status]");
    if (nextStatus) {
      nextStatus.textContent = result.changedUrl
        ? "Abgebrochen: Seite wollte navigieren."
        : `Neu erfasst ohne Klicks · Beschreibung ${nextProduct.description ? "erkannt" : "noch leer"}`;
    }
  });
  overlay.querySelector('[data-elyon-action="research"]')?.addEventListener("click", async () => {
    const result = await storeResearch({ ...detectProduct(), status: "new" });
    alert(importFeedback(result, "Research gemerkt"));
  });
  overlay.querySelector('[data-elyon-action="soul"]')?.addEventListener("click", async () => {
    const result = await chrome.runtime.sendMessage({
      type: "ELYON_RUN_AGENT_ANALYSIS",
      agentId: "soul-scout",
      product: { ...detectProduct(), status: "new", soulState: "prepared" },
      context: {
        title: "Soul Scout Analyse",
        url: location.href,
        notes: "Aus Overlay gestartet. Keine Live-Aktion."
      }
    }).catch((error) => ({ ok: false, message: error?.message || "Soul Scout nicht erreichbar" }));
    alert(result?.analysis?.content || result?.message || "Soul Scout vorbereitet.");
  });
}

function applyOverlayPosition(overlay) {
  if (overlayPosition.left != null && overlayPosition.top != null) {
    overlay.style.left = `${overlayPosition.left}px`;
    overlay.style.top = `${overlayPosition.top}px`;
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
  } else {
    overlay.style.right = "16px";
    overlay.style.bottom = "16px";
    overlay.style.left = "auto";
    overlay.style.top = "auto";
  }
}

function clampOverlayPosition(left, top, overlay) {
  const rect = overlay.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  return {
    left: Math.min(Math.max(8, left), maxLeft),
    top: Math.min(Math.max(8, top), maxTop)
  };
}

function wireOverlayDrag(overlay) {
  const handle = overlay.querySelector("[data-elyon-drag-handle]");
  if (!handle) return;
  handle.style.cursor = "move";
  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    draggingOverlay = true;
    const rect = overlay.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!draggingOverlay) return;
    const next = clampOverlayPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y, overlay);
    overlayPosition = next;
    overlay.style.left = `${next.left}px`;
    overlay.style.top = `${next.top}px`;
  });

  window.addEventListener("mouseup", () => {
    draggingOverlay = false;
  });
}

function wireOverlayScroll(overlay) {
  const shell = overlay.querySelector(".elyon-overlay-shell");
  if (!shell || shell.dataset.scrollWired === "true") return;
  shell.dataset.scrollWired = "true";
  shell.addEventListener(
    "wheel",
    (event) => {
      const canScroll = shell.scrollHeight > shell.clientHeight;
      if (!canScroll) return;
      event.preventDefault();
      shell.scrollTop += event.deltaY;
    },
    { passive: false }
  );
  shell.addEventListener(
    "touchmove",
    (event) => {
      const canScroll = shell.scrollHeight > shell.clientHeight;
      if (canScroll) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    try {
      if (!overlayEnabled) {
        hideOverlayForCurrentPage();
        return;
      }
      if (dismissedOverlayUrl === location.href) return;
      if (isSupportedPage(getDomain())) renderOverlay(detectProduct());
    } catch {}
  }, 250);
}

async function readOverlayEnabled() {
  try {
    const result = await chrome.storage.local.get("elyon.settings");
    const settings = result?.["elyon.settings"] || {};
    return settings.overlayEnabled !== false;
  } catch {
    return true;
  }
}

async function init() {
  overlayEnabled = await readOverlayEnabled();
  const domain = getDomain();
  if (dismissedOverlayUrl !== location.href) {
    dismissedOverlayUrl = "";
  }
  if (!isSupportedPage(domain)) {
    removeOverlay();
    removeCommandBar();
    return;
  }
  if (!overlayEnabled) {
    hideOverlayForCurrentPage();
    return;
  }
  renderOverlay(detectProduct());
  if (mutationObserver) mutationObserver.disconnect();
  mutationObserver = new MutationObserver(() => scheduleRefresh());
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleRefresh, { passive: true });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removeCommandBar();
    commandBarVisible = false;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ELYON_TOGGLE_COMMAND_BAR") {
    toggleCommandBar(typeof message.force === "boolean" ? message.force : undefined);
  }
  if (message?.type === "ELYON_SET_OVERLAY_ENABLED") {
    overlayEnabled = message.enabled !== false;
    if (!overlayEnabled) {
      hideOverlayForCurrentPage();
      return;
    }
    dismissedOverlayUrl = "";
    if (isSupportedPage(getDomain())) renderOverlay(detectProduct());
  }
  if (message?.type === "ELYON_GET_PRODUCT") {
    sendResponse({ ok: true, product: detectProduct() });
    return;
  }
  if (message?.type === "ELYON_SCAN_ALIEXPRESS_VARIANTS") {
    scanAliExpressVariants()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "ELYON_SCAN_PLATFORM_VARIANTS") {
    Promise.resolve(scanVisibleVariantsSnapshot(detectPlatform()))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "ELYON_CAPTURE_SELECTED_TEXT") {
    const result = message.text ? captureTextValue(message.text, message.target || "auto") : captureSelectedText(message.target || "auto");
    if (result.ok && message.persist !== false) {
      chrome.runtime.sendMessage({ type: "ELYON_MANUAL_CAPTURE_SAVE", capture: result.capture, product: result.product }).catch(() => null);
    }
    sendResponse(result);
    return;
  }
  if (message?.type === "ELYON_CAPTURE_IMAGE") {
    const result = captureImageUrl(message.srcUrl || "", message.asMain === true);
    sendResponse(result);
    return;
  }
  if (message?.type === "ELYON_PING") {
    sendResponse({ ok: true });
    return;
  }
});

init();
