import test from "node:test";
import assert from "node:assert/strict";
import { isMarketScoutCommand, parseConstraints, runMarketScout, WEB_SEARCH_TOOLS } from "../lib/jarvis-market-scout.js";

test("market scout parses requested count and category", () => {
  const parsed = parseConstraints("Suche mir 20 risikoarme Produktideen im Bereich Haushalt");
  assert.equal(parsed.requestedCount, 20);
  assert.equal(parsed.category, "Haushalt");
});

test("market scout is preferred even when margin is mentioned", () => {
  assert.equal(isMarketScoutCommand("Suche 20 Produktideen mit Marge und wenig Wettbewerb", { intent: { id: "product_discovery" } }), true);
});

test("market scout sends web search and normalizes structured candidates", async () => {
  let request;
  const result = await runMarketScout({
    command: "Suche 2 Produktideen im Bereich Haushalt",
    route: async (options) => {
      request = options;
      return { ok: true, provider: "openrouter", model: "openrouter/free", content: JSON.stringify({ summary: "Recherche", warnings: [], candidates: [{ productName: "Test Organizer", supplierUrl: "https://example.com/source", purchasePrice: 5, sellingPrice: 12, estimatedMarginPercent: 58 }] }) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.candidates[0].status, "research_only");
  assert.deepEqual(request.tools, WEB_SEARCH_TOOLS);
  assert.equal(request.allowFallback, false);
});

test("market scout never fabricates a result when provider is unavailable", async () => {
  const result = await runMarketScout({ command: "Suche Produktideen", route: async () => ({ ok: false }) });
  assert.equal(result.ok, false);
  assert.equal(result.mode, "market_scout_degraded");
  assert.equal(result.candidates, undefined);
});

test("market scout rejects malformed model output safely", async () => {
  const result = await runMarketScout({ command: "Suche Produktideen", route: async () => ({ ok: true, content: "keine liste" }) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "market_scout_invalid_response");
});
