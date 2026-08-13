import assert from "node:assert/strict";
import test from "node:test";

import worker, { processQueueMessage } from "../src/index.js";

const baseEnv = {
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-role"
};

const makeRequest = (path, init = {}) => new Request(`https://worker.example.test${path}`, init);

const dbRowFromTask = (task) => ({
  id: task.id,
  type: task.type,
  status: task.status,
  payload: task.payload ?? {},
  output: task.output ?? null,
  progress: Number(task.progress ?? 0),
  error: task.error ?? null,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
  started_at: task.startedAt ?? null,
  finished_at: task.finishedAt ?? null,
  attempt_count: Number(task.attemptCount ?? 0),
  max_attempts: Number(task.maxAttempts ?? 3),
  idempotency_key: task.idempotencyKey ?? null,
  last_error: task.lastError ?? null
});

const taskFromDb = (row) => ({
  id: row.id,
  type: row.type,
  payload: row.payload ?? {},
  output: row.output ?? null,
  status: row.status,
  progress: Number(row.progress ?? 0),
  error: row.error ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at ?? null,
  finishedAt: row.finished_at ?? null,
  attemptCount: Number(row.attempt_count ?? 0),
  maxAttempts: Number(row.max_attempts ?? 3),
  idempotencyKey: row.idempotency_key ?? null,
  lastError: row.last_error ?? null
});

const makeQueue = ({ fail = false } = {}) => {
  const messages = [];
  return {
    messages,
    binding: {
      async send(body) {
        if (fail) throw new Error("queue_down");
        messages.push(body);
      }
    }
  };
};

const makeMessage = (body) => ({
  body,
  acked: false,
  retries: [],
  ack() {
    this.acked = true;
  },
  retry(options) {
    this.retries.push(options || {});
  }
});

const createMockFetch = ({ failSupabase = false, failRedis = false } = {}) => {
  const redis = new Map();
  const supabaseTasks = new Map();
  const agentRuns = new Map();
  const taskPatchHistory = [];
  const calls = [];

  const mockFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });

    if (String(url).startsWith(baseEnv.UPSTASH_REDIS_REST_URL)) {
      if (failRedis) {
        return Response.json({}, { status: 503 });
      }

      const command = JSON.parse(init.body);
      const [name, ...args] = command;

      if (name === "PING") return Response.json({ result: "PONG" });

      if (name === "SET") {
        redis.set(args[0], args[1]);
        return Response.json({ result: "OK" });
      }

      if (name === "GET") {
        return Response.json({ result: redis.get(args[0]) ?? null });
      }

      return Response.json({ error: "unsupported_redis_command" }, { status: 400 });
    }

    if (String(url).startsWith(baseEnv.SUPABASE_URL)) {
      if (failSupabase) {
        return Response.json({ error: "database unavailable" }, { status: 503 });
      }

      const parsed = new URL(String(url));
      assert.equal(init.headers.apikey, baseEnv.SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(init.headers.Authorization, `Bearer ${baseEnv.SUPABASE_SERVICE_ROLE_KEY}`);

      if (parsed.pathname === "/rest/v1/jarvis_tasks") {
        if (init.method === "POST") {
          const row = JSON.parse(init.body);
          supabaseTasks.set(row.id, row);
          return new Response(null, { status: 201 });
        }

        if (init.method === "PATCH") {
          const id = parsed.searchParams.get("id")?.slice(3);
          const patch = JSON.parse(init.body);
          const previous = supabaseTasks.get(id) || { id };
          const next = { ...previous, ...patch };
          supabaseTasks.set(id, next);
          taskPatchHistory.push({ id, patch: next });
          return new Response(null, { status: 204 });
        }

        if (init.method === "GET") {
          const idFilter = parsed.searchParams.get("id");
          if (idFilter?.startsWith("eq.")) {
            const row = supabaseTasks.get(idFilter.slice(3));
            return Response.json(row ? [row] : []);
          }

          const keyFilter = parsed.searchParams.get("idempotency_key");
          const statusFilter = parsed.searchParams.get("status");
          if (keyFilter?.startsWith("eq.") && statusFilter === "eq.completed") {
            const key = keyFilter.slice(3);
            const rows = [...supabaseTasks.values()]
              .filter((row) => row.idempotency_key === key && row.status === "completed")
              .sort((a, b) => String(b.finished_at || "").localeCompare(String(a.finished_at || "")))
              .slice(0, 1)
              .map((row) => ({ id: row.id, output: row.output ?? null, finished_at: row.finished_at ?? null }));
            return Response.json(rows);
          }

          return Response.json([]);
        }
      }

      if (parsed.pathname === "/rest/v1/jarvis_agent_runs") {
        if (init.method === "POST") {
          const row = JSON.parse(init.body);
          agentRuns.set(row.id, row);
          return new Response(null, { status: 201 });
        }

        if (init.method === "PATCH") {
          const id = parsed.searchParams.get("id")?.slice(3);
          const patch = JSON.parse(init.body);
          const previous = agentRuns.get(id) || { id };
          agentRuns.set(id, { ...previous, ...patch });
          return new Response(null, { status: 204 });
        }
      }
    }

    return Response.json({ error: "unexpected_url" }, { status: 500 });
  };

  return { mockFetch, redis, supabaseTasks, agentRuns, taskPatchHistory, calls };
};

