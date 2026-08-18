import test from "node:test";
import assert from "node:assert/strict";

import handler, { publicMarketScoutTask } from "../api/jarvis-market-scout-task.js";

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function requestMock({ id = "11111111-1111-4111-8111-111111111111", token = "seller-test", method = "GET" } = {}) {
  return {
    method,
    query: { id },
    headers: {
      authorization: token ? `Bearer ${token}` : "",
      host: "elyonsellertool.vercel.app",
      "x-forwarded-proto": "https",
    },
  };
}

test("public Market Scout task omits request payload but keeps result and status", () => {
  const task = publicMarketScoutTask({
    id: "11111111-1111-4111-8111-111111111111",
    type: "market-scout",
    status: "completed",
    progress: 100,
    payload: { command: "secret-ish user command" },
    output: { count: 1 },
    attemptCount: 2,
    maxAttempts: 3,
  });
  assert.equal(task.status, "completed");
  assert.deepEqual(task.output, { count: 1 });
  assert.equal(task.attemptCount, 2);
  assert.equal("payload" in task, false);
});

test("Market Scout status endpoint requires seller authentication", async () => {
  const previousSecret = process.env.ELYON_SELLER_ACCESS_TOKEN;
  process.env.ELYON_SELLER_ACCESS_TOKEN = "seller-test";
  try {
    const res = responseMock();
    await handler(requestMock({ token: "" }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, "seller_access_denied");
  } finally {
    if (previousSecret === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previousSecret;
  }
});

test("Market Scout status endpoint proxies only market-scout task results", async () => {
  const previousSecret = process.env.ELYON_SELLER_ACCESS_TOKEN;
  const previousWorker = process.env.JARVIS_TASK_RUNTIME_URL;
  const originalFetch = globalThis.fetch;
  process.env.ELYON_SELLER_ACCESS_TOKEN = "seller-test";
  process.env.JARVIS_TASK_RUNTIME_URL = "https://worker.example.test";
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      ok: true,
      task: {
        id: "11111111-1111-4111-8111-111111111111",
        type: "market-scout",
        status: "completed",
        progress: 100,
        payload: { command: "Finde 1 Produkt" },
        output: { count: 1, candidates: [{ productName: "Test" }] },
        attemptCount: 1,
        maxAttempts: 3,
      },
    });
  };

  try {
    const res = responseMock();
    await handler(requestMock(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.task.type, "market-scout");
    assert.equal(res.body.task.output.count, 1);
    assert.equal("payload" in res.body.task, false);
    assert.equal(requestedUrl, "https://worker.example.test/tasks/11111111-1111-4111-8111-111111111111");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = previousSecret;
    if (previousWorker === undefined) delete process.env.JARVIS_TASK_RUNTIME_URL;
    else process.env.JARVIS_TASK_RUNTIME_URL = previousWorker;
  }
});
