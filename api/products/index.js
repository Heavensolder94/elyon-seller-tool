import { requireSellerAccess } from "../../lib/seller-access.js";
import {
  loadProductMasterForSeller,
  productMasterSummary,
} from "../../lib/product-master-consumer.js";

function text(value, max = 500) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function requestedIdentity(req) {
  return text(
    req?.query?.id ||
    req?.query?.articleNumber ||
    req?.query?.sku ||
    req?.query?.listingId ||
    req?.query?.offerId ||
    req?.body?.id ||
    req?.body?.articleNumber ||
    req?.body?.sku ||
    req?.body?.listingId ||
    req?.body?.offerId,
    240,
  );
}

function readOnlyResponse(res) {
  return res.status(409).json({
    ok: false,
    route: "/api/products",
    error: "product_master_read_only",
    message: "Der kanonische Product Master gehört Company OS. Seller Tool darf nur lesen und lokale Arbeitskopien für operative Abläufe führen.",
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

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;

  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return readOnlyResponse(res);

  try {
    const result = await loadProductMasterForSeller({
      identity: requestedIdentity(req),
    });
    return res.status(200).json({
      ok: true,
      route: "/api/products",
      products: result.products,
      summary: productMasterSummary(result.products),
      ownerSystem: "elyon_company_os",
      sourceOfTruth: "company_os_canonical_state",
      schemaVersion: "elyon-product-master-v2",
      consumer: {
        role: "seller_tool",
        writes: "blocked",
        localStorageRole: "working_copy_only",
      },
      sync: {
        source: result.source,
        freshness: result.freshness,
        generatedAt: result.generatedAt || null,
        staleReason: result.staleReason || null,
        cache: result.cacheStatus || null,
      },
      contract: result.contract || {
        entryBoundary: "product_review_identity_assigned",
        rawNovaWithoutElyonIdentityIncluded: false,
        sellerToolRole: "consumer",
        ebayStateOwnedBy: "company_os_channel_lifecycle",
      },
      safety: result.safety,
    });
  } catch (error) {
    return res.status(Number(error?.status || 503)).json({
      ok: false,
      route: "/api/products",
      error: text(error?.code || "product_master_unavailable", 120),
      message: text(error?.message || "Company OS Product Master v2 konnte nicht geladen werden.", 1000),
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
}