const withMockFetch = async (mockFetch, callback) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const withMutedConsoleError = async (callback) => {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = originalError;
  }
};

const envWithQueue = (queue = makeQueue()) => ({
  ...baseEnv,
  JARVIS_TASK_QUEUE: queue.binding
});

const createTask = async ({ mockFetch, queue, type = "runtime-test", payload = {}, idempotencyKey } = {}) => {
  const response = await worker.fetch(makeRequest("/tasks", {
    method: "POST",
    body: JSON.stringify({
      type,
      payload,
      ...(idempotencyKey ? { idempotencyKey } : {})
    })
  }), envWithQueue(queue));

  return { response, body: await response.json() };
};

test("GET /health returns worker health", async () => {
  const response = await worker.fetch(makeRequest("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "elyon-jarvis-worker",
    version: "0.4.0"
  });
});

test("GET /redis/health checks Upstash", async () => {
  const { mockFetch } = createMockFetch();

  await withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/redis/health"), baseEnv);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "upstash-redis",
      result: "PONG"
    });
  });
});

test("GET /supabase/health checks Supabase without exposing secrets", async () => {
  const { mockFetch } = createMockFetch();

  await withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/supabase/health"), baseEnv);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, {
      ok: true,
      service: "supabase",
      status: "connected"
    });
    assert.doesNotMatch(JSON.stringify(body), /service-role|redis-token/);
  });
});

test("GET /runtime/health reports queue configuration", async () => {
  const queue = makeQueue();
  const response = await worker.fetch(makeRequest("/runtime/health"), envWithQueue(queue));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "jarvis-task-runtime",
    queue: "configured",
    maxAttempts: 3
  });
});

test("POST /tasks writes to Upstash, Supabase and publishes a minimal Queue message", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const { response, body } = await createTask({ mockFetch: mock.mockFetch, queue, payload: { productId: "test-001" } });

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.task.status, "queued");
    assert.equal(body.task.attemptCount, 0);
    assert.equal(body.task.maxAttempts, 3);
    assert.match(body.task.idempotencyKey, /^runtime-test:/);

    const rawRedisTask = mock.redis.get(`jarvis:task:${body.task.id}`);
    assert.ok(rawRedisTask);
    assert.deepEqual(JSON.parse(rawRedisTask), body.task);
    assert.deepEqual(mock.supabaseTasks.get(body.task.id), dbRowFromTask(body.task));
    assert.deepEqual(queue.messages, [{ taskId: body.task.id, type: "runtime-test" }]);
  });
});

