import test from "node:test";
import assert from "node:assert/strict";
import {
  hasSellerAutoListerDraft,
  removeSellerAutoListerDraft,
} from "../seller-auto-lister-delete.js";

const productWithDraft = {
  id: "working-1",
  sellerToolMasterProductId: "seller-product-1",
  localOnlyNote: "preserve",
  status: "ready_for_manual_ebay_draft",
  autoListerDraft: { title: "top-level draft" },
  rawServerProduct: {
    id: "seller-product-1",
    title: "Laptopständer",
    unknownServerField: { keep: true },
    listingStatus: "ready_for_manual_ebay_draft",
    listing: {
      title: "Laptopständer Aluminium",
      descriptionHtml: "Beschreibung bleibt erhalten",
      ebayItemId: "123456789012",
      status: "ready_for_manual_ebay_draft",
      customListingField: "preserve",
      autoListerDraft: {
        schemaVersion: "elyon-seller-auto-lister-v1",
        price: 29.99,
      },
    },
  },
};

test("detects a stored AutoLister task", () => {
  assert.equal(hasSellerAutoListerDraft(productWithDraft), true);
  assert.equal(hasSellerAutoListerDraft({ id: "without-draft" }), false);
});

test("removes only the AutoLister task and preserves the product", () => {
  const updated = removeSellerAutoListerDraft(productWithDraft, "2026-08-01T20:00:00.000Z");
  assert.equal("autoListerDraft" in updated, false);
  assert.equal("autoListerDraft" in updated.rawServerProduct, false);
  assert.equal("autoListerDraft" in updated.rawServerProduct.listing, false);
  assert.equal(updated.status, "draft");
  assert.equal(updated.rawServerProduct.listingStatus, "draft");
  assert.equal(updated.rawServerProduct.listing.status, "draft");
  assert.equal(updated.localOnlyNote, "preserve");
  assert.deepEqual(updated.rawServerProduct.unknownServerField, { keep: true });
  assert.equal(updated.rawServerProduct.listing.customListingField, "preserve");
  assert.equal(updated.rawServerProduct.listing.title, "Laptopständer Aluminium");
  assert.equal(updated.rawServerProduct.listing.ebayItemId, "123456789012");
});

test("preserves a manual listing status while removing its obsolete draft", () => {
  const product = structuredClone(productWithDraft);
  product.status = "manually_listed";
  product.rawServerProduct.listingStatus = "manually_listed";
  product.rawServerProduct.listing.status = "manually_listed";
  const updated = removeSellerAutoListerDraft(product, "2026-08-01T20:00:00.000Z");
  assert.equal(updated.status, "manually_listed");
  assert.equal(updated.rawServerProduct.listingStatus, "manually_listed");
  assert.equal(updated.rawServerProduct.listing.status, "manually_listed");
  assert.equal(updated.rawServerProduct.listing.ebayItemId, "123456789012");
});

test("returns an unchanged product when no AutoLister task exists", () => {
  const product = { id: "without-draft", rawServerProduct: { id: "without-draft", listing: { title: "Keep" } } };
  assert.equal(removeSellerAutoListerDraft(product), product);
});

test("ships the module in both source and public output", async () => {
  const [{ readFile }, { fileURLToPath }] = await Promise.all([
    import("node:fs/promises"),
    import("node:url"),
  ]);
  const source = await readFile(fileURLToPath(new URL("../seller-auto-lister-delete.js", import.meta.url)), "utf8");
  const publicCopy = await readFile(fileURLToPath(new URL("../public/seller-auto-lister-delete.js", import.meta.url)), "utf8");
  assert.equal(publicCopy, source);
});
