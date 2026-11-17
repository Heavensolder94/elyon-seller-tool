import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  buildPendingCompanyReview,
  findExistingCompanyReview,
  selectExistingSellerDraft,
  submitSellerDraftReview,
} from "../api/products/review-intake.js";

const dreamzie = {
  sku: "AMZ-B0BWND9WBR",
  status: "UNPUBLISHED",
  title: "Dreamzie Kissenbezug 80x80 Baumwolle Renforcé (2er-Set)",
  images: ["https://example.test/dreamzie.png"],
  price: 20.99,
  externalTaskId: "feed-dreamzie",
  feedVerification: "feed_processed_not_live_checked",
};
const nobis = {
  sku: "AMZ-B0D63HF7Z4",
  status: "UNPUBLISHED",
  title: "NOBIS Power Bank 20000mAh",
  images: ["https://example.test/nobis.png"],
  price: 41.99,
  offerId: "243461011011",
};
const env = {
  ELYON_COMPANY_OS_SYNC_CODE: "local-test-sync-code",
  ELYON_COMPANY_OS_URL: "https://elyon-company-os.example",
};

function mockReview(drafts = [dreamzie], masterRecords = [], reply = {}) {
  const calls = [];
  const fakeFetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url: String(url), method: options.method, payload, headers: options.headers });
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      async json() { return reply.body ?? {
        ok: true,
        result: { product: {
          articleNumber: "ELY-009001",
          sourceImportId: payload.product.sourceImportId,
          reviewStatus: "in_review",
        } },
      }; },
    };
  };
  return {
    calls, env, fetchImpl: fakeFetch,
    sellerState: async () => ({
      draftsAvailable: true, elyonDrafts: { readable: true },
      draftItems: drafts,
    }),
    getMaster: async () => ({ records: masterRecords }),
  };
}

test("Dreamzie existing eBay draft goes directly into pending Company OS Product Review without eBay writes", async () => {
  const mock = mockReview();
  const result = await submitSellerDraftReview({ sku: dreamzie.sku, ...mock });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.articleNumber, "ELY-009001");
  assert.equal(result.body.reviewStatus, "in_review");
  assert.equal(result.body.supplierVerified, false);
  assert.equal(result.body.ebayListingUnchanged, true);
  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://elyon-company-os.example/api/company-os-workflow");
  assert.equal(call.payload.transition, "move_to_review");
  assert.equal(call.payload.import.supplierSku, dreamzie.sku);
  assert.equal(call.payload.product.supplierSku, dreamzie.sku);
  assert.equal(call.payload.product.costPrice, null);
  assert.equal(call.payload.product.shippingCost, null);
  assert.equal(call.payload.product.salePrice, null);
  assert.equal(call.payload.product.meta.ebayReferencePrice, 20.99);
  assert.equal(call.payload.product.compliance.status, "pending_supplier_and_rights_verification");
  assert.equal(call.payload.product.productReviewDecision, "pruefen");
  assert.equal(call.payload.product.images[0], dreamzie.images[0]);
  assert.equal(call.payload.product.articleNumber, "");
  assert.equal(call.payload.product.sku, "");
  assert.equal(call.payload.product.sourceImportId, "seller-ebay-review:AMZ-B0BWND9WBR");
  assert.equal(call.payload.product.supplier.name, "");
  assert.equal(call.payload.product.supplier.url, "");
});

test("NOBIS Inventory draft is a separate review candidate and preserves the existing eBay offer ID", async () => {
  const mock = mockReview([nobis]);
  const result = await submitSellerDraftReview({ sku: nobis.sku, ...mock });
  assert.equal(result.status, 200);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].payload.import.meta.ebayOfferId, "243461011011");
  assert.equal(mock.calls[0].payload.import.meta.ebayReferencePrice, 41.99);
  assert.equal(mock.calls[0].payload.product.sourceImportId, "seller-ebay-review:AMZ-B0D63HF7Z4");
});

test("existing canonical product with same Amazon supplier SKU is not duplicated", async () => {
  const canonical = { identity: { articleNumber: "ELY-000245", supplierSku: dreamzie.sku } };
  const mock = mockReview([dreamzie], [canonical]);
  const result = await submitSellerDraftReview({ sku: dreamzie.sku, ...mock });
  assert.equal(result.status, 200);
  assert.equal(result.body.created, false);
  assert.equal(result.body.alreadyExists, true);
  assert.equal(result.body.articleNumber, "ELY-000245");
  assert.equal(mock.calls.length, 0);
});

test("duplicate identities are detected without a write", async () => {
  const matches = [
    { identity: { articleNumber: "ELY-000245", supplierSku: dreamzie.sku } },
    { identity: { articleNumber: "ELY-000246", sourceImportId: "seller-ebay-review:AMZ-B0BWND9WBR" } },
  ];
  assert.equal(findExistingCompanyReview(matches, dreamzie.sku).status, "ambiguous");
  const mock = mockReview([dreamzie], matches);
  const result = await submitSellerDraftReview({ sku: dreamzie.sku, ...mock });
  assert.equal(result.status, 409);
  assert.equal(mock.calls.length, 0);
});

