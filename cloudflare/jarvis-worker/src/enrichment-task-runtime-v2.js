const TASK_TTL_SECONDS = 86400;
const IDEMPOTENCY_TTL_SECONDS = 2592000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_SECONDS = [15, 60];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const nowIso = () => new Date().toISOString();
const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const safeError = (error) => error instanceof Error ? error.message : "internal_error";
const retryDelaySeconds = (attempt) => RETRY_DELAYS_SECONDS[Math.min(RETRY_DELAYS_SECONDS.length - 1, Math.max(0, attempt - 1))];
const taskKey = (id) => `jarvis:task:${id}`;
const taskAttemptKey = (id) => `jarvis:task:${id}:attempt`;
const idempotencyKey = (key) => `jarvis:idempotency:${key}`;

function normalizeSupabaseUrl(value) {
  const candidate = text(value, 1000).replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("supabase_invalid_url");
  }
}

async function redis(env, command) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw new Error("upstash_not_configured");
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error || `upstash_http_${response.status}`);
  return body.result;
}

async function supabase(env, path, init = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = String(key || "").startsWith("sb_secret_")
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
  const response = await fetch(`${normalizeSupabaseUrl(env.SUPABASE_URL)}${path}`, {
    ...init,
    headers: { ...auth, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`supabase_http_${response.status}`);
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

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
  max_attempts: Number(task.maxAttempts ?? MAX_ATTEMPTS),
  idempotency_key: task.idempotencyKey ?? null,
  last_error: task.lastError ?? null,
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
  maxAttempts: Number(row.max_attempts ?? MAX_ATTEMPTS),
  idempotencyKey: row.idempotency_key ?? null,
  lastError: row.last_error ?? null,
});

async function getTask(env, id) {
  const rows = await supabase(env, `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}&select=*`, { method: "GET" });
  if (Array.isArray(rows) && rows.length) return taskFromDb(rows[0]);
  const raw = await redis(env, ["GET", taskKey(id)]);
  return raw ? JSON.parse(raw) : null;
}

async function updateTask(env, task, patch = {}) {
  const updated = { ...task, ...patch, updatedAt: patch.updatedAt ?? nowIso() };
  await redis(env, ["SET", taskKey(updated.id), JSON.stringify(updated), "EX", String(TASK_TTL_SECONDS)]);
  await redis(env, ["SET", taskAttemptKey(updated.id), String(updated.attemptCount ?? 0), "EX", String(TASK_TTL_SECONDS)]);
  await supabase(env, `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(updated.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(taskToDb(updated)),
  });
  return updated;
}

async function getCompleted(env, key) {
  if (!key) return null;
  const raw = await redis(env, ["GET", idempotencyKey(key)]);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.status === "completed") return parsed;
  }
  const rows = await supabase(env, `/rest/v1/jarvis_tasks?idempotency_key=eq.${encodeURIComponent(key)}&status=eq.completed&select=id,output,finished_at&order=finished_at.desc&limit=1`, { method: "GET" });
  if (!Array.isArray(rows) || !rows.length) return null;
  return { taskId: rows[0].id, status: "completed", output: rows[0].output ?? null, completedAt: rows[0].finished_at ?? null };
}

async function setCompleted(env, task) {
  return redis(env, ["SET", idempotencyKey(task.idempotencyKey), JSON.stringify({
    taskId: task.id,
    status: "completed",
    output: task.output ?? null,
    completedAt: task.finishedAt ?? nowIso(),
  }), "EX", String(IDEMPOTENCY_TTL_SECONDS)]);
}

async function createRun(env, task, attempt) {
  const run = {
    id: crypto.randomUUID(),
    task_id: task.id,
    agent_name: "product-enrichment-handler-v2",
    status: "running",
    input: { taskId: task.id, type: task.type, attempt, idempotencyKey: task.idempotencyKey, payload: task.payload ?? {} },
    output: null,
    error: null,
    duration_ms: null,
    model: null,
    cost: 0,
    created_at: nowIso(),
    finished_at: null,
  };
  await supabase(env, "/rest/v1/jarvis_agent_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(run),
  });
  return run;
}

async function finishRun(env, run, patch) {
  return supabase(env, `/rest/v1/jarvis_agent_runs?id=eq.${encodeURIComponent(run.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, finished_at: patch.finished_at ?? nowIso() }),
  });
}

const ack = (message) => { if (typeof message?.ack === "function") message.ack(); };
const retry = (message, delaySeconds) => { if (typeof message?.retry === "function") message.retry({ delaySeconds }); };

async function processEnrichmentMessageV2(message, env, handler) {
  const taskId = text(message?.body?.taskId, 100);
  const type = text(message?.body?.type, 100);
  if (!taskId || type !== "product-enrichment") {
    ack(message);
    return { ok: false, action: "ack", error: "invalid_queue_message" };
  }

  let task = await getTask(env, taskId);
  if (!task) {
    ack(message);
    return { ok: false, action: "ack", error: "task_not_found" };
  }
  if (task.type !== type) {
    ack(message);
    return { ok: false, action: "ack", error: "task_type_mismatch" };
  }
  if (task.status === "cancelled" || TERMINAL_STATUSES.has(task.status)) {
    ack(message);
    return { ok: true, action: "ack", status: task.status };
  }

  const completed = await getCompleted(env, task.idempotencyKey);
  if (completed) {
    task = await updateTask(env, task, {
      status: "completed",
      progress: 100,
      output: completed.output,
      error: null,
      lastError: null,
      finishedAt: completed.completedAt || nowIso(),
    });
    ack(message);
    return { ok: true, action: "ack", status: task.status, idempotent: true };
  }

  const attempt = Number(task.attemptCount ?? 0) + 1;
  const maxAttempts = Number(task.maxAttempts ?? MAX_ATTEMPTS);
  const startedAt = nowIso();
  let run = null;

  try {
    run = await createRun(env, task, attempt);
    task = await updateTask(env, task, { status: "running", progress: 10, attemptCount: attempt, startedAt: task.startedAt || startedAt, lastError: null });
    const output = await handler(task, env);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    const cost = Number(output?.cost?.amount);
    await finishRun(env, run, {
      status: "completed",
      output,
      error: null,
      duration_ms: durationMs,
      model: output?.cost?.model || null,
      cost: Number.isFinite(cost) ? cost : 0,
      finished_at: finishedAt,
    });
    task = await updateTask(env, task, { status: "completed", progress: 100, output, error: null, lastError: null, finishedAt });
    await setCompleted(env, task);
    ack(message);
    return { ok: true, action: "ack", status: task.status };
  } catch (error) {
    const errorText = safeError(error);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    if (run) {
      try {
        await finishRun(env, run, { status: "failed", output: null, error: errorText, duration_ms: durationMs, model: null, cost: 0, finished_at: finishedAt });
      } catch (runError) {
        console.error("elyon-jarvis enrichment v2 run update failed", runError);
      }
    }
    const retrying = error?.retryable !== false && attempt < maxAttempts;
    task = await updateTask(env, task, {
      status: retrying ? "queued" : "failed",
      progress: retrying ? 0 : Number(task.progress ?? 0),
      attemptCount: attempt,
      error: retrying ? null : errorText,
      lastError: errorText,
      finishedAt: retrying ? null : finishedAt,
    });
    if (retrying) {
      retry(message, retryDelaySeconds(attempt));
      return { ok: false, action: "retry", status: task.status, attempt };
    }
    ack(message);
    return { ok: false, action: "ack", status: task.status, attempt };
  }
}

export { getTask, processEnrichmentMessageV2 };
