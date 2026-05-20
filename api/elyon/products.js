function json(res, status, body) {
  return res.status(status).json(body);
}

function normalizeBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Nur POST erlaubt." });
  }

  const body = normalizeBody(req.body);
  const product = body.product || body.item || body.data || {};
  const title = toText(product.title || product.name || "Unbekanntes Produkt");
  const url = toText(product.url || "");

  return json(res, 200, {
    ok: true,
    route: "/api/elyon/products",
    message: "Produkt empfangen und für Elyon vorbereitet.",
    product: {
      title,
      url,
      status: toText(product.status || "new")
    },
    summary: body.summary && typeof body.summary === "object" ? body.summary : { total: 1 }
  });
}
