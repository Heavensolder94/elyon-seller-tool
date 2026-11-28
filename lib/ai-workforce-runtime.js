import { randomUUID, createHash, randomBytes, hkdfSync, createCipheriv, createDecipheriv } from "node:crypto";
import { AGENT_STRUCTURE, canonicalV2AgentId } from "./ai-workforce-structure-v2.js";
import { supabaseJarvisRequest } from "./jarvis-memory-store.js";
import { JARVIS_NOVA_LOCAL_ONLY } from "./elyon-jarvis-e5-v2-policy.js";

// Server-only request markers. Never derived from request body or headers.
export const WORKFORCE_REGISTRY_REQUEST = Symbol("workforce_registry_request");
export const WORKFORCE_DELEGATED_REQUEST = Symbol("workforce_delegated_request");
const WORKFORCE_MANAGED_REQUEST = Symbol("workforce_managed_request");
const WORKFORCE_CLAIM = Symbol("workforce_claim");
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
  return req?.[WORKFORCE_CLAIM]?.queued === true ? "manual_queue" : req?.[JARVIS_NOVA_LOCAL_ONLY] === true ? "nova_worker" :
    req?.[WORKFORCE_REGISTRY_REQUEST] === true ? "registry" : "legacy_handler";
}
function executionStatus(task, httpOk) {
  if (!httpOk || task.status === "failed") return "failed";
  if (task.status === "cancelled") return "cancelled";
  return "completed"; // Analysis completed; never implies product/listing approval.
}
function makeEntry(task, { requestOrigin, parentId, now, httpOk, uuid, claim = null }) {
  const agentId = canonicalAgent(task.agentId);
  if (!agentId) return null;
  const taskId = claim?.taskId || uuid();
  const runId = claim?.runId || uuid();
  const status = executionStatus(task, httpOk);
  const taskState = TASK_STATES.has(task.status) ? task.status : "unknown";
  const resultState = RESULT_STATES.has(task.result?.status) ? task.result.status : null;
  const provider = PROVIDERS.has(task.provider) ? task.provider : null;
  const model = safeModel(task.model);
  const metadata = { version: RUNTIME_VERSION, origin: requestOrigin, agentId, parentRuntimeTaskId: parentId,
    legacyTaskFingerprint: fingerprint(task.id), sourceFingerprint: fingerprint(task.sourceId),
    taskState, resultState, provider, model, retryOf: claim?.retryOf || null, retryDepth: claim?.retryDepth || 0,
    ...(claim?.queued ? { queueEnvelope: claim.queueEnvelope, queueType: claim.queueType, priority: claim.priority } : {}) };
  const error = status === "failed" ? "agent_execution_failed" : null;
  const row = { id: taskId, type: "workforce-agent-execution", status, payload: metadata,
    output: { taskState, resultState, manualReviewRequired: true }, progress: status === "completed" ? 100 : 0,
    error, created_at: claim?.startedAt || now, updated_at: now, finished_at: now };
  const run = { id: runId, task_id: taskId, agent_name: agentId, status, input: { origin: requestOrigin, parentRuntimeTaskId: parentId },
    output: { taskState, resultState, manualReviewRequired: true }, error, duration_ms: duration(task.durationMs),
    model, cost: null, created_at: claim?.startedAt || now, finished_at: now };
  return { row, run, runtime: { version: RUNTIME_VERSION, taskId, runId, agentId, origin: requestOrigin, parentTaskId: parentId, retryOf: claim?.retryOf || null, retryDepth: claim?.retryDepth || 0 } };
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

// The existing runners retain their execution paths. This records completed
// attempts, not a second runnable queue. Legacy IDs and approval states stay intact.
export async function recordWorkforceExecution(req, payload, statusCode, {
  env = process.env, request = supabaseJarvisRequest, persistence = defaultPersistence(env),
  nowMs = Date.now(), uuid = randomUUID,
} = {}) {
  if (req?.[WORKFORCE_DELEGATED_REQUEST] === true || !payload?.task || payload.runtime) return payload;
  const task = object(payload.task);
  const now = new Date(nowMs).toISOString();
  const claim = req?.[WORKFORCE_CLAIM] || null;
  const parent = makeEntry(task, { requestOrigin: origin(req), parentId: null, now, httpOk: statusCode >= 200 && statusCode < 300 && payload.ok === true, uuid, claim });
  if (!parent) return payload;
  const children = Array.isArray(payload.childTasks) ? payload.childTasks : null;
  const childEntries = (children || []).map(child => makeEntry(object(child), {
    requestOrigin: "manager_delegation", parentId: parent.row.id, now, httpOk: true, uuid,
  }));
  const entries = [parent, ...childEntries.filter(Boolean)];
  let journal = persistence === "enabled" ? "unconfirmed" : persistence === "not_configured" ? "not_configured" : "disabled";
  if (persistence === "enabled") {
    try {
      if (claim) {
        const { id, created_at, ...patch } = parent.row;
        const rows = await request("/rest/v1/jarvis_tasks?id=eq." + id + "&status=eq.running&select=id", {
          method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch), signal: AbortSignal.timeout(3000),
        }, env);
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== id) throw Error("claim_completion_unconfirmed");
        journal = "partial";
        if (entries.length > 1) await insertRows("/rest/v1/jarvis_tasks", entries.slice(1).map(entry => entry.row), env, request);
      } else await insertRows("/rest/v1/jarvis_tasks", entries.map(entry => entry.row), env, request);
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
  if (req?.[WORKFORCE_MANAGED_REQUEST] === true) return res.status(statusCode).json(payload);
  let response = payload;
  try { response = await recordWorkforceExecution(req, payload, statusCode); }
  catch { /* The established execution result must survive any diagnostic failure. */ }
  return res.status(statusCode).json(response);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = new Set(["registry", "legacy_handler", "nova_worker", "manager_delegation", "manual_queue"]);
function uuidOrNull(value) { return typeof value === "string" && UUID.test(value) ? value : null; }
function isoOrNull(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
export async function listWorkforceExecutionHistory({ env = process.env, request = supabaseJarvisRequest, limit = 30, persistence = defaultPersistence(env), nowMs = Date.now() } = {}) {
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
        retryOf: uuidOrNull(metadata.retryOf), retryDepth: Number.isInteger(metadata.retryDepth) && metadata.retryDepth >= 0 && metadata.retryDepth <= 2 ? metadata.retryDepth : 0,
        status: row.status === "queued" && metadata.origin === "manual_queue" ? "awaiting_manual_start" : row.status === "running" ? (Date.parse(row.created_at) + 15 * 60_000 < nowMs ? "interrupted_unconfirmed" : "running") : ["completed", "failed", "cancelled"].includes(row.status) ? row.status : "unknown",
        taskState: TASK_STATES.has(metadata.taskState) ? metadata.taskState : "unknown",
        resultState: RESULT_STATES.has(metadata.resultState) ? metadata.resultState : null,
        provider: PROVIDERS.has(metadata.provider) ? metadata.provider : null,
        model: safeModel(metadata.model), durationMs: duration(run?.duration_ms),
        createdAt: isoOrNull(row.created_at), finishedAt: isoOrNull(row.finished_at),
        journal: row.status === "queued" && metadata.origin === "manual_queue" ? "queued" : row.status === "running" ? "in_progress" : run ? "recorded" : "partial",
      }];
    });
    return { available: true, status: "online", entries };
  } catch {
    return { available: false, status: "unverified", entries: [] };
  }
}


