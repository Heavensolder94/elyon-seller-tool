import internalHandler from "../../internal/ebay/create-draft.js";
import { requireImporterAccess } from "../../lib/importer-request-guard.js";
import { parseEbayMoney } from "../../lib/ebay-money.js";

function normalizeDraftBody(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const price = parseEbayMoney(source.price ?? source.sellPrice);
  const shipping = parseEbayMoney(source.shipping);
  const categoryId = String(source.categoryId || source.ebayCategoryId || "").trim();
  return {
    ...source,
    price,
    sellPrice: price,
    shipping,
    sourceUrl: "",
    url: "",
    notes: "",
    category: categoryId || source.category
  };
}

export default async function handler(req, res) {
  if (!requireImporterAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  if (req.method === "POST") {
    req.body = normalizeDraftBody(req.body);
    if (req.body.price > 250000) {
      return res.status(400).json({ ok: false, draftCreated: false, published: false, error: "Verkaufspreis liegt außerhalb der Sicherheitsgrenze." });
    }
  }
  return internalHandler(req, res);
}
