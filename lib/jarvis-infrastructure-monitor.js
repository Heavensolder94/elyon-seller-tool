import { redisCommand } from "./jarvis-system-telemetry-store.js";
import { supabaseJarvisRequest } from "./jarvis-memory-store.js";

export const INFRA_KEY = "elyon:jarvis:infrastructure-health:v1";
export const INTERVAL_SECONDS = 6 * 60 * 60;
const LOCK_KEY = INFRA_KEY + ":interval";
const CF_RUNTIME_URL = "https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/runtime/health";
const TABLES = ["jarvis_memory", "jarvis_working_memory", "jarvis_tasks", "jarvis_agent_runs"];
const BEGIN = `
local previous = tonumber(redis.call("HGET", KEYS[1], "lastCronMs") or "0")
local now = tonumber(ARGV[1])
if now >= previous then
  redis.call("HSET", KEYS[1], "lastCronMs", ARGV[1], "lastCronOk", ARGV[2])
end
if ARGV[2] == "1" then
  local success = tonumber(redis.call("HGET", KEYS[1], "lastSuccessMs") or "0")
  if now >= success then redis.call("HSET", KEYS[1], "lastSuccessMs", ARGV[1]) end
end
if redis.call("SET", KEYS[2], ARGV[1], "NX", "EX", ARGV[3]) then return 1 end
return 0
`;
const FINISH = `
if redis.call("GET", KEYS[2]) ~= ARGV[1] then return 0 end
redis.call("HSET", KEYS[1], "lastCheckMs", ARGV[1], "checks", ARGV[2])
return 1
`;

function resultOf(response) {
  if (!response?.configured || !response.data || response.data.error || !Object.hasOwn(response.data, "result")) {
    throw new Error("infrastructure_redis_unavailable");
  }
  return response.data.result;
}

function statusCode(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? "http_" + status :
    error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "unreachable";
}

async function checkSupabase(env, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: "not_configured", stores: {} };
  }
  const results = await Promise.all(TABLES.map(async table => {
    try {
      const rows = await request("/rest/v1/" + table + "?select=id&limit=1", {
        method: "GET", signal: AbortSignal.timeout(4000),
      }, env);
      return [table, Array.isArray(rows) ? "online" : "invalid_response"];
    } catch (error) { return [table, statusCode(error)]; }
  }));
  const stores = Object.fromEntries(results);
  return { status: results.every(([, state]) => state === "online") ? "online" : "degraded", stores };
}

export const WORKFORCE_DB_BUDGET_BYTES = 500_000_000;
const RETENTION_DAYS = 90;

function sanitizeStorageInventory(raw, fresh = true) {
  const valid = value => Number.isSafeInteger(value) && value >= 0;
  if (!raw || raw.retentionDays !== RETENTION_DAYS ||
      !["databaseBytes", "taskTableBytes", "runTableBytes", "archiveCandidates"].every(key => valid(raw[key])) ||
      raw.databaseBytes === 0) {
    return { status: "unverified", retentionDays: RETENTION_DAYS, limitBytes: WORKFORCE_DB_BUDGET_BYTES };
  }
  const usagePercent = raw.databaseBytes / WORKFORCE_DB_BUDGET_BYTES * 100;
  return { status: !fresh ? "unverified" : usagePercent >= 85 ? "critical" : usagePercent >= 70 ? "warning" : "online",
    databaseBytes: raw.databaseBytes, taskTableBytes: raw.taskTableBytes, runTableBytes: raw.runTableBytes,
    archiveCandidates: raw.archiveCandidates, retentionDays: RETENTION_DAYS, limitBytes: WORKFORCE_DB_BUDGET_BYTES,
    usagePercent: Math.round(usagePercent * 100) / 100, stale: !fresh };
}

async function checkStorageInventory(env, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return sanitizeStorageInventory(null);
  try {
    const raw = await request("/rest/v1/rpc/jarvis_workforce_storage_health", {
      method: "POST", body: "{}", signal: AbortSignal.timeout(4000),
    }, env);
    return sanitizeStorageInventory(raw);
  } catch {
    // Older deployments may not have applied the migration yet.
    return sanitizeStorageInventory(null);
  }
}