test("GET /tasks/:id reads from Upstash first and falls back to Supabase", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({ mockFetch: mock.mockFetch, queue });
    const redisResponse = await worker.fetch(makeRequest(`/tasks/${body.task.id}`), envWithQueue(queue));
    assert.equal(redisResponse.status, 200);
    assert.deepEqual(await redisResponse.json(), { ok: true, task: body.task });

    mock.redis.delete(`jarvis:task:${body.task.id}`);
    const fallbackResponse = await worker.fetch(makeRequest(`/tasks/${body.task.id}`), envWithQueue(queue));
    assert.equal(fallbackResponse.status, 200);
    assert.equal((await fallbackResponse.json()).task.source, "supabase");
  });
});

test("Queue consumer runs runtime-test queued to running to completed and logs an agent run", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({ mockFetch: mock.mockFetch, queue });
    const message = makeMessage(queue.messages[0]);

    await worker.queue({ messages: [message] }, envWithQueue(queue));
    assert.equal(message.acked, true);
    assert.equal(message.retries.length, 0);

    const row = mock.supabaseTasks.get(body.task.id);
    assert.equal(row.status, "completed");
    assert.equal(row.progress, 100);
    assert.equal(row.attempt_count, 1);
    assert.equal(row.output.processed, true);
    assert.equal(row.output.handler, "runtime-test");

    const statuses = mock.taskPatchHistory.filter((entry) => entry.id === body.task.id).map((entry) => entry.patch.status);
    assert.deepEqual(statuses, ["running", "completed"]);

    const runs = [...mock.agentRuns.values()];
    assert.equal(runs.length, 1);
    assert.equal(runs[0].task_id, body.task.id);
    assert.equal(runs[0].agent_name, "runtime-test-handler");
    assert.equal(runs[0].status, "completed");
    assert.equal(runs[0].cost, 0);
    assert.equal(runs[0].model, null);

    const idempotencyRecord = JSON.parse(mock.redis.get(`jarvis:idempotency:${row.idempotency_key}`));
    assert.equal(idempotencyRecord.status, "completed");
  });
});

test("processQueueMessage can be invoked directly for a consumer message", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({ mockFetch: mock.mockFetch, queue });
    const message = makeMessage(queue.messages[0]);

    const result = await processQueueMessage(message, envWithQueue(queue));
    assert.deepEqual(result.action, "ack");
    assert.equal(mock.supabaseTasks.get(body.task.id).status, "completed");
  });
});

const validProduct = {
  id: "prod-001",
  sku: "ELY-000001",
  title: "LED Schreibtischlampe mit USB",
  description: "Dimmbarer LED Schreibtischlampen-Testdatensatz.",
  images: ["https://example.test/lamp.jpg"],
  supplierLink: "https://supplier.example.test/lamp",
  category: "Haushalt",
  variants: [{ sku: "ELY-000001-01", color: "schwarz" }],
  shippingInfo: "7-10 Werktage",
  buyPrice: 10,
  salePrice: 24.99,
  economics: {
    shippingCost: 2,
    marketplaceFeePercent: 10
  },
  manufacturer: {
    name: "Example Manufacturer GmbH",
    country: "DE"
  },
  responsiblePerson: {
    name: "Example EU Responsible GmbH",
    country: "DE"
  },
  compliance: {
    status: "approved"
  },
  listing: {
    categoryId: "123",
    itemSpecifics: { Marke: "Elyon" },
    conditionId: "1000"
  }
};

const lowMarginProduct = {
  ...validProduct,
  id: "prod-low-margin",
  sku: "ELY-000002",
  buyPrice: 10,
  salePrice: 11,
  economics: {
    shippingCost: 0,
    marketplaceFeePercent: 0
  }
};

const missingComplianceProduct = {
  ...validProduct,
  id: "prod-missing-compliance",
  sku: "ELY-000003",
  manufacturer: {},
  responsiblePerson: {},
  compliance: {},
  gpsr: {}
};

const seedProducts = (mock, products, key = "elyon_products") => {
  mock.redis.set(key, JSON.stringify(products));
};

