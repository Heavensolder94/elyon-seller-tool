import test from "node:test";
import assert from "node:assert/strict";

import { buildSellerHubDraftCsv, parseSellerHubDraftResult } from "../lib/ebay-seller-hub-drafts.js";

test("Seller Hub draft CSV uses the current draft template headers", () => {
  const built = buildSellerHubDraftCsv({
    sourceProductId: "amazon:B0TEST1234",
    sku: "AMZ-B0TEST1234",
    categoryId: "12345",
    title: "USB C Ladegerät 20W Schnellladegerät",
    conditionEnum: "NEW",
    description: "Kompaktes Ladegerät, mit Komma und \"Zitat\".\nZweite Zeile.",
    quantity: 1,
    price: 19.99,
    images: ["https://example.test/a.jpg", "http://example.test/b.jpg"],
  });

  assert.equal(built.sku, "AMZ-B0TEST1234");
  assert.equal(built.categoryId, "12345");
  assert.equal(built.imageCount, 2);
  assert.equal(built.condition, "NEW");
  assert.ok(built.csv.startsWith("\uFEFF\"Action\",\"Custom label (SKU)\",\"Category ID\",\"Title\",\"UPC\",\"Price\",\"Quantity\",\"Item photo URL\",\"Condition ID\",\"Description\",\"Format\""));
  assert.match(built.csv, /\"Draft\",\"AMZ-B0TEST1234\",\"12345\"/);
  assert.match(built.csv, /\"19\.99\",\"1\"/);
  assert.match(built.csv, /\"NEW\"/);
  assert.doesNotMatch(built.csv, /\"1000\"/);
  assert.doesNotMatch(built.csv, /\"Start price\"/);
  assert.match(built.csv, /Kompaktes Ladegerät, mit Komma und \"\"Zitat\"\"\.<br>Zweite Zeile\./);
});

test("Seller Hub draft maps non-new conditions to USED", () => {
  const built = buildSellerHubDraftCsv({ categoryId: "261186", conditionEnum: "USED_GOOD" });
  assert.equal(built.condition, "USED");
  assert.match(built.csv, /\"USED\"/);
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

test("Seller Hub draft result parser extracts eBay Trading errors", () => {
  const parsed = parseSellerHubDraftResult(`<?xml version="1.0" encoding="UTF-8"?>
    <BulkDataExchangeResponses>
      <AddItemResponse>
        <Ack>Failure</Ack>
        <Errors>
          <ShortMessage>Invalid condition.</ShortMessage>
          <LongMessage>The condition value is not valid for this draft template.</LongMessage>
          <ErrorCode>21916884</ErrorCode>
          <SeverityCode>Error</SeverityCode>
        </Errors>
      </AddItemResponse>
    </BulkDataExchangeResponses>`);

  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].code, "21916884");
  assert.equal(parsed.errors[0].severity, "Error");
  assert.equal(parsed.errors[0].message, "The condition value is not valid for this draft template.");
});
