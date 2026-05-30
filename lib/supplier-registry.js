function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeDomain(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return "";
  try {
    const url = text.includes("://") ? new URL(text) : new URL(`https://${text}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return text.replace(/^www\./, "");
  }
}

export const SUPPLIER_REGISTRY = [
  {
    id: "cj",
    key: "cj",
    name: "CJdropshipping",
    domains: ["cjdropshipping.com"],
    searchUrl: "https://www.cjdropshipping.com/search?keyWord={query}",
    envKeys: ["CJ_API_KEY", "CJ_ACCESS_TOKEN"],
    apiRoute: "/api/cj?q={query}",
    browserImport: true,
  },
  {
    id: "aliexpress",
    key: "aliexpress",
    name: "AliExpress",
    domains: ["aliexpress.com"],
    searchUrl: "https://www.aliexpress.com/wholesale?SearchText={query}",
    envKeys: [],
    apiRoute: "",
    browserImport: true,
  },
  {
    id: "amazon",
    key: "amazon",
    name: "Amazon",
    domains: ["amazon.de", "amazon.com"],
    searchUrl: "https://www.amazon.de/s?k={query}",
    envKeys: [],
    apiRoute: "",
    browserImport: true,
  },
  {
    id: "bigbuy",
    key: "bigbuy",
    name: "BigBuy",
    domains: ["bigbuy.eu", "bigbuy.com"],
    searchUrl: "https://www.bigbuy.eu/de/search/?q={query}",
    envKeys: [],
    apiRoute: "",
    browserImport: true,
  },
  {
    id: "temu",
    key: "temu",
    name: "Temu",
    domains: ["temu.com"],
    searchUrl: "https://www.temu.com/search_result.html?search_key={query}",
    envKeys: [],
    apiRoute: "",
    browserImport: true,
  },
  {
    id: "alibaba",
    key: "alibaba",
    name: "Alibaba",
    domains: ["alibaba.com"],
    searchUrl: "https://www.alibaba.com/trade/search?SearchText={query}",
    envKeys: [],
    apiRoute: "",
    browserImport: true,
  },
  {
    id: "dropxl",
    key: "dropxl",
    name: "DropXL",
    domains: ["dropxl.com"],
    searchUrl: "https://dropxl.com/?s={query}&post_type=product",
    envKeys: [],
    apiRoute: "",
    browserImport: true,
  },
];

export function getSupplierRegistry() {
  return SUPPLIER_REGISTRY.map((item) => ({ ...item, domains: item.domains.slice() }));
}

export function getSupplierByKey(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  return SUPPLIER_REGISTRY.find((item) =>
    item.key === text ||
    item.id === text ||
    item.name.toLowerCase() === text ||
    item.name.toLowerCase().includes(text)
  ) || null;
}

export function detectSupplierByUrl(value) {
  const domain = normalizeDomain(value);
  if (!domain) {
    return { supplier: null, domain: "" };
  }
  const supplier = SUPPLIER_REGISTRY.find((item) =>
    item.domains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`))
  ) || null;
  return { supplier, domain };
}

export function fillSearchUrl(template, query) {
  return normalizeText(template).replace("{query}", encodeURIComponent(normalizeText(query)));
}

export function getSupplierStatus(registryItem) {
  const item = registryItem || {};
  const configuredKeys = (item.envKeys || []).filter((key) => Boolean(process.env[key]));
  const apiReady = Boolean(item.apiRoute) && configuredKeys.length > 0;
  const browserImportActive = item.browserImport !== false;
  const fallbackActive = !apiReady && browserImportActive;
  const status = apiReady
    ? "api_active"
    : browserImportActive
      ? "fallback_active"
      : "not_configured";
  return {
    supplier: item.key || "",
    supplierName: item.name || "",
    apiActive: apiReady,
    browserImportActive,
    fallbackActive,
    configuredKeys,
    status,
    statusLabel: apiReady
      ? "API aktiv"
      : browserImportActive
        ? "Fallback aktiv"
        : "nicht konfiguriert",
  };
}