test("product-check task is routed to ProductCheckHandler and completes with structured output", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();
  seedProducts(mock, [validProduct]);

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: { productId: "prod-001" }
    });

    assert.deepEqual(queue.messages, [{ taskId: body.task.id, type: "product-check" }]);

    const message = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message] }, envWithQueue(queue));

    assert.equal(message.acked, true);
    assert.equal(message.retries.length, 0);

    const row = mock.supabaseTasks.get(body.task.id);
    assert.equal(row.status, "completed");
    assert.equal(row.output.processed, true);
    assert.equal(row.output.handler, "product-check");
    assert.equal(row.output.productId, "prod-001");
    assert.equal(row.output.productSource, "seller_product_master");
    assert.equal(row.output.dataQuality.score, 100);
    assert.deepEqual(row.output.dataQuality.missingFields, []);
    assert.equal(row.output.economics.purchasePrice, 10);
    assert.equal(row.output.economics.sellingPrice, 24.99);
    assert.equal(row.output.economics.status, "pass");
    assert.equal(row.output.compliance.risk, "low");
    assert.equal(row.output.listingReadiness.status, "ready");
    assert.equal(row.output.recommendation.decision, "pass");
    assert.deepEqual(row.output.cost, { llmUsed: false, model: null, amount: 0 });

    const runs = [...mock.agentRuns.values()];
    assert.equal(runs.length, 1);
    assert.equal(runs[0].agent_name, "product-check-handler");
    assert.equal(runs[0].status, "completed");
    assert.equal(runs[0].input.payload.productId, "prod-001");
    assert.equal(runs[0].output.handler, "product-check");
    assert.equal(runs[0].model, null);
    assert.equal(runs[0].cost, 0);

    assert.equal(mock.calls.some((call) => /ebay|inventory|offer|supplier|company-os|nova/i.test(call.url)), false);
  });
});

test("product-check fails safely when productId is missing", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMutedConsoleError(() => withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: {}
    });

    const message = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message] }, envWithQueue(queue));

    const row = mock.supabaseTasks.get(body.task.id);
    assert.equal(message.acked, true);
    assert.equal(message.retries.length, 0);
    assert.equal(row.status, "failed");
    assert.equal(row.attempt_count, 1);
    assert.equal(row.error, "invalid_product_id");
    assert.equal([...mock.agentRuns.values()][0].status, "failed");
  }));
});

test("product-check fails safely when the Product Master record is not found", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();
  seedProducts(mock, [validProduct]);

  await withMutedConsoleError(() => withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: { productId: "missing-product" }
    });

    const message = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message] }, envWithQueue(queue));

    const row = mock.supabaseTasks.get(body.task.id);
    assert.equal(message.acked, true);
    assert.equal(message.retries.length, 0);
    assert.equal(row.status, "failed");
    assert.equal(row.attempt_count, 1);
    assert.equal(row.error, "product_not_found");
  }));
});

test("product-check reports low margin as review without inventing unavailable fees", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();
  seedProducts(mock, [lowMarginProduct]);

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: { productId: "prod-low-margin" }
    });

    await worker.queue({ messages: [makeMessage(queue.messages[0])] }, envWithQueue(queue));
    const output = mock.supabaseTasks.get(body.task.id).output;
    assert.equal(output.economics.absoluteMargin, 1);
    assert.equal(output.economics.marginPercent, 9.09);
    assert.equal(output.economics.status, "review");
    assert.ok(output.economics.reasons.includes("margin_below_threshold"));
    assert.equal(output.listingReadiness.status, "needs_review");
    assert.equal(output.recommendation.decision, "review");
  });
});

test("product-check flags missing compliance fields and listing readiness", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();
  seedProducts(mock, [missingComplianceProduct]);

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: { productId: "prod-missing-compliance" }
    });

    await worker.queue({ messages: [makeMessage(queue.messages[0])] }, envWithQueue(queue));
    const output = mock.supabaseTasks.get(body.task.id).output;
    assert.ok(output.dataQuality.score < 100);
    assert.ok(output.dataQuality.missingFields.includes("manufacturer"));
    assert.ok(output.dataQuality.missingFields.includes("euResponsiblePerson"));
    assert.ok(output.dataQuality.missingFields.includes("complianceData"));
    assert.equal(output.compliance.risk, "medium");
    assert.ok(output.compliance.missing.includes("manufacturer"));
    assert.ok(output.compliance.missing.includes("eu_responsible_person"));
    assert.ok(output.listingReadiness.reasons.includes("missing_compliance_data"));
    assert.equal(output.recommendation.decision, "review");
  });
});

