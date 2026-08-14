import { requireSellerAccess } from "../lib/seller-access.js";
import { selectBrainAttempts } from "../lib/jarvis-brain.js";
import { supabaseJarvisRequest } from "../lib/jarvis-memory-store.js";
import { getJarvisPipelineControlSnapshot } from "../lib/elyon-jarvis-pipeline-control-store.js";
import { listJarvisSystemTelemetry, summarizeJarvisSystemTelemetry } from "../lib/jarvis-system-telemetry-store.js";

function text(value, max = 300) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function errorCode(error, fallback = "unavailable") {
  return text(error?.code || error?.message, 100).replace(/[^a-z0-9_.-]+/gi, "_").toLowerCase() || fallback;
}

function configuredProviders(env = process.env) {
  return {
    openrouter: Boolean(text(env.OPENROUTER_API_KEY, 4000)),
    deepseek: Boolean(text(env.DEEPSEEK_API_KEY, 4000)),
    openai: Boolean(text(env.OPENAI_API_KEY, 4000)),
  };
}

function latestProviderAttempt(events, provider) {
  for (const event of events) {
    const attempts = Array.isArray(event?.attempts) ? event.attempts : [];
    const attempt = attempts.find((item) => item?.provider === provider);
    if (attempt) return { ...attempt, at: event.at };
  }
  return null;
}

function providerStatus({ provider, configured, events }) {
  const lastAttempt = latestProviderAttempt(events, provider);
  let status = configured ? "configured" : "not_configured";
  if (configured && lastAttempt?.ok === true) status = "online";
  else if (configured && lastAttempt && lastAttempt.ok !== true) status = "degraded";
  return {
    provider,
    configured,
    status,
    lastAttempt,
  };
}

function normalizeRecentRun(row = {}) {
  return {
    id: text(row.id, 100),
    agentName: text(row.agent_name, 160),
    status: text(row.status, 50),
    model: text(row.model, 240) || null,
    cost: Number.isFinite(Number(row.cost)) ? Number(row.cost) : null,
    createdAt: text(row.created_at, 100),
    finishedAt: text(row.finished_at, 100) || null,
  };
}

function normalizeRecentTask(row = {}) {
  return {
    id: text(row.id, 100),
    type: text(row.type, 100),
    status: text(row.status, 50),
    progress: Number.isFinite(Number(row.progress)) ? Number(row.progress) : 0,
    updatedAt: text(row.updated_at, 100),
  };
}

async function readSupabaseSystemState({ env = process.env, request = supabaseJarvisRequest, nowMs = Date.now() } = {}) {
  const configured = Boolean(text(env.SUPABASE_URL, 1000) && text(env.SUPABASE_SERVICE_ROLE_KEY, 4000));
  if (!configured) {
    return {
      configured: false,
      online: false,
      longTermMemory: { online: false, latestUpdatedAt: null },
      workingMemory: { online: false, latestUpdatedAt: null },
      recentTasks: [],
      recentAgentRuns: [],
      agentUsage24h: { runs: 0, cost: null, sampled: false },
      error: "supabase_not_configured",
    };
  }

  const sinceIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const [memoryResult, workingResult, tasksResult, runsResult] = await Promise.allSettled([
    request("/rest/v1/jarvis_memory?select=id,updated_at&order=updated_at.desc&limit=1", { method: "GET" }, env),
    request("/rest/v1/jarvis_working_memory?select=id,updated_at&order=updated_at.desc&limit=1", { method: "GET" }, env),
    request("/rest/v1/jarvis_tasks?select=id,type,status,progress,updated_at&order=updated_at.desc&limit=20", { method: "GET" }, env),
    request(`/rest/v1/jarvis_agent_runs?select=id,agent_name,status,model,cost,created_at,finished_at&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=100`, { method: "GET" }, env),
  ]);

  const memoryRows = memoryResult.status === "fulfilled" && Array.isArray(memoryResult.value) ? memoryResult.value : [];
  const workingRows = workingResult.status === "fulfilled" && Array.isArray(workingResult.value) ? workingResult.value : [];
  const taskRows = tasksResult.status === "fulfilled" && Array.isArray(tasksResult.value) ? tasksResult.value : [];
  const runRows = runsResult.status === "fulfilled" && Array.isArray(runsResult.value) ? runsResult.value : [];
  const costs = runRows.map((row) => Number(row?.cost)).filter(Number.isFinite);

  const errors = [memoryResult, workingResult, tasksResult, runsResult]
    .filter((result) => result.status === "rejected")
    .map((result) => errorCode(result.reason));

  return {
    configured: true,
    online: memoryResult.status === "fulfilled" && workingResult.status === "fulfilled",
    longTermMemory: {
      online: memoryResult.status === "fulfilled",
      latestUpdatedAt: text(memoryRows[0]?.updated_at, 100) || null,
    },
    workingMemory: {
      online: workingResult.status === "fulfilled",
      latestUpdatedAt: text(workingRows[0]?.updated_at, 100) || null,
    },
    recentTasks: taskRows.map(normalizeRecentTask),
    recentAgentRuns: runRows.slice(0, 20).map(normalizeRecentRun),
    agentUsage24h: {
      runs: runRows.length,
      cost: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null,
      sampled: runRows.length >= 100,
    },
    error: errors[0] || null,
  };
}

