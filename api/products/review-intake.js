import { requireSellerAccess } from "../../lib/seller-access.js";
import { fetchSellerState } from "../ebay/seller-state.js";
import { fetchCompanyOsProductMaster } from "../../lib/product-master-consumer.js";

const AMAZON_SKU = /^AMZ-[A-Z0-9]{10}$/;
const ELY_ARTICLE = /^ELY-\d{6,}$/i;

function text(value, max = 240) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function skuId(value) {
  return text(value, 80).toUpperCase();
}

function matchIds(product) {
  const identity = product?.identity || {};
  const channel = product?.channels?.ebay || {};
  return [
    identity.supplierSku, identity.sourceImportId,
    product?.supplierSku, product?.sourceImportId,
    channel.sku, channel.offerId, channel.listingId,
  ].map(skuId).filter(Boolean);
}

export function findExistingCompanyReview(records, sku) {
  const wanted = skuId(sku);
  const sourceId = "SELLER-EBAY-REVIEW:" + wanted;
  const matches = (Array.isArray(records) ? records : []).filter((record) => {
    const ids = matchIds(record);
    return ids.includes(wanted) || ids.includes(sourceId);
  });
  if (matches.length > 1) return { status: "ambiguous", record: null };
  return matches.length === 1 ? { status: "exists", record: matches[0] } : { status: "missing", record: null };
}

export function selectExistingSellerDraft(sellerState, sku) {
  if (sellerState?.draftsAvailable === false || sellerState?.elyonDrafts?.readable === false) {
    return { status: "unavailable", draft: null };
  }
  const matches = (Array.isArray(sellerState?.draftItems) ? sellerState.draftItems : [])
    .filter((item) => skuId(item?.sku) === skuId(sku) && text(item?.status).toUpperCase() === "UNPUBLISHED");
  if (matches.length > 1) return { status: "ambiguous", draft: null };
  return matches.length === 1 ? { status: "found", draft: matches[0] } : { status: "missing", draft: null };
}