test("product-check idempotency prevents duplicate execution", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();
  seedProducts(mock, [validProduct]);
  const key = "product-check:prod-001:v1";

  await withMockFetch(mock.mockFetch, async () => {
    const first = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: { productId: "prod-001" },
      idempotencyKey: key
    });
    await worker.queue({ messages: [makeMessage(queue.messages[0])] }, envWithQueue(queue));
    assert.equal(mock.supabaseTasks.get(first.body.task.id).status, "completed");
    assert.equal(mock.agentRuns.size, 1);

    const second = await createTask({
      mockFetch: mock.mockFetch,
      queue,
      type: "product-check",
      payload: { productId: "prod-001" },
      idempotencyKey: key
    });
    await worker.queue({ messages: [makeMessage(queue.messages[1])] }, envWithQueue(queue));

    assert.equal(mock.supabaseTasks.get(second.body.task.id).status, "completed");
    assert.equal(mock.agentRuns.size, 1);
  });
});

test("Retry attempt 1 and 2 stay queued, attempt 3 fails safely for unknown task types", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMutedConsoleError(() => withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({ mockFetch: mock.mockFetch, queue, type: "unknown-task" });
    const message1 = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message1] }, envWithQueue(queue));
    assert.equal(message1.acked, false);
    assert.equal(message1.retries.length, 1);
    assert.equal(mock.supabaseTasks.get(body.task.id).status, "queued");
    assert.equal(mock.supabaseTasks.get(body.task.id).attempt_count, 1);

    const message2 = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message2] }, envWithQueue(queue));
    assert.equal(message2.acked, false);
    assert.equal(message2.retries.length, 1);
    assert.equal(mock.supabaseTasks.get(body.task.id).status, "queued");
    assert.equal(mock.supabaseTasks.get(body.task.id).attempt_count, 2);

    const message3 = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message3] }, envWithQueue(queue));
    assert.equal(message3.acked, true);
    assert.equal(message3.retries.length, 0);
    assert.equal(mock.supabaseTasks.get(body.task.id).status, "failed");
    assert.equal(mock.supabaseTasks.get(body.task.id).attempt_count, 3);
    assert.equal(mock.supabaseTasks.get(body.task.id).error, "unsupported_task_type");

    const runs = [...mock.agentRuns.values()];
    assert.equal(runs.length, 3);
    assert.deepEqual(runs.map((run) => run.status), ["failed", "failed", "failed"]);
  }));
});

test("Idempotency prevents duplicate handler execution after a completed task", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();
  const key = "runtime-test:shared:v1";

  await withMockFetch(mock.mockFetch, async () => {
    const first = await createTask({ mockFetch: mock.mockFetch, queue, idempotencyKey: key });
    await worker.queue({ messages: [makeMessage(queue.messages[0])] }, envWithQueue(queue));
    assert.equal(mock.supabaseTasks.get(first.body.task.id).status, "completed");
    assert.equal(mock.agentRuns.size, 1);

    const second = await createTask({ mockFetch: mock.mockFetch, queue, idempotencyKey: key });
    await worker.queue({ messages: [makeMessage(queue.messages[1])] }, envWithQueue(queue));

    const secondRow = mock.supabaseTasks.get(second.body.task.id);
    assert.equal(secondRow.status, "completed");
    assert.deepEqual(secondRow.output, mock.supabaseTasks.get(first.body.task.id).output);
    assert.equal(mock.agentRuns.size, 1);
  });
});

test("cancelled tasks are acknowledged without handler execution", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({ mockFetch: mock.mockFetch, queue });
    const row = mock.supabaseTasks.get(body.task.id);
    mock.supabaseTasks.set(body.task.id, { ...row, status: "cancelled" });

    const message = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message] }, envWithQueue(queue));

    assert.equal(message.acked, true);
    assert.equal(message.retries.length, 0);
    assert.equal(mock.agentRuns.size, 0);
    assert.equal(mock.supabaseTasks.get(body.task.id).status, "cancelled");
  });
});

