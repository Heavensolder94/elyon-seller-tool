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

test("Amazon draft compatibility verifies the signed session before any external work", async () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  try {
    process.env.ELYON_SELLER_ACCESS_TOKEN = "extension-bridge-test-secret";
    for (const action of ["create-draft", "draft"]) {
      const res = responseMock();
      await extensionActionHandler({
        method: "POST", headers: { "x-elyon-seller-session": "ZmFrZQ.ZmFrZQ" },
        body: { action, payload: { sku: "AMZ-B0BWND9WBR" } },
      }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error, "seller_access_denied");
    }
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
  }
});

test("Amazon draft compatibility cannot publish or use non-Amazon identities", async () => {
  const names = ["ELYON_SELLER_ACCESS_TOKEN", "ELYON_COMPANY_OS_SYNC_CODE", "ELYON_COMPANY_OS_URL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    const session = signedSellerSession();
    process.env.ELYON_COMPANY_OS_SYNC_CODE = "test-server-only-sync";
    process.env.ELYON_COMPANY_OS_URL = "https://company-os.example.test";
    for (const [payload, error] of [
      [{ sku: "AMZ-B0BWND9WBR", publish: true }, "amazon_draft_only_required"],
      [{ sku: "AMZ-B0BWND9WBR", published: true }, "amazon_draft_only_required"],
      [{ sku: "ELY-000001", conditionEnum: "NEW" }, "amazon_draft_sku_invalid"],
      [{ sku: "AMZ-B0BWND9WBR" }, "amazon_draft_condition_required"],
    ]) {
      const res = responseMock();
      await extensionActionHandler({
        method: "POST", headers: { "x-elyon-seller-session": session },
        body: { action: "create-draft", payload },
      }, res);
      assert.ok(res.statusCode >= 400);
      assert.equal(res.body.error, error);
    }
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("valid Amazon draft reaches Company OS and stops before eBay if the canonical CSV is unavailable", async () => {
  const names = ["ELYON_SELLER_ACCESS_TOKEN", "ELYON_COMPANY_OS_SYNC_CODE", "ELYON_COMPANY_OS_URL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const oldFetch = globalThis.fetch;
  const calls = [];
  try {
    const session = signedSellerSession();
    process.env.ELYON_COMPANY_OS_SYNC_CODE = "test-server-only-sync";
    process.env.ELYON_COMPANY_OS_URL = "https://company-os.example.test";
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: false, status: 409, json: async () => ({
        error: "ebay_official_draft_template_missing", message: "Vorlage fehlt",
      }) };
    };
    const res = responseMock();
    await extensionActionHandler({
      method: "POST", headers: { "x-elyon-seller-session": session },
      body: { action: "create-draft", payload: {
        sku: "AMZ-B0BWND9WBR", conditionEnum: "NEW", title: "Test", price: 10,
      } },
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, "ebay_official_draft_template_missing");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://company-os.example.test/api/auto-lister-seller-hub");
    assert.equal(calls[0].body.action, "build_external_csv");
    assert.equal(calls[0].body.confirmation, "draft_only");
    assert.equal(calls[0].body.publish, false);
  } finally {
    globalThis.fetch = oldFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
