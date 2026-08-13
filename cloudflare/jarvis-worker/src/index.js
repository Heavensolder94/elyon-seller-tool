const WORKER_VERSION = "0.3.0";
const TASK_TTL_SECONDS = 86400;
const IDEMPOTENCY_TTL_SECONDS = 2592000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_SECONDS = [15, 60];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const json = (data, init = {}) => Response.json(data, {
  ...init,
  headers: {
    "cache-control": "no-store",
    ...(init.headers || {})
  }
});

const requireRedis = (env) => {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("upstash_not_configured");
  }
};

const requireSupabase = (env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("supabase_not_configured");
  }
};

const requireQueue = (env) => {
  if (!env.JARVIS_TASK_QUEUE || typeof env.JARVIS_TASK_QUEUE.send !== "function") {
    throw new Error("queue_not_configured");
  }
};

const hasSupabase = (env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
const hasQueue = (env) => Boolean(env.JARVIS_TASK_QUEUE && typeof env.JARVIS_TASK_QUEUE.send === "function");

const normalizeSupabaseUrl = (url) => {
  const normalized = String(url || "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("supabase_invalid_url");
  }
};

const isSupabaseSecretKey = (key) => String(key || "").startsWith("sb_secret_");

const normalizeText = (value, max = 500) => String(value || "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const safeError = (error) => error instanceof Error ? error.message : "internal_error";
const taskKey = (id) => `jarvis:task:${id}`;
const taskAttemptKey = (id) => `jarvis:task:${id}:attempt`;
const idempotencyKey = (key) => `jarvis:idempotency:${key}`;
const defaultIdempotencyKey = (task) => `${task.type}:${task.id}:v1`;
const retryDelaySeconds = (attempt) => RETRY_DELAYS_SECONDS[Math.min(RETRY_DELAYS_SECONDS.length - 1, Math.max(0, attempt - 1))];

const publicError = (error) => {
  if (!(error instanceof Error)) return "internal_error";
  if (/^(upstash|supabase|queue)_/.test(error.message)) return error.message;
  return "internal_error";
};

const redis = async (env, command) => {
  requireRedis(env);
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(body.error || `upstash_http_${response.status}`);
  }
  return body.result;
};

const supabaseRequest = async (env, path, init = {}) => {
  requireSupabase(env);

  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeaders = isSupabaseSecretKey(supabaseKey)
    ? { apikey: supabaseKey }
    : {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      };

  const response = await fetch(`${normalizeSupabaseUrl(env.SUPABASE_URL)}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`supabase_http_${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const taskToDb = (task) => ({
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
  max_attempts: Number(task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
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
  maxAttempts: Number(row.max_attempts ?? DEFAULT_MAX_ATTEMPTS),
  idempotencyKey: row.idempotency_key ?? null,
  lastError: row.last_error ?? null,
  source: "supabase"
});

const runtimeOutput = (type) => ({
  processed: true,
  handler: "runtime-test",
  taskType: type,
  message: "Jarvis Task Runtime V1 completed successfully"
});

const RuntimeTestHandler = {
  agentName: "runtime-test-handler",
  async handle(task) {
    await Promise.resolve();
    return runtimeOutput(task.type);
  }
};

const UnsupportedTaskHandler = {
  agentName: "unsupported-task-handler",
  async handle() {
    throw new Error("unsupported_task_type");
  }
};

const handlers = {
  "runtime-test": RuntimeTestHandler,
  "product-check": RuntimeTestHandler
};

const getHandler = (type) => {
  const handler = handlers[type];
  return handler || UnsupportedTaskHandler;
};

const parseJsonBody = async (request) => {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, error: "invalid_json_payload" };
  }
};

const createTask = (body) => {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const type = normalizeText(body.type, 100);
  const providedKey = normalizeText(body.idempotencyKey || body.idempotency_key, 500);
  const task = {
    id,
    type,
    payload: body.payload ?? {},
    output: null,
    status: "queued",
    progress: 0,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    finishedAt: null,
    attemptCount: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    idempotencyKey: providedKey || null,
    lastError: null
  };

  task.idempotencyKey = task.idempotencyKey || defaultIdempotencyKey(task);
  return task;
};

const saveTaskToRedis = (env, task) => redis(env, ["SET", taskKey(task.id), JSON.stringify(task), "EX", String(TASK_TTL_SECONDS)]);

const saveAttemptToRedis = (env, task) => redis(env, ["SET", taskAttemptKey(task.id), String(task.attemptCount ?? 0), "EX", String(TASK_TTL_SECONDS)]);

const persistTaskToSupabase = (env, task) => supabaseRequest(env, "/rest/v1/jarvis_tasks", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify(taskToDb(task))
});

const patchTaskInSupabase = (env, id, patch) => supabaseRequest(
  env,
  `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}`,
  {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  }
);

const updateTaskStores = async (env, task, patch = {}) => {
  const updated = {
    ...task,
    ...patch,
    updatedAt: patch.updatedAt ?? nowIso()
  };

  await saveTaskToRedis(env, updated);
  await saveAttemptToRedis(env, updated);
  await patchTaskInSupabase(env, updated.id, taskToDb(updated));
  return updated;
};

const getTaskFromSupabase = async (env, id) => {
  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}&select=*`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return taskFromDb(rows[0]);
};

const getTaskFromRedis = async (env, id) => {
  const raw = await redis(env, ["GET", taskKey(id)]);
  return raw ? JSON.parse(raw) : null;
};

const getTask = async (env, id, { source = "redis-first" } = {}) => {
  if (source === "supabase-first" && hasSupabase(env)) {
    const task = await getTaskFromSupabase(env, id);
    if (task) return task;
  }

  const redisTask = await getTaskFromRedis(env, id);
  if (redisTask) return redisTask;

  if (source !== "supabase-first" && hasSupabase(env)) {
    return getTaskFromSupabase(env, id);
  }

  return null;
};

const setIdempotencyCompleted = (env, task) => redis(env, [
  "SET",
  idempotencyKey(task.idempotencyKey),
  JSON.stringify({
    taskId: task.id,
    status: "completed",
    output: task.output ?? null,
    completedAt: task.finishedAt ?? nowIso()
  }),
  "EX",
  String(IDEMPOTENCY_TTL_SECONDS)
]);

const getCompletedIdempotency = async (env, key) => {
  if (!key) return null;

  const raw = await redis(env, ["GET", idempotencyKey(key)]);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.status === "completed") return parsed;
  }

  if (!hasSupabase(env)) return null;

  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?idempotency_key=eq.${encodeURIComponent(key)}&status=eq.completed&select=id,output,finished_at&order=finished_at.desc&limit=1`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return {
    taskId: rows[0].id,
    status: "completed",
    output: rows[0].output ?? null,
    completedAt: rows[0].finished_at ?? null
  };
};

const createAgentRun = async (env, { task, handler, attempt, input }) => {
  const run = {
    id: crypto.randomUUID(),
    task_id: task.id,
    agent_name: handler.agentName,
    status: "running",
    input: input ?? { taskId: task.id, type: task.type, attempt },
    output: null,
    error: null,
    duration_ms: null,
    model: null,
    cost: 0,
    created_at: nowIso(),
    finished_at: null
  };

  await supabaseRequest(env, "/rest/v1/jarvis_agent_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(run)
  });

  return run;
};

