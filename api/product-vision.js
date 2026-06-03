import { applyCors } from "../lib/api-cors.js";

function getOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:4173");
  return `${proto}://${host}`;
}

async function readJson(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        ok: false,
        error: error?.message || "Request failed",
      },
    };
  }
}

function normalizePrice(value) {
  const number = Number(String(value || "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildRecommendation(profit, marginPercent) {
  if (profit <= 0 || marginPercent <= 0) return { recommendation: "Stop", riskLevel: "high" };
  if (marginPercent < 15) return { recommendation: "Prüfen", riskLevel: "medium" };
  return { recommendation: "Go", riskLevel: "low" };
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Nur POST erlaubt.",
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const barcode = String(body.barcode || "").trim();
  const contextUrl = String(body.context || body.url || "").trim();
  const image = typeof body.image === "string" ? body.image : "";
  const origin = getOrigin(req);

  let sourceData = null;
  if (contextUrl) {
    const sourceResponse = await readJson(`${origin}/api/source/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url: contextUrl }),
    });
    if (sourceResponse.ok) sourceData = sourceResponse.data;
  }

  const query = barcode || sourceData?.title || contextUrl;
  let ebayItems = [];
  if (query) {
    const ebayResponse = await readJson(`${origin}/api/ebay/search?q=${encodeURIComponent(query)}&limit=8`, {
      headers: {
        Accept: "application/json",
      },
    });
    ebayItems = Array.isArray(ebayResponse.data?.items) ? ebayResponse.data.items : [];
  }

  const sellPrices = ebayItems
    .map((item) => normalizePrice(item?.price?.value || item?.price || 0))
    .filter((value) => value > 0);
  const estimatedSellPrice = average(sellPrices);
  const estimatedPurchasePrice = normalizePrice(sourceData?.price) || (estimatedSellPrice ? estimatedSellPrice * 0.45 : 0);
  const estimatedFees = estimatedSellPrice * 0.13;
  const estimatedProfit = estimatedSellPrice - estimatedPurchasePrice - estimatedFees;
  const marginPercent = estimatedSellPrice > 0 ? (estimatedProfit / estimatedSellPrice) * 100 : 0;
  const recommendation = buildRecommendation(estimatedProfit, marginPercent);

  return res.status(200).json({
    ok: true,
    source: "mobile-product-vision",
    productName: sourceData?.title || (barcode ? `Barcode ${barcode}` : image ? "Fotoanalyse" : "Produktanalyse"),
    title: sourceData?.title || (barcode ? `Barcode ${barcode}` : "Produktanalyse"),
    category: sourceData?.category || "Mobile Scanner",
    notes: sourceData?.description || (image ? "Foto erfasst. Preiseinschätzung aus Marktdaten/Fallback berechnet." : "Marktdaten ausgewertet."),
    recommendation: recommendation.recommendation,
    riskLevel: recommendation.riskLevel,
    estimatedSellPrice: Number(estimatedSellPrice.toFixed(2)),
    estimatedPurchasePrice: Number(estimatedPurchasePrice.toFixed(2)),
    estimatedProfit: Number(estimatedProfit.toFixed(2)),
    estimatedMarginPercent: Number(marginPercent.toFixed(2)),
    searchKeywords: [barcode, sourceData?.supplier, sourceData?.category].filter(Boolean),
    marketHits: ebayItems.length,
    supplier: sourceData?.supplier || "",
    hasImage: Boolean(image),
  });
}
