import { requireBridgeAccess } from "../../../lib/bridge-access.js";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedStatus(value) {
  return text(value).toLocaleLowerCase("de-DE").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

// Kept as a compatibility predicate for callers that still validate the old
// handoff payload. It no longer grants permission to write a Seller Product
// Master record.
export function isReviewedCompanyProduct(product = {}) {
  const approval = object(product.approval);
  const reviewStatus = normalizedStatus(product.reviewStatus);
  const processingStatus = normalizedStatus(product.processingStatus);
  const status = normalizedStatus(product.status);
  const hasExplicitApproval = Boolean(
    product.reviewApproved === true ||
    approval.approved === true ||
    approval.manualApproved === true ||
    ["approved", "freigegeben"].includes(reviewStatus)
  );
  const hasFinalHandoffStatus = Boolean(
    ["ready for seller tool", "bereit fürs seller tool", "bereit fuer seller tool", "bereit manuell einstellen"].includes(processingStatus) ||
    ["ready for seller tool", "bereit fürs seller tool", "bereit fuer seller tool", "bereit manuell einstellen"].includes(status)
  );
  return hasExplicitApproval && hasFinalHandoffStatus;
}

export default async function handler(req, res) {
  if (!requireBridgeAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/integrations/company-os/products",
      mode: "deprecated_write_bridge",
      ownerSystem: "elyon_company_os",
      consumerRoute: "/api/products",
      schemaVersion: "elyon-product-master-v2",
      message: "Der frühere Push-Import ist nur noch als Kompatibilitätsroute vorhanden. Der Seller Tool liest Product Master v2 read-only über /api/products.",
      safety: {
        writes: false,
        automaticListing: false,
        automaticOrder: false,
        manualApprovalRequired: true,
      },
    });
  }

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase())) {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und der sichere read-only-Kompatibilitätsfehler sind erlaubt." });
  }

  return res.status(409).json({
    ok: false,
    route: "/api/integrations/company-os/products",
    error: "product_master_read_only",
    message: "Company OS Product Master v2 ist die kanonische Quelle. Seller Tool nimmt keine fachlichen Produktwrites mehr an.",
    ownerSystem: "elyon_company_os",
    schemaVersion: "elyon-product-master-v2",
    safety: {
      projectionOnly: true,
      createsIdentity: false,
      publishesToEbay: false,
      createsOrders: false,
    },
  });
}
