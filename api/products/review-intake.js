import { requireSellerAccess } from "../../lib/seller-access.js";
import { fetchSellerState } from "../ebay/seller-state.js";
import { fetchCompanyOsProductMaster } from "../../lib/product-master-consumer.js";
import { syncAmazonPriceReference } from "../../lib/amazon-price-reference-sync.js";

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
  const observedAmazonPrice = Number(draft?.amazonReferencePrice);
  const amazonReferencePrice = draft?.amazonReferencePrice !== null && draft?.amazonReferencePrice !== undefined
    && Number.isFinite(observedAmazonPrice) && observedAmazonPrice >= 0.01 && observedAmazonPrice <= 100000
    ? Math.round(observedAmazonPrice * 100) / 100 : null;
  const images = (Array.isArray(draft?.images) ? draft.images : [])
    .map((image) => text(image, 1800)).filter((image) => /^https:\/\//i.test(image)).slice(0, 8);
  const referenceUrl = "https://www.amazon.de/dp/" + sku.slice(4);
  const meta = {
    ebaySku: sku,
    originSystem: "elyon_seller_tool",
    originType: "amazon_product_research",
    ebayOfferId: text(draft?.offerId, 120),
    ebayExternalTaskId: text(draft?.externalTaskId, 220),
    ebayReferencePrice: referencePrice,
    amazonResearchUrl: referenceUrl,
    amazonReferencePrice,
    amazonReferenceCapturedAt: amazonReferencePrice !== null ? text(draft?.amazonReferenceCapturedAt, 80) : "",
    amazonReferenceCurrency: "EUR",
    amazonReferenceRole: "retail_research_price_not_verified_supplier_cost",
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
    // Company OS treats source/sourceLabel as potential supplier identity.
    // Keep both unset: the eBay draft and Amazon page are research, not verified wholesale supply.
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
    // The Product Master is a projection: an existing review must not short-circuit
    // backfilling a newly observed Amazon price into the canonical Company OS state.
    const observedPrice = selected.draft.amazonReferencePrice;
    const amazonReferenceSync = observedPrice === null || observedPrice === undefined || observedPrice === ""
      ? { synced: false, state: "reference_missing" }
      : await syncAmazonPriceReference({
        sku: wanted,
        amazonReferencePrice: observedPrice,
        amazonReferenceCapturedAt: selected.draft.amazonReferenceCapturedAt,
        env, fetchImpl,
      });
    return {
      status: 200,
      body: { ok: true, created: false, alreadyExists: true, sku: wanted, articleNumber,
        amazonReferenceSync,
        message: amazonReferenceSync.synced
          ? "Bestehende Company-OS-Produktprüfung gefunden und Amazon-EK-Referenz aktualisiert. Keine zweite ELY-Artikelnummer."
          : "Bestehende Company-OS-Produktprüfung gefunden, aber Amazon-EK-Referenz nicht bestätigt (" + amazonReferenceSync.state + "). Keine zweite ELY-Artikelnummer." },
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

// Amazon research intake is independent of any existing eBay offer or feed task.
// Retail prices and page images remain research evidence, never verified costs or rights.
export async function submitAmazonResearchReview({ product = {}, env = process.env, getMaster = fetchCompanyOsProductMaster, fetchImpl = fetch } = {}) {
  const asin = text(product.asin, 20).toUpperCase();
  const title = text(product.title, 180);
  const sku = `AMZ-${asin}`;
  let sourceUrl;
  try { sourceUrl = new URL(text(product.sourceUrl, 2000)); } catch {}
  const amazonHost = /(^|\.)amazon\.(de|com|co\.uk|fr|it|es|nl|pl|se|be)$/i;
  const urlAsin = sourceUrl?.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase();
  if (!AMAZON_SKU.test(sku) || !title || !sourceUrl || sourceUrl.protocol !== "https:" || !amazonHost.test(sourceUrl.hostname) || urlAsin !== asin) {
    return { status: 400, body: { ok: false, error: "amazon_product_invalid", message: "Amazon-Produktseite mit passender ASIN und Titel erneut einlesen." } };
  }
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE, 500);
  if (syncCode.length < 6) return { status: 503, body: { ok: false, error: "company_os_sync_unavailable", message: "Company OS ist serverseitig nicht verbunden." } };
  const master = await getMaster({ env });
  if (!Array.isArray(master?.records)) throw new Error("company_os_product_master_unavailable");
  const existing = findExistingCompanyReview(master.records, sku);
  if (existing.status !== "missing") return { status: 409, body: { ok: false, error: "company_os_product_exists", message: "Ein passender Artikel ist bereits vorhanden. Bitte in Company OS prüfen." } };

  const workflowUrl = new URL("/api/company-os-workflow", companyOsBaseUrl(env));
  const headers = { "Content-Type": "application/json", Accept: "application/json", "X-Elyon-Sync-Code": syncCode };
  const capabilityResponse = await fetchImpl(workflowUrl, {
    method: "POST", headers, body: JSON.stringify({ transition: "read_workflow", syncCode }), signal: AbortSignal.timeout(16000),
  });
  const capability = await capabilityResponse.json().catch(() => ({}));
  if (!capabilityResponse.ok || capability.ok !== true || capability.transition !== "read_workflow" || capability.capabilities?.createOnlyReview !== true) {
    return { status: 503, body: { ok: false, error: "company_os_create_only_unavailable", message: "Company OS unterstützt den sicheren Import noch nicht. Bitte die Bereitstellung prüfen." } };
  }

  const payload = buildPendingCompanyReview({ sku, title, images: product.images, amazonReferencePrice: product.amazonReferencePrice, amazonReferenceCapturedAt: product.amazonReferenceCapturedAt });
  const researchImages = (Array.isArray(product.images) ? product.images : [])
    .map(image => text(image, 1800)).filter(image => /^https:\/\//i.test(image)).slice(0, 12);
  const selectedVariations = product.selectedVariations && typeof product.selectedVariations === "object" && !Array.isArray(product.selectedVariations)
    ? Object.fromEntries(Object.entries(product.selectedVariations).slice(0, 30).map(([key, value]) => [text(key, 120), text(value, 500)]).filter(([key, value]) => key && value)) : {};
  for (const item of [payload.import, payload.product]) {
    item.researchUrl = sourceUrl.href;
    item.description = text(product.description, 10000);
    item.brand = text(product.brand, 160);
    item.images = researchImages;
    item.variants = Array.isArray(product.variants) ? product.variants.slice(0, 60) : [];
    item.meta = { ...item.meta, originSystem: "elyon_amazon_importer", amazonResearchUrl: sourceUrl.href,
      amazonDetails: product.details && typeof product.details === "object" && !Array.isArray(product.details) ? product.details : {},
      amazonOriginalTitle: text(product.originalTitle, 1000), amazonOriginalDescription: text(product.originalDescription, 10000),
      amazonSelectedVariations: selectedVariations,
      amazonBullets: Array.isArray(product.bullets) ? product.bullets.map(value => text(value, 1000)).filter(Boolean).slice(0, 8) : [],
      amazonBreadcrumbs: Array.isArray(product.breadcrumbs) ? product.breadcrumbs.map(value => text(value, 200)).filter(Boolean).slice(0, 8) : [],
      researchAttributes: { department: text(product.department, 160), style: text(product.style, 160), material: text(product.material, 160), modelNumber: text(product.modelNumber, 160),
        ebayCategoryId: text(product.ebayCategoryId, 50), ebayCategoryName: text(product.ebayCategoryName, 160),
        itemSpecifics: product.itemSpecifics && typeof product.itemSpecifics === "object" && !Array.isArray(product.itemSpecifics) ? product.itemSpecifics : {} },
      amazonReferenceCurrency: text(product.currency, 8).toUpperCase() };
  }
  const response = await fetchImpl(workflowUrl, {
    method: "POST", headers,
    body: JSON.stringify({ ...payload, createOnly: true, syncCode }), signal: AbortSignal.timeout(16000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) return { status: response.status === 409 ? 409 : 502,
    body: { ok: false, error: text(result.error || "company_os_review_creation_failed", 120), message: response.status === 409 ? "Ein passender Artikel ist bereits vorhanden. Bitte in Company OS prüfen." : "Die Übertragung wurde nicht bestätigt. Vor erneutem Versuch den Artikel in Company OS prüfen." } };
  const created = result?.result?.product || {};
  const articleNumber = text(created.articleNumber || created.identity?.articleNumber, 80);
  if (!ELY_ARTICLE.test(articleNumber) || text(created.sourceImportId) !== payload.product.sourceImportId || created.workflowStage !== "product_review") {
    return { status: 502, body: { ok: false, error: "company_os_identity_not_verified", message: "Die Übertragung ist nicht eindeutig bestätigt. Bitte Company OS vor einem neuen Versuch prüfen." } };
  }
  return { status: 200, body: { ok: true, articleNumber, reviewStatus: "in_review", message: "Artikel zur Produktprüfung übertragen. Lieferant, Kosten und Bildrechte sind noch nicht bestätigt." } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!requireSellerAccess(req, res, { maxBodyBytes: 65536 })) return;
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
    const result = req.body?.mode === "amazon_research"
      ? await submitAmazonResearchReview({ product: req.body.product })
      : await submitSellerDraftReview({ sku });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: "product_review_temporarily_unavailable",
      message: "Produktprüfung konnte nicht sicher ausgeführt werden. Bitte Company-OS-Verbindung und Verkäuferstatus prüfen.",
    });
  }
}
