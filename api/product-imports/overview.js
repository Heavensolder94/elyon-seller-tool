import { requireSellerAccess } from "../../lib/seller-access.js";
import { DEFAULT_COMPANY_OS_URL } from "../../lib/product-master-consumer.js";

const SCHEMA = "elyon-product-intake-overview-v1";
const text = (value) => String(value ?? "").trim();
const positiveInt = (value) => Number.isSafeInteger(value) && value >= 0;

export async function fetchProductIntakeOverview({
  env = process.env,
  fetchImpl = fetch,
  signal,
} = {}) {
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE);
  if (syncCode.length < 6) throw new Error("company_os_sync_code_missing");

  let url;
  try {
    url = new URL("/api/product-intake-overview", text(env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || DEFAULT_COMPANY_OS_URL));
  } catch {
    throw new Error("company_os_url_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("company_os_url_invalid");
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { "Accept": "application/json", "X-Elyon-Sync-Code": syncCode },
    cache: "no-store",
    signal: signal || AbortSignal.timeout(7000),
  });
  const payload = await response.json().catch(() => ({}));
  const overview = payload?.overview;
  if (!response.ok || payload?.ok !== true || overview?.schemaVersion !== SCHEMA
    || !positiveInt(overview.total)
    || !["nova", "amazonImporter", "companyOs", "unclassified"].every((key) => positiveInt(overview.sources?.[key]))
    || !["inbox", "review", "listingPrepared"].every((key) => positiveInt(overview.stages?.[key]))
    || !positiveInt(overview.identityUnverified)) {
    throw new Error("company_os_intake_unavailable");
  }
  if (Object.values(overview.sources).reduce((a, b) => a + b, 0) !== overview.total
    || Object.values(overview.stages).reduce((a, b) => a + b, 0) !== overview.total) {
    throw new Error("company_os_intake_inconsistent");
  }
  // Only the safe aggregate is forwarded. Never expose raw Company OS state.
  return {
    schemaVersion: SCHEMA,
    total: overview.total,
    sources: overview.sources,
    stages: overview.stages,
    identityUnverified: overview.identityUnverified,
    dedupeVerified: overview.identityUnverified === 0,
    complete: overview.complete === true,
    completenessReason: overview.completenessReason || null,
    generatedAt: text(payload.generatedAt),
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    return res.status(200).json({ ok: true, overview: await fetchProductIntakeOverview() });
  } catch {
    return res.status(503).json({
      ok: false,
      error: "product_intake_unavailable",
      message: "Zentraler Produkteingang aus Company OS und Nova ist derzeit nicht prüfbar.",
    });
  }
}
