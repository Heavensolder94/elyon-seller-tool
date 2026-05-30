import cjHandler from "../cj.js";
import { applyCors } from "../../lib/api-cors.js";
import { detectSupplierByUrl } from "../../lib/supplier-registry.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "OPTIONS"])) return;
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    const detected = detectSupplierByUrl(req.body.url || "");
    if (detected.supplier && !req.body.supplier) {
      req.body = {
        ...req.body,
        supplier: detected.supplier.name,
        detectedSupplierKey: detected.supplier.key,
        detectedSupplierDomain: detected.domain,
      };
    }
  }
  req.query = { ...(req.query || {}), action: "source-analyze" };
  return cjHandler(req, res);
}