const finishAgentRun = (env, run, patch) => supabaseRequest(
  env,
  `/rest/v1/jarvis_agent_runs?id=eq.${encodeURIComponent(run.id)}`,
  {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ...patch,
      finished_at: patch.finished_at ?? nowIso()
    })
  }
);

const publishTaskToQueue = async (env, task) => {
  requireQueue(env);
  await env.JARVIS_TASK_QUEUE.send({ taskId: task.id, type: task.type });
};

const failTaskAfterQueueError = async (env, task, error) => {
  const failed = {
    status: "failed",
    progress: 0,
    error: "queue_publish_failed",
    lastError: publicError(error),
    finishedAt: nowIso()
  };

  try {
    return await updateTaskStores(env, task, failed);
  } catch (updateError) {
    console.error("elyon-jarvis-worker queue failure state update failed", updateError);
    return { ...task, ...failed, updatedAt: nowIso() };
  }
};

const validateQueueMessage = (body) => {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_queue_message" };
  const taskId = normalizeText(body.taskId, 100);
  const type = normalizeText(body.type, 100);
  if (!taskId || !type) return { ok: false, error: "invalid_queue_message" };
  return { ok: true, taskId, type };
};

const ack = (message) => {
  if (typeof message.ack === "function") message.ack();
};

const retry = (message, delaySeconds) => {
  if (typeof message.retry === "function") {
    message.retry({ delaySeconds });
  }
};