// An explicit opaque request key claims a single execution globally within this
// single-seller runtime. Repeated requests never replay or return private output.
// The primary key is the atomic uniqueness boundary; no new SQL schema needed.
function requestKey(req) {
  const raw = req?.headers?.["idempotency-key"];
  if (raw === undefined) return { key: null, valid: true };
  return typeof raw === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(raw) ?
    { key: raw, valid: true } : { key: null, valid: false };
}
function keyedTaskId(key) {
  const h = createHash("sha256").update("elyon-workforce-runtime:v1:" + key).digest("hex");
  return h.slice(0,8) + "-" + h.slice(8,12) + "-5" + h.slice(13,16) + "-a" + h.slice(17,20) + "-" + h.slice(20,32);
}

export async function runClaimedRegistryExecution(req, res, agentId, handler, {
  env = process.env, request = supabaseJarvisRequest, persistence = defaultPersistence(env),
  nowMs = Date.now(), uuid = randomUUID,
} = {}) {
  const requested = requestKey(req);
  const queuedHeader = req?.headers?.["x-elyon-queued-task"];
  const queuedId = uuidOrNull(queuedHeader)?.toLowerCase() || null;
  const retryHeader = req?.headers?.["x-elyon-retry-of"];
  const retryOf = uuidOrNull(retryHeader)?.toLowerCase() || null;
  if (queuedHeader !== undefined && (!queuedId || !requested.key || retryHeader !== undefined || req?.[JARVIS_NOVA_LOCAL_ONLY] === true)) return res.status(400).json({ ok: false, error: "runtime_queue_reference_invalid" });
  if (retryHeader !== undefined && (!retryOf || !requested.key)) return res.status(400).json({ ok: false, error: "runtime_retry_reference_invalid" });
  if (!requested.valid) return res.status(400).json({ ok: false, error: "invalid_idempotency_key" });
  if (persistence !== "enabled") {
    if (requested.key) return res.status(503).json({ ok: false, error: "runtime_claim_unavailable" });
    return handler(req, res);
  }
  const canonical = canonicalAgent(agentId);
  if (!canonical) return requested.key ? res.status(400).json({ ok: false, error: "runtime_agent_invalid" }) : handler(req, res);
  let retryDepth = 0;
  if (retryOf) {
    if (canonical === "elyon-manager" || origin(req) === "nova_worker") return res.status(409).json({ ok: false, error: "runtime_retry_not_allowed" });
    let prior;
    try {
      const rows = await request("/rest/v1/jarvis_tasks?id=eq." + retryOf + "&type=eq.workforce-agent-execution&select=id,status,payload,jarvis_agent_runs(id,status)", { method: "GET", signal: AbortSignal.timeout(3000) }, env);
      prior = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    } catch { return res.status(503).json({ ok: false, error: "runtime_retry_unverified" }); }
    const meta = object(prior?.payload);
    const depth = meta.retryDepth === undefined ? 0 : meta.retryDepth;
    if (prior?.id !== retryOf || prior.status !== "failed" || meta.version !== RUNTIME_VERSION ||
        canonicalAgent(meta.agentId) !== canonical || !["legacy_handler", "registry", "manual_queue"].includes(meta.origin) ||
        !Number.isInteger(depth) || depth < 0 || depth >= 2 ||
        !Array.isArray(prior.jarvis_agent_runs) || !prior.jarvis_agent_runs.some(run => run.status === "failed" && uuidOrNull(run.id))) {
      return res.status(409).json({ ok: false, error: "runtime_retry_not_allowed", message: "Nur bestätigte fehlgeschlagene Einzelaufträge dürfen erneut gestartet werden (maximal zwei Wiederholungen)." });
    }
    retryDepth = depth + 1;
  }
  // A failed attempt has at most one successor, regardless of competing request keys.
  const claim = { taskId: queuedId || (retryOf ? keyedTaskId("retry:" + retryOf) : requested.key ? keyedTaskId(requested.key) : uuid()), runId: uuid(), startedAt: new Date(nowMs).toISOString(), retryOf, retryDepth };
  const row = { id: claim.taskId, type: "workforce-agent-execution", status: "running",
    payload: { version: RUNTIME_VERSION, origin: origin(req), agentId: canonical, parentRuntimeTaskId: null, taskState: "analyzing", retryOf, retryDepth },
    progress: 0, created_at: claim.startedAt, started_at: claim.startedAt, updated_at: claim.startedAt };
  try {
    if (queuedId) {
      const prior = await readManualQueueRow(queuedId, { env, request });
      const meta = object(prior?.payload);
      const stored = openQueueEnvelope(meta.queueEnvelope, queuedId, canonical, env);
      if (prior?.status !== "queued" || meta.origin !== "manual_queue" || meta.version !== RUNTIME_VERSION ||
          canonicalAgent(meta.agentId) !== canonical || !stored || req.body?.title !== stored.title || req.body?.taskPrompt !== stored.description) {
        return res.status(409).json({ ok: false, error: "runtime_queue_not_startable", message: "Auftrag bereits bearbeitet oder Auftragsdaten stimmen nicht überein." });
      }
      Object.assign(claim, { queued: true, queueEnvelope: sealQueueEnvelope({ title: stored.title, description: "" }, queuedId, canonical, env), queueType: meta.queueType, priority: meta.priority });
      const rows = await request("/rest/v1/jarvis_tasks?id=eq." + queuedId + "&type=eq.workforce-agent-execution&status=eq.queued&select=id", {
        method: "PATCH", headers: { Prefer: "return=representation" }, signal: AbortSignal.timeout(3000),
        body: JSON.stringify({ status: "running", started_at: claim.startedAt, updated_at: claim.startedAt, payload: { ...meta, taskState: "analyzing" } }),
      }, env);
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== queuedId) return res.status(409).json({ ok: false, error: "runtime_queue_not_startable" });
    } else await insertRows("/rest/v1/jarvis_tasks", [row], env, request);
  } catch {
    if (queuedId) return res.status(503).json({ ok: false, error: "runtime_queue_claim_unverified" });
    if (requested.key) {
      // An uncertain write is not permission to run. Query only the deterministic ID.
      try {
        const rows = await request("/rest/v1/jarvis_tasks?id=eq." + claim.taskId + "&type=eq.workforce-agent-execution&select=id,status", { method: "GET", signal: AbortSignal.timeout(3000) }, env);
        if (Array.isArray(rows) && rows.some(existing => existing?.id === claim.taskId)) {
          return res.status(409).json({ ok: false, error: "runtime_execution_already_claimed", runtime: { taskId: claim.taskId, journal: "existing" }, message: "Auftrag bereits registriert. Status prüfen; keine automatische Wiederholung." });
        }
      } catch { /* Do not dispatch an uncertain keyed request. */ }
      return res.status(503).json({ ok: false, error: "runtime_claim_unavailable" });
    }
    // Legacy/unkeyed requests retain existing availability and cost controls.
    return handler(req, res);
  }

  req[WORKFORCE_CLAIM] = claim;
  req[WORKFORCE_MANAGED_REQUEST] = true;
  let status = 200;
  let payload;
  const capture = {
    status(code) { status = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; },
    setHeader(...args) { res.setHeader(...args); return this; },
  };
  try {
    await handler(req, capture);
  } catch {
    status = 500;
    payload = { ok: false, error: "runtime_execution_failed" };
  }
  if (!payload || typeof payload !== "object") {
    status = 500;
    payload = { ok: false, error: "runtime_response_missing" };
  }
  const hasTask = Boolean(payload.task && canonicalAgent(payload.task.agentId) === canonical);
  const journalInput = hasTask ? payload : { ok: false, task: { agentId: canonical, status: "failed" } };
  try {
    const recorded = await recordWorkforceExecution(req, journalInput, hasTask ? status : 500, { env, request, persistence, uuid });
    payload = hasTask ? recorded : { ...payload, runtime: recorded.runtime };
  } catch {
    payload = { ...payload, runtime: { version: RUNTIME_VERSION, taskId: claim.taskId, runId: claim.runId, agentId: canonical, journal: "unconfirmed" } };
  }
  return res.status(status).json(payload);
}


