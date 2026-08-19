import { requireBridgeAccess } from "../../../lib/bridge-access.js";
import {
  readProductMasterList,
  writeProductMasterList,
} from "../../../lib/product-master-store.js";

const TEST_RESET_CONFIRMATION = "TEST RESET";
const ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;
const HARD_BUSINESS_REFERENCE_FIELDS = new Set([
  "ebayItemId",
  "orderId",
  "ebayOrderId",
  "transactionId",
  "ebayPublishedAt",
  "orderedAt",
  "manuallyListedAt",
]);
const CLEANABLE_TEST_REFERENCE_FIELDS = new Set([
  "ebayOfferId",
  "offerId",
  "ebayDraftId",
  "ebayDraftCreatedAt",
]);

function text(value) {
  return String(value ?? "").trim();
}

function resetEnabled(env = process.env) {
  const flag = text(env.ELYON_TEST_IDENTITY_RESET_ENABLED).toLowerCase();
  return !["false", "0", "off", "no"].includes(flag);
}

function articleNumberOf(product = {}) {
  const candidates = [
    product.articleNumber,
    product.elyonArticleNumber,
    product.sku,
    product.identity?.articleNumber,
    product.listing?.articleNumber,
    product.listing?.sku,
  ];
  return candidates.map((value) => text(value).toUpperCase()).find((value) => ARTICLE_NUMBER_PATTERN.test(value)) || "";
}

function statusLooksExternal(item = {}) {
  const values = [item.listingStatus, item.ebayStatus, item.manualListingStatus, item.status]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
  return values.some((value) => ["active", "live", "published", "sold", "ended", "manuell gelistet"].includes(value));
}

function findHardReference(value, path = "", depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return null;
  seen.add(value);
  if (!Array.isArray(value)) {
    for (const [key, raw] of Object.entries(value)) {
      if (HARD_BUSINESS_REFERENCE_FIELDS.has(key) && text(raw)) {
        return { path: path ? `${path}.${key}` : key, field: key, value: text(raw).slice(0, 160) };
      }
    }
    if (statusLooksExternal(value)) {
      return { path: path || "record", field: "status", value: text(value.listingStatus || value.ebayStatus || value.manualListingStatus || value.status).slice(0, 160) };
    }
  }
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, child] of entries) {
    if (!child || typeof child !== "object") continue;
    const found = findHardReference(child, path ? `${path}.${key}` : String(key), depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function collectCleanableReferences(value, path = "", depth = 0, seen = new Set(), matches = []) {
  if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return matches;
  seen.add(value);
  if (!Array.isArray(value)) {
    for (const [key, raw] of Object.entries(value)) {
      if (!CLEANABLE_TEST_REFERENCE_FIELDS.has(key) || !text(raw)) continue;
      matches.push({ path: path ? `${path}.${key}` : key, field: key, value: text(raw).slice(0, 160) });
    }
  }
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, child] of entries) {
    if (!child || typeof child !== "object") continue;
    collectCleanableReferences(child, path ? `${path}.${key}` : String(key), depth + 1, seen, matches);
  }
  return matches;
}

export function inspectSellerTestIdentityReset(products = [], env = process.env) {
  const list = Array.isArray(products) ? products : [];
  const testProducts = list.filter((product) => articleNumberOf(product));
  const blockers = [];
  const cleanups = [];

  testProducts.forEach((product, index) => {
    const found = findHardReference(product, `products[${index}]`);
    if (found) {
      blockers.push({
        ...found,
        id: text(product?.id || product?.articleNumber || product?.sku),
        articleNumber: articleNumberOf(product),
        title: text(product?.title || product?.name).slice(0, 180),
      });
    }
    collectCleanableReferences(product, `products[${index}]`).forEach((reference) => cleanups.push({
      ...reference,
      id: text(product?.id || product?.articleNumber || product?.sku),
      articleNumber: articleNumberOf(product),
      title: text(product?.title || product?.name).slice(0, 180),
    }));
  });

  return {
    enabled: resetEnabled(env),
    totalProducts: list.length,
    testProductCount: testProducts.length,
    articleNumbers: testProducts.map(articleNumberOf).filter(Boolean).sort(),
    blockerCount: blockers.length,
    blockers: blockers.slice(0, 20),
    cleanupCount: cleanups.length,
    cleanupReferences: cleanups.slice(0, 40),
    ready: resetEnabled(env) && blockers.length === 0,
  };
}

export function removeSellerTestIdentityProducts(products = []) {
  const list = Array.isArray(products) ? products : [];
  const removed = [];
  const kept = [];
  for (const product of list) {
    const articleNumber = articleNumberOf(product);
    if (articleNumber) removed.push({ id: text(product?.id), articleNumber, title: text(product?.title || product?.name).slice(0, 180) });
    else kept.push(product);
  }
  return { items: kept, removed };
}

export default async function handler(req, res) {
  if (!requireBridgeAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = text(body.action || "inspect").toLowerCase();
  if (!["inspect", "reset"].includes(action)) return res.status(400).json({ ok: false, error: "test_reset_action_invalid" });

  try {
    const products = await readProductMasterList("elyon_products");
    const report = inspectSellerTestIdentityReset(products);
    if (action === "inspect") {
      return res.status(200).json({ ok: true, action, ...report, confirmationRequired: TEST_RESET_CONFIRMATION });
    }

    if (!report.enabled) return res.status(403).json({ ok: false, action, error: "test_identity_reset_disabled", ...report });
    if (text(body.confirmation) !== TEST_RESET_CONFIRMATION) {
      return res.status(400).json({ ok: false, action, error: "test_reset_confirmation_required", confirmationRequired: TEST_RESET_CONFIRMATION, ...report });
    }
    if (report.blockerCount) {
      return res.status(409).json({ ok: false, action, error: "test_identity_reset_blocked_by_business_reference", ...report });
    }

    const cleanup = removeSellerTestIdentityProducts(products);
    const storage = await writeProductMasterList("elyon_products", cleanup.items);
    return res.status(200).json({
      ok: true,
      action,
      deleted: cleanup.removed.length,
      remaining: cleanup.items.length,
      removed: cleanup.removed,
      cleanedDraftReferences: report.cleanupCount,
      blockerCount: 0,
      storage,
      message: `${cleanup.removed.length} Testprodukte mit Elyon-Artikelnummer aus dem Seller Product Master entfernt.`,
      safety: { automaticListing: false, ebayActionExecuted: false, orderActionExecuted: false },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      action,
      error: "seller_test_identity_reset_failed",
      message: error?.message || "Seller-Tool-Testreset fehlgeschlagen.",
    });
  }
}
