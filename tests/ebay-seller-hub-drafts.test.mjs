import test from "node:test";
import assert from "node:assert/strict";

import { buildSellerHubDraftCsv } from "../lib/ebay-seller-hub-drafts.js";

test("Seller Hub draft CSV uses Draft action and standard draft columns", () => {
  const built = buildSellerHubDraftCsv({
    sourceProductId: "amazon:B0TEST1234",
    sku: "AMZ-B0TEST1234",
    categoryId: "12345",
    title: "USB C Ladegerät 20W Schnellladegerät",
    conditionEnum: "NEW",
    description: "Kompaktes Ladegerät, mit Komma und \"Zitat\".",
    quantity: 1,
    price: 19.99,
    images: ["https://example.test/a.jpg", "http://example.test/rejected.jpg"],
  });

  assert.equal(built.sku, "AMZ-B0TEST1234");
  assert.equal(built.categoryId, "12345");
  assert.equal(built.imageCount, 1);
  assert.ok(built.csv.startsWith("\uFEFF\"Action\",\"Custom label (SKU)\",\"Category ID\""));
  assert.match(built.csv, /\"Draft\",\"AMZ-B0TEST1234\",\"12345\"/);
  assert.match(built.csv, /\"1000\"/);
  assert.match(built.csv, /\"FixedPrice\",\"1\",\"19\.99\"/);
  assert.match(built.csv, /\"Kompaktes Ladegerät, mit Komma und \"\"Zitat\"\"\.\"/);
  assert.doesNotMatch(built.csv, /http:\/\/example\.test/);
});

test("Seller Hub draft only requires a numeric category ID", () => {
  const built = buildSellerHubDraftCsv({ categoryId: "261186" });
  assert.match(built.csv, /\"Draft\",/);
  assert.match(built.csv, /\"261186\"/);
});

test("Seller Hub draft rejects missing category ID", () => {
  assert.throws(
    () => buildSellerHubDraftCsv({ title: "Test" }),
    (error) => error?.code === "ebay_draft_category_missing" && error?.status === 400,
  );
});
