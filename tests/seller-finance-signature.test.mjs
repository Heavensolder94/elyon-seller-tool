import test from "node:test";
import assert from "node:assert/strict";
import { constants, generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { financeSigningStatus, signFinancesGetRequest } from "../lib/ebay-finance-signature.js";

const jwe = "a.b.c.d.e";
const url = "https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate%3A%5B1..2%5D&limit=1000";
const timestamp = 1795033500;

function verifySignedHeaders(headers, publicKey, algorithm, padding) {
  const params = headers["Signature-Input"].slice("sig1=".length);
  const signatureBase = [
    '"x-ebay-signature-key": ' + headers["x-ebay-signature-key"],
    '"@method": GET',
    '"@path": /sell/finances/v1/transaction',
    '"@authority": apiz.ebay.com',
    '"@signature-params": ' + params,
  ].join("\n");
  const signature = Buffer.from(headers.Signature.slice("sig1=:".length, -1), "base64");
  assert.equal(headers["Signature-Input"], 'sig1=("x-ebay-signature-key" "@method" "@path" "@authority");created=' + timestamp);
  assert.equal(headers["x-ebay-signature-key"], jwe);
  assert.equal(headers["Content-Digest"], undefined);
  assert.ok(verify(algorithm, Buffer.from(signatureBase), padding
    ? { key: publicKey, padding } : publicKey, signature));
}

test("eBay Finances GET signature verifies as Ed25519 RFC 9421 message", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const headers = signFinancesGetRequest(url, {
    jwe, privateKey: privateKey.export({ type: "pkcs8", format: "pem" }), created: timestamp,
  });
  verifySignedHeaders(headers, publicKey, null);
});

test("eBay raw createSigningKey base64 PKCS8 DER signs without manual PEM conversion", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawEbayKey = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const headers = signFinancesGetRequest(url, { jwe, privateKey: rawEbayKey, created: timestamp });
  verifySignedHeaders(headers, publicKey, null);
});

test("eBay Finances GET signature verifies as RSA-SHA256 and normalizes escaped PEM newlines", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const headers = signFinancesGetRequest(url, {
    jwe, privateKey: pem.replace(/\n/g, "\\n"), created: timestamp,
  });
  verifySignedHeaders(headers, publicKey, "sha256", constants.RSA_PKCS1_PADDING);
});

test("missing or invalid signing configuration fails safely before HTTP calls", () => {
  assert.throws(
    () => signFinancesGetRequest(url, { jwe: "", privateKey: "" }),
    (error) => error.code === "ebay_signature_not_configured" && error.status === 503,
  );
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  assert.throws(
    () => signFinancesGetRequest("https://evil.example/steal", { jwe, privateKey: pem }),
    (error) => error.code === "ebay_signature_target_invalid",
  );
  assert.throws(
    () => signFinancesGetRequest(url, { jwe: "not-jwe", privateKey: pem }),
    (error) => error.code === "ebay_signature_invalid_config",
  );
  assert.throws(
    () => signFinancesGetRequest(url, { jwe, privateKey: "secret-text" }),
    (error) => error.code === "ebay_signature_invalid_private_key" && !error.message.includes("secret-text"),
  );
});

test("signature status exposes only whether keys are configured, never their contents", () => {
  const options = {
    EBAY_SIGNATURE_PRIVATE_KEY: "private key belongs on server",
    EBAY_SIGNATURE_JWE: jwe,
  };
  const status = financeSigningStatus(options);
  assert.deepEqual(status, { required: true, configured: true, missing: [] });
  assert.ok(!JSON.stringify(status).includes("private key belongs"));
});

test("Finances API applies signatures to transactions and payouts and browser formats server errors", async () => {
  const api = await readFile(new URL("../internal/finance/index.js", import.meta.url), "utf8");
  const ui = await readFile(new URL("../seller-finance.js", import.meta.url), "utf8");
  assert.match(api, /signFinancesGetRequest\(requestUrl\)/);
  assert.equal((api.match(/headers: ebayHeaders\(session\.accessToken, url\.toString\(\)\)/g) || []).length, 2);
  assert.match(api, /ebayFinancesSignature: financeSigningStatus\(\)/);
  assert.match(ui, /function financeErrorText\(/);
  assert.match(ui, /EBAY_SIGNATURE_PRIVATE_KEY/);
});
