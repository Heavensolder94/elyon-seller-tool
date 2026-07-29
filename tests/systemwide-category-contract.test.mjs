import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  categoryState,
  mergeProductWithCategory,
} from "../seller-category-engine-core.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("categoryData preserves source category and official ebay category", () => {
  const product = {
    id: "P-1",
    title: "Kabel Organizer",
    category: "Supplier Storage",
    sourceCategoryName: "Supplier Storage",
    listing: { itemSpecifics: { Material: ["Silikon"] } },
  };
  const updated = mergeProductWithCategory(product, {
    categoryId: "12345",
    categoryName: "Kabelmanagement",
    path: ["Computer", "Kabelmanagement"],
    required: ["Material"],
    aspects: [{ name: "Material", required: true }],
    source: "ebay_taxonomy_manual_choice",
    automatic: false,
  });

  assert.equal(updated.sourceCategoryName, "Supplier Storage");
  assert.equal(updated.categoryData.schemaVersion, "elyon-category-v1");
  assert.equal(updated.categoryData.ebay.categoryId, "12345");
  assert.deepEqual(updated.categoryData.ebay.categoryPath, ["Computer", "Kabelmanagement"]);
  assert.equal(updated.listing.categoryData.ebay.categoryName, "Kabelmanagement");
  assert.equal(categoryState(updated).valid, true);
});

test("category change resets old category-specific confirmation", () => {
  const first = mergeProductWithCategory({
    id: "P-2",
    title: "Organizer",
    listing: { itemSpecifics: { Marke: ["Markenlos"] } },
  }, {
    categoryId: "100",
    categoryName: "Alt",
    required: ["Marke"],
    aspects: [{ name: "Marke", required: true }],
  });
  first.categoryData.ebay.requiredSpecificsConfirmed = true;
  first.listing.requiredSpecificsConfirmed = true;

  const changed = mergeProductWithCategory(first, {
    categoryId: "200",
    categoryName: "Neu",
    required: ["Produktart"],
    aspects: [{ name: "Produktart", required: true }],
  });

  assert.equal(changed.categoryData.ebay.requiredSpecificsConfirmed, false);
  assert.equal(changed.categoryData.ebay.staleSpecifics, true);
  assert.equal(changed.listing.requiredSpecificsConfirmed, false);
  assert.deepEqual(changed.listing.autoListerDraft?.missingRequiredAspects || ["Produktart"], ["Produktart"]);
});

test("Product Master and Company OS adoption keep canonical fields", () => {
  const master = read("lib/product-master.js");
  const inbox = read("seller-company-os-inbox.js");
  const flow = read("seller-selling-flow-core.js");
  assert.match(master, /Offizielle eBay-Kategorie fehlt/);
  assert.match(master, /categoryData: category\.categoryData/);
  assert.match(inbox, /ebayCategoryId/);
  assert.match(flow, /categoryData: object\(merged\.categoryData\)/);
});
