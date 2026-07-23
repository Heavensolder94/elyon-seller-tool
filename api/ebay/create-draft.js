import internalHandler from "./create-draft-internal.js";
import { requireImporterAccess } from "../../lib/importer-request-guard.js";

export function parseEbayMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  let raw = String(value ?? "").trim().replace(/[\s'’]/g, "").replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    raw = raw.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    raw = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    raw = /\.\d{1,2}$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(/\./g, "");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

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
