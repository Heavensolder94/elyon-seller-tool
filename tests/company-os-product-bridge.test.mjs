import assert from "node:assert/strict";
import test from "node:test";

import { validateBridgeAccess } from "../lib/bridge-access.js";
import { isReviewedCompanyProduct } from "../api/integrations/company-os/products.js";
import { upsertProductMasterItem } from "../lib/product-master-store.js";

function req(secret, body = {}) {
  return { method: "POST", headers: { "x-elyon-bridge-secret": secret }, body };
}

test("bridge access accepts only the configured secret", () => {
  const env = { ELYON_BRIDGE_SECRET: "strong-test-secret" };
  assert.equal(validateBridgeAccess(req("strong-test-secret"), env).ok, true);
  const denied = validateBridgeAccess(req("wrong-secret"), env);
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
});

test("bridge remains closed when no server secret exists", () => {
  const result = validateBridgeAccess(req("anything"), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});

test("only finally approved Company OS products pass the bridge", () => {
  assert.equal(isReviewedCompanyProduct({ status: "neu", reviewStatus: "not_reviewed" }), false);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "in_review" }), false);
  assert.equal(isReviewedCompanyProduct({ companyOsSection: "pruefen" }), false);
  assert.equal(isReviewedCompanyProduct({ processingStatus: "sent_to_review" }), false);
  assert.equal(isReviewedCompanyProduct({ status: "prüfen" }), false);
  assert.equal(isReviewedCompanyProduct({ reviewApproved: true }), false);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "approved" }), false);
  assert.equal(isReviewedCompanyProduct({ processingStatus: "ready_for_seller_tool" }), false);
  assert.equal(isReviewedCompanyProduct({ status: "bereit_manuell_einstellen" }), false);
  assert.equal(isReviewedCompanyProduct({ listingPackage: { status: "completed" } }), false);
  assert.equal(isReviewedCompanyProduct({ reviewApproved: true, processingStatus: "ready_for_seller_tool" }), true);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "approved", status: "bereit_manuell_einstellen" }), true);
});

test("repeated Company OS transfers update one Product Master item", () => {
  const first = upsertProductMasterItem([], {
    id: "company-product-1",
    sourceImportId: "nova-import-1",
    title: "Testprodukt",
    description: "Vollständige Beschreibung",
    images: ["https://example.com/image.jpg"],
    supplierUrl: "https://supplier.example/product/1",
    buyPrice: 10,
    salePrice: 24.99,
  });
  assert.equal(first.status, "saved");
  assert.equal(first.items.length, 1);

  const second = upsertProductMasterItem(first.items, {
    id: "company-product-1",
    sourceImportId: "nova-import-1",
    title: "Testprodukt aktualisiert",
    description: "Vollständige Beschreibung",
    images: ["https://example.com/image.jpg"],
    supplierUrl: "https://supplier.example/product/1",
    buyPrice: 10,
    salePrice: 29.99,
  });
  assert.equal(second.status, "updated");
  assert.equal(second.items.length, 1);
  assert.equal(second.product.title, "Testprodukt aktualisiert");
  assert.equal(second.product.pricing.salePrice, 29.99);
});

test("active eBay listings are not silently overwritten by Company OS", () => {
  const existing = upsertProductMasterItem([], {
    id: "company-product-active",
    sourceImportId: "nova-import-active",
    title: "Aktives Produkt",
    ebayItemId: "123456789012",
  });
  const blocked = upsertProductMasterItem(existing.items, {
    id: "company-product-active",
    sourceImportId: "nova-import-active",
    title: "Ungeprüfte Überschreibung",
  });
  assert.equal(blocked.status, "blocked_active_listing");
  assert.equal(blocked.items.length, 1);
  assert.equal(blocked.product.title, "Aktives Produkt");
  assert.equal(blocked.activeMarketplaceId, "123456789012");

  const explicitSameListing = upsertProductMasterItem(existing.items, {
    id: "company-product-active",
    sourceImportId: "nova-import-active",
    title: "Bewusst aktualisiert",
    ebayItemId: "123456789012",
  });
  assert.equal(explicitSameListing.status, "updated");
  assert.equal(explicitSameListing.product.title, "Bewusst aktualisiert");
});
