import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

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
  payload: task.payload,
  output: task.output ?? null,
  progress: task.progress,
  error: task.error ?? null,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
  started_at: task.startedAt ?? null,
  finished_at: task.finishedAt ?? null
});

const createMockFetch = ({ failSupabase = false } = {}) => {
  const redis = new Map();
  const supabaseTasks = new Map();
  const calls = [];

  const mockFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });

    if (String(url).startsWith(baseEnv.UPSTASH_REDIS_REST_URL)) {
      const command = JSON.parse(init.body);
      const [name, ...args] = command;

      if (name === "PING") {
        return Response.json({ result: "PONG" });
      }

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

      if (init.method === "POST" && parsed.pathname === "/rest/v1/jarvis_tasks") {
        const row = JSON.parse(init.body);
        supabaseTasks.set(row.id, row);
        return new Response(null, { status: 201 });
      }

      if (init.method === "GET" && parsed.pathname === "/rest/v1/jarvis_tasks") {
        const idFilter = parsed.searchParams.get("id");
        if (idFilter?.startsWith("eq.")) {
          const row = supabaseTasks.get(idFilter.slice(3));
          return Response.json(row ? [row] : []);
        }

        return Response.json([]);
      }
    }

    return Response.json({ error: "unexpected_url" }, { status: 500 });
  };

  return { mockFetch, redis, supabaseTasks, calls };
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

test("GET /health returns worker health", async () => {
  const response = await worker.fetch(makeRequest("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "elyon-jarvis-worker",
    version: "0.2.0"
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

test("POST /tasks writes to Upstash and Supabase", async () => {
  const { mockFetch, redis, supabaseTasks } = createMockFetch();

  await withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "product-check", payload: { productId: "test-001" } })
    }), baseEnv);

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.task.status, "queued");

    const rawRedisTask = redis.get(`jarvis:task:${body.task.id}`);
    assert.ok(rawRedisTask);
    assert.deepEqual(JSON.parse(rawRedisTask), body.task);
    assert.deepEqual(supabaseTasks.get(body.task.id), dbRowFromTask(body.task));
  });
});

test("GET /tasks/:id reads from Upstash first", async () => {
  const { mockFetch } = createMockFetch();

  await withMockFetch(mockFetch, async () => {
    const created = await worker.fetch(makeRequest("/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "product-check", payload: { productId: "test-001" } })
    }), baseEnv);
    const { task } = await created.json();

    const response = await worker.fetch(makeRequest(`/tasks/${task.id}`), baseEnv);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, task });
  });
});

test("GET /tasks/:id falls back to Supabase when Upstash misses", async () => {
  const { mockFetch, supabaseTasks } = createMockFetch();
  const task = {
    id: "5b6e1d9e-9b4d-4e6f-9b02-6885d703339b",
    type: "product-check",
    payload: { productId: "test-001" },
    status: "queued",
    progress: 0,
    createdAt: "2026-08-13T17:39:22.808Z",
    updatedAt: "2026-08-13T17:39:22.808Z"
  };
  supabaseTasks.set(task.id, dbRowFromTask(task));

  await withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest(`/tasks/${task.id}`), baseEnv);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.task.id, task.id);
    assert.equal(body.task.source, "supabase");
  });
});

test("POST /tasks returns a controlled error when Supabase persist fails", async () => {
  const { mockFetch, redis } = createMockFetch({ failSupabase: true });

  await withMutedConsoleError(() => withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "product-check", payload: { productId: "test-001" } })
    }), baseEnv);

    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "supabase_persist_failed");
    assert.ok(redis.get(`jarvis:task:${body.taskId}`));
  }));
});

test("health endpoints return controlled errors when secrets are missing", async () => {
  await withMutedConsoleError(async () => {
    const redisResponse = await worker.fetch(makeRequest("/redis/health"), {});
    assert.equal(redisResponse.status, 500);
    assert.equal((await redisResponse.json()).error, "upstash_not_configured");

    const supabaseResponse = await worker.fetch(makeRequest("/supabase/health"), {});
    assert.equal(supabaseResponse.status, 500);
    assert.equal((await supabaseResponse.json()).error, "supabase_not_configured");
  });
});

test("POST /tasks rejects missing Supabase secrets before writing", async () => {
  const { mockFetch, redis } = createMockFetch();

  await withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "product-check", payload: { productId: "test-001" } })
    }), {
      UPSTASH_REDIS_REST_URL: baseEnv.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: baseEnv.UPSTASH_REDIS_REST_TOKEN
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, error: "supabase_not_configured" });
    assert.equal(redis.size, 0);
  });
});

test("POST /tasks rejects invalid JSON payloads", async () => {
  const response = await worker.fetch(makeRequest("/tasks", {
    method: "POST",
    body: "{"
  }), baseEnv);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_json_payload" });
});

test("GET /tasks/:id returns not found for an unknown task", async () => {
  const { mockFetch } = createMockFetch();

  await withMockFetch(mockFetch, async () => {
    const response = await worker.fetch(makeRequest("/tasks/unknown-task"), baseEnv);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: "task_not_found" });
  });
});