test("invalid queue messages and missing tasks are acknowledged without execution", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const invalid = makeMessage({ taskId: "", type: "" });
    await worker.queue({ messages: [invalid] }, envWithQueue(queue));
    assert.equal(invalid.acked, true);
    assert.equal(invalid.retries.length, 0);

    const missing = makeMessage({ taskId: "missing-task", type: "runtime-test" });
    await worker.queue({ messages: [missing] }, envWithQueue(queue));
    assert.equal(missing.acked, true);
    assert.equal(missing.retries.length, 0);
    assert.equal(mock.agentRuns.size, 0);
  });
});

test("missing secrets return controlled errors", async () => {
  await withMutedConsoleError(async () => {
    const redisResponse = await worker.fetch(makeRequest("/redis/health"), {});
    assert.equal(redisResponse.status, 500);
    assert.equal((await redisResponse.json()).error, "upstash_not_configured");

    const supabaseResponse = await worker.fetch(makeRequest("/supabase/health"), {});
    assert.equal(supabaseResponse.status, 500);
    assert.equal((await supabaseResponse.json()).error, "supabase_not_configured");
  });
});

test("POST /tasks rejects missing Supabase before writing", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "runtime-test" })
    }), {
      UPSTASH_REDIS_REST_URL: baseEnv.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: baseEnv.UPSTASH_REDIS_REST_TOKEN,
      JARVIS_TASK_QUEUE: queue.binding
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, error: "supabase_not_configured" });
    assert.equal(mock.redis.size, 0);
  });
});

test("POST /tasks rejects invalid JSON payloads", async () => {
  const response = await worker.fetch(makeRequest("/tasks", {
    method: "POST",
    body: "{"
  }), envWithQueue());

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_json_payload" });
});

test("queue publish failure marks task failed in Upstash and Supabase", async () => {
  const mock = createMockFetch();
  const queue = makeQueue({ fail: true });

  await withMutedConsoleError(() => withMockFetch(mock.mockFetch, async () => {
    const { response, body } = await createTask({ mockFetch: mock.mockFetch, queue });

    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.error, "queue_publish_failed");
    assert.equal(body.task.status, "failed");
    assert.equal(mock.supabaseTasks.get(body.taskId).status, "failed");
    assert.equal(JSON.parse(mock.redis.get(`jarvis:task:${body.taskId}`)).status, "failed");
  }));
});

test("Supabase failure during task creation returns controlled error", async () => {
  const mock = createMockFetch({ failSupabase: true });
  const queue = makeQueue();

  await withMutedConsoleError(() => withMockFetch(mock.mockFetch, async () => {
    const { response, body } = await createTask({ mockFetch: mock.mockFetch, queue });

    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.error, "supabase_persist_failed");
    assert.equal(queue.messages.length, 0);
  }));
});

test("Supabase failure in consumer retries instead of acking", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const { body } = await createTask({ mockFetch: mock.mockFetch, queue });
    assert.equal(mock.supabaseTasks.get(body.task.id).status, "queued");
  });

  const failing = createMockFetch({ failSupabase: true });
  await withMutedConsoleError(() => withMockFetch(failing.mockFetch, async () => {
    const message = makeMessage(queue.messages[0]);
    await worker.queue({ messages: [message] }, envWithQueue(queue));
    assert.equal(message.acked, false);
    assert.equal(message.retries.length, 1);
  }));
});

test("Upstash failure returns controlled error", async () => {
  const mock = createMockFetch({ failRedis: true });
  const queue = makeQueue();

  await withMutedConsoleError(() => withMockFetch(mock.mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "runtime-test" })
    }), envWithQueue(queue));

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, "upstash_http_503");
    assert.equal(queue.messages.length, 0);
  }));
});

test("GET /tasks/:id returns not found for an unknown task", async () => {
  const mock = createMockFetch();
  const queue = makeQueue();

  await withMockFetch(mock.mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks/unknown-task"), envWithQueue(queue));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: "task_not_found" });
  });
});