export function buildPendingCompanyReview(draft) {
  const sku = skuId(draft?.sku);
  if (!AMAZON_SKU.test(sku)) throw new Error("invalid_amazon_sku");
  const sourceImportId = "seller-ebay-review:" + sku;
  const id = "seller_ebay_review_" + sku;
  const listingTitle = text(draft?.title, 180);
  if (!listingTitle) throw new Error("draft_title_missing");
  const ebayReferencePrice = Number(draft?.price);
  const referencePrice = Number.isFinite(ebayReferencePrice) && ebayReferencePrice > 0 ? ebayReferencePrice : null;
  const images = (Array.isArray(draft?.images) ? draft.images : [])
    .map((image) => text(image, 1800)).filter((image) => /^https:\/\//i.test(image)).slice(0, 8);
  const referenceUrl = "https://www.amazon.de/dp/" + sku.slice(4);
  const meta = {
    ebaySku: sku,
    ebayOfferId: text(draft?.offerId, 120),
    ebayExternalTaskId: text(draft?.externalTaskId, 220),
    ebayReferencePrice: referencePrice,
    amazonResearchUrl: referenceUrl,
    supplierVerified: false,
    supplierCostVerified: false,
    imageRightsVerified: false,
    policyReviewRequired: true,
    reviewOnly: true,
  };
  const source = {
    id,
    sourceImportId,
    supplierSku: sku,
    name: listingTitle,
    title: listingTitle,
    source: "elyon_seller_ebay_review",
    sourceLabel: "eBay-Entwurf zur manuellen Produktprüfung",
    sourceRole: "research_reference_only",
    images,
    meta,
    status: "prüfen",
    reviewStatus: "in_review",
    processingStatus: "supplier_verification_required",
    // Keep marketplace/retail prices as references only, never as a verified buy or sell price.
    ebayReferencePrice: referencePrice,
    researchUrl: referenceUrl,
    imageRightsConfirmed: false,
    supplierContractVerified: false,
  };
  const product = {
    ...source,
    supplier: { name: "", url: "" },
    supplierName: "",
    articleNumber: "",
    // Company OS owns the ELY number. Do not supply or overwrite it from Seller Tool.
    sku: "",
    costPrice: null,
    buyPrice: null,
    shippingCost: null,
    salePrice: null,
    sellPrice: null,
    estimatedFees: null,
    estimatedProfit: null,
    marginPercent: null,
    productReviewDecision: "pruefen",
    compliance: {
      status: "pending_supplier_and_rights_verification",
      supplierVerified: false,
      imageRightsVerified: false,
      fulfillmentPolicyVerified: false,
    },
  };
  return { transition: "move_to_review", import: source, product };
}

function companyOsBaseUrl(env) {
  const configured = text(env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || "https://elyon-company-os.vercel.app", 1000);
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_company_os_url");
  return url;
}

export async function submitSellerDraftReview({
  sku, env = process.env, sellerState = fetchSellerState,
  getMaster = fetchCompanyOsProductMaster, fetchImpl = fetch,
} = {}) {
  const wanted = skuId(sku);
  if (!AMAZON_SKU.test(wanted)) return {
    status: 400, body: { ok: false, error: "invalid_sku", message: "Nur eBay-Entwürfe mit eindeutiger Amazon-SKU AMZ-XXXXXXXXXX können so übergeben werden." },
  };
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE, 500);
  if (syncCode.length < 6) return {
    status: 503, body: { ok: false, error: "company_os_sync_unavailable", message: "Company OS Sync-Code ist serverseitig nicht eingerichtet." },
  };

  const state = await sellerState("production");
  const selected = selectExistingSellerDraft(state, wanted);
  if (selected.status !== "found") return {
    status: selected.status === "ambiguous" ? 409 : 404,
    body: { ok: false, error: "seller_draft_" + selected.status, message: "Der bestehende eBay-Entwurf konnte nicht eindeutig und aktuell aus dem Verkäuferkonto bestätigt werden. Es wurde nichts angelegt." },
  };

  // A fresh read is mandatory: never replace canonical Product Master data
  // or make a new ELY identity based on a stale/failed lookup.
  const master = await getMaster({ env });
  const existing = findExistingCompanyReview(master.records, wanted);
  if (existing.status === "ambiguous") return {
    status: 409, body: { ok: false, error: "master_identity_ambiguous", message: "Mehrere Company-OS-Produkte passen. Bitte die Identität im Company OS manuell prüfen." },
  };
  if (existing.status === "exists") {
    const articleNumber = text(existing.record?.identity?.articleNumber || existing.record?.articleNumber);
    return {
      status: 200,
      body: { ok: true, created: false, alreadyExists: true, sku: wanted, articleNumber,
        message: "Der geprüfte Company-OS-Produktdatensatz existiert bereits. Es wurde nichts dupliziert." },
    };
  }

  const payload = buildPendingCompanyReview(selected.draft);
  const url = new URL("/api/company-os-workflow", companyOsBaseUrl(env));
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Elyon-Sync-Code": syncCode },
    body: JSON.stringify({ ...payload, syncCode }),
    signal: AbortSignal.timeout(16000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) return {
    status: response.status >= 400 && response.status < 500 ? response.status : 502,
    body: { ok: false, error: text(result.error || "company_os_review_creation_failed", 120),
      message: "Company OS konnte den Produktprüfungsdatensatz nicht übernehmen. Kein eBay-Angebot wurde verändert." },
  };
  const createdProduct = result?.result?.product || {};
  const articleNumber = text(createdProduct.articleNumber || createdProduct.identity?.articleNumber, 80);
  if (!ELY_ARTICLE.test(articleNumber) || text(createdProduct.sourceImportId) !== payload.product.sourceImportId) {
    return { status: 502, body: { ok: false, error: "company_os_identity_not_verified",
      message: "Company OS hat keine verifizierbare ELY-Artikelnummer zurückgegeben. Bitte den Prüfungsbestand kontrollieren, bevor du erneut klickst." } };
  }
  return {
    status: 200, body: {
      ok: true, created: true, alreadyExists: false,
      sku: wanted, articleNumber, reviewStatus: "in_review",
      supplierVerified: false, costVerified: false, imageRightsVerified: false,
      ebayListingUnchanged: true,
      message: "Company-OS-Produktprüfung angelegt. ELY-Artikelnummer vergeben; Lieferant, Kosten, Bilderrechte und Freigabe bleiben offen.",
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!requireSellerAccess(req, res, { maxBodyBytes: 4096 })) return;
  const origin = text(req.headers?.origin, 600);
  const forwardedHost = text(req.headers?.["x-forwarded-host"] || req.headers?.host, 500).split(",")[0];
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (!host || host !== forwardedHost) {
      return res.status(403).json({ ok: false, error: "origin_not_allowed", message: "Nur Anfragen aus dem eigenen Seller Tool sind erlaubt." });
    }
  }
  try {
    const sku = req.body && typeof req.body === "object" ? req.body.sku : "";
    const result = await submitSellerDraftReview({ sku });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: "product_review_temporarily_unavailable",
      message: "Produktprüfung konnte nicht sicher ausgeführt werden. Bitte Company-OS-Verbindung und Verkäuferstatus prüfen.",
    });
  }
}
