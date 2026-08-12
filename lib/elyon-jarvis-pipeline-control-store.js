import { getJarvisControlSnapshot } from "./elyon-jarvis-control-store.js";

const PIPELINE_CONTROL_KEY = "elyon:jarvis:pipeline-control:v1";
const DEFAULT_PIPELINE_CONTROL = Object.freeze({
  version: 1,
  enabled: false,
  updatedAt: "",
});

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
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
    const error = new Error("Persistenter Jarvis-Pipeline-Control-Speicher ist nicht konfiguriert.");
    error.code = "jarvis_pipeline_control_storage_unconfigured";
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
    error.code = "jarvis_pipeline_control_storage_failed";
    throw error;
  }
  return response.json().catch(() => null);
}

function redisResult(response) {
  return response && Object.prototype.hasOwnProperty.call(response, "result") ? response.result : null;
}

function parseStored(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function normalize(value = {}) {
  return {
    version: 1,
    enabled: value?.enabled === true,
    updatedAt: text(value?.updatedAt, 100),
  };
}

export async function getJarvisPipelineControl(options = {}) {
  const config = getRedisConfig(options.env || process.env);
  if (!config.url || !config.token) return { ...DEFAULT_PIPELINE_CONTROL };
  const stored = parseStored(redisResult(await redisCommand(["GET", PIPELINE_CONTROL_KEY], options)));
  return normalize(stored || DEFAULT_PIPELINE_CONTROL);
}

export async function saveJarvisPipelineControl(value = {}, options = {}) {
  const current = await getJarvisPipelineControl(options);
  const next = normalize({
    ...current,
    enabled: typeof value.enabled === "boolean" ? value.enabled : current.enabled,
    updatedAt: text(options.now, 100) || new Date().toISOString(),
  });
  const result = redisResult(await redisCommand(["SET", PIPELINE_CONTROL_KEY, JSON.stringify(next)], options));
  if (result !== "OK") throw new Error("Jarvis-Pipeline-Control konnte nicht gespeichert werden.");
  return next;
}

export async function getJarvisPipelineControlSnapshot(options = {}) {
  const [pipeline, e4] = await Promise.all([
    getJarvisPipelineControl(options),
    getJarvisControlSnapshot(options),
  ]);
  const mode = text(e4?.control?.mode, 30).toLowerCase() || "manual";
  const baseAllowed = pipeline.enabled === true &&
    e4?.decision?.allowed === true &&
    e4?.control?.killSwitch !== true &&
    e4?.control?.pausedByGuard !== true &&
    ["assisted", "autopilot"].includes(mode);
  const internalPipelineAllowed = baseAllowed;
  const ebayDraftAllowed = baseAllowed && mode === "autopilot";
  const reasons = [];
  if (!pipeline.enabled) reasons.push("full_product_pipeline_disabled");
  for (const reason of Array.isArray(e4?.decision?.reasons) ? e4.decision.reasons : []) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  if (baseAllowed && mode !== "autopilot") reasons.push("draft_requires_autopilot");

  return {
    phase: "E5",
    pipeline,
    control: {
      mode,
      killSwitch: e4?.control?.killSwitch === true,
      pausedByGuard: e4?.control?.pausedByGuard === true,
      state: text(e4?.decision?.state, 30) || "paused",
    },
    permissions: {
      internalPipelineAllowed,
      ebayDraftAllowed,
      livePublishingAllowed: false,
      supplierOrdersAllowed: false,
      customerMessagesAllowed: false,
      refundsAllowed: false,
      legalDataChangesAllowed: false,
    },
    reasons,
  };
}

export { DEFAULT_PIPELINE_CONTROL, PIPELINE_CONTROL_KEY };
