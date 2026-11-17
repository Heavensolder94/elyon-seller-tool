const AMAZON_SKU = /^AMZ-[A-Z0-9]{10}$/;
const text = (v) => String(v ?? "").trim();
const price = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.01 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};

function confirmedReference(result, wanted, observed) {
  const product = result?.result?.product;
  if (!product || typeof product !== "object") return false;
  const identities = [
    product.supplierSku,
    product.meta?.ebaySku,
    product.identity?.supplierSku,
    product.sourceImportId === "seller-ebay-review:" + wanted ? wanted : "",
  ].map((value) => text(value).toUpperCase()).filter(Boolean);
  return product.workflowStage === "product_review"
    && identities.includes(wanted)
    && price(product.meta?.amazonReferencePrice) === observed
    && product.meta?.reviewOnly === true
    && product.meta?.supplierCostVerified !== true;
}

/**
 * The Company OS workflow is the sole authority for identifying an existing
 * Product Review. Product Master v2 is a read-only projection, not a gate for
 * appending observational source-price metadata. No product or eBay draft is
 * created; the endpoint rejects missing or ambiguous Product Review identities.
 */
export async function syncAmazonPriceReference({
  sku, amazonReferencePrice, amazonReferenceCapturedAt,
  env = process.env, fetchImpl = fetch,
} = {}) {
  const wanted = text(sku).toUpperCase();
  const observed = price(amazonReferencePrice);
  if (!AMAZON_SKU.test(wanted)) return { synced: false, state: "invalid_sku" };
  if (observed === null) return { synced: false, state: "reference_missing" };
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE);
  if (syncCode.length < 6) return { synced: false, state: "connection_unavailable" };
  let url;
  try {
    url = new URL("/api/company-os-workflow", env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || "https://elyon-company-os.vercel.app");
    if (url.protocol !== "https:" || url.username || url.password) {
      return { synced: false, state: "connection_invalid" };
    }
  } catch {
    return { synced: false, state: "connection_invalid" };
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
      const error = text(result.error, 100);
      const states = {
        amazon_reference_review_not_found: "review_not_found",
        amazon_reference_ambiguous: "ambiguous",
        amazon_reference_invalid_sku_or_price: "reference_invalid",
        amazon_reference_invalid_capture_date: "reference_date_invalid",
        company_os_sync_code_invalid: "authentication_failed",
        company_os_sync_code_missing: "authentication_failed",
        storage_not_configured: "connection_unavailable",
      };
      return { synced: false, state: states[error] || (response.status === 403 ? "authentication_failed" : "update_failed") };
    }
    if (!confirmedReference(result, wanted, observed)) return { synced: false, state: "confirmation_missing" };
    return { synced: true, state: "reference_recorded" };
  } catch {
    return { synced: false, state: "connection_unavailable" };
  }
}
