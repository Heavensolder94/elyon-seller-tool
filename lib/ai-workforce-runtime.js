import { randomUUID, createHash } from "node:crypto";
import { AGENT_STRUCTURE, canonicalV2AgentId } from "./ai-workforce-structure-v2.js";
import { supabaseJarvisRequest } from "./jarvis-memory-store.js";
import { JARVIS_NOVA_LOCAL_ONLY } from "./elyon-jarvis-e5-v2-policy.js";

// Server-only request markers. Never derived from request body or headers.
export const WORKFORCE_REGISTRY_REQUEST = Symbol("workforce_registry_request");
export const WORKFORCE_DELEGATED_REQUEST = Symbol("workforce_delegated_request");
const RUNTIME_VERSION = 1;
const PROVIDERS = new Set(["local", "openai", "deepseek", "openrouter"]);
const RESULT_STATES = new Set(["passed", "warning", "blocked", "manualReviewRequired"]);
const TASK_STATES = new Set(["draft_ready", "approval_required", "blocked", "failed", "completed", "cancelled", "manual_review_required", "manual_approval_required", "warning", "analyzing"]);

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function canonicalAgent(value) {
  const id = typeof value === "string" ? value.toLowerCase() : "";
  const canonical = canonicalV2AgentId(id);
  return typeof canonical === "string" && Object.hasOwn(AGENT_STRUCTURE, canonical) ? canonical : (/^custom-[a-z0-9][a-z0-9-]{2,80}$/.test(id) ? id : null);
}
function fingerprint(value) {
  return typeof value === "string" && value ? createHash("sha256").update(value.slice(0, 300)).digest("hex") : null;
}
function safeModel(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:/-]{0,159}$/i.test(value) &&
    !/^(?:sk[-_]|sb_secret_|ghp_|github_pat_|eyJ)/i.test(value) ? value : null;
}
function duration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(2147483647, Math.round(value)) : null;
}
function origin(req) {
  return req?.[JARVIS_NOVA_LOCAL_ONLY] === true ? "nova_worker" :
    req?.[WORKFORCE_REGISTRY_REQUEST] === true ? "registry" : "legacy_handler";
}
function executionStatus(task, httpOk) {
  if (!httpOk || task.status === "failed") return "failed";
  if (task.status === "cancelled") return "cancelled";
  return "completed"; // Analysis completed; never implies product/listing approval.
}
function makeEntry(task, { requestOrigin, parentId, now, httpOk, uuid }) {
  const agentId = canonicalAgent(task.agentId);
  if (!agentId) return null;
  const taskId = uuid();
  const runId = uuid();
  const status = executionStatus(task, httpOk);
  const taskState = TASK_STATES.has(task.status) ? task.status : "unknown";
  const resultState = RESULT_STATES.has(task.result?.status) ? task.result.status : null;
  const provider = PROVIDERS.has(task.provider) ? task.provider : null;
  const model = safeModel(task.model);
  const metadata = { version: RUNTIME_VERSION, origin: requestOrigin, agentId, parentRuntimeTaskId: parentId,
    legacyTaskFingerprint: fingerprint(task.id), sourceFingerprint: fingerprint(task.sourceId),
    taskState, resultState, provider, model };
  const error = status === "failed" ? "agent_execution_failed" : null;
  const row = { id: taskId, type: "workforce-agent-execution", status, payload: metadata,
    output: { taskState, resultState, manualReviewRequired: true }, progress: status === "completed" ? 100 : 0,
    error, created_at: now, updated_at: now, finished_at: now };
  const run = { id: runId, task_id: taskId, agent_name: agentId, status, input: { origin: requestOrigin, parentRuntimeTaskId: parentId },
    output: { taskState, resultState, manualReviewRequired: true }, error, duration_ms: duration(task.durationMs),
    model, cost: null, created_at: now, finished_at: now };
  return { row, run, runtime: { version: RUNTIME_VERSION, taskId, runId, agentId, origin: requestOrigin, parentTaskId: parentId } };
}

function defaultPersistence(env) {
  // Vercel runs the test suite during builds. Never send test fixtures to production.
  if (env.NODE_TEST_CONTEXT || env.NODE_ENV === "test" || env.VERCEL_ENV !== "production") return "disabled";
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? "enabled" : "not_configured";
}

async function insertRows(path, rows, env, request) {
  const result = await request(path + "?select=id", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows), signal: AbortSignal.timeout(3000),
  }, env);
  const ids = new Set(Array.isArray(result) ? result.map(row => row?.id) : []);
  if (ids.size !== rows.length || !rows.every(row => ids.has(row.id))) throw Error("journal_write_unconfirmed");
}

