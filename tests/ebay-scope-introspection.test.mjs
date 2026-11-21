import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeEbayIntrospection } from "../api/ebay/scope-check.js";

const required = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.message",
];

test("eBay token introspection confirms all granted scopes without exposing credentials", () => {
  assert.deepEqual(summarizeEbayIntrospection({ active:true, scope:required.join(" ") }), {
    tokenActive:true, scopeVerified:true, messageScopeGranted:true, scopesComplete:true,
  });
});

test("introspection distinguishes unreported scopes from missing scope", () => {
  assert.deepEqual(summarizeEbayIntrospection({active:true}), {
    tokenActive:true, scopeVerified:false, messageScopeGranted:null, scopesComplete:null,
  });
  const missing=summarizeEbayIntrospection({active:true,scope:required.slice(0,-1).join(" ")});
  assert.equal(missing.scopeVerified,true);
  assert.equal(missing.messageScopeGranted,false);
  assert.equal(missing.scopesComplete,false);
  assert.equal(summarizeEbayIntrospection({active:false}).messageScopeGranted,false);
});

test("protected scope status is read only and does not send buyer messages", async () => {
  const source=await readFile(new URL("../api/ebay/scope-check.js",import.meta.url),"utf8");
  assert.match(source,/requireSellerAccess\(req, res\)/);
  assert.match(source,/req\.method !== "GET"/);
  assert.match(source,/token\/introspect/);
  assert.match(source,/token_type_hint: "access_token"/);
  assert.match(source,/Cache-Control", "no-store"/);
  assert.doesNotMatch(source,/send_message|otherPartyUsername|messageMedia/);
});
