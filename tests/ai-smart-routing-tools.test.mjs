import test from "node:test";
import assert from "node:assert/strict";

import { chooseDeepSeekModelForTask } from "../lib/ai-task-model-policy.js";
import { createReadonlyToolRuntime } from "../lib/ai-readonly-tools.js";
import { routeAIRequest } from "../lib/ai-provider-router.js";

function providerResponse({ content = "", toolCalls = [], model = "deepseek-v4-flash", finishReason = "stop", usage = {} } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    async text() {
      return JSON.stringify({
        model,
        choices: [{
          finish_reason: finishReason,
          message: {
            content,
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          },
        }],
        usage: {
          prompt_tokens: usage.prompt_tokens ?? 10,
          completion_tokens: usage.completion_tokens ?? 5,
          total_tokens: usage.total_tokens ?? 15,
        },
      });
    },
  };
}

async function withAiEnv(run) {
  const previous = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    DEEPSEEK_SMART_ROUTING: process.env.DEEPSEEK_SMART_ROUTING,
    AI_ALLOW_PROVIDER_FALLBACK: process.env.AI_ALLOW_PROVIDER_FALLBACK,
  };
  process.env.DEEPSEEK_API_KEY = "test-deepseek";
  process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
  delete process.env.DEEPSEEK_SMART_ROUTING;
  process.env.AI_ALLOW_PROVIDER_FALLBACK = "false";
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("DeepSeek task policy uses Flash for routine work and Pro for complex analysis", () => {
  assert.equal(chooseDeepSeekModelForTask("seller_listing_optimizer"), "deepseek-v4-flash");
  assert.equal(chooseDeepSeekModelForTask("product-search"), "deepseek-v4-flash");
  assert.equal(chooseDeepSeekModelForTask("compliance_gpsr_review"), "deepseek-v4-pro");
  assert.equal(chooseDeepSeekModelForTask("elyon-profit-analyst"), "deepseek-v4-pro");
  assert.equal(chooseDeepSeekModelForTask("custom-stock-review:custom-agent-task"), "deepseek-v4-pro");
});

test("Read-only tool runtime only exposes allowed scopes and calculates margin from context", async () => {
  const runtime = createReadonlyToolRuntime({
    contextAccess: { product: true, listing: false, market: false, orders: false, returns: false, tasks: false },
    input: {
      product: {
        purchasePrice: 10,
        shippingCost: 2,
        sellingPrice: 20,
        ebayFeePercent: 10,
        paymentFee: 1,
      },
      orders: [{ id: "must-not-be-readable" }],
    },
  });

  const names = runtime.tools.map((entry) => entry.function.name).sort();
  assert.deepEqual(names, ["calculate_margin", "get_product"]);
  assert.ok(names.every((name) => !/publish|price|order|message|refund|delete/i.test(name)));

  const margin = await runtime.execute("calculate_margin", "{}");
  assert.equal(margin.ok, true);
  assert.equal(margin.profit, 5);
  assert.equal(margin.marginPercent, 25);

  const blocked = await runtime.execute("get_orders", "{}");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "readonly_tool_not_allowed");
});

test("Provider router completes a DeepSeek tool-call round trip and preserves tool trace", async () => {
  await withAiEnv(async () => {
    const previousFetch = global.fetch;
    const requestBodies = [];
    let callCount = 0;
    global.fetch = async (_url, init = {}) => {
      requestBodies.push(JSON.parse(init.body || "{}"));
      callCount += 1;
      if (callCount === 1) {
        return providerResponse({
          model: "deepseek-v4-pro",
          finishReason: "tool_calls",
          toolCalls: [{
            id: "call_product_1",
            type: "function",
            function: { name: "get_product", arguments: "{}" },
          }],
        });
      }
      return providerResponse({ content: "Fertige Analyse", model: "deepseek-v4-pro" });
    };

    try {
      const runtime = createReadonlyToolRuntime({
        contextAccess: { product: true },
        input: { product: { title: "Testprodukt", sellingPrice: 19.99 } },
      });
      const result = await routeAIRequest({
        provider: "deepseek",
        task: "custom-stock-review:custom-agent-task",
        prompt: "Prüfe das Produkt.",
        tools: runtime.tools,
        toolExecutor: runtime.execute,
        allowFallback: false,
      });

      assert.equal(result.ok, true);
      assert.equal(result.model, "deepseek-v4-pro");
      assert.equal(result.content, "Fertige Analyse");
      assert.equal(result.toolTrace.length, 1);
      assert.equal(result.toolTrace[0].tool, "get_product");
      assert.equal(requestBodies.length, 2);
      assert.equal(requestBodies[0].model, "deepseek-v4-pro");
      assert.equal(requestBodies[1].messages.at(-1).role, "tool");
      assert.equal(requestBodies[1].messages.at(-1).tool_call_id, "call_product_1");
      assert.equal(result.usage.totalTokens, 30);
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("Explicit DeepSeek model selection overrides smart task routing", async () => {
  await withAiEnv(async () => {
    const previousFetch = global.fetch;
    let body = null;
    global.fetch = async (_url, init = {}) => {
      body = JSON.parse(init.body || "{}");
      return providerResponse({ content: "ok", model: "deepseek-v4-flash" });
    };

    try {
      const result = await routeAIRequest({
        provider: "deepseek",
        model: "deepseek-v4-flash",
        task: "compliance_gpsr_review",
        prompt: "Prüfen",
        allowFallback: false,
      });
      assert.equal(result.ok, true);
      assert.equal(body.model, "deepseek-v4-flash");
    } finally {
      global.fetch = previousFetch;
    }
  });
});
