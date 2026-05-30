function readText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanText(value) {
  return readText(value).replace(/\s+/g, " ").trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = readText(value).replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function validateProduct(product) {
  const warnings = [];
  const errors = [];

  if (!product.sourceUrl) errors.push({ field: "sourceUrl", message: "Lieferanten-Link fehlt." });
  if (!product.title) warnings.push({ field: "title", message: "Titel fehlt oder konnte nicht erkannt werden." });
  if (!product.description) warnings.push({ field: "description", message: "Beschreibung fehlt. Markierten Text oder Produktbeschreibung manuell übernehmen." });
  if (!product.images.length) warnings.push({ field: "images", message: "Keine Bilder erkannt." });
  if (product.price === null) warnings.push({ field: "price", message: "Preis fehlt oder konnte nicht gelesen werden." });

  return { ok: errors.length === 0, errors, warnings };
}

function normalizeExtensionProduct(input) {
  const source = cleanText(input.source || input.provider || "aliexpress").toLowerCase();
  const selectedText = readText(input.selectedText || input.selection || "");
  const description = readText(input.description || input.productDescription || selectedText || "");
  const images = toArray(input.images || input.imageUrls || input.gallery);

  return {
    id: `ext-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source,
    sourceLabel: source === "aliexpress" ? "AliExpress" : source,
    sourceUrl: readText(input.sourceUrl || input.url || input.productUrl || input.href),
    title: cleanText(input.title || input.productTitle || input.name),
    description,
    price: toNumber(input.price || input.salePrice || input.currentPrice),
    priceRaw: readText(input.price || input.salePrice || input.currentPrice),
    images,
    variants: Array.isArray(input.variants) ? input.variants : [],
    shippingInfo: readText(input.shippingInfo || input.shipping || input.delivery || ""),
    supplierName: cleanText(input.supplierName || input.shopName || input.storeName || "AliExpress"),
    selectedText,
    rawHtml: readText(input.rawHtml || ""),
    importedAt: new Date().toISOString(),
    status: "imported_for_review",
    safety: {
      automaticListing: false,
      automaticOrder: false,
      manualApprovalRequired: true
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const product = normalizeExtensionProduct(body);
    const validation = validateProduct(product);

    return res.status(validation.ok ? 200 : 400).json({
      ok: validation.ok,
      source: "extension-product-import",
      product,
      validation,
      message: validation.ok
        ? "Produkt wurde für die manuelle Prüfung übernommen. Keine Live-Aktion ausgeführt."
        : "Produkt konnte wegen fehlendem Lieferanten-Link nicht übernommen werden.",
      nextStep: validation.ok
        ? "Produkt in Elyon prüfen: Titel, Bilder, Preis, Versandzeit, Marge und eBay-Listing manuell bestätigen."
        : "Bitte sourceUrl oder productUrl aus der Produktseite mitsenden."
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : "Extension-Import fehlgeschlagen."
    });
  }
}