const processQueueMessage = async (message, env) => {
  const validation = validateQueueMessage(message.body);
  if (!validation.ok) {
    ack(message);
    return { ok: false, error: validation.error, action: "ack" };
  }

  try {
    return await processValidQueueMessage(message, env, validation);
  } catch (error) {
    console.error("elyon-jarvis-worker queue message failed before task handling", error);
    retry(message, RETRY_DELAYS_SECONDS[0]);
    return { ok: false, error: publicError(error), action: "retry" };
  }
};

const processValidQueueMessage = async (message, env, validation) => {
  let task = await getTask(env, validation.taskId, { source: "supabase-first" });
  if (!task) {
    ack(message);
    return { ok: false, error: "task_not_found", action: "ack" };
  }

  if (task.type !== validation.type) {
    ack(message);
    return { ok: false, error: "task_type_mismatch", action: "ack" };
  }

  if (task.status === "cancelled") {
    ack(message);
    return { ok: true, status: "cancelled", action: "ack" };
  }

  if (TERMINAL_STATUSES.has(task.status)) {
    ack(message);
    return { ok: true, status: task.status, action: "ack" };
  }

  const completedIdempotency = await getCompletedIdempotency(env, task.idempotencyKey);
  if (completedIdempotency) {
    task = await updateTaskStores(env, task, {
      status: "completed",
      progress: 100,
      output: completedIdempotency.output,
      error: null,
      lastError: null,
      finishedAt: completedIdempotency.completedAt || nowIso()
    });
    ack(message);
    return { ok: true, status: task.status, action: "ack", idempotent: true };
  }

  const handler = getHandler(task.type);
  const attempt = Number(task.attemptCount ?? 0) + 1;
  const maxAttempts = Number(task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const startedAt = nowIso();
  let run = null;

  try {
    run = await createAgentRun(env, {
      task,
      handler,
      attempt,
      input: {
        taskId: task.id,
        type: task.type,
        attempt,
        idempotencyKey: task.idempotencyKey
      }
    });

    task = await updateTaskStores(env, task, {
      status: "running",
      progress: 10,
      attemptCount: attempt,
      startedAt: task.startedAt || startedAt,
      lastError: null
    });

    const output = await handler.handle(task, env);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

    await finishAgentRun(env, run, {
      status: "completed",
      output,
      error: null,
      duration_ms: durationMs,
      model: null,
      cost: 0,
      finished_at: finishedAt
    });

    task = await updateTaskStores(env, task, {
      status: "completed",
      progress: 100,
      output,
      error: null,
      lastError: null,
      finishedAt
    });
    await setIdempotencyCompleted(env, task);
    ack(message);
    return { ok: true, status: task.status, action: "ack" };
  } catch (error) {
    const errorMessage = safeError(error);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

    if (run) {
      try {
        await finishAgentRun(env, run, {
          status: "failed",
          output: null,
          error: errorMessage,
          duration_ms: durationMs,
          model: null,
          cost: 0,
          finished_at: finishedAt
        });
      } catch (runError) {
        console.error("elyon-jarvis-worker agent run failure update failed", runError);
      }
    }

    const retrying = attempt < maxAttempts;
    task = await updateTaskStores(env, task, {
      status: retrying ? "queued" : "failed",
      progress: retrying ? 0 : Number(task.progress ?? 0),
      attemptCount: attempt,
      error: retrying ? null : errorMessage,
      lastError: errorMessage,
      finishedAt: retrying ? null : finishedAt
    });

    if (retrying) {
      retry(message, retryDelaySeconds(attempt));
      return { ok: false, status: task.status, action: "retry", attempt };
    }

    ack(message);
    return { ok: false, status: task.status, action: "ack", attempt };
  }
};

const fetchHandler = async (request, env) => {
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "elyon-jarvis-worker", version: WORKER_VERSION });
    }

    if (request.method === "GET" && url.pathname === "/redis/health") {
      const pong = await redis(env, ["PING"]);
      return json({ ok: pong === "PONG", service: "upstash-redis", result: pong });
    }

    if (request.method === "GET" && url.pathname === "/supabase/health") {
      await supabaseRequest(env, "/rest/v1/jarvis_tasks?select=id&limit=1", { method: "GET" });
      return json({ ok: true, service: "supabase", status: "connected" });
    }

    if (request.method === "GET" && url.pathname === "/runtime/health") {
      return json({
        ok: true,
        service: "jarvis-task-runtime",
        queue: hasQueue(env) ? "configured" : "missing",
        maxAttempts: DEFAULT_MAX_ATTEMPTS
      });
    }

    if (request.method === "POST" && url.pathname === "/tasks") {
      const parsed = await parseJsonBody(request);
      if (!parsed.ok) {
        return json({ ok: false, error: parsed.error }, { status: 400 });
      }

      const body = parsed.body;
      if (!body || typeof body.type !== "string" || !body.type.trim()) {
        return json({ ok: false, error: "invalid_task_type" }, { status: 400 });
      }

      if (!hasSupabase(env)) {
        return json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
      }

      const task = createTask(body);
      await saveTaskToRedis(env, task);
      await saveAttemptToRedis(env, task);

      try {
        await persistTaskToSupabase(env, task);
      } catch (error) {
        console.error("elyon-jarvis-worker supabase persist failed", error);
        return json({
          ok: false,
          error: "supabase_persist_failed",
          taskId: task.id,
          task
        }, { status: 502 });
      }

      try {
        await publishTaskToQueue(env, task);
      } catch (error) {
        console.error("elyon-jarvis-worker queue publish failed", error);
        const failedTask = await failTaskAfterQueueError(env, task, error);
        return json({
          ok: false,
          error: "queue_publish_failed",
          taskId: task.id,
          task: failedTask
        }, { status: 502 });
      }

      return json({ ok: true, task }, { status: 201 });
    }

    if (request.method === "GET" && url.pathname.startsWith("/tasks/")) {
      const id = url.pathname.slice("/tasks/".length).trim();
      if (!id) return json({ ok: false, error: "missing_task_id" }, { status: 400 });

      const task = await getTask(env, id);
      if (!task) return json({ ok: false, error: "task_not_found" }, { status: 404 });

      return json({ ok: true, task });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        service: "elyon-jarvis-worker",
        status: "online",
        version: WORKER_VERSION,
        endpoints: [
          "/health",
          "/redis/health",
          "/supabase/health",
          "/runtime/health",
          "POST /tasks",
          "GET /tasks/:id"
        ]
      });
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  } catch (error) {
    console.error("elyon-jarvis-worker error", error);
    return json({ ok: false, error: publicError(error) }, { status: 500 });
  }
};

export default {
  fetch: fetchHandler,
  async queue(batch, env) {
    for (const message of batch.messages || []) {
      await processQueueMessage(message, env);
    }
  }
};

export {
  processQueueMessage
};
