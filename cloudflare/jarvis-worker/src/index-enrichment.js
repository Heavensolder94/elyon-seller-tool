import baseWorker, { loadProductForTask, processQueueMessage } from "./index.js";
import {
  ENRICHMENT_VERSION,
  buildAutoApplyPatch,
  buildProvenancePatch,
  callOpenRouterResearch,
  classifyFindings,
  detectConcurrentConflicts,
  discoverEnrichmentTargets,
  snapshotTargetValues,
} from "./product-enrichment.js";

const WORKER_VERSION = "0.5.0";
const TASK_TTL_SECONDS = 86400;
const IDEMPOTENCY_TTL_SECONDS = 2592000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_SECONDS = [15, 60];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const ELYON_ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;

const nowIso = () => new Date().toISOString();
const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const safeError = (error) => error instanceof Error ? error.message : "internal_error";
const retryDelaySeconds = (attempt) => RETRY_DELAYS_SECONDS[Math.min(RETRY_DELAYS_SECONDS.length - 1, Math.max(0, attempt - 1))];
const isRetryableError = (error) => error?.retryable !== false;
const taskKey = (id) => `jarvis:task:${id}`;
const taskAttemptKey = (id) => `jarvis:task:${id}:attempt`;
const idempotencyKey = (key) => `jarvis:idempotency:${key}`;

const normalizeSellerToolUrl = (url) => {
  const normalized = text(url, 1000).replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    const error = new Error("product_source_invalid_url");
    error.retryable = false;
    throw error;
  }
};

const requireRedis = (env) => {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw new Error("upstash_not_configured");
};

const requireSupabase = (env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
};

const normalizeSupabaseUrl = (url) => {
  const normalized = text(url, 1000).replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("supabase_invalid_url");
  }
};

const redis = async (env, command) => {
  requireRedis(env);
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error || `upstash_http_${response.status}`);
  return body.result;
};

const supabaseRequest = async (env, path, init = {}) => {
  requireSupabase(env);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = String(key || "").startsWith("sb_secret_")
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
  const response = await fetch(`${normalizeSupabaseUrl(env.SUPABASE_URL)}${path}`, {
    ...init,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`supabase_http_${response.status}`);
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

const saveTaskToRedis = (env, task) => redis(env, ["SET", taskKey(task.id), JSON.stringify(task), "EX", String(TASK_TTL_SECONDS)]);
const saveAttemptToRedis = (env, task) => redis(env, ["SET", taskAttemptKey(task.id), String(task.attemptCount ?? 0), "EX", String(TASK_TTL_SECONDS)]);

const patchTaskInSupabase = (env, task) => supabaseRequest(
  env,
  `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(task.id)}`,
  {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(taskToDb(task)),
  }
);

const updateTaskStores = async (env, task, patch = {}) => {
  const updated = { ...task, ...patch, updatedAt: patch.updatedAt ?? nowIso() };
  await saveTaskToRedis(env, updated);
  await saveAttemptToRedis(env, updated);
  await patchTaskInSupabase(env, updated);
  return updated;
};

const getTask = async (env, id) => {
  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}&select=*`,
    { method: "GET" }
  );
  if (Array.isArray(rows) && rows.length) return taskFromDb(rows[0]);
  const raw = await redis(env, ["GET", taskKey(id)]);
  return raw ? JSON.parse(raw) : null;
};

const getCompletedIdempotency = async (env, key) => {
  if (!key) return null;
  const raw = await redis(env, ["GET", idempotencyKey(key)]);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.status === "completed") return parsed;
  }
  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?idempotency_key=eq.${encodeURIComponent(key)}&status=eq.completed&select=id,output,finished_at&order=finished_at.desc&limit=1`,
    { method: "GET" }
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return { taskId: rows[0].id, status: "completed", output: rows[0].output ?? null, completedAt: rows[0].finished_at ?? null };
};

const setIdempotencyCompleted = (env, task) => redis(env, [
  "SET",
  idempotencyKey(task.idempotencyKey),
  JSON.stringify({ taskId: task.id, status: "completed", output: task.output ?? null, completedAt: task.finishedAt ?? nowIso() }),
  "EX",
  String(IDEMPOTENCY_TTL_SECONDS),
]);

const createAgentRun = async (env, task, attempt) => {
  const run = {
    id: crypto.randomUUID(),
    task_id: task.id,
    agent_name: "product-enrichment-handler",
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
  await supabaseRequest(env, "/rest/v1/jarvis_agent_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(run),
  });
  return run;
};

const finishAgentRun = (env, run, patch) => supabaseRequest(
  env,
  `/rest/v1/jarvis_agent_runs?id=eq.${encodeURIComponent(run.id)}`,
  {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, finished_at: patch.finished_at ?? nowIso() }),
  }
);

