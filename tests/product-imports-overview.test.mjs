import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchProductIntakeOverview } from "../api/product-imports/overview.js";
import { transformSellerRuntimeLoader } from "../scripts/seller-listing-parity-transform.mjs";

const data = {
  schemaVersion: "elyon-product-intake-overview-v1",
  total: 3,
  sources: { nova: 1, amazonImporter: 1, companyOs: 1, unclassified: 0 },
  stages: { inbox: 1, review: 1, listingPrepared: 1 },
  identityUnverified: 0,
  dedupeVerified: true,
  complete: true,
};

test("Seller Tool fetches only the Company OS aggregate using existing server sync auth", async () => {
  let called = 0;
  const result = await fetchProductIntakeOverview({
    env: { ELYON_COMPANY_OS_URL: "https://elyon-company-os.vercel.app", COMPANY_OS_SYNC_CODE: "test-secret-123456" },
    fetchImpl: async (url, options) => {
      called++;
      assert.equal(url.pathname, "/api/product-intake-overview");
      assert.equal(options.headers["X-Elyon-Sync-Code"], "test-secret-123456");
      assert.equal(options.method, "GET");
      return { ok: true, json: async () => ({ ok: true, overview: data, generatedAt: "2026-11-19T00:00:00Z" }) };
    },
  });
  assert.equal(called, 1);
  assert.equal(result.total, 3);
  assert.deepEqual(result.sources, data.sources);
  assert.equal(JSON.stringify(result).includes("test-secret-123456"), false);
});

test("malformed or inconsistent upstream source totals never become legitimate counts", async () => {
  const env = { COMPANY_OS_SYNC_CODE: "test-secret-123456" };
  await assert.rejects(() => fetchProductIntakeOverview({
    env,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, overview: { ...data, sources: { ...data.sources, nova: 20 } } }) }),
  }), /inconsistent/);
});

test("unreachable backend is not represented as an empty intake", async () => {
  await assert.rejects(() => fetchProductIntakeOverview({
    env: { COMPANY_OS_SYNC_CODE: "test-secret-123456" },
    fetchImpl: async () => { throw new Error("backend down"); },
  }), /backend down/);
});

test("missing auth or an insecure source URL is rejected before contacting upstream", async () => {
  await assert.rejects(() => fetchProductIntakeOverview({
    env: { COMPANY_OS_SYNC_CODE: "abc", ELYON_COMPANY_OS_URL: "http://example.org" },
    fetchImpl: async () => { throw new Error("must not fetch"); },
  }), /company_os_sync_code_missing/);
  await assert.rejects(() => fetchProductIntakeOverview({
    env: { COMPANY_OS_SYNC_CODE: "test-secret-123456", ELYON_COMPANY_OS_URL: "http://example.org" },
    fetchImpl: async () => { throw new Error("must not fetch"); },
  }), /company_os_url_invalid/);
});

test("production runtime distinguishes product imports from eBay Feed task records", async () => {
  const source = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const runtime = transformSellerRuntimeLoader(source);
  assert.match(runtime, /getJson\("\/api\/product-imports\/overview"\)/);
  assert.match(runtime, /<small>Importiert<\/small>[\s\S]*?<strong>\$\{typeof intakeCountLabel/);
  assert.match(runtime, /Einmalig erfasste Produkte aus ELYON Nova, Amazon Importer und Company OS/);
  assert.match(runtime, /Produktzugänge &amp; eBay-Status/);
  assert.match(runtime, /Feed-Aufträge: /);
  assert.match(runtime, /productIntakeError/);
  assert.doesNotMatch(runtime, /<small>Importiert<\/small>[\s\S]*?<strong>\$\{window\.__elyonSellerState\?\.draftsAvailable === false \? "!" : processedFeedCount/);
});
