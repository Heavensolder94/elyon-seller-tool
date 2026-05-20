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

function limitDescription(text) {
  const value = safeText(text);
  if (!value) return "";
  return value.slice(0, 12000);
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
  return pickMeta(["meta[property='og:image']", "meta[name='twitter:image']", "meta[property='twitter:image']"]) || "";
}

function getImages() {
  const values = [
    getImage(),
    ...Array.from(document.querySelectorAll("img"))
      .map((img) => img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy-src"))
      .filter((src) => /^https?:\/\//i.test(String(src || "")))
  ];
  return uniqueList(values, 12);
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
  return queryText([
    "#availability",
    "[class*='availability']",
    "[class*='stock']",
    "[data-testid*='availability']",
    "[data-testid*='stock']"
  ]) || "";
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
  const structured = getJsonLdDescription();
  if (structured) return structured;

  const selectors = [
    "#productDescription",
    "#feature-bullets",
    "#desc_div",
    "#j-product-description",
    "[data-pl='product-description']",
    "[class*='product-description']",
    "[class*='ProductDescription']",
    "[class*='description']",
    "[id*='description']"
  ];
  for (const selector of selectors) {
    const value = queryText([selector]);
    if (value && value.length > 40) return limitDescription(value);
  }

  return limitDescription(pickMeta(["meta[property='og:description']", "meta[name='description']"]) || "");
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
  const title = queryText(["[class*='product-title']", "[class*='title']", "[data-pl='product-title']", "h1"], root);
  const price = queryText(["[class*='price']", "[data-pl='product-price']", "[class*='product-price']"], root);
  const image = queryAttr(["img", "[class*='image'] img", "[class*='gallery'] img"], "src", root);
  const description = queryText(["[class*='description']", "[class*='product-description']", "[data-pl='product-description']"], root);
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
  if (response.importResult?.storedLocally) return response.importResult.message || "Backend nicht erreichbar - lokal gespeichert";
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
