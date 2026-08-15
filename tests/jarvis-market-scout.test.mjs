import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MARKET_SCOUT_PROFILE,
  DEFAULT_STATUS_API_URL,
  isMarketScoutCommand,
  parseConstraints,
  runMarketScout,
} from "../lib/jarvis-market-scout.js";

function workerResponse(task = {}) {
  return {
    ok: true,
    status: 201,
    async json() {
      return {
        ok: true,
        task: {
          id: task.id || "11111111-1111-4111-8111-111111111111",
          type: "market-scout",
          status: "queued",
          progress: 0,
        },
      };
    },
  };
}

test("market scout parses requested count and category", () => {
  const parsed = parseConstraints("Suche mir 20 risikoarme Produktideen im Bereich Haushalt");
  assert.equal(parsed.requestedCount, 20);
  assert.equal(parsed.category, "Haushalt");
});

test("market scout applies useful defaults instead of requiring follow-up questions", () => {
  const parsed = parseConstraints("Finde 10 neue Produkte");
  assert.equal(parsed.requestedCount, 10);
  assert.equal(parsed.profile.sellingPriceMin, DEFAULT_MARKET_SCOUT_PROFILE.sellingPriceMin);
  assert.equal(parsed.profile.sellingPriceMax, DEFAULT_MARKET_SCOUT_PROFILE.sellingPriceMax);
  assert.equal(parsed.profile.targetMarginPercent, 30);
  assert.equal(parsed.profile.riskTolerance, "low-medium");
  assert.equal(parsed.profile.seasonality, "evergreen");
  assert.equal(parsed.assumptionsUsed.sellingPrice, true);
  assert.equal(parsed.assumptionsUsed.targetMargin, true);
});

test("market scout preserves explicit price and margin constraints", () => {
  const parsed = parseConstraints("Finde 8 Produkte, VK 35-95 €, Marge mindestens 40 %");
  assert.equal(parsed.requestedCount, 8);
  assert.equal(parsed.profile.sellingPriceMin, 35);
  assert.equal(parsed.profile.sellingPriceMax, 95);
  assert.equal(parsed.profile.targetMarginPercent, 40);
  assert.equal(parsed.assumptionsUsed.sellingPrice, false);
  assert.equal(parsed.assumptionsUsed.targetMargin, false);
});

test("market scout is preferred even when margin is mentioned", () => {
  assert.equal(isMarketScoutCommand("Suche 20 Produktideen mit Marge und wenig Wettbewerb", { intent: { id: "product_discovery" } }), true);
});

test("market scout enqueues a browser-independent read-only task", async () => {
  let url = "";
  let request = null;
  const result = await runMarketScout({
    command: "Finde 10 neue Produkte",
    workerUrl: "https://worker.example.test",
    fetchImpl: async (nextUrl, options) => {
      url = nextUrl;
      request = options;
      return workerResponse();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "market_scout_queued");
  assert.equal(result.status, "queued");
  assert.equal(result.safety.browserIndependent, true);
  assert.match(result.summary, /20–80 € VK/i);
  assert.equal(result.task.statusUrl, `${DEFAULT_STATUS_API_URL}?id=11111111-1111-4111-8111-111111111111`);
  assert.equal(url, "https://worker.example.test/tasks");

  const payload = JSON.parse(request.body);
  assert.equal(payload.type, "market-scout");
  assert.equal(payload.payload.requestedCount, 10);
  assert.equal(payload.payload.profile.targetMarginPercent, 30);
  assert.equal(payload.payload.source, "seller_tool_jarvis");
  assert.equal("statusToken" in payload.payload, false);
});

test("market scout never fabricates candidates when queue rejects the task", async () => {
  const result = await runMarketScout({
    command: "Suche Produktideen",
    workerUrl: "https://worker.example.test",
    fetchImpl: async () => ({ ok: false, status: 503, async json() { return { ok: false, error: "queue_not_configured" }; } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.mode, "market_scout_degraded");
  assert.equal(result.reason, "market_scout_queue_rejected");
  assert.equal(result.candidates, undefined);
});
