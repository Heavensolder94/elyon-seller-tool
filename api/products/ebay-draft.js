import { applyCors } from "../../lib/api-cors.js";
import { buildDraftPreview, loadProducts } from "./_store.js";

function json(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Nur GET erlaubt." });
  }

  const id = String(req.query?.id || "").trim();
  if (!id) {
    return json(res, 400, { ok: false, error: "Produkt-ID fehlt." });
  }

  const items = await loadProducts();
  const product = items.find((item) => String(item.id) === id);
  if (!product) {
    return json(res, 404, { ok: false, error: "Produkt nicht gefunden." });
  }

  return json(res, 200, buildDraftPreview(product));
}
