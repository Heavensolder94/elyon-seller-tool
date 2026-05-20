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
  const text = safeText(value);
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

function getTitle() {
  return pickMeta(["meta[property='og:title']", "meta[name='twitter:title']", "meta[name='title']"]) || safeText(document.title);
}

function getPrice() {
  const direct = pickMeta([
    "meta[property='product:price:amount']",
    "meta[property='og:price:amount']",
    "meta[name='price']"
  ]);
  const fields = [
    direct,
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
  expandProductInformationSections();

  const structured = getJsonLdDescription();
  const selectors = [
    "#productDescription",
    "#productDescription_feature_div",
    "#feature-bullets",
    "#aplus",
    "#aplus_feature_div",
    "#productOverview_feature_div",
    "#detailBullets_feature_div",
    "#productFactsDesktop_feature_div",
    "#desc_div",
    "#j-product-description",
    "#product-description",
    "#product-details",
    "[data-pl='product-description']",
    "[data-widget-type='productDescription']",
    "[data-feature-name='productDescription']",
    "[data-feature-name='featurebullets']",
    "[data-feature-name='aplus']",
    "[class*='product-description']",
    "[class*='ProductDescription']",
    "[class*='product-detail']",
    "[class*='ProductDetail']",
    "[class*='description']",
    "[id*='description']"
  ];
  const combined = [structured, queryLongText(selectors)]
    .map(limitDescription)
    .filter(Boolean)
    .join("\n\n");
  if (combined && combined.length > 40) return limitDescription(combined);

  return limitDescription(pickMeta(["meta[property='og:description']", "meta[name='description']"]) || "");
}

function expandProductInformationSections(root = document) {
  const patterns = [
    /weitere\s+produktdetails/i,
    /produktdetails\s+anzeigen/i,
    /mehr\s+anzeigen/i,
    /vollstaendige?\s+beschreibung/i,
    /show\s+more/i,
    /see\s+more/i,
    /read\s+more/i,
    /more\s+product\s+details/i,
    /product\s+details/i
  ];
  const selectors = [
    "button",
    "[role='button']",
    "a",
    "summary",
    "[aria-expanded='false']",
    "[class*='expand']",
    "[class*='more']",
    "[data-action*='expand']"
  ];

  Array.from(root.querySelectorAll(selectors.join(","))).slice(0, 120).forEach((node) => {
    const label = safeText([
      node.textContent,
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.getAttribute?.("data-action")
    ].filter(Boolean).join(" "));
    if (!label || !patterns.some((pattern) => pattern.test(label))) return;
    const rect = node.getBoundingClientRect?.();
    const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    const visible = rect && rect.width > 0 && rect.height > 0 && (!style || style.visibility !== "hidden" && style.display !== "none");
    if (!visible) return;
    try {
      node.click();
    } catch {
      // If the marketplace blocks synthetic clicks, keep the already visible data.
    }
  });
}

function isSupportedPage(domain) {
  return /(^|\.)ebay\./i.test(domain) || /(^|\.)amazon\./i.test(domain) || /aliexpress/i.test(domain) || /cjdropshipping/i.test(domain) || /temu/i.test(domain);
}

function isAliExpress(domain) {
  return /aliexpress/i.test(domain);
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
  expandProductInformationSections(root);
  const title = queryText(["[class*='product-title']", "[class*='title']", "[data-pl='product-title']", "h1"], root);
  const price = queryText(["[class*='price']", "[data-pl='product-price']", "[class*='product-price']"], root);
  const image = normalizeImageUrl(queryAttr(["img", "[class*='image'] img", "[class*='gallery'] img"], "src", root));
  const description = queryLongText(["[class*='description']", "[class*='product-description']", "[data-pl='product-description']", "[class*='product-detail']", "[class*='ProductDetail']"], root);
  return { title, price, image, description };
}

function detectProduct() {
  const url = location.href;
  const domain = getDomain(url);
  const supplier = getSupplier(domain);
  const popupRoot = isAliExpress(domain) ? findVisiblePopup(document) : null;
  const popupData = popupRoot ? getAliExpressPopupData(popupRoot) : null;

  const title = popupData?.title || getTitle() || null;
  const price = extractPriceFromText(popupData?.price || getPrice()) || null;
  const images = uniqueList([popupData?.image, ...getImages()], 12);
  const image = images[0] || null;
  const currency = getCurrencyFromText(price) || null;
  const description = popupData?.description || getDescription() || null;
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

  return {
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
  const imageMarkup = product.image
    ? `<div class="elyon-image-wrap"><img class="elyon-image" src="${product.image}" alt="Produktbild" loading="lazy" referrerpolicy="no-referrer" /><a class="elyon-image-link" href="${product.image}" target="_blank" rel="noreferrer">Bild öffnen</a></div>`
    : `<strong>-</strong>`;
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
        <div class="elyon-field"><span>Title</span><strong>${product.title || "-"}</strong></div>
        <div class="elyon-field"><span>Price</span><strong>${product.price || "-"}</strong></div>
        <div class="elyon-field"><span>Image</span>${imageMarkup}</div>
        <div class="elyon-field"><span>URL</span><strong>${product.url || "-"}</strong></div>
        <div class="elyon-field"><span>Supplier</span><strong>${product.supplier || "-"}</strong></div>
        <div class="elyon-field"><span>Domain</span><strong>${product.domain || "-"}</strong></div>
        <div class="elyon-field"><span>Currency</span><strong>${product.currency || "-"}</strong></div>
        <div class="elyon-field"><span>Description</span><strong>${product.description || "-"}</strong></div>
        <div class="elyon-field"><span>Detected</span><strong>${product.detectedAt || "-"}</strong></div>
      </div>
      <div class="elyon-overlay-actions">
        <button type="button" data-elyon-action="save">Zu Elyon speichern</button>
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
    const result = await storeResearch({ ...product, status: "new" });
    alert(importFeedback(result, "Gespeichert"));
  });
  overlay.querySelector('[data-elyon-action="research"]')?.addEventListener("click", async () => {
    const result = await storeResearch({ ...product, status: "new" });
    alert(importFeedback(result, "Research gemerkt"));
  });
  overlay.querySelector('[data-elyon-action="soul"]')?.addEventListener("click", () => {
    chrome.runtime.sendMessage({
      type: "ELYON_SAVE_PRODUCT",
      product: { ...product, status: "new", soulState: "prepared" }
    });
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
  if (message?.type === "ELYON_PING") {
    sendResponse({ ok: true });
    return;
  }
});

init();
