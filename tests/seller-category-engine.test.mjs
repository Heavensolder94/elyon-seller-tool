import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  categoryNeedsResolution,
  categoryQueryFromProduct,
  categoryState,
  mergeProductWithCategory,
  normalizeCategoryResolution,
} from "../seller-category-engine-core.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function syntaxCheck(file) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${file}`, import.meta.url))], { stdio: "pipe" });
}

test("category query uses product title and useful item specifics", () => {
  const query = categoryQueryFromProduct({
    title: "Kabellose LED Tischlampe dimmbar",
    itemSpecifics: { Marke: ["Elyon Home"], Produktart: "Tischleuchte" },
  });

  assert.match(query, /Kabellose LED Tischlampe/);
  assert.match(query, /Elyon Home/);
  assert.match(query, /Tischleuchte/);
});

test("only products without an internal numeric category need automatic resolution", () => {
  assert.equal(categoryNeedsResolution({ title: "Wandaufkleber Weltkarte" }), true);
  assert.equal(categoryNeedsResolution({ title: "Wandaufkleber Weltkarte", listing: { categoryId: "159889", categoryName: "Wandtattoos" } }), false);
  assert.equal(categoryNeedsResolution({ title: "" }), false);
});

test("resolved category is shared across root, listing, server copy and existing draft", () => {
  const product = {
    id: "P-1",
    title: "Wandaufkleber Weltkarte",
    listing: {
      title: "Wandaufkleber Weltkarte groß",
      autoListerDraft: { title: "Wandaufkleber Weltkarte groß", conditionId: "1000" },
    },
    rawServerProduct: { id: "P-1", title: "Wandaufkleber Weltkarte" },
  };
  const updated = mergeProductWithCategory(product, {
    categoryId: "159889",
    categoryName: "Wandtattoos",
    ancestors: [{ categoryId: "11700", categoryName: "Möbel & Wohnen" }],
    required: ["Marke", "Produktart"],
    aspects: [{ name: "Marke", required: true, values: [] }],
    query: "Wandaufkleber Weltkarte",
  });

  assert.equal(updated.categoryId, "159889");
  assert.equal(updated.categoryName, "Wandtattoos");
  assert.equal(updated.listing.categoryId, "159889");
  assert.equal(updated.listing.autoListerDraft.categoryId, "159889");
  assert.equal(updated.rawServerProduct.listing.categoryName, "Wandtattoos");
  assert.deepEqual(updated.categoryMetadata.path, ["Möbel & Wohnen", "Wandtattoos"]);
  assert.deepEqual(updated.categoryMetadata.required, ["Marke", "Produktart"]);
  assert.equal(categoryState(updated).valid, true);
});

test("invalid taxonomy result never overwrites existing product data", () => {
  const product = { title: "Produkt", listing: { categoryId: "123", categoryName: "Bestehend" } };
  const updated = mergeProductWithCategory(product, { categoryId: "abc", categoryName: "Falsch" });
  assert.equal(updated, product);
  assert.equal(normalizeCategoryResolution({ categoryId: "abc", categoryName: "Falsch" }).valid, false);
});

test("browser integration hides category numbers and offers name-based selection", async () => {
  const source = await readFile(new URL("../seller-category-engine.js", import.meta.url), "utf8");
  assert.match(source, /action:\s*"resolve"/);
  assert.match(source, /sce-id-internal/);
  assert.match(source, /Keine Zahleneingabe erforderlich/);
  assert.match(source, /Kategorie ändern/);
  assert.match(source, /data-sce-choice/);
  assert.match(source, /sellerProductPayload/);
  assert.match(source, /elyon:category-resolved/);
  assert.doesNotMatch(source, /placeholder="z\. B\. 12345"/);
});

test("taxonomy API exposes automatic resolve with aspects and alternatives", async () => {
  const source = await readFile(new URL("../api/ebay-taxonomy.js", import.meta.url), "utf8");
  assert.match(source, /action === "resolve"/);
  assert.match(source, /resolveCategory/);
  assert.match(source, /categoryAspects\(category\.categoryId/);
  assert.match(source, /alternatives:/);
  assert.match(source, /automaticResolution: true/);
});

test("desktop and mobile builds ship the shared category engine", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(source, /seller-category-engine-core\.js/);
  assert.match(source, /seller-category-engine\.js/);
  assert.match(source, /type="module" src="\/seller-category-engine\.js/);
});

test("new category engine files are valid JavaScript", () => {
  for (const file of ["seller-category-engine-core.js", "seller-category-engine.js", "api/ebay-taxonomy.js", "scripts/prepare-vercel.mjs"]) {
    syntaxCheck(file);
  }
  assert.ok(root);
});
