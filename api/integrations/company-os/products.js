import { requireBridgeAccess } from "../../../lib/bridge-access.js";
import { normalizeProduct } from "../../../lib/product-master.js";
import {
  getProductMasterRedisConfig,
  readProductMasterList,
  upsertProductMasterItem,
  writeProductMasterList,
} from "../../../lib/product-master-store.js";

function text(value) {
  return String(value ?? "").trim();
}

export function isReviewedCompanyProduct(product = {}) {
  const reviewStatus = text(product.reviewStatus).toLowerCase();
  const processingStatus = text(product.processingStatus).toLowerCase();
  const section = text(product.companyOsSection || product.targetArea).toLowerCase();
  const status = text(product.status).toLowerCase();
  return Boolean(
    product.reviewApproved === true ||
    product.reviewAcceptedAt ||
    ["in_review", "reviewed", "approved"].includes(reviewStatus) ||
    ["sent_to_review", "reviewed", "approved", "ready_for_seller_tool"].includes(processingStatus) ||
    ["pruefen", "prüfen", "review"].includes(section) ||
    ["prüfen", "pruefen", "geprüft", "geprueft", "bereit fürs seller tool", "bereit fuer seller tool"].includes(status)
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
      error: "company_os_review_required",
      message: "Nur Produkte aus der Company-OS-Produktprüfung dürfen an den Product Master übertragen werden.",
    });
  }

  try {
    const now = new Date().toISOString();
    const prepared = {
      ...incoming,
      source: "elyon_company_os",
      sourceProvider: "company-os",
      sourceType: "company_os_review",
      companyOsProductId: text(incoming.companyOsProductId || incoming.id),
      sourceImportId: text(incoming.sourceImportId || incoming.importId || incoming.novaId),
      sellerToolReceivedAt: now,
      sellerToolSyncStatus: "imported",
      processingStatus: "sent_to_seller_tool",
      reviewApproved: true,
      listingStatus: text(incoming.listingStatus || incoming.listing?.status || "draft"),
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
        ? "Product-Master-Eintrag aus Company OS aktualisiert."
        : "Produkt aus Company OS im Product Master gespeichert.",
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