const persistSellerProductPatch = async (env, product, patch) => {
  if (!env.ELYON_SELLER_TOOL_URL || !env.ELYON_SELLER_ACCESS_TOKEN) {
    const error = new Error("product_source_write_not_configured");
    error.retryable = false;
    throw error;
  }
  const articleNumber = text(product?.articleNumber || product?.sku, 100).toUpperCase();
  if (!ELYON_ARTICLE_NUMBER_PATTERN.test(articleNumber)) {
    const error = new Error("product_identity_not_write_ready");
    error.retryable = false;
    throw error;
  }
  const response = await fetch(`${normalizeSellerToolUrl(env.ELYON_SELLER_TOOL_URL)}/api/products`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-elyon-seller-token": env.ELYON_SELLER_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      product: {
        id: product.id,
        articleNumber,
        sku: articleNumber,
        ...patch,
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    const error = new Error("product_source_auth_failed");
    error.retryable = false;
    throw error;
  }
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || `product_source_write_http_${response.status}`);
  return body.product || null;
};

const persistChildProductCheckTask = async (env, parentTask, productId) => {
  const timestamp = nowIso();
  const child = {
    id: crypto.randomUUID(),
    type: "product-check",
    payload: { productId, parentTaskId: parentTask.id, trigger: "post-enrichment" },
    output: null,
    status: "queued",
    progress: 0,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    finishedAt: null,
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    idempotencyKey: `product-check:${parentTask.id}:post-enrichment:v1`,
    lastError: null,
  };
  await saveTaskToRedis(env, child);
  await saveAttemptToRedis(env, child);
  await supabaseRequest(env, "/rest/v1/jarvis_tasks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(taskToDb(child)),
  });
  return child;
};

const runPostEnrichmentProductCheck = async (env, parentTask, productId) => {
  const child = await persistChildProductCheckTask(env, parentTask, productId);
  const syntheticMessage = {
    body: { taskId: child.id, type: child.type },
    ack() {},
    retry() {},
  };
  await processQueueMessage(syntheticMessage, env);
  const completed = await getTask(env, child.id);
  return {
    taskId: child.id,
    status: completed?.status || "unknown",
    output: completed?.output ?? null,
    error: completed?.error ?? null,
  };
};

const mergeProvenanceWithClassification = ({ product, autoApply, pendingReview, lowConfidence, conflicts, now }) => {
  const all = [
    ...autoApply,
    ...pendingReview,
    ...lowConfidence,
    ...conflicts,
  ];
  return buildProvenancePatch({ product, findings: all, now });
};

const runProductEnrichment = async (task, env) => {
  const productId = text(task.payload?.productId || task.payload?.product_id || task.payload?.id, 200);
  if (!productId) {
    const error = new Error("invalid_product_id");
    error.retryable = false;
    throw error;
  }

  const loaded = await loadProductForTask(env, productId);
  const { product, rawProduct, source } = loaded;
  const targets = discoverEnrichmentTargets(product, rawProduct, task.payload?.requestedFields);
  const baseline = snapshotTargetValues(product, rawProduct, targets);

  if (!targets.length) {
    const postCheck = await runPostEnrichmentProductCheck(env, task, product.articleNumber || product.sku || product.id);
    return {
      processed: true,
      handler: "product-enrichment",
      version: ENRICHMENT_VERSION,
      productId,
      productSource: source,
      researchedFields: 0,
      autoApplied: [],
      pendingReview: [],
      unresolved: [],
      conflicts: [],
      noOp: true,
      postCheck,
      cost: { provider: "openrouter", model: null, inputTokens: 0, outputTokens: 0, totalTokens: 0, webSearchRequests: 0 },
    };
  }

  const research = await callOpenRouterResearch({ env, product, rawProduct, fields: targets });
  const initial = classifyFindings({ product, rawProduct, findings: research.findings });

  const reloaded = await loadProductForTask(env, productId);
  const concurrency = detectConcurrentConflicts({
    baseline,
    currentProduct: reloaded.product,
    currentRawProduct: reloaded.rawProduct,
    findings: initial.autoApply,
  });

  const safeAutoApply = concurrency.safeFindings;
  const allConflicts = [...initial.existingValueConflicts, ...concurrency.conflicts];
  const { patch: fieldPatch, applied } = buildAutoApplyPatch({ product: reloaded.product, findings: safeAutoApply });
  const checkedAutoApply = safeAutoApply.filter((finding) => applied.includes(finding.field));
  const now = nowIso();
  const provenancePatch = mergeProvenanceWithClassification({
    product: reloaded.product,
    autoApply: checkedAutoApply,
    pendingReview: initial.pendingReview,
    lowConfidence: initial.lowConfidence,
    conflicts: allConflicts,
    now,
  });

  const writable = source === "seller_tool_product_master" && ELYON_ARTICLE_NUMBER_PATTERN.test(text(reloaded.product.articleNumber || reloaded.product.sku, 100));
  const hasWrite = checkedAutoApply.length > 0 || Object.keys(provenancePatch.enrichment?.fields || {}).length > 0;
  let persisted = false;
  if (writable && hasWrite) {
    await persistSellerProductPatch(env, reloaded.product, { ...fieldPatch, ...provenancePatch });
    persisted = true;
  }

  const canonicalId = reloaded.product.articleNumber || reloaded.product.sku || reloaded.product.id || productId;
  const postCheck = await runPostEnrichmentProductCheck(env, task, canonicalId);

  return {
    processed: true,
    handler: "product-enrichment",
    version: ENRICHMENT_VERSION,
    productId,
    productSource: source,
    researchedFields: targets.length,
    requestedFields: targets,
    autoApplied: persisted ? checkedAutoApply.map((finding) => finding.field) : [],
    pendingReview: initial.pendingReview.map((finding) => ({
      field: finding.field,
      value: finding.value,
      confidence: finding.confidence,
      sourceType: finding.sourceType,
      sourceUrl: finding.sourceUrl || null,
      complianceSensitive: finding.complianceSensitive,
    })),
    unresolved: research.unresolved,
    lowConfidence: initial.lowConfidence.map((finding) => finding.field),
    conflicts: allConflicts.map((finding) => ({ field: finding.field, existingValue: finding.existingValue || null, proposedValue: finding.value })),
    persisted,
    writeBlockedReason: writable ? null : "product_master_identity_or_source_not_write_ready",
    citations: research.citations,
    postCheck,
    cost: {
      provider: research.provider,
      model: research.model,
      inputTokens: research.usage.inputTokens,
      outputTokens: research.usage.outputTokens,
      totalTokens: research.usage.totalTokens,
      webSearchRequests: research.usage.webSearchRequests,
    },
  };
};

