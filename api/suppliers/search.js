import { applyCors } from "../../lib/api-cors.js";
import { fillSearchUrl, getSupplierByKey, getSupplierRegistry, getSupplierStatus } from "../../lib/supplier-registry.js";
import { normalizeSupplierProduct } from "../../lib/supplier-product-normalizer.js";

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createBrowserFallback(item, query, reason) {
  return {
    ok: true,
    supplier: item.key,
    supplierName: item.name,
    query,
    status: "fallback_active",
    statusLabel: "Fallback aktiv",
    reason,
    browserSearchUrl: fillSearchUrl(item.searchUrl, query),
    items: [],
    message: reason,
  };
}

async function searchViaApi(req, item, query) {
  if (item.key !== "cj") {
    return createBrowserFallback(item, query, "Für diesen Supplier ist aktuell nur Browser-Suche vorbereitet.");
  }

  const host = req.headers?.host || process.env.VERCEL_URL || "localhost";
  const protocol = host.includes("localhost") ? "http" : "https";
  const endpoint = `${protocol}://${host}/api/cj?q=${encodeURIComponent(query)}&limit=10`;
  const response = await fetch(endpoint);
  const data = await parseJson(response);
  if (!response.ok || !data?.ok) {
    return createBrowserFallback(item, query, data?.error || "API nicht verfügbar. Browser-Suche bleibt aktiv.");
  }

  const items = Array.isArray(data.products)
    ? data.products.map((product) => ({
        ...normalizeSupplierProduct({
          supplier: item.name,
          sourceUrl: product.productLink,
          title: product.title,
          price: product.price,
          currency: "USD",
          image: product.image,
          shipping: { deliveryText: product.shipping },
          variants: product.variants,
          category: product.category,
          sku: product.sku,
          importedAt: new Date().toISOString(),
        }),
        previewOnly: true,
      }))
    : [];

  return {
    ok: true,
    supplier: item.key,
    supplierName: item.name,
    query,
    status: "api_active",
    statusLabel: "API aktiv",
    browserSearchUrl: fillSearchUrl(item.searchUrl, query),
    items,
    message: items.length
      ? "Suchtreffer vorbereitet. Finaler Import bleibt Browser-basiert."
      : "Keine API-Treffer gefunden. Browser-Suche bleibt verfügbar.",
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
  }

  const query = text(req.query?.q || req.query?.query);
  const supplierKey = text(req.query?.supplier);
  if (!query) {
    return res.status(400).json({ ok: false, error: "Suchbegriff fehlt." });
  }

  const item = getSupplierByKey(supplierKey);
  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "Supplier nicht gefunden.",
      suppliers: getSupplierRegistry().map((entry) => entry.key),
    });
  }

  const status = getSupplierStatus(item);
  if (!status.apiActive) {
    return res.status(200).json(createBrowserFallback(item, query, "API-Key fehlt oder keine Supplier-API aktiv. Browser-Suche geöffnet."));
  }

  try {
    const result = await searchViaApi(req, item, query);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(200).json(createBrowserFallback(item, query, error?.message || "Suche fehlgeschlagen. Browser-Suche bleibt aktiv."));
  }
}
