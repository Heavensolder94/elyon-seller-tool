import assert from "node:assert/strict";
import test from "node:test";

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

function candidate(name, index) {
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
    riskLevel: "low",
    risks: [],
    evidence: [{ url: `https://market.example.test/${index}`, label: "market evidence", type: "market" }],
  };
}

test("async Market Scout splits larger research into bounded batches and returns verified candidates", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    const request = JSON.parse(options.body);
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
    assert.equal(result.candidates[0].marginBasis, "gross_before_marketplace_fees_and_returns");
    assert.equal(result.cost.webSearchRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async Market Scout does not invent candidates when all research batches fail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: "provider unavailable" } }, { status: 503 });
  try {
    await assert.rejects(
      () => researchMarketScout({
        env: { OPENROUTER_API_KEY: "test" },
        payload: { command: "Finde 5 Produkte", requestedCount: 5 },
      }),
      /market_scout_no_verified_candidates/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
