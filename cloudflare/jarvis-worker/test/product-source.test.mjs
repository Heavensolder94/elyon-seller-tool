import assert from "node:assert/strict";
import test from "node:test";

import { loadProductForTask } from "../src/index.js";

const withMockFetch = async (mockFetch, callback) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("ProductCheck prefers the authenticated Seller Tool Product Master API", async () => {
  const env = {
    ELYON_SELLER_TOOL_URL: "https://seller.example.test",
    ELYON_SELLER_ACCESS_TOKEN: "test-value"
  };

  await withMockFetch(async (url, init = {}) => {
    assert.equal(String(url), "https://seller.example.test/api/products?includeLegacyImports=true");
    assert.equal(init.method, "GET");
    assert.equal(init.headers["x-elyon-seller-token"], "test-value");

    return Response.json({
      ok: true,
      products: [{
        id: "prod-123",
        articleNumber: "ELY-000123",
        sku: "ELY-000123",
        title: "Test product",
        pricing: { buyPrice: 10, salePrice: 20 },
        supplier: { name: "Test Supplier", url: "https://supplier.example.test/item" }
      }],
      legacyBrowserImports: []
    });
  }, async () => {
    const result = await loadProductForTask(env, "ELY-000123");
    assert.equal(result.source, "seller_tool_product_master");
    assert.equal(result.product.articleNumber, "ELY-000123");
  });
});

test("ProductCheck falls back to worker Redis when Seller Tool API has no match", async () => {
  const env = {
    ELYON_SELLER_TOOL_URL: "https://seller.example.test",
    ELYON_SELLER_ACCESS_TOKEN: "test-value",
    UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    UPSTASH_REDIS_REST_TOKEN: "redis-test-value"
  };

  await withMockFetch(async (url, init = {}) => {
    if (String(url).startsWith("https://seller.example.test")) {
      return Response.json({ ok: true, products: [], legacyBrowserImports: [] });
    }

    if (String(url) === env.UPSTASH_REDIS_REST_URL) {
      const command = JSON.parse(init.body);
      if (command[0] === "GET" && command[1] === "elyon_products") {
        return Response.json({ result: JSON.stringify([{ id: "local-1", sku: "LOCAL-001", title: "Local product" }]) });
      }
      return Response.json({ result: null });
    }

    throw new Error(`unexpected URL ${url}`);
  }, async () => {
    const result = await loadProductForTask(env, "LOCAL-001");
    assert.equal(result.source, "worker_product_master");
    assert.equal(result.product.sku, "LOCAL-001");
  });
});