// Direct compatibility routes retain their existing request validation and
// provider settings, but use the same claim/journal as the registry.
// A registry or manager delegation already owns the execution boundary.
export function runDirectWorkforceExecution(req, res, agentId, handler, options) {
  if (req?.[WORKFORCE_REGISTRY_REQUEST] === true || req?.[WORKFORCE_DELEGATED_REQUEST] === true || req?.[WORKFORCE_MANAGED_REQUEST] === true) {
    return handler(req, res);
  }
  return runClaimedRegistryExecution(req, res, agentId, handler, options);
}


const QUEUE_TYPES = new Set(["product_analysis","listing_review","margin_check","customer_reply_draft","supplier_check","research","seo_audit","risk_audit","support_summary","operations_check"]);
const QUEUE_PRIORITIES = new Set(["low","medium","normal","high","critical"]);
const queueText = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const secretLike = value => /(?:\b(?:sk[-_]|ghp_|github_pat_|sb_secret_|xox[baprs]-)[a-z0-9_-]{8,}|\beyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}|(?:password|passwort|api.?key|access.?token|authorization)\s*[:=]\s*\S+)/i.test(value);
// Protect free-text drafts from other legacy task readers. Domain-separated key
// derivation uses the existing server-only secret; rotation requires a migration.
function queueEncryptionKey(env) {
  if (typeof env.SUPABASE_SERVICE_ROLE_KEY !== "string" || !env.SUPABASE_SERVICE_ROLE_KEY.trim()) throw Error("queue_key_unavailable");
  return hkdfSync("sha256", env.SUPABASE_SERVICE_ROLE_KEY, "elyon-workforce", "manual-queue-envelope-v1", 32);
}
function sealQueueEnvelope(value,id,agentId,env) {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",queueEncryptionKey(env),iv);
  cipher.setAAD(Buffer.from(id+":"+agentId));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return {version:1,iv:iv.toString("base64url"),tag:cipher.getAuthTag().toString("base64url"),data:ciphertext.toString("base64url")};
}
function openQueueEnvelope(value,id,agentId,env) {
  try {
    if(value?.version!==1 || typeof value.data!=="string" || value.data.length>20000) return null;
    const decipher=createDecipheriv("aes-256-gcm",queueEncryptionKey(env),Buffer.from(value.iv,"base64url"));
    decipher.setAAD(Buffer.from(id+":"+agentId));
    decipher.setAuthTag(Buffer.from(value.tag,"base64url"));
    const decoded=JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,"base64url")),decipher.final()]).toString("utf8"));
    return {title:queueText(decoded.title,200),description:queueText(decoded.description,2000)};
  } catch { return null; }
}
function manualQueueEntry(row,env) {
  const p = object(row?.payload);
  if (!uuidOrNull(row?.id) || p.version !== RUNTIME_VERSION || p.origin !== "manual_queue" || !canonicalAgent(p.agentId) ||
      !["queued","running","completed","failed","cancelled"].includes(row.status)) return null;
  const decoded=openQueueEnvelope(p.queueEnvelope,row.id,canonicalAgent(p.agentId),env);
  return { id: row.id, agentId: canonicalAgent(p.agentId), title: decoded?.title || "Auftragsdaten nicht lesbar",
    description: row.status === "queued" ? decoded?.description || "" : "",
    type: QUEUE_TYPES.has(p.queueType) ? p.queueType : "research", priority: QUEUE_PRIORITIES.has(p.priority) ? p.priority : "medium",
    status: row.status, createdAt: isoOrNull(row.created_at), updatedAt: isoOrNull(row.updated_at),
    executionMode: "manual_start", serverConfirmed: true, startable: row.status === "queued" && Boolean(decoded?.title && decoded?.description) };
}
async function readManualQueueRow(id, { env, request }) {
  const rows = await request("/rest/v1/jarvis_tasks?id=eq." + id + "&type=eq.workforce-agent-execution&payload->>origin=eq.manual_queue&select=id,status,payload,created_at,updated_at", { method:"GET", signal:AbortSignal.timeout(3000) }, env);
  return Array.isArray(rows) && rows.length === 1 && rows[0]?.id === id ? rows[0] : null;
}
export async function manualWorkforceQueue(req, res, { env = process.env, request = supabaseJarvisRequest, persistence = defaultPersistence(env), nowMs = Date.now() } = {}) {
  if (persistence !== "enabled") return res.status(503).json({ ok:false,error:"runtime_queue_unavailable" });
  try {
    if (req.method === "GET") {
      const rows = await request("/rest/v1/jarvis_tasks?type=eq.workforce-agent-execution&payload->>origin=eq.manual_queue&select=id,status,payload,created_at,updated_at&order=created_at.desc&limit=50", { method:"GET",signal:AbortSignal.timeout(3000) }, env);
      if (!Array.isArray(rows)) throw Error("queue_read_unverified");
      return res.status(200).json({ ok:true,entries:rows.slice(0,50).map(row=>manualQueueEntry(row,env)).filter(Boolean), executionMode:"manual_start", limit:50 });
    }
    const body = object(req.body);
    if (req.method !== "POST") return res.status(405).json({ok:false,error:"method_not_allowed"});
    if (body.operation === "cancel") {
      const id = uuidOrNull(body.taskId)?.toLowerCase();
      if (!id) return res.status(400).json({ok:false,error:"runtime_queue_reference_invalid"});
      const prior = await readManualQueueRow(id,{env,request});
      if (!prior || prior.status !== "queued" || !manualQueueEntry(prior,env)) return res.status(409).json({ok:false,error:"runtime_queue_not_cancellable"});
      const now = new Date(nowMs).toISOString();
      const decoded=openQueueEnvelope(prior.payload.queueEnvelope,id,canonicalAgent(prior.payload.agentId),env);
      const metadata={...prior.payload,queueEnvelope:sealQueueEnvelope({title:decoded?.title || "Stornierter Auftrag",description:""},id,canonicalAgent(prior.payload.agentId),env)};
      const rows = await request("/rest/v1/jarvis_tasks?id=eq."+id+"&type=eq.workforce-agent-execution&status=eq.queued&select=id", {method:"PATCH",headers:{Prefer:"return=representation"},signal:AbortSignal.timeout(3000),body:JSON.stringify({status:"cancelled",payload:metadata,updated_at:now,finished_at:now})},env);
      if (!Array.isArray(rows)||rows.length!==1||rows[0]?.id!==id) return res.status(409).json({ok:false,error:"runtime_queue_not_cancellable"});
      return res.status(200).json({ok:true,task:manualQueueEntry({...prior,status:"cancelled",payload:metadata,updated_at:now},env)});
    }
    if (body.operation !== "create") return res.status(400).json({ok:false,error:"runtime_queue_operation_invalid"});
    const key = requestKey(req);
    const agentId = canonicalAgent(body.agentId);
    const title = queueText(body.title,200), prompt = queueText(body.description,2000);
    if (!key.valid || !key.key || !agentId || !title || !prompt || secretLike(title+" "+prompt) || !QUEUE_TYPES.has(body.type)||!QUEUE_PRIORITIES.has(body.priority)) return res.status(400).json({ok:false,error:"runtime_queue_input_invalid",message:"Mitarbeiter, Titel und Arbeitsauftrag ohne Zugangsdaten erforderlich."});
    const id = keyedTaskId("queue:"+key.key);
    const now = new Date(nowMs).toISOString();
    const row = {id,type:"workforce-agent-execution",status:"queued",progress:0,created_at:now,updated_at:now,payload:{version:RUNTIME_VERSION,origin:"manual_queue",agentId,queueEnvelope:sealQueueEnvelope({title,description:prompt},id,agentId,env),queueType:body.type,priority:body.priority,taskState:"queued"}};
    try { await insertRows("/rest/v1/jarvis_tasks",[row],env,request); }
    catch {
      const prior = await readManualQueueRow(id,{env,request});
      if (prior?.status==="queued" && prior.payload?.agentId===agentId && openQueueEnvelope(prior.payload?.queueEnvelope,id,agentId,env)?.title===title && openQueueEnvelope(prior.payload?.queueEnvelope,id,agentId,env)?.description===prompt && prior.payload?.queueType===body.type && prior.payload?.priority===body.priority) return res.status(200).json({ok:true,task:manualQueueEntry(prior,env)});
      return res.status(503).json({ok:false,error:"runtime_queue_write_unverified"});
    }
    return res.status(201).json({ok:true,task:manualQueueEntry(row,env)});
  } catch { return res.status(503).json({ok:false,error:"runtime_queue_unverified"}); }
}