// The existing runners still execute exactly once. This records completed
// attempts, not a second runnable queue. Legacy IDs and approval states stay intact.
export async function recordWorkforceExecution(req, payload, statusCode, {
  env = process.env, request = supabaseJarvisRequest, persistence = defaultPersistence(env),
  nowMs = Date.now(), uuid = randomUUID,
} = {}) {
  if (req?.[WORKFORCE_DELEGATED_REQUEST] === true || !payload?.task || payload.runtime) return payload;
  const task = object(payload.task);
  const now = new Date(nowMs).toISOString();
  const parent = makeEntry(task, { requestOrigin: origin(req), parentId: null, now, httpOk: statusCode >= 200 && statusCode < 300 && payload.ok === true, uuid });
  if (!parent) return payload;
  const children = Array.isArray(payload.childTasks) ? payload.childTasks : null;
  const childEntries = (children || []).map(child => makeEntry(object(child), {
    requestOrigin: "manager_delegation", parentId: parent.row.id, now, httpOk: true, uuid,
  }));
  const entries = [parent, ...childEntries.filter(Boolean)];
  let journal = persistence === "enabled" ? "unconfirmed" : persistence === "not_configured" ? "not_configured" : "disabled";
  if (persistence === "enabled") {
    try {
      await insertRows("/rest/v1/jarvis_tasks", entries.map(entry => entry.row), env, request);
      journal = "partial";
      await insertRows("/rest/v1/jarvis_agent_runs", entries.map(entry => entry.run), env, request);
      journal = "recorded";
    } catch {
      // Never repeat a provider request or claim a durable record when writes failed.
    }
  }
  const attach = (original, entry) => entry ? { ...original, runtime: { ...entry.runtime, journal } } : original;
  return { ...payload, runtime: { ...parent.runtime, journal }, task: attach(task, parent),
    ...(children ? { childTasks: children.map((child, index) => attach(child, childEntries[index])) } : {}) };
}

export async function respondWithWorkforceExecution(req, res, statusCode, payload) {
  let response = payload;
  try { response = await recordWorkforceExecution(req, payload, statusCode); }
  catch { /* The established execution result must survive any diagnostic failure. */ }
  return res.status(statusCode).json(response);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = new Set(["registry", "legacy_handler", "nova_worker", "manager_delegation"]);
function uuidOrNull(value) { return typeof value === "string" && UUID.test(value) ? value : null; }
function isoOrNull(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
export async function listWorkforceExecutionHistory({ env = process.env, request = supabaseJarvisRequest, limit = 30, persistence = defaultPersistence(env) } = {}) {
  if (persistence !== "enabled") return { available: false, status: persistence === "not_configured" ? "not_configured" : "disabled", entries: [] };
  const count = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 30)));
  try {
    const rows = await request("/rest/v1/jarvis_tasks?type=eq.workforce-agent-execution&select=id,status,created_at,finished_at,payload,jarvis_agent_runs(id,status,duration_ms)&order=created_at.desc&limit=" + count,
      { method: "GET", signal: AbortSignal.timeout(3000) }, env);
    if (!Array.isArray(rows)) throw Error("history_read_unconfirmed");
    const entries = rows.slice(0, count).flatMap(row => {
      const metadata = object(row?.payload);
      const taskId = uuidOrNull(row?.id);
      const agentId = canonicalAgent(metadata.agentId);
      if (metadata.version !== RUNTIME_VERSION || !taskId || !agentId) return [];
      const run = Array.isArray(row.jarvis_agent_runs) ? row.jarvis_agent_runs.find(item => uuidOrNull(item?.id)) : null;
      return [{
        taskId, runId: uuidOrNull(run?.id), agentId, parentTaskId: uuidOrNull(metadata.parentRuntimeTaskId),
        origin: ORIGINS.has(metadata.origin) ? metadata.origin : "unknown",
        status: ["completed", "failed", "cancelled"].includes(row.status) ? row.status : "unknown",
        taskState: TASK_STATES.has(metadata.taskState) ? metadata.taskState : "unknown",
        resultState: RESULT_STATES.has(metadata.resultState) ? metadata.resultState : null,
        provider: PROVIDERS.has(metadata.provider) ? metadata.provider : null,
        model: safeModel(metadata.model), durationMs: duration(run?.duration_ms),
        createdAt: isoOrNull(row.created_at), finishedAt: isoOrNull(row.finished_at),
        journal: run ? "recorded" : "partial",
      }];
    });
    return { available: true, status: "online", entries };
  } catch {
    return { available: false, status: "unverified", entries: [] };
  }
}
