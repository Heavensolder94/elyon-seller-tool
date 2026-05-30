import { applyCors } from "../../lib/api-cors.js";
import {
  deleteProductById,
  getStorageMeta,
  loadProducts,
  saveProducts,
  upsertProduct,
} from "./_store.js";

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

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "DELETE", "OPTIONS"])) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const items = await loadProducts();
    return json(res, 200, {
      ok: true,
      route: "/api/products",
      items,
      total: items.length,
      storage: getStorageMeta(false),
    });
  }

  if (req.method === "POST") {
    const body = normalizeBody(req.body);
    const incoming = body.product || body.item || body.data || body;
    if (!incoming || typeof incoming !== "object") {
      return json(res, 400, { ok: false, error: "Produktdaten fehlen." });
    }
    const current = await loadProducts();
    const next = upsertProduct(current, incoming);
    const persisted = await saveProducts(next.items);
    return json(res, 200, {
      ok: true,
      route: "/api/products",
      product: next.product,
      total: persisted.items.length,
      persisted: persisted.persisted,
      storage: getStorageMeta(persisted.persisted),
    });
  }

  if (req.method === "DELETE") {
    const id = String(req.query?.id || "").trim();
    if (!id) {
      return json(res, 400, { ok: false, error: "Produkt-ID fehlt." });
    }
    const current = await loadProducts();
    const next = deleteProductById(current, id);
    if (!next.removed) {
      return json(res, 404, { ok: false, error: "Produkt nicht gefunden." });
    }
    const persisted = await saveProducts(next.items);
    return json(res, 200, {
      ok: true,
      route: "/api/products",
      id,
      total: persisted.items.length,
      persisted: persisted.persisted,
      storage: getStorageMeta(persisted.persisted),
    });
  }

  return json(res, 405, { ok: false, error: "Nur GET, POST und DELETE erlaubt." });
}
