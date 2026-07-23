import test from "node:test";
import assert from "node:assert/strict";
import { parseEbayMoney } from "../lib/ebay-money.js";
import { createEbayOAuthState, verifyEbayOAuthState } from "../lib/ebay-oauth-state.js";
import { requireImporterAccess } from "../lib/importer-request-guard.js";

test("eBay money parser keeps international decimals", () => {
  assert.equal(parseEbayMoney("19.99"), 19.99);
  assert.equal(parseEbayMoney("1,999.99"), 1999.99);
});

test("eBay money parser handles German formats", () => {
  assert.equal(parseEbayMoney("19,99 €"), 19.99);
  assert.equal(parseEbayMoney("1.999,99 €"), 1999.99);
  assert.equal(parseEbayMoney("1.999"), 1999);
});

test("signed eBay OAuth state verifies only for the intended environment", () => {
  const previous = process.env.EBAY_CLIENT_SECRET;
  process.env.EBAY_CLIENT_SECRET = "test-oauth-secret";
  try {
    const state = createEbayOAuthState({ source: "test", environment: "production" });
    assert.equal(verifyEbayOAuthState(state, { environment: "production" }).ok, true);
    assert.equal(verifyEbayOAuthState(state, { environment: "sandbox" }).ok, false);
    assert.equal(verifyEbayOAuthState(state + "x", { environment: "production" }).ok, false);
  } finally {
    if (previous === undefined) delete process.env.EBAY_CLIENT_SECRET;
    else process.env.EBAY_CLIENT_SECRET = previous;
  }
});

test("importer guard rejects an invalid access token", () => {
  const previous = process.env.AMAZON_IMPORTER_ACCESS_TOKEN;
  process.env.AMAZON_IMPORTER_ACCESS_TOKEN = "correct-token";
  const req = { method: "GET", headers: { "x-elyon-import-token": "wrong-token" } };
  const response = { statusCode: 200, body: null, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  try {
    assert.equal(requireImporterAccess(req, response), false);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, "importer_access_denied");
  } finally {
    if (previous === undefined) delete process.env.AMAZON_IMPORTER_ACCESS_TOKEN;
    else process.env.AMAZON_IMPORTER_ACCESS_TOKEN = previous;
  }
});
