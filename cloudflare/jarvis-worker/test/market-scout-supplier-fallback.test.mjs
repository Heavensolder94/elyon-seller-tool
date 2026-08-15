import assert from "node:assert/strict";
import test from "node:test";

import { MarketScoutHandler } from "../src/index-market-scout-v2.js";

function response(candidates) {
  return Response.json({
    choices: [{
      message: {
        content: JSON.stringify({ summary: "Research complete", warnings: [], candidates }),
        annotations: [],
      },
    }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 100,
      total_tokens: 200,
      cost: 0.001,
      server_tool_use: { web_search_requests: 1 },
    },
  });
}

function candidate(name, patch = {}) {
  return {
    productName: name,
    category: "Haushalt",
    rationale: "Evergreen use case",
    demandSignal: "Current independent market evidence",
    competitionLevel: "medium",
    purchasePrice: 10,
    sellingPrice: 30,
    supplierSource: "Verified Dropshipping Supplier",
    supplierUrl: "https://supplier.example.test/product",
    supplierRegion: "EU",
    dropshippingSupported: true,
    supplierShipsPerOrder: true,
    minimumOrderQuantity: 1,
    fulfillmentEvidence: "Supplier explicitly supports single-order dropshipping fulfillment with MOQ 1 to EU customers.",
    riskLevel: "low",
    risks: [],
    evidence: [{ url: "https://market.example.test/product", label: "market evidence", type: "market" }],
    ...patch,
  };
}

const rejectedWholesaleCandidate = () => candidate("Bulk-only Product", {
  dropshippingSupported: false,
  supplierShipsPerOrder: false,
  minimumOrderQuantity: 100,
  fulfillmentEvidence: "Wholesale only; MOQ 100.",
});

test("Market Scout automatically switches to supplier-first research after zero verified primary candidates", async () => {
  const originalFetch = globalThis.fetch;
  const prompts = [];
  let calls = 0;

  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    const request = JSON.parse(options.body);
    const prompt = request.messages?.[0]?.content || "";
    prompts.push(prompt);

    if (/SUPPLIER-FIRST FALLBACK/i.test(prompt)) {
      return response([candidate("Supplier-first Product")]);
    }
    return response([rejectedWholesaleCandidate()]);
  };

  try {
    const result = await MarketScoutHandler.handle({
      type: "market-scout",
      payload: {
        command: "Finde 1 neues risikoarmes Evergreen-Produkt für eBay Dropshipping.",
        requestedCount: 1,
        profile: { sellingPriceMin: 20, sellingPriceMax: 80, targetMarginPercent: 30 },
      },
    }, { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "openrouter/free" });

    assert.equal(calls, 3);
    assert.equal(result.count, 1);
    assert.equal(result.candidates[0].productName, "Supplier-first Product");
    assert.equal(result.researchStrategy, "supplier_first_fallback");
    assert.equal(result.fallback.triggered, true);
    assert.equal(result.fallback.reason, "market_scout_no_verified_candidates");
    assert.match(prompts[2], /First identify current suppliers or dropshipping platforms/i);
    assert.match(prompts[2], /MOQ 1/i);
    assert.match(result.warnings.join(" "), /Supplier-first-Nachrecherche/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Market Scout still fails safely when primary and supplier-first research both yield no verified candidates", async () => {
  const originalFetch = globalThis.fetch;
  const prompts = [];

  globalThis.fetch = async (_url, options = {}) => {
    const request = JSON.parse(options.body);
    prompts.push(request.messages?.[0]?.content || "");
    return response([rejectedWholesaleCandidate()]);
  };

  try {
    await assert.rejects(
      () => MarketScoutHandler.handle({
        type: "market-scout",
        payload: { command: "Finde ein Dropshipping-Produkt", requestedCount: 1 },
      }, { OPENROUTER_API_KEY: "test" }),
      (error) => error?.message === "market_scout_no_verified_candidates"
        && error?.retryable === false
        && error?.fallbackAttempted === true
    );

    assert.equal(prompts.length, 4);
    assert.equal(prompts.filter((prompt) => /SUPPLIER-FIRST FALLBACK/i.test(prompt)).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Market Scout does not mask provider failures with the supplier-first fallback", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ error: { message: "provider unavailable" } }, { status: 503 });
  };

  try {
    await assert.rejects(
      () => MarketScoutHandler.handle({
        type: "market-scout",
        payload: { command: "Finde ein Produkt", requestedCount: 1 },
      }, { OPENROUTER_API_KEY: "test" }),
      /provider unavailable/
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
