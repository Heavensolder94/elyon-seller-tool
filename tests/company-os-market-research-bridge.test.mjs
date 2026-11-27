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

test('bridge distinguishes real free shipping from unknown or foreign-currency shipping', async () => {
  const { normalizedItem } = await import('../api/integrations/company-os/market-research.js');
  const base = { price: { value: '20', currency: 'EUR' }, seller: { feedbackPercentage: '98.4' }, bidCount: 0 };
  const missing = normalizedItem(base);
  const priced = normalizedItem({ ...base, shippingOptions: [{ shippingCost: { value: 0, currency: 'EUR' } },
    { shippingCost: { value: 0, currency: 'GBP' } }] });
  assert.deepEqual(missing.shippingOptions, []);
  assert.equal(missing.shippingCost, 0);
  assert.deepEqual(priced.shippingOptions[0].shippingCost, { value: 0, currency: 'EUR' });
  assert.equal(priced.shippingOptions[1].shippingCost, null);
  assert.equal(priced.seller.feedbackPercentage, 98.4);
  assert.equal(priced.bidCount, 0);
  assert.equal(priced.watchCount, null);
});
