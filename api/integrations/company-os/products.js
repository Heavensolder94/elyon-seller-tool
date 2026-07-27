import { requireBridgeAccess } from "../../../lib/bridge-access.js";
import { normalizeProduct } from "../../../lib/product-master-active.js";
import {
  getProductMasterRedisConfig,
  readProductMasterList,
  upsertProductMasterItem,
  writeProductMasterList,
} from "../../../lib/product-master-store.js";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedStatus(value) {
  return text(value).toLocaleLowerCase("de-DE").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function isReviewedCompanyProduct(product = {}) {
  const approval = object(product.approval);
  const listingPackage = object(product.listingPackage || product.listingTask);
  const reviewStatus = normalizedStatus(product.reviewStatus);
  const processingStatus = normalizedStatus(product.processingStatus);
  const status = normalizedStatus(product.status);
  const listingStatus = normalizedStatus(listingPackage.status);

  return Boolean(
    product.reviewApproved === true ||
    approval.approved === true ||
    approval.manualApproved === true ||
    ["approved", "freigegeben"].includes(reviewStatus) ||
    ["ready for seller tool", "bereit fürs seller tool", "bereit fuer seller tool", "bereit manuell einstellen"].includes(processingStatus) ||
    ["ready for seller tool", "bereit fürs seller tool", "bereit fuer seller tool", "bereit manuell einstellen"].includes(status) ||
    ["completed", "approved", "ready for seller tool", "bereit manuell einstellen"].includes(listingStatus)
  );
}

function incomingProduct(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  return body.product || body.item || body.data || body;
}

export default async function handler(req, res) {
  if (!requireBridgeAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;
  const config = getProductMasterRedisConfig();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/integrations/company-os/products",
      bridge: { configured: true, source: "elyon_company_os" },
      storage: { configured: Boolean(config.url && config.token), source: config.source },
      acceptedStates: ["reviewApproved=true", "approved", "ready_for_seller_tool", "bereit_manuell_einstellen"],
      rejectedStates: ["in_review", "sent_to_review", "prüfen", "review"],
      safety: { automaticListing: false, automaticOrder: false, manualApprovalRequired: true },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST erlaubt." });
  }

  if (!config.url || !config.token) {
    return res.status(503).json({
      ok: false,
      error: "persistent_storage_required",
      message: "Product Master bleibt gesperrt, bis Upstash/KV persistent konfiguriert ist.",
      storage: { configured: false, source: config.source },
    });
  }

  const incoming = incomingProduct(req);
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return res.status(400).json({ ok: false, error: "invalid_product_payload", message: "Produktdatensatz fehlt." });
  }
  if (!isReviewedCompanyProduct(incoming)) {
    return res.status(409).json({
      ok: false,
      error: "company_os_final_approval_required",
      message: "Nur final freigegebene Produkte mit Status ready_for_seller_tool bzw. bereit_manuell_einstellen dürfen an das Seller Tool übertragen werden.",
    });
  }

  try {
    const now = new Date().toISOString();
    const prepared = {
      ...incoming,
      schemaVersion: text(incoming.schemaVersion || "elyon-seller-product-v1"),
      source: "elyon_company_os",
      sourceProvider: "company-os",
      sourceType: "company_os_approved",
      companyOsProductId: text(incoming.companyOsProductId || incoming.id),
      sourceImportId: text(incoming.sourceImportId || incoming.importId || incoming.novaId),
      sellerToolReceivedAt: now,
      sellerToolSyncStatus: "imported",
      sellerStatus: text(incoming.sellerStatus || "received_from_company_os"),
      processingStatus: "sent_to_seller_tool",
      reviewApproved: true,
      listingStatus: text(incoming.listingStatus || incoming.listing?.status || incoming.listingPackage?.status || "draft"),
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
      updatedAt: now,
    };
    const current = await readProductMasterList("elyon_products");
    const result = upsertProductMasterItem(current, prepared);
    const storage = await writeProductMasterList("elyon_products", result.items);
    const product = normalizeProduct(result.product);

    return res.status(200).json({
      ok: true,
      route: "/api/integrations/company-os/products",
      status: result.status,
      masterProductId: product.id,
      product,
      total: result.items.length,
      storage,
      message: result.status === "updated"
        ? "Freigegebener Company-OS-Datensatz im Product Master aktualisiert."
        : "Freigegebenes Produkt aus Company OS im Product Master gespeichert.",
      safety: { automaticListing: false, automaticOrder: false, manualApprovalRequired: true },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "company_os_product_bridge_failed",
      message: error?.message || "Company-OS-Produkt konnte nicht gespeichert werden.",
      storage: { configured: true, source: config.source },
    });
  }
}
