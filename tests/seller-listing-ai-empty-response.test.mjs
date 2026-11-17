import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/seller-listing-ai.js";

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

const exampleResult = {
  title: "Example Product 500",
  shortDescription: "Simple product description",
  longDescription: "Only supplied factual details.",
  features: [{ title: "Color", text: "Blue" }],
  warnings: [],
};

async function exercise(responses, { authorization = "Bearer local-test-token" } = {}) {
  const origFetch = globalThis.fetch;
  const origSecret = process.env.ELYON_SELLER_ACCESS_TOKEN;
  const origDeepSeek = process.env.DEEPSEEK_API_KEY;
  const origOpenAi = process.env.OPENAI_API_KEY;
  const origFallback = process.env.AI_ALLOW_PROVIDER_FALLBACK;
  const calls = [];
  try {
    process.env.ELYON_SELLER_ACCESS_TOKEN = "local-test-token";
    process.env.DEEPSEEK_API_KEY = "local-test-api-key";
    delete process.env.OPENAI_API_KEY;
    process.env.AI_ALLOW_PROVIDER_FALLBACK = "false";
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      return {
        ok: response.status < 400,
        status: response.status,
        headers: { get: () => null },
        text: async () => JSON.stringify(response.body),
      };
    };
    const request = {
      method: "POST",
      headers: { host: "localhost:3000", authorization },
      body: {
        product: { title: "Example Product 500", brand: "Example", description: "Blue item" },
        draft: { title: "Example Product 500", description: "Blue item" },
        strength: 55,
      },
    };
    await handler(request, res);
    return calls;
  } finally {
    globalThis.fetch = origFetch;
    for (const [name, value] of [
      ["ELYON_SELLER_ACCESS_TOKEN", origSecret],
      ["DEEPSEEK_API_KEY", origDeepSeek],
      ["OPENAI_API_KEY", origOpenAi],
      ["AI_ALLOW_PROVIDER_FALLBACK", origFallback],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function ok(content, reason = "stop") {
  return { status: 200, body: { model: "deepseek-flash", choices: [{ finish_reason: reason, message: { content } }], usage: {} } };
}

test("recovers from DeepSeek JSON-mode whitespace by retrying once with plain-text JSON instructions", async () => {
  const res = responseMock();
  const calls = await exercise([ok("   "), ok(JSON.stringify(exampleResult))], res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.result.title, exampleResult.title);
  assert.equal(res.body.recovered, true);
  assert.equal(res.body.attempts, 2);
  assert.equal(calls.length, 2);
  const first = JSON.parse(calls[0].options.body);
  const second = JSON.parse(calls[1].options.body);
  assert.equal(first.model, "deepseek-flash");
  assert.equal(first.reasoning_effort, "none");
  assert.equal(first.response_format.type, "json_object");
  assert.equal(second.response_format.type, "text");
  assert.match(second.messages.at(-1).content, /JSON-Objekt/);
});

test("keeps original behavior when JSON content is complete", async () => {
  const res = responseMock();
  const calls = await exercise([ok(JSON.stringify(exampleResult))], res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recovered, false);
  assert.equal(res.body.attempts, 1);
  assert.equal(calls.length, 1);
});

test("rejects both empty responses safely without inventing product details", async () => {
  const res = responseMock();
  const calls = await exercise([ok("   "), ok(" ")], res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.reason, "empty_content");
  assert.equal(res.body.attempts, 2);
  assert.equal("result" in res.body, false);
  assert.equal(calls.length, 2);
});

test("retries malformed JSON once then accepts valid factual listing", async () => {
  const res = responseMock();
  const calls = await exercise([ok("{invalid"), ok(JSON.stringify(exampleResult))], res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recovered, true);
  assert.equal(calls.length, 2);
});

test("does not retry authentication or billing errors", async () => {
  const res = responseMock();
  const calls = await exercise([{ status: 402, body: { error: { message: "billing disabled" } } }], res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.attempts, 1);
  assert.equal(calls.length, 1);
});

test("does not call AI without a valid seller session", async () => {
  const res = responseMock();
  const calls = await exercise([ok(JSON.stringify(exampleResult))], { authorization: "" });
  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 0);
});
