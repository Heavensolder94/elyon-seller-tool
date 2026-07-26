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

test("only reviewed Company OS products pass the bridge", () => {
  assert.equal(isReviewedCompanyProduct({ status: "neu", reviewStatus: "not_reviewed" }), false);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "in_review" }), true);
  assert.equal(isReviewedCompanyProduct({ companyOsSection: "pruefen" }), true);
  assert.equal(isReviewedCompanyProduct({ reviewApproved: true }), true);
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