const ack = (message) => { if (typeof message.ack === "function") message.ack(); };
const retry = (message, delaySeconds) => { if (typeof message.retry === "function") message.retry({ delaySeconds }); };

const processProductEnrichmentMessage = async (message, env) => {
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

  const completed = await getCompletedIdempotency(env, task.idempotencyKey);
  if (completed) {
    task = await updateTaskStores(env, task, {
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
    run = await createAgentRun(env, task, attempt);
    task = await updateTaskStores(env, task, {
      status: "running",
      progress: 10,
      attemptCount: attempt,
      startedAt: task.startedAt || startedAt,
      lastError: null,
    });

    const output = await runProductEnrichment(task, env);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    await finishAgentRun(env, run, {
      status: "completed",
      output,
      error: null,
      duration_ms: durationMs,
      model: output?.cost?.model || null,
      cost: 0,
      finished_at: finishedAt,
    });
    task = await updateTaskStores(env, task, {
      status: "completed",
      progress: 100,
      output,
      error: null,
      lastError: null,
      finishedAt,
    });
    await setIdempotencyCompleted(env, task);
    ack(message);
    return { ok: true, action: "ack", status: task.status };
  } catch (error) {
    const messageText = safeError(error);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    if (run) {
      try {
        await finishAgentRun(env, run, {
          status: "failed",
          output: null,
          error: messageText,
          duration_ms: durationMs,
          model: null,
          cost: 0,
          finished_at: finishedAt,
        });
      } catch (runError) {
        console.error("elyon-jarvis enrichment agent run failure update failed", runError);
      }
    }
    const retrying = isRetryableError(error) && attempt < maxAttempts;
    task = await updateTaskStores(env, task, {
      status: retrying ? "queued" : "failed",
      progress: retrying ? 0 : Number(task.progress ?? 0),
      attemptCount: attempt,
      error: retrying ? null : messageText,
      lastError: messageText,
      finishedAt: retrying ? null : finishedAt,
    });
    if (retrying) {
      retry(message, retryDelaySeconds(attempt));
      return { ok: false, action: "retry", status: task.status, attempt };
    }
    ack(message);
    return { ok: false, action: "ack", status: task.status, attempt };
  }
};

const fetchHandler = async (request, env, ctx) => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({
      ok: true,
      service: "elyon-jarvis-worker",
      version: WORKER_VERSION,
      productEnrichment: "v1",
      openRouterResearch: env.OPENROUTER_API_KEY ? "configured" : "missing",
    }, { headers: { "cache-control": "no-store" } });
  }
  if (request.method === "GET" && url.pathname === "/runtime/health") {
    const baseResponse = await baseWorker.fetch(request, env, ctx);
    const payload = await baseResponse.json().catch(() => ({}));
    return Response.json({
      ...payload,
      version: WORKER_VERSION,
      productEnrichment: {
        enabled: true,
        openRouterResearch: env.OPENROUTER_API_KEY ? "configured" : "missing",
        complianceAutoApply: false,
      },
    }, { status: baseResponse.status, headers: { "cache-control": "no-store" } });
  }
  return baseWorker.fetch(request, env, ctx);
};

export default {
  fetch: fetchHandler,
  async queue(batch, env, ctx) {
    const baseMessages = [];
    for (const message of batch.messages || []) {
      if (message?.body?.type === "product-enrichment") {
        await processProductEnrichmentMessage(message, env);
      } else {
        baseMessages.push(message);
      }
    }
    if (baseMessages.length) {
      await baseWorker.queue({ ...batch, messages: baseMessages }, env, ctx);
    }
  },
};

export {
  persistSellerProductPatch,
  processProductEnrichmentMessage,
  runProductEnrichment,
  runPostEnrichmentProductCheck,
};
