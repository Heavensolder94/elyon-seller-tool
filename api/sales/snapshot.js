import { loadSalesSnapshot, saveSalesSnapshot } from "../../lib/sales-snapshot.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireSellerAccess(req, res, { maxBodyBytes: 2 * 1024 * 1024 })) return;

  try {
    if (req.method === "GET") {
      const sales = await loadSalesSnapshot();
      return res.status(200).json({ ok: true, count: sales.length, sales });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET oder POST erlaubt." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sales = Array.isArray(body.sales) ? body.sales : Array.isArray(body) ? body : null;
    if (!sales) {
      return res.status(400).json({ ok: false, error: "sales_required", message: "Es wurde keine Verkaufsliste übergeben." });
    }
    const result = await saveSalesSnapshot(sales);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(Number(error?.status || 503)).json({
      ok: false,
      error: error?.code || "sales_snapshot_failed",
      message: error?.message || "Verkaufsdaten konnten nicht gesichert werden.",
    });
  }
}