async function buildJarvisSystemStatus({
  env = process.env,
  nowMs = Date.now(),
  telemetryReader = listJarvisSystemTelemetry,
  pipelineReader = getJarvisPipelineControlSnapshot,
  supabaseRequest = supabaseJarvisRequest,
} = {}) {
  const checkedAt = new Date(nowMs).toISOString();
  const [telemetryResult, memoryResult, e5Result] = await Promise.allSettled([
    telemetryReader({ limit: 200, env }),
    readSupabaseSystemState({ env, request: supabaseRequest, nowMs }),
    pipelineReader({ env, e5V2: true }),
  ]);

  const telemetry = telemetryResult.status === "fulfilled" && Array.isArray(telemetryResult.value) ? telemetryResult.value : [];
  const brainMetrics24h = summarizeJarvisSystemTelemetry(telemetry, { nowMs });
  const providerConfig = configuredProviders(env);
  const providers = ["openrouter", "deepseek", "openai"].map((provider) => providerStatus({
    provider,
    configured: providerConfig[provider],
    events: telemetry,
  }));
  const memory = memoryResult.status === "fulfilled"
    ? memoryResult.value
    : { configured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), online: false, longTermMemory: { online: false }, workingMemory: { online: false }, recentTasks: [], recentAgentRuns: [], agentUsage24h: { runs: 0, cost: null, sampled: false }, error: errorCode(memoryResult.reason) };
  const e5 = e5Result.status === "fulfilled" ? e5Result.value : null;
  const brainChain = selectBrainAttempts(env).map((attempt) => ({
    provider: attempt.provider,
    model: attempt.model || null,
  }));

  const brainConfigured = providers.some((provider) => provider.configured);
  const degraded = !brainConfigured || memory.online !== true || !e5 || brainMetrics24h.latest?.ok === false;

  return {
    ok: true,
    readOnly: true,
    checkedAt,
    status: degraded ? "degraded" : "healthy",
    brain: {
      configured: brainConfigured,
      chain: brainChain,
      lastRun: brainMetrics24h.latest,
      metrics24h: brainMetrics24h,
      telemetryAvailable: telemetryResult.status === "fulfilled",
      telemetryError: telemetryResult.status === "rejected" ? errorCode(telemetryResult.reason) : null,
    },
    providers,
    memory,
    e5: e5 ? {
      online: true,
      pipelineEnabled: e5?.pipeline?.enabled === true,
      mode: text(e5?.control?.mode, 30) || "manual",
      state: text(e5?.control?.state, 30) || "paused",
      killSwitch: e5?.control?.killSwitch === true,
      pausedByGuard: e5?.control?.pausedByGuard === true,
      permissions: e5?.permissions || {},
      reasons: Array.isArray(e5?.reasons) ? e5.reasons.slice(0, 10).map((reason) => text(reason, 120)).filter(Boolean) : [],
    } : {
      online: false,
      error: errorCode(e5Result.reason),
    },
    safety: {
      livePublishingAllowed: false,
      supplierOrdersAllowed: false,
      customerMessagesAllowed: false,
      refundsAllowed: false,
      legalDataChangesAllowed: false,
    },
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  if (String(req?.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const status = await buildJarvisSystemStatus();
  return res.status(200).json(status);
}

export {
  buildJarvisSystemStatus,
  configuredProviders,
  latestProviderAttempt,
  providerStatus,
  readSupabaseSystemState,
};
