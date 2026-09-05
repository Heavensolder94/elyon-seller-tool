import ebayHandler from "./index.js";
import { requireSellerAccess } from "../../lib/seller-access.js";
import { parseEbayMoney } from "../../lib/ebay-money.js";

function normalizeDraftBody(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const price = parseEbayMoney(source.price ?? source.sellPrice ?? source?.draft?.price);
  const shipping = parseEbayMoney(source.shipping ?? source?.draft?.shipping);
  const categoryId = String(source.categoryId || source.ebayCategoryId || source?.draft?.categoryId || "").trim();
  return {
    ...source,
    price,
    sellPrice: price,
    shipping,
    categoryId,
    environment: source.environment || source.env || process.env.EBAY_ENV || "production",
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 1024 * 1024 })) return;
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, draftCreated: false, published: false, error: "Nur POST erlaubt." });
  }

  req.body = normalizeDraftBody(req.body);
  if (req.body.price > 250000) {
    return res.status(400).json({
      ok: false,
      draftCreated: false,
      published: false,
      error: "Verkaufspreis liegt außerhalb der Sicherheitsgrenze.",
    });
  }
  req.query = { ...(req.query || {}), action: "create-draft" };
  return ebayHandler(req, res);
}
