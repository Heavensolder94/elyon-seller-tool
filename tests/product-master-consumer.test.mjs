import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptLegacyProductForSeller,
  adaptProductMasterForSeller,
  fetchCompanyOsProductMaster,
  isProductMasterV2Record,
  loadProductMasterForSeller,
  resolveProductMasterRecord,
} from "../lib/product-master-consumer.js";

const canonical = {
  schemaVersion: "elyon-product-master-v2",
  ownerSystem: "elyon_company_os",
  identity: {
    productId: "company-product-1",
    companyOsProductId: "company-product-1",
    productKey: "product-key-1",
    articleNumber: "ELY-001274",
    sku: "ELY-001274",
    supplierSku: "SUP-RED-L",
    sourceImportId: "nova-import-1",
  },
  product: {
    title: "Organizer",
    description: "Kanonische Beschreibung aus Company OS.",
    images: ["https://example.test/organizer.jpg"],
    variants: [
      { sku: "ELY-001274-01", supplierSku: "SUP-RED-L", color: "Rot" },
      { sku: "ELY-001274-02", supplierSku: "SUP-BLUE-L", color: "Blau" },
    ],
    supplier: { name: "Supplier", url: "https://supplier.example/organizer" },
  },
  workflow: { stage: "ebay_draft", status: "ebay_draft_created", reviewStatus: "approved", active: true, rejected: false },
  economics: { currency: "EUR", buyPrice: 10, shippingCost: 2, salePrice: 29.99, fees: 4.2, profit: 13.79, marginPercent: 46.0, minimumRulePassed: true, source: "company_os" },
  market: { decision: "GO", score: 88 },
  compliance: { status: "approved" },
  listing: { title: "Organizer Listing", descriptionHtml: "<p>Company OS Listing</p>", status: "draft" },
  channels: { ebay: { status: "DRAFT", sku: "ELY-001274", offerId: "offer-1274", listingId: null, listingUrl: null, publishedAt: null, withdrawn: false } },
  timestamps: { createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" },
};

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

test("v2 adapter preserves canonical identity, economics, supplier SKU and eBay channel state", () => {
  const product = adaptProductMasterForSeller(canonical);
  assert.equal(product.articleNumber, "ELY-001274");
  assert.equal(product.sku, "ELY-001274");
  assert.equal(product.supplierSku, "SUP-RED-L");
  assert.equal(product.pricing.salePrice, 29.99);
  assert.equal(product.pricing.profit, 13.79);
  assert.equal(product.pricing.calculationSource, "company_os");
  assert.equal(product.channels.ebay.offerId, "offer-1274");
  assert.equal(product.channels.ebay.status, "DRAFT");
  assert.equal(product.listing.offerId, "offer-1274");
  assert.equal(product.variants[0].sku, "ELY-001274-01");
  assert.equal(product.variants[0].supplierSku, "SUP-RED-L");
  assert.equal(product.sellerView.role, "consumer");
});

test("raw imports and records without a permanent Elyon identity never become seller products", () => {
  assert.equal(isProductMasterV2Record({ schemaVersion: "elyon-product-master-v2", identity: { sourceImportId: "nova-raw" } }), false);
  assert.equal(adaptProductMasterForSeller({ schemaVersion: "elyon-product-master-v2", identity: { sku: "SUP-123" }, product: {} }), null);
});

test("legacy v1 data remains readable only as an explicitly labeled compatibility view", () => {
  const product = adaptLegacyProductForSeller({
    id: "legacy-product-1",
    articleNumber: "ELY-001274",
    sku: "ELY-001274",
    supplierSku: "SUP-RED-L",
    title: "Legacy Organizer",
    pricing: { buyPrice: 10, salePrice: 29.99 },
  });
  assert.equal(product.articleNumber, "ELY-001274");
  assert.equal(product.supplierSku, "SUP-RED-L");
  assert.equal(product.sellerView.role, "compatibility");
  assert.equal(product.sellerView.sourceOfTruth, "legacy_seller_product_master");
});

test("Company OS fetch uses the read-only v2 endpoint and sync code without issuing a write", async () => {
  const calls = [];
  const result = await fetchCompanyOsProductMaster({
    env: { ELYON_COMPANY_OS_URL: "https://company-os.example", COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({ ok: true, products: [canonical], contract: { sellerToolRole: "consumer" } });
    },
  });
  assert.equal(result.records.length, 1);
  assert.match(calls[0].url, /\/api\/product-master-v2$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["X-Elyon-Sync-Code"], "sync-secret");
  assert.equal(calls[0].init.body, undefined);
});

test("same Company OS identity updates one consumer view without generating a new Elyon ID", async () => {
  const updated = { ...canonical, product: { ...canonical.product, title: "Organizer aktualisiert" } };
  const first = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: true, products: [canonical] }),
    readCache: async () => [],
    writeCache: async () => ({ persisted: false, mode: "test" }),
  });
  const second = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: true, products: [updated] }),
    readCache: async () => [],
    writeCache: async () => ({ persisted: false, mode: "test" }),
  });
  assert.equal(first.products[0].articleNumber, "ELY-001274");
  assert.equal(second.products[0].articleNumber, "ELY-001274");
  assert.equal(second.products[0].id, "company-product-1");
  assert.equal(second.products[0].title, "Organizer aktualisiert");
});

