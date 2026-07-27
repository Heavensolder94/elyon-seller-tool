import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSellerListingView,
  buildAutoListerChecks,
  autoListerReadiness,
  buildInternalAutoListerDraft,
  mergeSellerProductWithDraft,
  mergeSellerManualListingMeta,
  sellerProductPayload,
} from "../seller-selling-flow-core.js";

const readyProduct = {
  id: "working-1",
  sellerToolMasterProductId: "seller-product-1",
  localOnlyNote: "muss erhalten bleiben",
  rawServerProduct: {
    id: "seller-product-1",
    companyOsProductId: "company-product-1",
    title: "Verstellbarer Laptopständer Aluminium für Schreibtisch und Homeoffice",
    description: "Ein stabiler und verstellbarer Laptopständer aus Aluminium für ergonomisches Arbeiten im Büro und Homeoffice.",
    images: ["https://example.com/laptopstand.jpg"],
    supplier: { url: "https://supplier.example/item", name: "Supplier" },
    pricing: {
      currency: "EUR",
      salePrice: 29.99,
      profit: 7.2,
      marginPercent: 24.01,
      minimumRulePassed: true,
      unknownPricingField: "preserve",
    },
    logistics: {
      deliveryTime: "3–5 Werktage",
      returnAddress: "Musterstraße 1, 12345 Berlin, Deutschland",
    },
    approval: { companyOsApproved: true },
    readiness: { state: "ready_for_manual_listing", score: 100, blockers: [], warnings: [] },
    listing: {
      title: "Laptopständer Aluminium verstellbar ergonomisch Notebook Halterung",
      descriptionHtml: "<p>Stabiler, verstellbarer Aluminium-Laptopständer für ergonomisches Arbeiten.</p><ul><li>Rutschfest</li><li>Faltbar</li><li>Für viele Notebook-Größen</li></ul>",
      categoryId: "31519",
      categoryName: "Laptop-Ständer",
      conditionId: "1000",
      itemSpecifics: { Material: ["Aluminium"], Farbe: ["Silber"] },
      shippingProfile: "shipping-policy-1",
      returnProfile: "return-policy-1",
      paymentProfile: "payment-policy-1",
      customListingField: "preserve",
    },
    unknownServerField: { keep: true },
  },
};

test("normalizes a Seller Product Master listing for the selling flow", () => {
  const view = buildSellerListingView(readyProduct);
  assert.equal(view.id, "seller-product-1");
  assert.equal(view.companyOsApproved, true);
  assert.equal(view.listingTitle.length <= 80, true);
  assert.equal(view.categoryId, "31519");
  assert.equal(view.conditionId, "1000");
  assert.equal(view.images.length, 1);
  assert.equal(view.minimumRulePassed, true);
});

test("requires explicit eBay condition and category instead of inventing values", () => {
  const product = structuredClone(readyProduct);
  delete product.rawServerProduct.listing.conditionId;
  delete product.rawServerProduct.listing.categoryId;
  const view = buildSellerListingView(product);
  const checks = buildAutoListerChecks(view);
  assert.equal(view.conditionId, "");
  assert.equal(view.categoryId, "");
  assert.equal(checks.find((check) => check.key === "condition")?.ok, false);
  assert.equal(checks.find((check) => check.key === "category")?.ok, false);
});

test("marks a complete internal Auto Lister draft ready without enabling publishing", () => {
  const view = buildSellerListingView(readyProduct);
  const draft = buildInternalAutoListerDraft(view);
  assert.equal(draft.readiness.ready, true);
  assert.equal(draft.readiness.score, 100);
  assert.equal(draft.status, "ready_for_manual_ebay_draft");
  assert.equal(draft.manualApprovalRequired, true);
  assert.equal(draft.automaticPublishingAllowed, false);
  assert.equal(draft.publishEndpointAvailable, false);
  assert.equal(draft.ebayInventoryDraftCreated, false);
});

test("keeps blockers visible when Company OS approval or required data is missing", () => {
  const product = structuredClone(readyProduct);
  product.rawServerProduct.approval.companyOsApproved = false;
  product.rawServerProduct.readiness.blockers = ["Rücksendeadresse prüfen"];
  product.rawServerProduct.listing.itemSpecifics = {};
  const view = buildSellerListingView(product);
  const checks = buildAutoListerChecks(view);
  const readiness = autoListerReadiness(checks);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.some((item) => /Freigabe/.test(item)));
  assert.ok(readiness.blockers.some((item) => /Blocker/.test(item)));
  assert.ok(readiness.blockers.some((item) => /Merkmal/.test(item)));
});

test("merges the Auto Lister draft additively and preserves unknown fields", () => {
  const view = buildSellerListingView(readyProduct);
  const draft = buildInternalAutoListerDraft(view, {
    listingTitle: "Laptopständer Aluminium verstellbar Notebook Halterung ergonomisch",
    price: 31.99,
  });
  const updated = mergeSellerProductWithDraft(readyProduct, draft);
  assert.equal(updated.localOnlyNote, "muss erhalten bleiben");
  assert.deepEqual(updated.rawServerProduct.unknownServerField, { keep: true });
  assert.equal(updated.rawServerProduct.pricing.unknownPricingField, "preserve");
  assert.equal(updated.rawServerProduct.listing.customListingField, "preserve");
  assert.equal(updated.rawServerProduct.listing.autoListerDraft.price, 31.99);
  assert.equal(updated.rawServerProduct.listing.autonomousPostingAllowed, false);
  assert.equal(updated.rawServerProduct.listing.manualApprovalRequired, true);
});

test("stores manual eBay metadata without changing unrelated listing fields", () => {
  const updated = mergeSellerManualListingMeta(readyProduct, "123456789012", "manually_listed");
  assert.equal(updated.rawServerProduct.listing.ebayItemId, "123456789012");
  assert.equal(updated.rawServerProduct.listing.status, "manually_listed");
  assert.equal(updated.rawServerProduct.listing.customListingField, "preserve");
  assert.equal(updated.rawServerProduct.unknownServerField.keep, true);
  assert.equal(updated.rawServerProduct.listing.autonomousPostingAllowed, false);
});

test("creates a server payload from the updated working copy", () => {
  const draft = buildInternalAutoListerDraft(buildSellerListingView(readyProduct));
  const updated = mergeSellerProductWithDraft(readyProduct, draft);
  const payload = sellerProductPayload(updated);
  assert.equal(payload.id, "seller-product-1");
  assert.equal(payload.listing.autoListerDraft.schemaVersion, "elyon-seller-auto-lister-v1");
  assert.equal(payload.unknownServerField.keep, true);
});