async function checkCloudflare(fetchImpl) {
  try {
    const response = await fetchImpl(CF_RUNTIME_URL, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { status: "degraded", reason: statusCode({ status: response.status }) };
    const body = await response.json();
    if (body?.ok !== true || body?.service !== "jarvis-task-runtime") {
      return { status: "degraded", reason: "invalid_response" };
    }
    return body.queue === "configured" ? { status: "online", queue: "configured" } :
      { status: "degraded", reason: "queue_not_confirmed" };
  } catch (error) { return { status: "degraded", reason: statusCode(error) }; }
}

// Called only after the authenticated cron handler has attempted its existing worker.
// A failed monitor must never turn a successful worker result into a retry.
export async function recordInfrastructureCycle({
  env = process.env, nowMs = Date.now(), workerOk = false,
  command = redisCommand, request = supabaseJarvisRequest, fetchImpl = fetch,
} = {}) {
  const options = { env };
  try {
    const due = resultOf(await command(["EVAL", BEGIN, "2", INFRA_KEY, LOCK_KEY,
      String(nowMs), workerOk ? "1" : "0", String(INTERVAL_SECONDS)], options));
    if (due === 0) return { ok: true, checked: false, reason: "interval_not_due" };
    if (due !== 1) throw new Error("invalid_interval_result");
    const [supabase, cloudflare, storage] = await Promise.all([checkSupabase(env, request), checkCloudflare(fetchImpl), checkStorageInventory(env, request)]);
    const checks = { supabase, cloudflare, storage, redis: { status: "online" } };
    const saved = resultOf(await command(["EVAL", FINISH, "2", INFRA_KEY, LOCK_KEY, String(nowMs), JSON.stringify(checks)], options));
    return saved === 1 ? { ok: true, checked: true } : { ok: false, checked: false, reason: "monitor_lease_lost" };
  } catch {
    return { ok: false, checked: false, reason: "monitor_storage_unavailable" };
  }
}

function safeTime(value, nowMs) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 && ms <= nowMs + 60000 ? ms : null;
}

const allowedState = value => ["online", "degraded", "not_configured"].includes(value) ? value : "unverified";
const allowedReason = value => typeof value === "string" && /^(?:online|invalid_response|unreachable|timeout|queue_not_confirmed|http_[45][0-9]{2})$/.test(value) ? value : null;

export async function readInfrastructureStatus({ env = process.env, nowMs = Date.now(), command = redisCommand } = {}) {
  try {
    const row = resultOf(await command(["HMGET", INFRA_KEY, "lastCronMs", "lastCronOk", "lastSuccessMs", "lastCheckMs", "checks"], { env }));
    if (!Array.isArray(row) || row.length !== 5) throw Error("invalid_monitor_state");
    const lastCronMs = safeTime(row[0], nowMs);
    const lastSuccessMs = safeTime(row[2], nowMs);
    const lastCheckMs = safeTime(row[3], nowMs);
    const raw = row[4] ? (typeof row[4] === "string" ? JSON.parse(row[4]) : row[4]) : {};
    const fresh = lastCheckMs !== null && nowMs - lastCheckMs <= (INTERVAL_SECONDS + 3600) * 1000;
    const checked = Object.fromEntries(["supabase", "cloudflare", "redis"].map(key => [key, {
      status: fresh ? allowedState(raw?.[key]?.status) : "unverified",
      lastStatus: allowedState(raw?.[key]?.status),
      ...(key === "cloudflare" ? { reason: allowedReason(raw?.cloudflare?.reason), queue: raw?.cloudflare?.queue === "configured" ? "configured" : null } : {}),
      ...(key === "supabase" ? { stores: Object.fromEntries(TABLES.map(table => [table, allowedReason(raw?.supabase?.stores?.[table])])) } : {}),
    }]));
    const cronFresh = lastCronMs !== null && nowMs - lastCronMs <= 15 * 60 * 1000;
    return {
      available: true,
      intervalHours: 6,
      cron: { status: !cronFresh ? "unverified" : String(row[1]) === "1" ? "online" : "degraded",
        lastRunAt: lastCronMs === null ? null : new Date(lastCronMs).toISOString(),
        lastSuccessAt: lastSuccessMs === null ? null : new Date(lastSuccessMs).toISOString() },
      lastCheckedAt: lastCheckMs === null ? null : new Date(lastCheckMs).toISOString(),
      stale: !fresh,
      checks: { ...checked, storage: sanitizeStorageInventory(raw?.storage, fresh) },
    };
  } catch {
    return { available: false, intervalHours: 6, cron: { status: "unverified", lastRunAt: null, lastSuccessAt: null }, lastCheckedAt: null, stale: true, checks: {}, error: "monitor_storage_unavailable" };
  }
}
