import assert from "node:assert/strict";
import test from "node:test";
import { processEnrichmentMessageV2 } from "../cloudflare/jarvis-worker/src/enrichment-task-runtime-v2.js";

test("enrichment runtime stores output cost in jarvis_agent_runs", async () => {
  const originalFetch = globalThis.fetch;
  const patches = [];
  const row = {
    id: "task-1", type: "product-enrichment", status: "queued",
    payload: { productId: "ELY-000123" }, output: null, progress: 0, error: null,
    created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    started_at: null, finished_at: null, attempt_count: 0, max_attempts: 3,
    idempotency_key: "product-enrichment:task-1:v1", last_error: null,
  };

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    if (href === "https://redis.test") {
      return new Response(JSON.stringify({ result: Array.isArray(body) && body[0] === "GET" ? null : "OK" }), { status: 200 });
    }
    if (href.includes("jarvis_tasks?id=eq.task-1&select=*")) return new Response(JSON.stringify([row]), { status: 200 });
    if (href.includes("jarvis_tasks?idempotency_key=")) return new Response(JSON.stringify([]), { status: 200 });
    if (href.includes("jarvis_agent_runs?id=eq.") && init.method === "PATCH") {
      patches.push(body);
      return new Response(null, { status: 204 });
    }
    if (href.includes("jarvis_agent_runs") && init.method === "POST") return new Response(null, { status: 204 });
    if (href.includes("jarvis_tasks?id=eq.task-1") && init.method === "PATCH") return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${href}`);
  };

  let acked = false;
  try {
    const result = await processEnrichmentMessageV2(
      { body: { taskId: "task-1", type: "product-enrichment" }, ack() { acked = true; }, retry() {} },
      {
        UPSTASH_REDIS_REST_URL: "https://redis.test",
        UPSTASH_REDIS_REST_TOKEN: "redis-test-token",
        SUPABASE_URL: "https://supabase.test",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      },
      async () => ({ processed: true, cost: { model: "openrouter/free", amount: 0.0042, unit: "openrouter_credits" } })
    );
    assert.equal(result.ok, true);
    assert.equal(acked, true);
    assert.equal(patches[0].cost, 0.0042);
    assert.equal(patches[0].model, "openrouter/free");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
