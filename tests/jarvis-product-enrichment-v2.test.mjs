import assert from "node:assert/strict";
import test from "node:test";
import enrichmentWorker, { runProductEnrichmentV2 } from "../cloudflare/jarvis-worker/src/index-enrichment-v2.js";
import {
  buildPreservingEnrichmentPatch,
  existingEnrichmentFields,
} from "../cloudflare/jarvis-worker/src/enrichment-provenance-v2.js";
import { researchWithOpenRouter } from "../cloudflare/jarvis-worker/src/openrouter-enrichment-research-v2.js";

test("hardened enrichment worker exports fetch, queue and handler", () => {
  assert.equal(typeof enrichmentWorker.fetch, "function");
  assert.equal(typeof enrichmentWorker.queue, "function");
  assert.equal(typeof runProductEnrichmentV2, "function");
});

test("provenance survives nested raw normalization layers", () => {
  const product = {
    raw: {
      enrichment: {
        fields: {
          material: { value: "ABS", confidence: 0.97, status: "auto_apply" },
        },
      },
      raw: {
        enrichment: {
          fields: {
            color: { value: "Schwarz", confidence: 0.93, status: "auto_apply" },
          },
        },
      },
    },
  };
  const oldFields = existingEnrichmentFields(product);
  assert.equal(oldFields.material.value, "ABS");
  assert.equal(oldFields.color.value, "Schwarz");

  const patch = buildPreservingEnrichmentPatch({
    product,
    version: "jarvis-product-enrichment-v1.1",
    now: "2026-08-14T00:00:00.000Z",
    findings: [{
      field: "manufacturer",
      value: "Example GmbH",
      confidence: 0.97,
      sourceType: "manufacturer",
      sourceUrl: "https://manufacturer.test/",
      evidence: "Official manufacturer page",
      status: "pending_review",
      complianceSensitive: true,
    }],
  });
  assert.equal(patch.enrichment.fields.material.value, "ABS");
  assert.equal(patch.enrichment.fields.color.value, "Schwarz");
  assert.equal(patch.enrichment.fields.manufacturer.status, "pending_review");
});

test("OpenRouter adapter forwards server tools, citations and usage.cost", async () => {
  let request = null;
  const fetchImpl = async (_url, init) => {
    request = JSON.parse(init.body);
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
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        cost: 0.00123,
        server_tool_use: { web_search_requests: 2 },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await researchWithOpenRouter({
    env: { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "openrouter/free" },
    product: { articleNumber: "ELY-000123", title: "Testprodukt", supplier: { url: "https://supplier.test/item/123" } },
    rawProduct: {},
    fields: ["material"],
    fetchImpl,
  });

  assert.equal(request.tools[0].type, "openrouter:web_search");
  assert.equal(request.tools[1].type, "openrouter:web_fetch");
  assert.equal(result.usage.webSearchRequests, 2);
  assert.equal(result.usage.amount, 0.00123);
  assert.equal(result.usage.unit, "openrouter_credits");
  assert.deepEqual(result.citations, ["https://manufacturer.test/product"]);
});
