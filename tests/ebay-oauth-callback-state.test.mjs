import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const callbackFiles = [
  "../ebay-accepted.html",
  "../public/ebay-accepted.html",
  "../public/ebay-token-exchange/index.html",
];

test("eBay OAuth callback passes eBay-signed state to token exchange", async()=>{
  for(const relative of callbackFiles) {
    const source=await readFile(new URL(relative,import.meta.url),"utf8");
    assert.match(source,/async function exchangeCode\(code, state\)/,relative);
    assert.match(source,/JSON\.stringify\(\{ code, state, environment \}\)/,relative);
    assert.match(source,/exchangeCode\(info\.code, info\.state\)/,relative);
    assert.match(source,/if \(!state\) \{/,"missing state must not consume eBay code: "+relative);
    assert.match(source,/error: 'oauth_state_missing'/,relative);
  }
});

test("API exchange requires a valid signed callback state",async()=>{
  const api=await readFile(new URL("../api/ebay/index.js",import.meta.url),"utf8");
  assert.match(api,/if \(action === "exchange-token"\)/);
  assert.match(api,/verifyEbayOAuthState\(state, \{ environment \}\)/);
  assert.match(api,/return res\.status\(403\)/);
});

test("eBay message permission remains requested during reconnect",async()=>{
  const ebay=await readFile(new URL("../lib/ebay-production.js",import.meta.url),"utf8");
  const auth=await readFile(new URL("../internal/ebay/index.js",import.meta.url),"utf8");
  assert.match(ebay,/commerce\.message/);
  assert.match(auth,/configuredEbayScopes\(\)\.join\(" "\)/);
});
