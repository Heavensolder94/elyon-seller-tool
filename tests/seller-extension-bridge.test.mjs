import test from "node:test";
import assert from "node:assert/strict";
import {
  createSellerSession,
  requireSellerAccess,
} from "../lib/seller-access.js";
import {
  applyExtensionSellerSession,
  extensionSellerSession,
} from "../lib/seller-extension-bridge.js";
import extensionActionHandler, { normalizeExtensionEbayPayload } from "../api/ebay/extension-action.js";

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function signedSellerSession(token = "extension-bridge-test-secret") {
  process.env.ELYON_SELLER_ACCESS_TOKEN = token;
  const res = responseMock();
  const result = createSellerSession(
    { headers: { host: "localhost:4173" } },
    res,
    token,
  );
  assert.equal(result.ok, true);
  const cookie = String(res.getHeader("set-cookie")).split(";")[0];
  return decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
}

test("extension bridge converts a signed session header into seller authentication", () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  try {
    const session = signedSellerSession();
    const req = {
      method: "POST",
      headers: { "x-elyon-seller-session": session },
      body: { hello: "world" },
    };
    assert.equal(extensionSellerSession(req.headers), session);
    assert.equal(applyExtensionSellerSession(req).ok, true);
    const res = responseMock();
    assert.equal(requireSellerAccess(req, res), true);
    assert.equal(res.statusCode, 200);
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
  }
});

test("extension bridge rejects malformed or forged session header values", () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  try {
    process.env.ELYON_SELLER_ACCESS_TOKEN = "extension-bridge-test-secret";
    const malformed = { method: "POST", headers: { "x-elyon-seller-session": "bad;cookie=1" }, body: {} };
    assert.equal(applyExtensionSellerSession(malformed).ok, false);

    const forged = { method: "POST", headers: { "x-elyon-seller-session": "ZmFrZQ.ZmFrZQ" }, body: {} };
    assert.equal(applyExtensionSellerSession(forged).ok, true);
    const res = responseMock();
    assert.equal(requireSellerAccess(forged, res), false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, "seller_access_denied");
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
  }
});

test("extension eBay endpoint fails closed without a signed seller session", async () => {
  const res = responseMock();
  await extensionActionHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { action: "create-draft", payload: {} },
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "seller_extension_session_missing");
});

test("extension listing AI action is allowlisted but still requires a signed session", async () => {
  const res = responseMock();
  await extensionActionHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { action: "listing-ai", payload: { product: {}, draft: {}, strength: 55 } },
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "seller_extension_session_missing");
});

test("extension eBay endpoint only exposes the explicit lifecycle allowlist", async () => {
  const res = responseMock();
  await extensionActionHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { action: "token", payload: {} },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "seller_extension_action_not_allowed");
});

test("extension eBay payload is normalized to Inventory API field limits", () => {
  const longDescription = "D".repeat(4500);
  const longName = "N".repeat(45);
  const longValue = "V".repeat(60);
  const payload = normalizeExtensionEbayPayload({
    description: longDescription,
    itemSpecifics: {
      [longName]: [longValue, longValue],
      Marke: ["Testmarke"],
    },
    images: ["http://invalid.example/image.jpg", "https://example.com/a.jpg", "https://example.com/a.jpg"],
  });

  assert.equal(payload.description.length, 4000);
  const names = Object.keys(payload.itemSpecifics);
  assert.equal(names.some((name) => name.length > 40), false);
  assert.equal(Object.values(payload.itemSpecifics).flat().some((value) => value.length > 50), false);
  assert.deepEqual(payload.images, ["https://example.com/a.jpg"]);
});
