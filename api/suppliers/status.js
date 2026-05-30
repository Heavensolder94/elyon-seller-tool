import { applyCors } from "../../lib/api-cors.js";
import { getSupplierRegistry, getSupplierStatus } from "../../lib/supplier-registry.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
  }

  const items = getSupplierRegistry().map((item) => ({
    id: item.id,
    key: item.key,
    name: item.name,
    domains: item.domains,
    searchUrl: item.searchUrl,
    apiRoute: item.apiRoute || "",
    ...getSupplierStatus(item),
  }));

  return res.status(200).json({
    ok: true,
    items,
    checkedAt: new Date().toISOString(),
  });
}
