import test from "node:test";
import assert from "node:assert/strict";

import { buildSellerHubDraftCsv, parseSellerHubDraftResult } from "../lib/ebay-seller-hub-drafts.js";

test("Seller Hub draft CSV mirrors the downloaded draft template shape", () => {
  const built = buildSellerHubDraftCsv({
    marketplaceId: "EBAY_DE",
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
  assert.equal(built.marketplaceId, "EBAY_DE");
  assert.equal(built.imageCount, 2);
  assert.equal(built.condition, "NEW");
  assert.equal(built.descriptionDesigned, false);
  assert.equal(built.descriptionTheme, "plain");
  assert.doesNotMatch(built.csv, /^\uFEFF/);
  assert.ok(built.csv.endsWith("\r\n"));

  const lines = built.csv.split("\r\n");
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^#INFO Created=\d+$/);
  assert.equal(lines[1], "#INFO Version=1.0 Template=fx_draft_template_EBAY");
  assert.equal(lines[2], "#INFO");
  assert.ok(lines[3].startsWith("*Action(SiteID=Germany|Country=DE|Currency=EUR|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format"));
  assert.match(lines[4], /^Draft,AMZ-B0TEST1234,12345,/);
  assert.match(lines[4], /,19\.99,1,/);
  assert.match(lines[4], /,NEW,/);
  assert.match(lines[4], /"Kompaktes Ladegerät, mit Komma und ""Zitat""\.<br>Zweite Zeile\."/);
});

test("Seller Hub draft can render an Elyon visual description design", () => {
  const built = buildSellerHubDraftCsv({
    marketplaceId: "EBAY_DE",
    sourceProductId: "amazon:B0DESIGN123",
    sku: "AMZ-B0DESIGN123",
    categoryId: "12345",
    title: "USB C Ladegerät 20W",
    description: "Kompaktes Ladegerät für Smartphone und Tablet.",
    itemSpecifics: { Marke: ["Elyon Test"], Leistung: ["20 W"] },
    images: ["https://example.test/product.jpg"],
    useDescriptionDesign: true,
    descriptionTheme: "carbon",
  });

  assert.equal(built.descriptionDesigned, true);
  assert.equal(built.descriptionTheme, "carbon");
  assert.match(built.csv, /<!doctype html>/i);
  assert.match(built.csv, /class=""elyon""/);
  assert.match(built.csv, /--brand:#0b1117/);
  assert.match(built.csv, /USB C Ladegerät 20W/);
});

test("Seller Hub draft maps marketplace metadata into the Action header", () => {
  const built = buildSellerHubDraftCsv({ marketplaceId: "EBAY_GB", categoryId: "261186" });
  assert.match(built.csv, /\*Action\(SiteID=UK\|Country=GB\|Currency=GBP\|Version=1193\|CC=UTF-8\)/);
});

test("Seller Hub draft maps non-new conditions to USED", () => {
  const built = buildSellerHubDraftCsv({ categoryId: "261186", conditionEnum: "USED_GOOD" });
  assert.equal(built.condition, "USED");
  assert.match(built.csv, /,USED,/);
});

test("Seller Hub draft only requires a numeric category ID", () => {
  const built = buildSellerHubDraftCsv({ categoryId: "261186" });
  assert.match(built.csv, /\r\nDraft,/);
  assert.match(built.csv, /261186/);
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

test("Seller Hub draft result parser extracts FX_DRAFT CSV errors cleanly", () => {
  const parsed = parseSellerHubDraftResult(
    "LineNumber,DraftID,Title,Status,Link to complete draft,ErrorCode,ErrorMessage\r\n2,,,ERROR,,BAF.Error.3,Error occured try again later!\r\n",
  );
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].code, "BAF.Error.3");
  assert.equal(parsed.errors[0].severity, "ERROR");
  assert.equal(parsed.errors[0].message, "Error occured try again later!");
});
