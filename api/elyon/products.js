import soulHandler from "../elyon-soul.js";

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

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({
      ok: false,
      error: "Nur POST erlaubt."
    });
  }

  const body = normalizeBody(req.body);
  const product = body.product || body.item || body.data || {};
  const forwardedBody = {
    action: "save-product",
    prompt: "Produkt aus Elyon Browser OS speichern und vorbereiten.",
    products: toArray(product),
    summary: body.summary && typeof body.summary === "object" ? body.summary : { total: 1 }
  };

  req.body = forwardedBody;
  return soulHandler(req, res);
}
