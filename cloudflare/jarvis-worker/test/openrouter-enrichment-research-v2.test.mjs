import assert from "node:assert/strict";
import test from "node:test";
import { researchWithOpenRouter } from "../src/openrouter-enrichment-research-v2.js";

test("research request enables server search/fetch and returns exact usage cost", async () => {
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            findings: [{
              field: "material",
              value: "ABS",
              sourceType: "manufacturer",
              sourceUrl: "https://manufacturer.test/product",
              evidence: "Material specification: ABS",
              evidenceCount: 1,
            }],
            unresolved: [],
          }),
          annotations: [{
            type: "url_citation",
            url_citation: { url: "https://manufacturer.test/product" },
          }],
        },
      }],
      usage: {
        prompt_tokens: 123,
        completion_tokens: 45,
        total_tokens: 168,
        cost: 0.00123,
        cost_details: { upstream_inference_cost: 0.001 },
        server_tool_use: { web_search_requests: 2 },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await researchWithOpenRouter({
    env: { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "openrouter/free" },
    product: {
      articleNumber: "ELY-000123",
      title: "Testprodukt",
      supplier: { url: "https://supplier.test/item/123" },
    },
    rawProduct: {},
    fields: ["material"],
    fetchImpl,
  });

  assert.equal(requestBody.tools[0].type, "openrouter:web_search");
  assert.equal(requestBody.tools[1].type, "openrouter:web_fetch");
  assert.equal(requestBody.tools[0].parameters.max_total_results, 12);
  assert.equal(result.findings[0].confidence, 0.97);
  assert.equal(result.usage.webSearchRequests, 2);
  assert.equal(result.usage.amount, 0.00123);
  assert.equal(result.usage.unit, "openrouter_credits");
  assert.deepEqual(result.citations, ["https://manufacturer.test/product"]);
});

test("missing OpenRouter configuration is non-retryable", async () => {
  await assert.rejects(
    () => researchWithOpenRouter({ env: {}, product: {}, rawProduct: {}, fields: ["material"], fetchImpl: async () => null }),
    (error) => error.message === "openrouter_not_configured" && error.retryable === false
  );
});
