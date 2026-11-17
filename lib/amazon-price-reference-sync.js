import { fetchCompanyOsProductMaster } from "./product-master-consumer.js";

const AMAZON_SKU = /^AMZ-[A-Z0-9]{10}$/;
const text = (v) => String(v ?? "").trim();
const price = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.01 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};

/**
 * Best-effort, post-verification sync. No eBay mutation or product creation.
 * An observed Amazon retail VK is only a potential purchase-price reference.
 */
export async function syncAmazonPriceReference({
  sku, amazonReferencePrice, amazonReferenceCapturedAt,
  env = process.env, getMaster = fetchCompanyOsProductMaster, fetchImpl = fetch,
} = {}) {
  const wanted = text(sku).toUpperCase();
  const observed = price(amazonReferencePrice);
  if (!AMAZON_SKU.test(wanted) || observed === null) {
    return { synced: false, state: "reference_missing" };
  }
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE);
  if (syncCode.length < 6) return { synced: false, state: "connection_unavailable" };
  const url = new URL("/api/company-os-workflow", env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || "https://elyon-company-os.vercel.app");
  if (url.protocol !== "https:" || url.username || url.password) {
    return { synced: false, state: "connection_invalid" };
  }
  let records;
  try {
    records = (await getMaster({ env })).records;
  } catch {
    return { synced: false, state: "master_unavailable" };
  }
  const matches = (Array.isArray(records) ? records : []).filter((record) => {
    const identity = record?.identity || {};
    return [identity.supplierSku, record.supplierSku, record.raw?.supplierSku]
      .map((v) => text(v).toUpperCase()).includes(wanted)
      && ["product_review", "review"].includes(text(record.workflow?.stage || record.raw?.workflowStage).toLowerCase());
  });
  if (matches.length !== 1) {
    return { synced: false, state: matches.length ? "ambiguous" : "awaiting_review" };
  }
  const body = {
    transition: "set_amazon_reference",
    syncCode,
    sku: wanted,
    amazonReferencePrice: observed,
    amazonReferenceCapturedAt: text(amazonReferenceCapturedAt) || new Date().toISOString(),
  };
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Elyon-Sync-Code": syncCode },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(16000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true || result.transition !== "set_amazon_reference") {
      return { synced: false, state: "update_failed" };
    }
    return { synced: true, state: "reference_recorded" };
  } catch {
    return { synced: false, state: "connection_unavailable" };
  }
}