test("temporary Company OS outage falls back to a visibly stale v2 cache without deleting it", async () => {
  const result = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: false, error: "upstream_unavailable", message: "temporarily unavailable" }, 503),
    readCache: async () => [canonical],
  });
  assert.equal(result.freshness, "stale");
  assert.equal(result.source, "company_os_product_master_v2_cache");
  assert.equal(result.products[0].articleNumber, "ELY-001274");
  assert.equal(result.products[0].sellerView.freshness, "stale");
});

test("successful empty Company OS snapshots replace the v2 cache", async () => {
  const writes = [];
  const empty = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: true, products: [] }),
    readCache: async () => [canonical],
    writeCache: async (records) => {
      writes.push(records);
      return { persisted: true, mode: "test" };
    },
  });
  assert.deepEqual(empty.products, []);
  assert.deepEqual(writes, [[]]);

  await assert.rejects(
    () => loadProductMasterForSeller({
      env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
      fetchImpl: async () => response({ ok: false, error: "upstream_unavailable" }, 503),
      readCache: async () => writes.at(-1),
      readLegacy: async () => [],
    }),
    (error) => error.code === "upstream_unavailable",
  );
});

test("Company OS review stages never become final Seller approval", () => {
  for (const stage of ["product_review", "market_review", "review"]) {
    const product = adaptProductMasterForSeller({
      ...canonical,
      workflow: { stage, status: "pending_review", active: true, rejected: false },
      channels: { ebay: { status: "NOT_STARTED", withdrawn: false } },
    });
    assert.equal(product.readiness.state, "needs_review");
    assert.equal(product.approval.companyOsApproved, false);
  }
});

test("order/listing identity resolution is deterministic and never uses title matching", () => {
  assert.equal(resolveProductMasterRecord([canonical], { listingId: "offer-1274" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { offerId: "offer-1274" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { sku: "SUP-RED-L" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { sku: "ELY-001274-02" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { title: "Organizer" }), null);
});

test("ambiguous supplier SKUs never select an arbitrary Elyon product", () => {
  const other = structuredClone(canonical);
  other.identity = {
    ...other.identity,
    productId: "company-product-2",
    companyOsProductId: "company-product-2",
    articleNumber: "ELY-001275",
    sku: "ELY-001275",
  };
  other.product = { ...other.product, title: "Other Organizer" };
  assert.equal(resolveProductMasterRecord([canonical, other], { supplierSku: "SUP-RED-L" }), null);
});

test("ambiguous eBay listing IDs never select an arbitrary Elyon product", () => {
  const first = structuredClone(canonical);
  const second = structuredClone(canonical);
  first.channels.ebay.listingId = "listing-conflict";
  second.identity = {
    ...second.identity,
    productId: "company-product-2",
    companyOsProductId: "company-product-2",
    articleNumber: "ELY-001275",
    sku: "ELY-001275",
  };
  second.channels.ebay.listingId = "listing-conflict";
  assert.equal(resolveProductMasterRecord([first, second], { listingId: "listing-conflict" }), null);
});

test("conflicting identity fields never override each other by precedence", () => {
  const first = structuredClone(canonical);
  const second = structuredClone(canonical);
  second.identity = {
    ...second.identity,
    productId: "company-product-2",
    companyOsProductId: "company-product-2",
    articleNumber: "ELY-001275",
    sku: "ELY-001275",
  };
  second.channels.ebay.offerId = "offer-1275";
  assert.equal(resolveProductMasterRecord([first, second], {
    sku: "ELY-001274",
    offerId: "offer-1275",
  }), null);
});

test("withdrawn Company OS channel state remains visible to the Seller consumer", () => {
  const withdrawn = {
    ...canonical,
    channels: { ebay: { ...canonical.channels.ebay, status: "LIVE", withdrawn: true, offerId: "offer-1274" } },
  };
  const product = adaptProductMasterForSeller(withdrawn);
  assert.equal(product.channels.ebay.withdrawn, true);
  assert.equal(product.channels.ebay.status, "WITHDRAWN");
  assert.equal(product.listing.status, "WITHDRAWN");
  assert.equal(product.approval.companyOsApproved, false);
});
