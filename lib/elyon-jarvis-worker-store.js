import { randomUUID } from "node:crypto";
import {
  EVENT_PREFIX,
  JOB_INDEX_KEY,
  JOB_PREFIX,
  MAX_ATTEMPTS,
  scrubPayload,
} from "./elyon-jarvis-event-store.js";

const WORKER_SCOPE = "e3_company_os_nova";
const LEASE_PREFIX = "elyon:jarvis:job-lease:v1:";
const DEFAULT_LEASE_SECONDS = 120;
const MAX_SCAN = 100;
const HANDOFF_INDEX = "elyon:jarvis:handoff-due:v1";
const HANDOFF_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = Object.freeze([60_000, 5 * 60_000, 15 * 60_000]);

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getRedisConfig(env = process.env) {
  const pairs = [
    { source: "custom_upstash_backup", url: env.UPSTASH_BACKUP_URL, token: env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN },
  ];
  return pairs.find((pair) => pair.url && pair.token) || { source: "unconfigured", url: "", token: "" };
}

async function redisCommand(command, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getRedisConfig(env);
  if (!config.url || !config.token) {
    const error = new Error("Persistenter Jarvis-Worker-Speicher ist nicht konfiguriert.");
    error.code = "jarvis_worker_storage_unconfigured";
    throw error;
  }
  const response = await fetchImpl(config.url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    const error = new Error(`Redis REST ${response.status}`);
    error.code = "jarvis_worker_storage_failed";
    throw error;
  }
  return response.json().catch(() => null);
}

function redisResult(response) {
  return response && Object.prototype.hasOwnProperty.call(response, "result") ? response.result : null;
}

function parseStoredObject(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getStored(key, options = {}) {
  return parseStoredObject(redisResult(await redisCommand(["GET", key], options)));
}

async function setStored(key, value, options = {}) {
  const result = redisResult(await redisCommand(["SET", key, JSON.stringify(value)], options));
  if (result !== "OK") throw new Error("Jarvis-Worker-Datensatz konnte nicht gespeichert werden.");
  return value;
}

async function releaseLease(jobId, owner, options = {}) {
  const leaseKey = `${LEASE_PREFIX}${text(jobId, 120)}`;
  const current = text(redisResult(await redisCommand(["GET", leaseKey], options)), 200);
  if (current && current === text(owner, 200)) await redisCommand(["DEL", leaseKey], options);
}

function priorityRank(value) {
  return { high: 0, medium: 1, low: 2 }[text(value, 20).toLowerCase()] ?? 3;
}

function dueAt(job, nowMs) {
  const next = Date.parse(text(job?.nextRunAt, 100));
  return !Number.isFinite(next) || next <= nowMs;
}

export function isE3AutoInternalJob(job = {}) {
  return text(job.eventType, 120).toLowerCase() === "nova.product.created" &&
    text(job.source, 100).toLowerCase() === "company-os";
}

export async function armJarvisJobForWorker(job = {}, options = {}) {
  if (!isE3AutoInternalJob(job)) return { armed: false, job };
  const jobId = text(job.jobId, 120);
  if (!jobId) return { armed: false, job };
  const current = (await getStored(`${JOB_PREFIX}${jobId}`, options)) || job;
  const now = text(options.now, 100) || new Date().toISOString();
  const next = {
    ...current,
    executionPolicy: "auto_internal",
    autoExecute: true,
    workerScope: WORKER_SCOPE,
    updatedAt: now,
  };
  await setStored(`${JOB_PREFIX}${jobId}`, next, options);
  return { armed: true, job: next };
}

function isPendingHandoff(job = {}) {
  return isE3AutoInternalJob(job) && job.status === "SUCCESS" &&
    job.autoExecute === true && job.executionPolicy === "auto_internal" &&
    job.pipelineHandoff?.status === "PENDING";
}

// Persist the job and its due-index membership together, fenced by the active lease.
async function persistHandoffState(job, owner, options = {}) {
  const jobId = text(job.jobId, 120);
  const pending = isPendingHandoff(job);
  const script = `if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
if ARGV[3] == '1' then
  redis.call('ZADD', KEYS[3], ARGV[4], ARGV[5])
else
  redis.call('ZREM', KEYS[3], ARGV[5])
end
redis.call('DEL', KEYS[2])
return 1`;
  const result = redisResult(await redisCommand([
    "EVAL", script, 3, `${JOB_PREFIX}${jobId}`, `${LEASE_PREFIX}${jobId}`, HANDOFF_INDEX,
    owner, JSON.stringify(job), pending ? "1" : "0",
    String(Date.parse(job.pipelineHandoff?.nextRunAt || "") || Date.now()), jobId,
  ], options));
  if (Number(result) !== 1) throw Object.assign(new Error("Jarvis-Job-Lease nicht mehr gültig."), { code: "jarvis_worker_lease_lost" });
  return job;
}

export async function listDueJarvisWorkerJobs(options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 2) || 2));
  const nowMs = Date.parse(text(options.now, 100)) || Date.now();
  // The due index contains only references to existing jobs, not a second task store.
  // Pending handoffs are not lost when the recent-jobs display index is trimmed.
  const handoffIds = redisResult(await redisCommand(["ZRANGEBYSCORE", HANDOFF_INDEX, "-inf", nowMs, "LIMIT", 0, limit], options));
  const pendingIds = Array.isArray(handoffIds) ? handoffIds.map(id => text(id, 120)).filter(Boolean) : [];
  const pendingValues = pendingIds.length ? redisResult(await redisCommand(["MGET", ...pendingIds.map(id => `${JOB_PREFIX}${id}`)], options)) : [];
  const handoffs = (Array.isArray(pendingValues) ? pendingValues : []).map(parseStoredObject).filter(Boolean).filter(isPendingHandoff);
  if (handoffs.length >= limit) return handoffs.slice(0, limit);
  const ids = redisResult(await redisCommand(["ZREVRANGE", JOB_INDEX_KEY, 0, MAX_SCAN - 1], options));
  const jobIds = Array.isArray(ids) ? ids.map((id) => text(id, 120)).filter(Boolean) : [];
  if (!jobIds.length) return handoffs;
  const values = redisResult(await redisCommand(["MGET", ...jobIds.map((id) => `${JOB_PREFIX}${id}`)], options));
  const jobs = (Array.isArray(values) ? values : [])
    .map(parseStoredObject)
    .filter(Boolean)
    .filter((job) => isE3AutoInternalJob(job))
    .filter((job) => job.autoExecute === true && text(job.executionPolicy, 50) === "auto_internal")
    .filter((job) => ["QUEUED", "RETRYING"].includes(text(job.status, 50).toUpperCase()))
    .filter((job) => Number(job.attempts || 0) < Number(job.maxAttempts || MAX_ATTEMPTS))
    .filter((job) => dueAt(job, nowMs));

  jobs.sort((a, b) => {
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    if (priority) return priority;
    return (Date.parse(text(a.createdAt)) || 0) - (Date.parse(text(b.createdAt)) || 0);
  });
  return [...handoffs, ...jobs].slice(0, limit);
}

