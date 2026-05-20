const SUPPLIERS = [
  { name: "CJdropshipping", domains: ["cjdropshipping.com"] },
  { name: "AliExpress", domains: ["aliexpress.com"] },
  { name: "BigBuy", domains: ["bigbuy.eu", "bigbuy.com"] },
  { name: "Amazon.de", domains: ["amazon.de"] },
  { name: "Temu", domains: ["temu.com"] },
  { name: "Alibaba", domains: ["alibaba.com"] },
  { name: "dropxl.com", domains: ["dropxl.com"] },
  { name: "vidaXL", domains: ["vidaxl.de", "vidaxl.com"] },
];

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function detectSupplierFromUrl(url) {
  const domain = url.hostname.replace(/^www\./i, "").toLowerCase();
  const found = SUPPLIERS.find((supplier) =>
    supplier.domains.some((item) => domain === item || domain.endsWith(`.${item}`)),
  );
  return { domain, supplier: found ? found.name : "Unbekannter Supplier" };
}

function textBetween(html, regex) {
  const match = html.match(regex);
  return match && match[1] ? cleanText(match[1]) : "";
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function extractBasicMetadata(html, baseUrl) {
  const title =
    textBetween(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    textBetween(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
    textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    textBetween(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    textBetween(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const image =
    textBetween(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    textBetween(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  const price =
    textBetween(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i) ||
    textBetween(html, /"price"\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)/i);
  const currency =
    textBetween(html, /<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([^"']+)["']/i) ||
    textBetween(html, /"priceCurrency"\s*:\s*"([^"]+)"/i);
  const availability = textBetween(html, /"availability"\s*:\s*"([^"]+)"/i).split("/").pop();
  const category = textBetween(html, /"category"\s*:\s*"([^"]+)"/i);

  return {
    title,
    price,
    currency,
    image: absoluteUrl(image, baseUrl),
    availability,
    shipping: "",
    description,
    category,
  };
}

function normalizeSourceAnalysisResult({ url, supplier, domain, metadata, message, ok = true, reason = "" }) {
  const detectedFields = Object.fromEntries(
    Object.entries(metadata || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""),
  );
  const confidence = Object.keys(detectedFields).length >= 4 ? "medium" : Object.keys(detectedFields).length >= 2 ? "low" : "low";
  return {
    ok,
    mode: "online",
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
    detectedData: detectedFields,
    confidence,
    warnings: [],
    reason,
    status: ok ? "done" : "failed",
    checkedAt: new Date().toISOString(),
    message,
    url,
  };
}

async function analyzeSourceOnline(url, supplierName) {
  const detected = detectSupplierFromUrl(url);
  const supplier = supplierName || detected.supplier;
  const response = await fetch(url.toString(), { redirect: "follow" });
  if (!response.ok) {
    return normalizeSourceAnalysisResult({
      url: url.toString(),
      supplier,
      domain: detected.domain,
      metadata: {},
      ok: false,
      reason: "unsupported_supplier_or_blocked",
      message: "Fuer diese Quelle konnten noch keine Produktdaten automatisch gelesen werden.",
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return normalizeSourceAnalysisResult({
      url: url.toString(),
      supplier,
      domain: detected.domain,
      metadata: {},
      ok: false,
      reason: "unsupported_content_type",
      message: "Diese Quelle liefert keine auswertbare HTML-Produktseite.",
    });
  }

  const html = (await response.text()).slice(0, 600000);
  const metadata = extractBasicMetadata(html, url.toString());
  const hasData = Boolean(metadata.title || metadata.price || metadata.image || metadata.description);
  return normalizeSourceAnalysisResult({
    url: url.toString(),
    supplier,
    domain: detected.domain,
    metadata,
    ok: hasData,
    reason: hasData ? "" : "unsupported_supplier_or_blocked",
    message: hasData
      ? "Onlineanalyse abgeschlossen. Es wurden oeffentliche Metadaten erkannt."
      : "Automatisches Auslesen ist fuer diese Quelle noch nicht verfuegbar. Bitte Produktdaten manuell ergaenzen oder spaeter API-Anbindung nutzen.",
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, mode: "online", reason: "method_not_allowed", message: "Bitte POST verwenden." });
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const url = normalizeUrl(body.url);
  if (!url) {
    return res.status(400).json({ ok: false, mode: "online", reason: "invalid_url", message: "Bitte gueltigen Produktlink uebergeben." });
  }

  try {
    const result = await analyzeSourceOnline(url, String(body.supplier || "").trim());
    return res.status(result.ok ? 200 : 200).json(result);
  } catch {
    const detected = detectSupplierFromUrl(url);
    return res.status(200).json({
      ok: false,
      mode: "online",
      supplier: String(body.supplier || "").trim() || detected.supplier,
      domain: detected.domain,
      reason: "unsupported_supplier_or_blocked",
      message: "Fuer diese Quelle konnten noch keine Produktdaten automatisch gelesen werden.",
      confidence: "low",
      warnings: [],
      detectedData: {},
      status: "failed",
      checkedAt: new Date().toISOString(),
    });
  }
}
