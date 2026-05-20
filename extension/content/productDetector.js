const OVERLAY_ID = "elyon-browser-os-overlay";
const COMMAND_BAR_ID = "elyon-browser-os-command-bar";
let commandBarVisible = false;
let mutationObserver = null;
let refreshTimer = null;

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
  if (/€/.test(value)) return "EUR";
  if (/\$/.test(value)) return "USD";
  if (/£/.test(value)) return "GBP";
  if (/¥/.test(value)) return "JPY";
  return null;
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

function getTitle() {
  return (
    pickMeta(["meta[property='og:title']", "meta[name='twitter:title']", "meta[name='title']"]) ||
    safeText(document.title)
  );
}

function getPrice() {
  return (
    pickMeta([
      "meta[property='product:price:amount']",
      "meta[property='og:price:amount']",
      "meta[name='price']"
    ]) ||
    safeText(document.querySelector("[class*='price']")?.textContent) ||
    safeText(document.querySelector("[data-testid*='price']")?.textContent) ||
    safeText(document.querySelector("[aria-label*='price']")?.getAttribute("aria-label")) ||
    ""
  );
}

function getImage() {
  return (
    pickMeta([
      "meta[property='og:image']",
      "meta[name='twitter:image']",
      "meta[property='twitter:image']"
    ]) || ""
  );
}

function getDescription() {
  return pickMeta(["meta[property='og:description']", "meta[name='description']"]) || "";
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
  return (
    candidates.find((node) => {
      const text = safeText(node.textContent);
      const rect = node.getBoundingClientRect?.();
      const visible = rect && rect.width > 180 && rect.height > 120;
      return text && visible;
    }) || null
  );
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
  const price = popupData?.price || getPrice() || null;
  const image = popupData?.image || getImage() || null;
  const currency = getCurrencyFromText(price) || null;
  const description = popupData?.description || getDescription() || null;

  return {
    title,
    price,
    image,
    url: url || null,
    supplier,
    domain,
    currency,
    detectedAt: new Date().toISOString(),
    productType: getProductType(domain, url),
    description
  };
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  document.documentElement.appendChild(overlay);
  return overlay;
}

function removeOverlay() {
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

async function sendToElyon(product) {
  const response = await chrome.runtime.sendMessage({ type: "ELYON_SAVE_PRODUCT", product }).catch(() => null);
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
    {
      id: "save",
      label: "Produkt speichern",
      action: () => storeResearch({ ...product, status: "new" })
    },
    {
      id: "send",
      label: "Zu Elyon senden",
      action: () => sendToElyon({ ...product, status: "new" })
    },
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
  const overlay = ensureOverlay();
  const imageMarkup = product.image
    ? `<div class="elyon-image-wrap"><img class="elyon-image" src="${product.image}" alt="Produktbild" loading="lazy" referrerpolicy="no-referrer" /><a class="elyon-image-link" href="${product.image}" target="_blank" rel="noreferrer">Bild öffnen</a></div>`
    : `<strong>-</strong>`;
  overlay.innerHTML = `
    <div class="elyon-overlay-shell">
      <div class="elyon-overlay-header">
        <div>
          <div class="elyon-overlay-brand">Elyon Browser OS</div>
          <div class="elyon-overlay-sub">Smart Overlay</div>
        </div>
        <button type="button" class="elyon-overlay-close" data-elyon-close>×</button>
      </div>
      <div class="elyon-overlay-card">
        <div class="elyon-field"><span>Title</span><strong>${product.title || "-"}</strong></div>
        <div class="elyon-field"><span>Price</span><strong>${product.price || "-"}</strong></div>
        <div class="elyon-field"><span>Image</span>${imageMarkup}</div>
        <div class="elyon-field"><span>URL</span><strong>${product.url || "-"}</strong></div>
        <div class="elyon-field"><span>Supplier</span><strong>${product.supplier || "-"}</strong></div>
        <div class="elyon-field"><span>Domain</span><strong>${product.domain || "-"}</strong></div>
        <div class="elyon-field"><span>Currency</span><strong>${product.currency || "-"}</strong></div>
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

  overlay.querySelector("[data-elyon-close]")?.addEventListener("click", removeOverlay);
  overlay.querySelector('[data-elyon-action="close"]')?.addEventListener("click", removeOverlay);
  overlay.querySelector('[data-elyon-action="save"]')?.addEventListener("click", () => storeResearch({ ...product, status: "new" }));
  overlay.querySelector('[data-elyon-action="research"]')?.addEventListener("click", () => storeResearch({ ...product, status: "new" }));
  overlay.querySelector('[data-elyon-action="soul"]')?.addEventListener("click", () => {
    chrome.runtime.sendMessage({
      type: "ELYON_SAVE_PRODUCT",
      product: { ...product, status: "new", soulState: "prepared" }
    });
  });
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    try {
      if (isSupportedPage(getDomain())) renderOverlay(detectProduct());
    } catch {}
  }, 250);
}

function init() {
  const domain = getDomain();
  if (!isSupportedPage(domain)) {
    removeOverlay();
    removeCommandBar();
    return;
  }
  renderOverlay(detectProduct());
  if (mutationObserver) mutationObserver.disconnect();
  mutationObserver = new MutationObserver(() => scheduleRefresh());
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", scheduleRefresh, { passive: true });
  window.addEventListener("resize", scheduleRefresh, { passive: true });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removeCommandBar();
    commandBarVisible = false;
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "ELYON_TOGGLE_COMMAND_BAR") {
    toggleCommandBar(typeof message.force === "boolean" ? message.force : undefined);
  }
  if (message?.type === "ELYON_PING") return;
});

init();