export async function claimJarvisWorkerJob(jobId, options = {}) {
  const normalizedId = text(jobId, 120);
  if (!normalizedId) return { claimed: false, reason: "missing_job_id" };
  const owner = text(options.owner, 200) || randomUUID();
  const leaseSeconds = Math.max(30, Math.min(300, Number(options.leaseSeconds || DEFAULT_LEASE_SECONDS) || DEFAULT_LEASE_SECONDS));
  const leaseKey = `${LEASE_PREFIX}${normalizedId}`;
  const lease = redisResult(await redisCommand(["SET", leaseKey, owner, "NX", "EX", leaseSeconds], options));
  if (lease !== "OK") return { claimed: false, reason: "already_leased" };

  try {
    const job = await getStored(`${JOB_PREFIX}${normalizedId}`, options);
    const now = text(options.now, 100) || new Date().toISOString();
    const nowMs = Date.parse(now) || Date.now();
    if (!job || !isE3AutoInternalJob(job) || job.autoExecute !== true || text(job.executionPolicy, 50) !== "auto_internal") {
      await releaseLease(normalizedId, owner, options);
      return { claimed: false, reason: "job_not_worker_eligible" };
    }
    if (isPendingHandoff(job)) {
      const due = Date.parse(job.pipelineHandoff.nextRunAt || "");
      if (!Number.isFinite(due) || due > nowMs) {
        await releaseLease(normalizedId, owner, options);
        return { claimed: false, reason: "handoff_not_due" };
      }
      const attempts = Number(job.pipelineHandoff.attempts || 0);
      const exhausted = attempts >= HANDOFF_MAX_ATTEMPTS;
      const next = {
        ...job,
        pipelineHandoff: { ...job.pipelineHandoff, attempts: exhausted ? attempts : attempts + 1, lastAttemptAt: now },
        leaseOwner: owner,
        leaseExpiresAt: new Date(nowMs + leaseSeconds * 1000).toISOString(),
        updatedAt: now,
      };
      await setStored(`${JOB_PREFIX}${normalizedId}`, next, options);
      return { claimed: true, owner, job: next, handoffOnly: true, handoffExhausted: exhausted };
    }
    if (!["QUEUED", "RETRYING"].includes(text(job.status, 50).toUpperCase()) || !dueAt(job, nowMs)) {
      await releaseLease(normalizedId, owner, options);
      return { claimed: false, reason: "job_not_due" };
    }
    if (Number(job.attempts || 0) >= Number(job.maxAttempts || MAX_ATTEMPTS)) {
      await releaseLease(normalizedId, owner, options);
      return { claimed: false, reason: "attempts_exhausted" };
    }

    const next = {
      ...job,
      status: "RUNNING",
      attempts: Number(job.attempts || 0) + 1,
      lastAttemptAt: now,
      leaseOwner: owner,
      leaseExpiresAt: new Date(nowMs + leaseSeconds * 1000).toISOString(),
      updatedAt: now,
    };
    await setStored(`${JOB_PREFIX}${normalizedId}`, next, options);
    return { claimed: true, owner, job: next };
  } catch (error) {
    await releaseLease(normalizedId, owner, options).catch(() => {});
    throw error;
  }
}

