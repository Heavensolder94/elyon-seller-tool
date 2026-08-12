import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const taxonomy = fs.readFileSync(new URL("../api/ebay-taxonomy.js", import.meta.url), "utf8");

test("eBay taxonomy accepts authenticated Seller Tool sessions or the internal Company OS bridge", () => {
  assert.match(taxonomy, /validateBridgeAccess/);
  assert.match(taxonomy, /isSellerAuthenticated/);
  assert.match(taxonomy, /sellerAccessConfigured/);
  assert.match(taxonomy, /requireTaxonomyAccess\(req, res\)/);
  assert.match(taxonomy, /if \(bridge\.ok\) return true/);
});

test("Company OS taxonomy access remains read-only", () => {
  assert.match(taxonomy, /if \(req\.method !== "GET"\)/);
  assert.doesNotMatch(taxonomy, /publishOffer|createEbay|inventory\/v1\/offer|method:\s*"POST"[^\n]*offer/);
});

test("taxonomy still resolves categories from eBay app credentials rather than user listing credentials", () => {
  assert.match(taxonomy, /EBAY_CLIENT_ID/);
  assert.match(taxonomy, /EBAY_CLIENT_SECRET/);
  assert.match(taxonomy, /grant_type:\s*"client_credentials"/);
  assert.match(taxonomy, /action === "resolve"/);
});
