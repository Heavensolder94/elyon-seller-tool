import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../api/integrations/company-os/market-research.js", import.meta.url), "utf8");

test("Company OS market research bridge is authenticated and read-only", () => {
  assert.match(source, /requireBridgeAccess\(req, res\)/);
  assert.match(source, /req\.method !== "GET"/);
  assert.match(source, /action:\s*"competition"/);
  assert.match(source, /source:\s*"ebay_browse_active_listings"/);
  assert.match(source, /marketType:\s*"active_listings"/);
});

test("market research bridge explicitly reports evidence limits", () => {
  assert.match(source, /activeListingsOnly:\s*true/);
  assert.match(source, /soldItemsAvailable:\s*false/);
  assert.match(source, /automaticPriceDecision:\s*false/);
});

test("market research bridge contains no eBay commerce write action", () => {
  assert.doesNotMatch(source, /publishOffer|publishEbay|createEbay|create-draft|inventory\/v1\/offer|withdraw|refund|order/);
});
