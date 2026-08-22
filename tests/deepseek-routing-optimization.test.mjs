import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import aiHandler from "../api/ai.js";
import agentEngineHandler from "../api/agent-engine.js";
import { getAgentRoutingPreference } from "../lib/ai-agent-routing-preferences.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function captureResponse() {
  const capture = { statusCode: 200, payload: null };
  return {
    capture,
    res: {
      status(code) {
        capture.statusCode = code;
        return this;
      },
      json(payload) {
        capture.payload = payload;
        return this;
      },
      setHeader() {
        return this;
      },
      end() {
        return this;
      },
    },
  };
}

function providerResponse(content, { status = 200, model = "mock-model" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return JSON.stringify({
        model,
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    },
  };
}

function openAiVisionResponse(content, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify({ output_text: content });
    },
  };
}

async function withAiEnv(run) {
  const previous = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    AI_FALLBACK_PROVIDER: process.env.AI_FALLBACK_PROVIDER,
    AI_ALLOW_PROVIDER_FALLBACK: process.env.AI_ALLOW_PROVIDER_FALLBACK,
  };
  process.env.DEEPSEEK_API_KEY = "test-deepseek";
  process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  delete process.env.AI_FALLBACK_PROVIDER;
  delete process.env.AI_ALLOW_PROVIDER_FALLBACK;
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Seller product search is DeepSeek-first and keeps structured response metadata", async () => {
  await withAiEnv(async () => {
    const previousFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), body: JSON.parse(init.body || "{}") });
      return providerResponse(JSON.stringify({
        query: "kleiderbuegel",
        recommendedQuery: "kleiderbügel anti rutsch",
        queryExpansion: ["kleiderbügel weiß"],
        searchAngles: ["platzsparend"],
        titleIdeas: ["19er Set Kleiderbügel Weiß Anti-Rutsch"],
        riskWarnings: [],
        score: { searchPotential: 75, competition: 40, risk: 20, total: 65 },
      }), { model: "deepseek-v4-flash" });
    };

    try {
      const { capture, res } = captureResponse();
      await aiHandler({ method: "POST", query: {}, body: { task: "product-search", query: "Kleiderbügel" } }, res);
      assert.equal(capture.statusCode, 200);
      assert.equal(capture.payload.ok, true);
      assert.equal(capture.payload.provider, "deepseek");
      assert.equal(capture.payload.model, "deepseek-v4-flash");
      assert.equal(capture.payload.fallbackUsed, false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
      assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("Malformed DeepSeek structured output retries once with OpenAI", async () => {
  await withAiEnv(async () => {
    const previousFetch = global.fetch;
    const urls = [];
    global.fetch = async (url) => {
      const value = String(url);
      urls.push(value);
      if (value.includes("api.deepseek.com")) return providerResponse("kein json", { model: "deepseek-v4-flash" });
      if (value.includes("api.openai.com")) {
        return providerResponse(JSON.stringify({
          title: "19er Set Kleiderbügel Weiß Anti-Rutsch",
          subtitle: "",
          bulletPoints: ["Rutschhemmende Oberfläche"],
          description: "Beschreibung",
          seoKeywords: ["kleiderbügel"],
          riskWarnings: [],
          score: { title: 90, seo: 80, description: 85, risk: 90, total: 86 },
        }), { model: "gpt-4o-mini" });
      }
      throw new Error(`Unexpected URL ${value}`);
    };

    try {
      const { capture, res } = captureResponse();
      await aiHandler({
        method: "POST",
        query: {},
        body: { task: "listing-optimizer", product: { productName: "Kleiderbügel", features: "Anti-Rutsch" } },
      }, res);
      assert.equal(capture.statusCode, 200);
      assert.equal(capture.payload.provider, "openai");
      assert.equal(capture.payload.fallbackUsed, true);
      assert.deepEqual(urls, [
        "https://api.deepseek.com/chat/completions",
        "https://api.openai.com/v1/chat/completions",
      ]);
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("General Seller text tasks use DeepSeek first", async () => {
  await withAiEnv(async () => {
    const previousFetch = global.fetch;
    const urls = [];
    global.fetch = async (url) => {
      urls.push(String(url));
      return providerResponse("Kurze Elyon Antwort", { model: "deepseek-v4-flash" });
    };

    try {
      const { capture, res } = captureResponse();
      await aiHandler({ method: "POST", query: {}, body: { task: "assistant", prompt: "Was ist offen?" } }, res);
      assert.equal(capture.statusCode, 200);
      assert.equal(capture.payload.provider, "deepseek");
      assert.equal(capture.payload.result, "Kurze Elyon Antwort");
      assert.deepEqual(urls, ["https://api.deepseek.com/chat/completions"]);
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("Mobile text uses DeepSeek but image analysis remains on OpenAI Vision", async () => {
  await withAiEnv(async () => {
    const previousFetch = global.fetch;
    const urls = [];
    global.fetch = async (url) => {
      const value = String(url);
      urls.push(value);
      if (value.includes("api.deepseek.com")) return providerResponse("Mobile Antwort", { model: "deepseek-v4-flash" });
      if (value === "https://api.openai.com/v1/responses") {
        return openAiVisionResponse(JSON.stringify({ productName: "Produkt", recommendation: "prüfen" }));
      }
      throw new Error(`Unexpected URL ${value}`);
    };

    try {
      const textCapture = captureResponse();
      await agentEngineHandler({ method: "POST", query: { action: "ai-workflow" }, body: { prompt: "Status?" } }, textCapture.res);
      assert.equal(textCapture.capture.payload.ok, true);
      assert.equal(textCapture.capture.payload.provider, "deepseek");

      const visionCapture = captureResponse();
      await agentEngineHandler({
        method: "POST",
        query: { action: "ai-workflow" },
        body: { action: "product-vision", image: "data:image/jpeg;base64,abc", barcode: "123" },
      }, visionCapture.res);
      assert.equal(visionCapture.capture.payload.ok, true);
      assert.equal(visionCapture.capture.payload.mode, "ai-vision");
      assert.deepEqual(urls, [
        "https://api.deepseek.com/chat/completions",
        "https://api.openai.com/v1/responses",
      ]);
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("Profit Analyst defaults to DeepSeek without overriding an explicit user route", () => {
  assert.equal(getAgentRoutingPreference({ headers: {} }, "elyon-profit-analyst").provider, "deepseek");

  const cookie = encodeURIComponent(JSON.stringify({
    agents: {
      "elyon-profit-analyst": { provider: "openai", model: "gpt-4o-mini", allowFallback: false },
    },
  }));
  const explicit = getAgentRoutingPreference({
    headers: { cookie: `elyon_ai_routing_v1=${cookie}` },
  }, "elyon-profit-analyst");
  assert.equal(explicit.provider, "openai");
  assert.equal(explicit.model, "gpt-4o-mini");
  assert.equal(explicit.allowFallback, false);
});

test("Agent engine keeps separate workflow storage key and OpenAI Vision model", () => {
  const source = fs.readFileSync(path.join(root, "api/agent-engine.js"), "utf8");
  assert.match(source, /AI_WORKFLOW_STORE_KEY/);
  assert.match(source, /set\/\$\{encodeURIComponent\(AI_WORKFLOW_STORE_KEY\)\}/);
  assert.match(source, /OPENAI_VISION_MODEL/);
  assert.match(source, /provider:\s*"deepseek"/);
});
