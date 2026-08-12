import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import { normalizeProduct, productIdentityFrom } from "../lib/product-master-active.js";
import { upsertProductMasterItem, deleteProductMasterItem } from "../lib/product-master-store.js";
import { elyonSkuFromPayload } from "../internal/ebay/create-draft.js";
import { deterministicEbaySku } from "../lib/ebay-production.js";

const bridgeSource = fs.readFileSync(new URL("../api/integrations/company-os/products.js", import.meta.url), "utf8");

test("Product Master exposes Elyon article number and keeps supplier SKU separate", () => {
  const product = normalizeProduct({
    id: "review_nova_123",
    sourceImportId: "nova_123",
    articleNumber: "ELY-000001",
    sku: "ELY-000001",
    supplierSku: "ALI-123",
    title: "Organizer Set",
    supplierUrl: "https://supplier.example/1",
  });

  assert.equal(product.articleNumber, "ELY-000001");
  assert.equal(product.sku, "ELY-000001");
  assert.equal(product.supplierSku, "ALI-123");
  assert.equal(product.listing.sku, "ELY-000001");
  assert.equal(product.identity.source, "elyon_unified_product_identity_v1");
});

test("legacy supplier SKU is preserved when an Elyon article number arrives", () => {
  const identity = productIdentityFrom({
    articleNumber: "ELY-000042",
    sku: "SUPPLIER-BLACK-L",
  });
  assert.equal(identity.articleNumber, "ELY-000042");
  assert.equal(identity.sku, "ELY-000042");
  assert.equal(identity.supplierSku, "SUPPLIER-BLACK-L");
});

test("variant Elyon SKUs survive Product Master normalization", () => {
  const product = normalizeProduct({
    articleNumber: "ELY-000010",
    sku: "ELY-000010",
    title: "Flasche",
    variants: [
      { id: "black-500", sku: "ELY-000010-01", supplierSku: "SUP-01", color: "Schwarz" },
      { id: "white-500", sku: "ELY-000010-02", supplierSku: "SUP-02", color: "Weiß" },
    ],
  });
  assert.equal(product.logistics.variants[0].sku, "ELY-000010-01");
  assert.equal(product.logistics.variants[0].supplierSku, "SUP-01");
  assert.equal(product.logistics.variants[1].sku, "ELY-000010-02");
});

test("same Elyon article number updates one Product Master record", () => {
  const first = upsertProductMasterItem([], {
    id: "review_nova_a",
    sourceImportId: "nova_a",
    articleNumber: "ELY-000100",
    sku: "ELY-000100",
    title: "Produkt A",
    salePrice: 19.99,
  });
  const second = upsertProductMasterItem(first.items, {
    id: "different-technical-id",
    sourceImportId: "nova_a",
    articleNumber: "ELY-000100",
    sku: "ELY-000100",
    title: "Produkt A aktualisiert",
    salePrice: 24.99,
  });

  assert.equal(first.items.length, 1);
  assert.equal(second.status, "updated");
  assert.equal(second.items.length, 1);
  assert.equal(second.product.articleNumber, "ELY-000100");
  assert.equal(second.product.sku, "ELY-000100");
  assert.equal(second.product.title, "Produkt A aktualisiert");
});

test("Product Master deletion can target the Elyon article number", () => {
  const first = upsertProductMasterItem([], {
    articleNumber: "ELY-000101",
    sku: "ELY-000101",
    title: "Produkt",
  });
  const deleted = deleteProductMasterItem(first.items, "ELY-000101");
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.items.length, 0);
});

test("eBay draft paths prefer main and variant Elyon SKUs", () => {
  assert.equal(elyonSkuFromPayload({ articleNumber: "ELY-000001" }), "ELY-000001");
  assert.equal(elyonSkuFromPayload({ sku: "ELY-000001-03" }), "ELY-000001-03");
  assert.equal(elyonSkuFromPayload({ sku: "SUPPLIER-123" }), "");
  assert.equal(deterministicEbaySku({ sku: "ELY-000001", sourceProductId: "nova_1", title: "Test" }), "ELY-000001");
  assert.equal(deterministicEbaySku({ sku: "ELY-000001-03", sourceProductId: "nova_1", title: "Test" }), "ELY-000001-03");
});

test("Company OS bridge requires and persists unified Elyon identity without enabling live publishing", () => {
  assert.match(bridgeSource, /company_os_article_number_required/);
  assert.match(bridgeSource, /articleNumber,/);
  assert.match(bridgeSource, /sku: articleNumber/);
  assert.match(bridgeSource, /autonomousPostingAllowed: false/);
  assert.match(bridgeSource, /automaticListing: false/);
});