export async function getJarvisWorkerEvent(eventId, options = {}) {
  const normalizedId = text(eventId, 120);
  return normalizedId ? getStored(`${EVENT_PREFIX}${normalizedId}`, options) : null;
}

export function retryDelayMs(attempts) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attempts || 1) - 1));
  return RETRY_DELAYS_MS[index];
}

export async function finishJarvisWorkerJob(claim, outcome = {}, options = {}) {
  const jobId = text(claim?.job?.jobId, 120);
  const owner = text(claim?.owner, 200);
  if (!jobId || !owner) throw new Error("Ungültiger Jarvis-Worker-Claim.");
  const current = (await getStored(`${JOB_PREFIX}${jobId}`, options)) || claim.job;
  const now = text(options.now, 100) || new Date().toISOString();
  const nowMs = Date.parse(now) || Date.now();
  const attempts = Number(current.attempts || 0);
  const maxAttempts = Number(current.maxAttempts || MAX_ATTEMPTS);
  const blocked = outcome.blocked === true;
  const success = outcome.ok === true && !blocked;
  const retrying = !success && !blocked && attempts < maxAttempts;
  const status = success ? "SUCCESS" : blocked ? "BLOCKED" : retrying ? "RETRYING" : "FAILED";
  const nextRunAt = retrying ? new Date(nowMs + retryDelayMs(attempts)).toISOString() : "";
  const errorText = success ? "" : text(outcome.error || outcome.message, 2000);
  const next = {
    ...current,
    status,
    executionPolicy: "auto_internal",
    autoExecute: true,
    workerScope: WORKER_SCOPE,
    nextRunAt,
    lastError: errorText ? { message: errorText, at: now } : null,
    result: outcome.result ? scrubPayload(plainObject(outcome.result)) : current.result,
    completedAt: success || blocked || status === "FAILED" ? now : "",
    leaseOwner: "",
    leaseExpiresAt: "",
    updatedAt: now,
  };
  if (success && isE3AutoInternalJob(current) && current.autoExecute === true && text(current.eventId, 120)) {
    next.pipelineHandoff = { status: "PENDING", attempts: 0, maxAttempts: HANDOFF_MAX_ATTEMPTS, nextRunAt: now, lastError: null };
    return persistHandoffState(next, owner, options);
  }
  await setStored(`${JOB_PREFIX}${jobId}`, next, options);
  await releaseLease(jobId, owner, options);
  return next;
}

export async function finishJarvisPipelineHandoff(claim, outcome = {}, options = {}) {
  const job = claim?.job;
  const owner = text(claim?.owner, 200);
  if (!owner || !isPendingHandoff(job)) throw new Error("Ungültiger Jarvis-Pipeline-Claim.");
  const now = text(options.now, 100) || new Date().toISOString();
  const attempts = Number(job.pipelineHandoff.attempts || 0);
  const pipelineJobId = text(outcome.pipelineJobId, 200);
  const delivered = outcome.delivered === true && Boolean(pipelineJobId);
  const code = text(outcome.reason, 500) || "company_os_pipeline_start_unconfirmed";
  const http = Number(outcome.status || 0);
  const retryable = !claim.handoffExhausted && outcome.attempted === true &&
    outcome.skipped !== true && (http === 0 || http === 202 || http === 429 || http >= 500 ||
      code === "company_os_pipeline_start_pending" || code === "company_os_pipeline_start_unconfirmed");
  const retrying = !delivered && retryable && attempts < HANDOFF_MAX_ATTEMPTS;
  const next = {
    ...job,
    pipelineHandoff: {
      ...job.pipelineHandoff,
      status: delivered ? "DELIVERED" : retrying ? "PENDING" : "NEEDS_REVIEW",
      pipelineJobId: delivered ? pipelineJobId : "",
      lastError: delivered ? null : { code, at: now, httpStatus: http },
      nextRunAt: retrying ? new Date((Date.parse(now) || Date.now()) + retryDelayMs(attempts)).toISOString() : "",
      completedAt: delivered ? now : "",
    },
    leaseOwner: "",
    leaseExpiresAt: "",
    updatedAt: now,
  };
  return persistHandoffState(next, owner, options);
}

export {
  DEFAULT_LEASE_SECONDS,
  LEASE_PREFIX,
  RETRY_DELAYS_MS,
  WORKER_SCOPE,
  HANDOFF_INDEX,
  HANDOFF_MAX_ATTEMPTS,
  isPendingHandoff,
};
