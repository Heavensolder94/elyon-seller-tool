const TELEMETRY_KEY = "elyon:jarvis:system-telemetry:v1";
const MAX_EVENTS = 200;

function text(value, max = 300) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getRedisConfig(env = process.env) {
  const pairs = [
    { source: "custom_upstash_backup", url: env.UPSTASH_BACKUP_URL, token: env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN },
  ];
  return pairs.find((pair) => pair.url && pair.token) || { source: "unconfigured", url: "", token: "" };
}

function redisResult(response) {
  return response && Object.prototype.hasOwnProperty.call(response, "result") ? response.result : null;
}

async function redisCommand(command, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getRedisConfig(env);
  if (!config.url || !config.token) return { configured: false, result: null };
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
    const error = new Error(`jarvis_system_telemetry_storage_http_${response.status}`);
    error.code = "jarvis_system_telemetry_storage_failed";
    error.status = response.status;
    throw error;
  }
  return { configured: true, data: await response.json().catch(() => null) };
}

function sanitizeAttempt(value = {}) {
  return {
    provider: text(value.provider, 40) || "unknown",
    model: text(value.model, 240) || null,
    ok: value.ok === true,
    error: text(value.error, 80) || null,
    errorType: text(value.errorType, 80) || null,
    status: Number.isInteger(value.status) ? value.status : null,
    retryAfterSeconds: finiteNumber(value.retryAfterSeconds),
  };
}

function sanitizeUsage(value = {}) {
  return {
    inputTokens: finiteNumber(value.inputTokens),
    outputTokens: finiteNumber(value.outputTokens),
    totalTokens: finiteNumber(value.totalTokens),
    cost: finiteNumber(value.cost),
  };
}

function sanitizeTelemetryEvent(value = {}) {
  const at = text(value.at, 100) || new Date().toISOString();
  return {
    version: 1,
    type: "brain_run",
    at,
    ok: value.ok === true,
    mode: value.ok === true ? "brain" : "brain_degraded",
    provider: text(value.provider, 40) || null,
    model: text(value.model, 240) || null,
    fallbackUsed: value.fallbackUsed === true,
    durationMs: Math.max(0, finiteNumber(value.durationMs) || 0),
    usage: sanitizeUsage(value.usage),
    attempts: Array.isArray(value.attempts) ? value.attempts.slice(0, 8).map(sanitizeAttempt) : [],
  };
}

async function recordJarvisSystemTelemetry(event = {}, options = {}) {
  const clean = sanitizeTelemetryEvent(event);
  const pushed = await redisCommand(["LPUSH", TELEMETRY_KEY, JSON.stringify(clean)], options);
  if (!pushed.configured) return { ok: false, reason: "storage_unconfigured" };
  await redisCommand(["LTRIM", TELEMETRY_KEY, "0", String(MAX_EVENTS - 1)], options);
  return { ok: true };
}

async function listJarvisSystemTelemetry({ limit = 100, ...options } = {}) {
  const safeLimit = Math.max(1, Math.min(MAX_EVENTS, Number(limit) || 100));
  const response = await redisCommand(["LRANGE", TELEMETRY_KEY, "0", String(safeLimit - 1)], options);
  if (!response.configured) return [];
  const rows = redisResult(response.data);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    try {
      return sanitizeTelemetryEvent(typeof row === "string" ? JSON.parse(row) : row);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function summarizeJarvisSystemTelemetry(events = [], { nowMs = Date.now(), windowMs = 24 * 60 * 60 * 1000 } = {}) {
  const from = nowMs - windowMs;
  const recent = events.filter((event) => {
    const at = Date.parse(event?.at || "");
    return Number.isFinite(at) && at >= from && at <= nowMs + 60_000;
  });
  const totals = recent.reduce((acc, event) => {
    acc.requests += 1;
    if (event?.fallbackUsed) acc.fallbacks += 1;
    if (event?.ok !== true) acc.errors += 1;
    if (Array.isArray(event?.attempts) && event.attempts.some((attempt) => attempt?.status === 429 || attempt?.error === "RATE_LIMIT")) acc.rateLimits += 1;
    for (const key of ["inputTokens", "outputTokens", "totalTokens"]) {
      const numeric = finiteNumber(event?.usage?.[key]);
      if (numeric !== null) acc[key] += numeric;
    }
    const cost = finiteNumber(event?.usage?.cost);
    if (cost !== null) {
      acc.cost += cost;
      acc.costSamples += 1;
    }
    return acc;
  }, { requests: 0, fallbacks: 0, errors: 0, rateLimits: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, costSamples: 0 });

  return {
    windowHours: Math.round(windowMs / 3_600_000),
    ...totals,
    cost: totals.costSamples > 0 ? totals.cost : null,
    latest: events[0] || null,
  };
}

export {
  MAX_EVENTS,
  TELEMETRY_KEY,
  getRedisConfig,
  listJarvisSystemTelemetry,
  recordJarvisSystemTelemetry,
  sanitizeTelemetryEvent,
  summarizeJarvisSystemTelemetry,
};