test("non-Amazon, unknown, active or duplicated eBay SKU cannot create Product Review", async () => {
  const mock = mockReview([dreamzie]);
  assert.equal((await submitSellerDraftReview({ sku: "invalid", ...mock })).status, 400);
  assert.equal((await submitSellerDraftReview({ sku: nobis.sku, ...mock })).status, 404);
  const active = mockReview([{ ...dreamzie, status: "PUBLISHED" }]);
  assert.equal((await submitSellerDraftReview({ sku: dreamzie.sku, ...active })).status, 404);
  const ambiguous = mockReview([dreamzie, { ...dreamzie, offerId: "OTHER" }]);
  assert.equal((await submitSellerDraftReview({ sku: dreamzie.sku, ...ambiguous })).status, 409);
  assert.equal(mock.calls.length, 0);
  assert.equal(active.calls.length, 0);
  assert.equal(ambiguous.calls.length, 0);
});

test("unavailable Seller Hub draft state blocks intake, even with known SKU", async () => {
  const mock = mockReview();
  const draft = selectExistingSellerDraft({ draftsAvailable: false }, dreamzie.sku);
  assert.equal(draft.status, "unavailable");
  const res = await submitSellerDraftReview({
    sku: dreamzie.sku, ...mock, sellerState: async () => ({ draftsAvailable: false, draftItems: [dreamzie] }),
  });
  assert.equal(res.status, 404);
  assert.equal(mock.calls.length, 0);
});

test("missing Company OS server config and broken canonical lookup fail closed", async () => {
  const missing = mockReview();
  const res = await submitSellerDraftReview({ sku: dreamzie.sku, ...missing, env: {} });
  assert.equal(res.status, 503);
  assert.equal(missing.calls.length, 0);
  const broken = mockReview();
  await assert.rejects(submitSellerDraftReview({
    sku: dreamzie.sku, ...broken, getMaster: async () => { throw Error("Company OS unavailable"); },
  }), /Company OS unavailable/);
  assert.equal(broken.calls.length, 0);
});

test("Company OS identity mismatch or missing ELY number is reported for inspection, not falsely completed", async () => {
  const mismatch = mockReview([dreamzie], [], {
    body: { ok: true, result: { product: { articleNumber: "ELY-000123", sourceImportId: "other-product" } } },
  });
  const res = await submitSellerDraftReview({ sku: dreamzie.sku, ...mismatch });
  assert.equal(res.status, 502);
  assert.equal(res.body.error, "company_os_identity_not_verified");
  assert.equal(mismatch.calls.length, 1);
});

test("read-only Seller Tool UI exposes Product Review only for unmatched Amazon drafts", async () => {
  const source = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const cardStart = source.indexOf("  function listingCard(");
  const cardEnd = source.indexOf("  function renderDraftWorkspace(", cardStart);
  const snippet = source.slice(cardStart, cardEnd);
  assert.match(snippet, /mode === "draft" && product\?\.productMasterMatch === "unmatched"/);
  assert.match(snippet, /data-elyon-review-sku/);
  assert.match(snippet, /Produktprüfung offen – nicht freigegeben/);
  assert.match(source, /fetch\("\/api\/products\/review-intake",/);
  assert.match(source, /refreshListingWorkspaces\(true, DRAFT_TAB_ID\)/);
  const backend = await readFile(new URL("../api/products/review-intake.js", import.meta.url), "utf8");
  assert.match(backend, /requireSellerAccess\(req, res/);
  assert.match(backend, /origin_not_allowed/);
  assert.doesNotMatch(backend, /createSellerHubDraft|publishEbayOffer|deleteProductMaster|writeProductMasterList/);
});

test("literal markup remains HTML escaped and a card cannot invoke backend implicitly", async () => {
  const src = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const start = src.indexOf("  function listingCard(");
  const end = src.indexOf("  function renderDraftWorkspace(", start);
  const snippet = src.slice(start, end);
  const context = vm.createContext({
    text: (value) => String(value ?? "").trim(),
    escapeHtml: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    money: (value) => Number(value).toFixed(2) + " €",
    listingStatus: (value) => value.status,
    listingItemId: () => "",
    matchLabel: (state) => ({ className: "blocked", label: state }),
  });
  vm.runInContext(snippet, context);
  const result = context.listingCard({
    ...dreamzie,
    title: '<img src=x onerror="alert(1)">',
    productMasterMatch: "unmatched",
    pricing: { salePrice: 20.99, buyPrice: null, supplierShipping: null,
      estimatedFees: null, profit: null, marginPercent: null },
  }, "draft");
  assert.match(result, /data-elyon-review-sku="AMZ-B0BWND9WBR"/);
  assert.doesNotMatch(result, /<img src=x onerror/);
  assert.match(result, /&lt;img src=x/);
});
