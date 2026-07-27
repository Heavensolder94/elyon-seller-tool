import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSellerSession,
  isSellerAuthenticated,
  requireSellerAccess,
  sellerAccessConfiguration,
  verifySellerToken,
} from "../lib/seller-access.js";
import productHandler from "../api/products/index.js";
import sheetsSettingsHandler from "../api/google-sheets-sync-settings.js";

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
    end(body) {
      this.body = body ?? this.body;
      return this;
    },
  };
}

function sellerCookie(token = "seller-test-secret") {
  process.env.ELYON_SELLER_ACCESS_TOKEN = token;
  const res = responseMock();
  const result = createSellerSession({ headers: { host: "localhost:4173" } }, res, token);
  assert.equal(result.ok, true);
  return String(res.getHeader("set-cookie")).split(";")[0];
}

test("seller guard fails closed when no server secret exists", () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  delete process.env.ELYON_SELLER_ACCESS_TOKEN;
  const res = responseMock();
  try {
    assert.equal(requireSellerAccess({ method: "GET", headers: {} }, res), false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "seller_access_not_configured");
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
  }
});

test("seller login ignores legacy admin token fallbacks", () => {
  const previousSeller = process.env.ELYON_SELLER_ACCESS_TOKEN;
  const previousAdmin = process.env.ELYON_ADMIN_TOKEN;
  const previousFlags = process.env.FEATURE_FLAGS_ADMIN_TOKEN;
  try {
    delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    process.env.ELYON_ADMIN_TOKEN = "legacy-admin-secret";
    process.env.FEATURE_FLAGS_ADMIN_TOKEN = "legacy-flags-secret";
    assert.equal(sellerAccessConfiguration().configured, false);
    assert.equal(verifySellerToken("legacy-admin-secret"), false);
    assert.equal(verifySellerToken("legacy-flags-secret"), false);
  } finally {
    if (previousSeller === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previousSeller;
    if (previousAdmin === undefined) delete process.env.ELYON_ADMIN_TOKEN;
    else process.env.ELYON_ADMIN_TOKEN = previousAdmin;
    if (previousFlags === undefined) delete process.env.FEATURE_FLAGS_ADMIN_TOKEN;
    else process.env.FEATURE_FLAGS_ADMIN_TOKEN = previousFlags;
  }
});

test("seller token tolerates copied quotes, invisible characters and outer whitespace", () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  try {
    process.env.ELYON_SELLER_ACCESS_TOKEN = '  "seller-production-secret\u200B"  ';
    const configuration = sellerAccessConfiguration();
    assert.equal(configuration.configured, true);
    assert.equal(configuration.source, "ELYON_SELLER_ACCESS_TOKEN");
    assert.equal(configuration.formatAdjusted, true);
    assert.equal(verifySellerToken("seller-production-secret"), true);
    assert.equal(verifySellerToken("  'seller-production-secret'  "), true);
    assert.equal(verifySellerToken("wrong-secret"), false);
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
  }
});

test("signed seller session authenticates without storing the raw token", () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  try {
    const cookie = sellerCookie();
    assert.equal(cookie.includes("seller-test-secret"), false);
    assert.equal(isSellerAuthenticated({ headers: { cookie } }), true);
    assert.equal(isSellerAuthenticated({ headers: { cookie: `${cookie}x` } }), false);
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
  }
});

test("product master rejects authenticated writes without persistent storage", async () => {
  const previous = process.env.ELYON_SELLER_ACCESS_TOKEN;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const backupUrl = process.env.UPSTASH_BACKUP_URL;
  const backupToken = process.env.UPSTASH_BACKUP_TOKEN;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  try {
    const cookie = sellerCookie();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_BACKUP_URL;
    delete process.env.UPSTASH_BACKUP_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const res = responseMock();
    await productHandler({ method: "POST", headers: { cookie }, body: { title: "Test" }, query: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "persistent_storage_required");
  } finally {
    if (previous === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previous;
    if (redisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    if (redisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
    if (backupUrl === undefined) delete process.env.UPSTASH_BACKUP_URL; else process.env.UPSTASH_BACKUP_URL = backupUrl;
    if (backupToken === undefined) delete process.env.UPSTASH_BACKUP_TOKEN; else process.env.UPSTASH_BACKUP_TOKEN = backupToken;
    if (kvUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = kvUrl;
    if (kvToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = kvToken;
  }
});

test("Google Sheets settings never return the stored sync token", async () => {
  const previousToken = process.env.ELYON_SELLER_ACCESS_TOKEN;
  const previousMode = process.env.GOOGLE_SHEETS_SYNC_STORE_MODE;
  const previousPath = process.env.GOOGLE_SHEETS_SYNC_STORE_PATH;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "elyon-sheets-test-"));
  const settingsPath = path.join(tempDir, "settings.json");
  try {
    const cookie = sellerCookie();
    process.env.GOOGLE_SHEETS_SYNC_STORE_MODE = "file";
    process.env.GOOGLE_SHEETS_SYNC_STORE_PATH = settingsPath;
    await writeFile(settingsPath, JSON.stringify({ url: "https://script.google.com/macros/s/demo/exec", token: "top-secret-sync-token" }), "utf8");
    const res = responseMock();
    await sheetsSettingsHandler({ method: "GET", headers: { cookie }, query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.settings.token, "");
    assert.equal(res.body.settings.tokenConfigured, true);
    assert.equal(JSON.stringify(res.body).includes("top-secret-sync-token"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (previousToken === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previousToken;
    if (previousMode === undefined) delete process.env.GOOGLE_SHEETS_SYNC_STORE_MODE;
    else process.env.GOOGLE_SHEETS_SYNC_STORE_MODE = previousMode;
    if (previousPath === undefined) delete process.env.GOOGLE_SHEETS_SYNC_STORE_PATH;
    else process.env.GOOGLE_SHEETS_SYNC_STORE_PATH = previousPath;
  }
});
