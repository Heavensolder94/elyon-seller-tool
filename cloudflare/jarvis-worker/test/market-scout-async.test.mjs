import assert from "node:assert/strict";
import test from "node:test";

import worker, { MarketScoutHandler } from "../src/index.js";
import { researchMarketScout } from "../src/market-scout-research.js";

function openRouterResponse(candidates, cost = 0.001) {
  return Response.json({
    choices: [{
      message: {
        content: JSON.stringify({ summary: "Research complete", warnings: [], candidates }),
        annotations: [],
      },
    }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
      cost,
      server_tool_use: { web_search_requests: 1 },
    },
  });
}

function invalidOpenRouterResponse(content = "not valid json") {
  return Response.json({
    choices: [{ message: { content, annotations: [] } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      cost: 0.0005,
      server_tool_use: { web_search_requests: 1 },
    },
  });
}

function candidate(name, index, patch = {}) {
  return {
    productName: name,
    category: "Haushalt",
    rationale: "Evergreen use case",
    demandSignal: "multiple current market results",
    competitionLevel: "medium",
    purchasePrice: 10 + index,
    sellingPrice: 30 + index,
    supplierSource: "Supplier",
    supplierUrl: `https://supplier.example.test/${index}`,
    supplierRegion: "EU",
    dropshippingSupported: true,
    supplierShipsPerOrder: true,
    minimumOrderQuantity: 1,
    fulfillmentEvidence: "Supplier explicitly offers single-order dropshipping fulfillment with MOQ 1.",
    riskLevel: "low",
    risks: [],
    evidence: [{ url: `https://market.example.test/${index}`, label: "market evidence", type: "market" }],
    ...patch,
  };
}

test("async Market Scout splits larger research into bounded batches and returns verified dropshipping candidates", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const requests = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    const request = JSON.parse(options.body);
    requests.push(request);
    const prompt = request.messages?.[0]?.content || "";
    const count = Number(prompt.match(/Find exactly (\d+)/i)?.[1] || 1);
    const offset = (calls - 1) * 5;
    return openRouterResponse(Array.from({ length: count }, (_, index) => candidate(`Product ${offset + index + 1}`, offset + index + 1)));
  };

  try {
    const result = await researchMarketScout({
      env: { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "openrouter/free" },
      payload: {
        command: "Finde 10 neue Produkte",
        requestedCount: 10,
        profile: { sellingPriceMin: 20, sellingPriceMax: 80, targetMarginPercent: 30 },
      },
    });

    assert.equal(result.processed, true);
    assert.equal(result.handler, "market-scout-handler-v1");
    assert.equal(result.count, 10);
    assert.equal(result.status, "research_complete");
    assert.equal(calls, 2);
    assert.equal(result.safety.nothingMutated, true);
    assert.equal(result.safety.livePublishingAllowed, false);
    assert.equal(result.safety.supplierOrderingAllowed, false);
    assert.equal(result.candidates[0].marginBasis, "gross_before_marketplace_fees_and_returns");
    assert.equal(result.candidates[0].dropshippingSupported, true);
    assert.equal(result.candidates[0].supplierShipsPerOrder, true);
    assert.equal(result.candidates[0].minimumOrderQuantity, 1);
    assert.equal(result.cost.webSearchRequests, 2);

    for (const request of requests) {
      assert.equal(request.max_tool_calls, 3);
      assert.equal(request.tools.length, 1);
      assert.equal(request.tools[0].type, "openrouter:web_search");
      assert.equal(request.tools[0].parameters.engine, "exa");
      assert.equal(request.tools[0].parameters.mode, "fast");
      assert.equal(request.tools[0].parameters.max_uses, 3);
      assert.equal(request.tools[0].parameters.max_results, 4);
      assert.equal(request.tools[0].parameters.max_total_results, 10);
      assert.equal(request.tools[0].parameters.max_characters, 2000);
      assert.equal(request.response_format?.type, "json_schema");
      assert.equal(request.response_format?.json_schema?.strict, true);
      assert.equal(request.plugins?.[0]?.id, "response-healing");
      assert.equal(request.provider?.require_parameters, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout repairs malformed research JSON once without repeating web search", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options = {}) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    if (requests.length === 1) {
      return invalidOpenRouterResponse("Product opportunity found, but the response wrapper was malformed.");
    }
    return openRouterResponse([candidate("Repair Product", 1)]);
  };

  try {
    const result = await researchMarketScout({
      env: { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "openrouter/free" },
      payload: { command: "Finde ein Produkt", requestedCount: 1 },
    });

    assert.equal(result.count, 1);
    assert.equal(result.candidates[0].productName, "Repair Product");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].tools?.[0]?.type, "openrouter:web_search");
    assert.equal(requests[1].tools, undefined);
    assert.equal(requests[1].max_tool_calls, undefined);
    assert.equal(requests[1].response_format?.type, "json_schema");
    assert.equal(requests[1].plugins?.[0]?.id, "response-healing");
    assert.match(result.warnings.join(" "), /automatisch.*strukturiert/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout stops after one failed JSON repair instead of repeating the same research three times", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return invalidOpenRouterResponse("still not json");
  };

  try {
    await assert.rejects(
      () => researchMarketScout({
        env: { OPENROUTER_API_KEY: "test" },
        payload: { command: "Finde ein Produkt", requestedCount: 1 },
      }),
      (error) => error?.message === "openrouter_invalid_market_scout_json" && error?.retryable === false
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout rejects wholesale MOQ candidates that are not single-order dropshipping", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return openRouterResponse([candidate("Bulk Silicone Bag", 1, {
      dropshippingSupported: false,
      supplierShipsPerOrder: false,
      minimumOrderQuantity: 500,
      fulfillmentEvidence: "Wholesale MOQ is 500 units.",
    })]);
  };

  try {
    await assert.rejects(
      () => researchMarketScout({
        env: { OPENROUTER_API_KEY: "test" },
        payload: { command: "Finde ein Dropshipping-Produkt", requestedCount: 1 },
      }),
      (error) => error?.message === "market_scout_no_verified_candidates" && error?.retryable === false
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout preserves provider failure when every research batch fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: "provider unavailable" } }, { status: 503 });
  try {
    await assert.rejects(
      () => researchMarketScout({
        env: { OPENROUTER_API_KEY: "test" },
        payload: { command: "Finde 5 Produkte", requestedCount: 5 },
      }),
      /provider unavailable/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout marks daily free-model quota as non-retryable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" },
  }, { status: 429 });
  try {
    await assert.rejects(
      () => researchMarketScout({
        env: { OPENROUTER_API_KEY: "test" },
        payload: { command: "Finde ein Produkt", requestedCount: 1 },
      }),
      (error) => /free-models-per-day/.test(error?.message || "") && error?.retryable === false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout does not retry a successful research response with zero verified candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openRouterResponse([]);
  try {
    await assert.rejects(
      () => researchMarketScout({
        env: { OPENROUTER_API_KEY: "test" },
        payload: { command: "Finde ein Produkt", requestedCount: 1 },
      }),
      (error) => error?.message === "market_scout_no_verified_candidates" && error?.retryable === false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker MarketScoutHandler delegates queued payload to async research", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openRouterResponse([candidate("Queue Product", 1)]);
  try {
    const result = await MarketScoutHandler.handle(
      {
        type: "market-scout",
        payload: {
          command: "Finde ein risikoarmes Produkt",
          requestedCount: 1,
        },
      },
      { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "openrouter/free" }
    );

    assert.equal(MarketScoutHandler.agentName, "market-scout-handler-v1");
    assert.equal(result.handler, "market-scout-handler-v1");
    assert.equal(result.count, 1);
    assert.equal(result.candidates[0].productName, "Queue Product");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runtime health exposes market-scout as an available queue handler", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example.test/runtime/health"),
    { JARVIS_TASK_QUEUE: { send: async () => {} } }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.queue, "configured");
  assert.ok(body.taskHandlers.includes("runtime-test"));
  assert.ok(body.taskHandlers.includes("product-check"));
  assert.ok(body.taskHandlers.includes("market-scout"));
});
