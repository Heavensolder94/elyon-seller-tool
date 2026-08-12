const CONTROL_KEY = "elyon:jarvis:control:v1";
const USAGE_MONTH_PREFIX = "elyon:jarvis:usage:v1:month:";
const SLOT_HOUR_PREFIX = "elyon:jarvis:usage:v1:hour:";
const SLOT_DAY_PREFIX = "elyon:jarvis:usage:v1:day:";
const CONSECUTIVE_FAILURES_KEY = "elyon:jarvis:usage:v1:consecutive-failures";

const MODES = new Set(["manual", "assisted", "autopilot"]);

const DEFAULT_CONTROL = Object.freeze({
  version: 1,
  mode: "assisted",
  killSwitch: false,
  pausedByGuard: false,
  pausedReason: "",
  pausedAt: "",
  automations: {
    novaAutoReview: true,
  },
  limits: {
    maxJobsPerHour: 12,
    maxJobsPerDay: 50,
    maxTokensPerMonth: 2_000_000,
  },
  budget: {
    monthlyEur: 20,
    warnEur: 15,
    softEur: 18,
    hardEur: 20,
    reservePerJobEur: 0.75,
    requirePricingForAutonomy: true,
  },
  errorGuard: {
    maxConsecutiveFailures: 3,
    autoPause: true,
  },
  updatedAt: "",
});

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function int(value, fallback, min, max) {
  return Math.trunc(boundedNumber(value, fallback, min, max));
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
    const error = new Error("Persistenter Jarvis-Control-Speicher ist nicht konfiguriert.");
    error.code = "jarvis_control_storage_unconfigured";
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
    error.code = "jarvis_control_storage_failed";
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

function parseHash(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (!Array.isArray(raw)) return {};
  const output = {};
  for (let index = 0; index < raw.length; index += 2) {
    const key = text(raw[index], 120);
    if (key) output[key] = raw[index + 1];
  }
  return output;
}

function baseControl() {
  return {
    ...DEFAULT_CONTROL,
    automations: { ...DEFAULT_CONTROL.automations },
    limits: { ...DEFAULT_CONTROL.limits },
    budget: { ...DEFAULT_CONTROL.budget },
    errorGuard: { ...DEFAULT_CONTROL.errorGuard },
  };
}

export function normalizeJarvisControl(value = {}, existing = DEFAULT_CONTROL) {
  const source = plainObject(value);
  const previous = plainObject(existing);
  const previousAutomations = plainObject(previous.automations);
  const previousLimits = plainObject(previous.limits);
  const previousBudget = plainObject(previous.budget);
  const previousGuard = plainObject(previous.errorGuard);
  const inputAutomations = plainObject(source.automations);
  const inputLimits = plainObject(source.limits);
  const inputBudget = plainObject(source.budget);
  const inputGuard = plainObject(source.errorGuard);

  const modeCandidate = text(source.mode || previous.mode, 30).toLowerCase();
  const monthlyEur = boundedNumber(inputBudget.monthlyEur, Number(previousBudget.monthlyEur || DEFAULT_CONTROL.budget.monthlyEur), 1, 500);
  let hardEur = boundedNumber(inputBudget.hardEur, Number(previousBudget.hardEur || DEFAULT_CONTROL.budget.hardEur), 1, monthlyEur);
  let softEur = boundedNumber(inputBudget.softEur, Number(previousBudget.softEur || DEFAULT_CONTROL.budget.softEur), 0, hardEur);
  let warnEur = boundedNumber(inputBudget.warnEur, Number(previousBudget.warnEur || DEFAULT_CONTROL.budget.warnEur), 0, softEur);
  hardEur = Math.min(hardEur, monthlyEur);
  softEur = Math.min(softEur, hardEur);
  warnEur = Math.min(warnEur, softEur);

  return {
    version: 1,
    mode: MODES.has(modeCandidate) ? modeCandidate : "assisted",
    killSwitch: Object.prototype.hasOwnProperty.call(source, "killSwitch")
      ? bool(source.killSwitch, false)
      : bool(previous.killSwitch, false),
    pausedByGuard: Object.prototype.hasOwnProperty.call(source, "pausedByGuard")
      ? bool(source.pausedByGuard, false)
      : bool(previous.pausedByGuard, false),
    pausedReason: text(Object.prototype.hasOwnProperty.call(source, "pausedReason") ? source.pausedReason : previous.pausedReason, 500),
    pausedAt: text(Object.prototype.hasOwnProperty.call(source, "pausedAt") ? source.pausedAt : previous.pausedAt, 100),
    automations: {
      novaAutoReview: Object.prototype.hasOwnProperty.call(inputAutomations, "novaAutoReview")
        ? bool(inputAutomations.novaAutoReview, true)
        : bool(previousAutomations.novaAutoReview, DEFAULT_CONTROL.automations.novaAutoReview),
    },
    limits: {
      maxJobsPerHour: int(inputLimits.maxJobsPerHour, Number(previousLimits.maxJobsPerHour || DEFAULT_CONTROL.limits.maxJobsPerHour), 1, 120),
      maxJobsPerDay: int(inputLimits.maxJobsPerDay, Number(previousLimits.maxJobsPerDay || DEFAULT_CONTROL.limits.maxJobsPerDay), 1, 1000),
      maxTokensPerMonth: int(inputLimits.maxTokensPerMonth, Number(previousLimits.maxTokensPerMonth || DEFAULT_CONTROL.limits.maxTokensPerMonth), 10_000, 100_000_000),
    },
    budget: {
      monthlyEur,
      warnEur,
      softEur,
      hardEur,
      reservePerJobEur: boundedNumber(previousBudget.reservePerJobEur, DEFAULT_CONTROL.budget.reservePerJobEur, 0.05, 20),
      requirePricingForAutonomy: true,
    },
    errorGuard: {
      maxConsecutiveFailures: int(inputGuard.maxConsecutiveFailures, Number(previousGuard.maxConsecutiveFailures || DEFAULT_CONTROL.errorGuard.maxConsecutiveFailures), 1, 10),
      autoPause: true,
    },
    updatedAt: text(source.updatedAt || previous.updatedAt, 100),
  };
}

function dateKeys(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  const iso = safe.toISOString();
  return {
    month: iso.slice(0, 7),
    day: iso.slice(0, 10).replaceAll("-", ""),
    hour: iso.slice(0, 13).replaceAll("-", "").replace("T", ""),
  };
}

function rate(value) {
  const raw = text(value, 100);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function providerPricing(provider, env = process.env) {
  const normalized = text(provider, 40).toLowerCase();
  if (normalized === "local") return { provider: "local", configured: true, inputEurPer1M: 0, outputEurPer1M: 0 };
  const names = {
    openai: ["ELYON_AI_OPENAI_INPUT_EUR_PER_1M", "ELYON_AI_OPENAI_OUTPUT_EUR_PER_1M"],
    deepseek: ["ELYON_AI_DEEPSEEK_INPUT_EUR_PER_1M", "ELYON_AI_DEEPSEEK_OUTPUT_EUR_PER_1M"],
  }[normalized];
  if (!names) return { provider: normalized || "unknown", configured: false, inputEurPer1M: null, outputEurPer1M: null };
  const inputEurPer1M = rate(env[names[0]]);
  const outputEurPer1M = rate(env[names[1]]);
  return {
    provider: normalized,
    configured: inputEurPer1M !== null && outputEurPer1M !== null,
    inputEurPer1M,
    outputEurPer1M,
  };
}

export function getJarvisPricingStatus(env = process.env) {
  const configuredProviders = [];
  if (text(env.OPENAI_API_KEY)) configuredProviders.push("openai");
  if (text(env.DEEPSEEK_API_KEY)) configuredProviders.push("deepseek");
  const providers = ["openai", "deepseek"].map((provider) => {
    const pricing = providerPricing(provider, env);
    return { provider, configured: pricing.configured, active: configuredProviders.includes(provider) };
  });
  const required = providers.filter((item) => item.active);
  return {
    completeForConfiguredProviders: required.every((item) => item.configured),
    configuredProviders,
    providers,
  };
}

export async function getJarvisControl(options = {}) {
  const env = options.env || process.env;
  const config = getRedisConfig(env);
  if (!config.url || !config.token) return normalizeJarvisControl(baseControl(), baseControl());
  const stored = parseStoredObject(redisResult(await redisCommand(["GET", CONTROL_KEY], options)));
  return normalizeJarvisControl(stored || baseControl(), baseControl());
}

export async function saveJarvisControl(control, options = {}) {
  const now = text(options.now, 100) || new Date().toISOString();
  const normalized = normalizeJarvisControl({ ...control, updatedAt: now }, baseControl());
  const result = redisResult(await redisCommand(["SET", CONTROL_KEY, JSON.stringify(normalized)], options));
  if (result !== "OK") throw new Error("Jarvis-Control-Einstellungen konnten nicht gespeichert werden.");
  return normalized;
}

export async function updateJarvisControl(patch = {}, options = {}) {
  const current = await getJarvisControl(options);
  const source = plainObject(patch);
  const resume = source.resume === true;
  const next = normalizeJarvisControl({
    ...current,
    ...source,
    automations: { ...current.automations, ...plainObject(source.automations) },
    limits: { ...current.limits, ...plainObject(source.limits) },
    budget: { ...current.budget, ...plainObject(source.budget) },
    errorGuard: { ...current.errorGuard, ...plainObject(source.errorGuard) },
    ...(resume ? { pausedByGuard: false, pausedReason: "", pausedAt: "" } : {}),
  }, current);
  return saveJarvisControl(next, options);
}

async function counter(key, options = {}) {
  const value = Number(redisResult(await redisCommand(["GET", key], options)));
  return Number.isFinite(value) ? value : 0;
}

async function monthlyUsage(month, options = {}) {
  const hash = parseHash(redisResult(await redisCommand(["HGETALL", `${USAGE_MONTH_PREFIX}${month}`], options)));
  const number = (key) => {
    const value = Number(hash[key]);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    month,
    jobs: number("jobs"),
    successJobs: number("successJobs"),
    failedJobs: number("failedJobs"),
    blockedJobs: number("blockedJobs"),
    inputTokens: number("inputTokens"),
    outputTokens: number("outputTokens"),
    totalTokens: number("totalTokens"),
    pricedTokens: number("pricedTokens"),
    unpricedTokens: number("unpricedTokens"),
    estimatedCostEur: number("estimatedCostEur"),
    unpricedRuns: number("unpricedRuns"),
  };
}

function decisionFrom({ control, usage, jobsThisHour, jobsToday, pricing }) {
  const reasons = [];
  if (control.killSwitch) reasons.push("kill_switch");
  if (control.pausedByGuard) reasons.push("auto_paused");
  if (control.mode === "manual") reasons.push("manual_mode");
  if (!control.automations.novaAutoReview) reasons.push("nova_auto_review_disabled");
  if (jobsThisHour >= control.limits.maxJobsPerHour) reasons.push("hourly_job_limit");
  if (jobsToday >= control.limits.maxJobsPerDay) reasons.push("daily_job_limit");
  if (usage.totalTokens >= control.limits.maxTokensPerMonth) reasons.push("monthly_token_limit");
  if (control.budget.requirePricingForAutonomy && !pricing.completeForConfiguredProviders) reasons.push("pricing_unconfigured");
  if (usage.estimatedCostEur >= control.budget.hardEur) reasons.push("monthly_budget_hard_stop");
  if (usage.estimatedCostEur + control.budget.reservePerJobEur > control.budget.hardEur) reasons.push("monthly_budget_reserve_stop");

  const warning = usage.estimatedCostEur >= control.budget.warnEur;
  const softLimited = usage.estimatedCostEur >= control.budget.softEur;
  const allowed = reasons.length === 0;
  const batchLimit = allowed
    ? (control.mode === "autopilot" && !softLimited ? 2 : 1)
    : 0;
  const state = !allowed
    ? (control.killSwitch ? "stopped" : "paused")
    : softLimited ? "throttled" : "ready";

  return {
    allowed,
    state,
    reasons,
    batchLimit,
    warning,
    softLimited,
    remainingBudgetEur: Math.max(0, control.budget.hardEur - usage.estimatedCostEur),
  };
}

export async function getJarvisControlSnapshot(options = {}) {
  const env = options.env || process.env;
  const now = options.now ? new Date(options.now) : new Date();
  const keys = dateKeys(now);
  const control = await getJarvisControl(options);
  const [usage, jobsThisHour, jobsToday, consecutiveFailures] = await Promise.all([
    monthlyUsage(keys.month, options),
    counter(`${SLOT_HOUR_PREFIX}${keys.hour}`, options),
    counter(`${SLOT_DAY_PREFIX}${keys.day}`, options),
    counter(CONSECUTIVE_FAILURES_KEY, options),
  ]);
  const pricing = getJarvisPricingStatus(env);
  return {
    phase: "E4",
    control,
    usage: {
      ...usage,
      jobsThisHour,
      jobsToday,
      consecutiveFailures,
      costIsEstimate: true,
      pricingComplete: pricing.completeForConfiguredProviders,
    },
    pricing,
    decision: decisionFrom({ control, usage, jobsThisHour, jobsToday, pricing }),
    safety: {
      externalActionsLocked: true,
      livePublishingAllowed: false,
      supplierOrdersAllowed: false,
      customerMessagesAllowed: false,
      refundsAllowed: false,
      legalDataChangesAllowed: false,
    },
  };
}

export async function reserveJarvisAutopilotSlot(snapshot, options = {}) {
  const control = snapshot?.control || (await getJarvisControl(options));
  const now = options.now ? new Date(options.now) : new Date();
  const keys = dateKeys(now);
  const hourKey = `${SLOT_HOUR_PREFIX}${keys.hour}`;
  const dayKey = `${SLOT_DAY_PREFIX}${keys.day}`;
  const hourCount = Number(redisResult(await redisCommand(["INCR", hourKey], options))) || 0;
  await redisCommand(["EXPIRE", hourKey, 3 * 60 * 60], options);
  const dayCount = Number(redisResult(await redisCommand(["INCR", dayKey], options))) || 0;
  await redisCommand(["EXPIRE", dayKey, 3 * 24 * 60 * 60], options);

  if (hourCount > control.limits.maxJobsPerHour || dayCount > control.limits.maxJobsPerDay) {
    await Promise.all([
      redisCommand(["DECR", hourKey], options).catch(() => null),
      redisCommand(["DECR", dayKey], options).catch(() => null),
    ]);
    return { reserved: false, reason: hourCount > control.limits.maxJobsPerHour ? "hourly_job_limit" : "daily_job_limit" };
  }
  return { reserved: true, hourCount, dayCount };
}

export function meterJarvisWorkerOutcome(outcome = {}, env = process.env) {
  const runs = Array.isArray(outcome?.result?.runs) ? outcome.result.runs : [];
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let pricedTokens = 0;
  let unpricedTokens = 0;
  let estimatedCostEur = 0;
  let unpricedRuns = 0;
  const items = [];

  for (const run of runs) {
    const provider = text(run?.provider, 40).toLowerCase() || "unknown";
    const model = text(run?.model, 160);
    const usage = plainObject(run?.usage);
    const input = Math.max(0, Number(usage.inputTokens || 0) || 0);
    const output = Math.max(0, Number(usage.outputTokens || 0) || 0);
    const total = Math.max(0, Number(usage.totalTokens || input + output) || input + output);
    const pricing = providerPricing(provider, env);
    const priced = pricing.configured && Number.isFinite(input) && Number.isFinite(output);
    const cost = priced
      ? ((input / 1_000_000) * pricing.inputEurPer1M) + ((output / 1_000_000) * pricing.outputEurPer1M)
      : 0;

    inputTokens += input;
    outputTokens += output;
    totalTokens += total;
    if (priced) pricedTokens += total;
    else {
      unpricedTokens += total;
      if (provider !== "local") unpricedRuns += 1;
    }
    estimatedCostEur += cost;
    items.push({ provider, model, inputTokens: input, outputTokens: output, totalTokens: total, priced, estimatedCostEur: cost });
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    pricedTokens,
    unpricedTokens,
    estimatedCostEur,
    unpricedRuns,
    pricingComplete: unpricedRuns === 0,
    runs: items,
  };
}

async function hincr(key, field, value, options = {}) {
  const amount = Number(value || 0);
  if (!amount) return;
  await redisCommand(["HINCRBY", key, field, Math.trunc(amount)], options);
}

async function hincrFloat(key, field, value, options = {}) {
  const amount = Number(value || 0);
  if (!amount) return;
  await redisCommand(["HINCRBYFLOAT", key, field, amount], options);
}

export async function recordJarvisAutopilotOutcome(outcome = {}, options = {}) {
  const env = options.env || process.env;
  const now = options.now ? new Date(options.now) : new Date();
  const keys = dateKeys(now);
  const usageKey = `${USAGE_MONTH_PREFIX}${keys.month}`;
  const metering = meterJarvisWorkerOutcome(outcome, env);
  const blocked = outcome.blocked === true;
  const success = outcome.ok === true && !blocked;

  await hincr(usageKey, "jobs", 1, options);
  await hincr(usageKey, success ? "successJobs" : blocked ? "blockedJobs" : "failedJobs", 1, options);
  await hincr(usageKey, "inputTokens", metering.inputTokens, options);
  await hincr(usageKey, "outputTokens", metering.outputTokens, options);
  await hincr(usageKey, "totalTokens", metering.totalTokens, options);
  await hincr(usageKey, "pricedTokens", metering.pricedTokens, options);
  await hincr(usageKey, "unpricedTokens", metering.unpricedTokens, options);
  await hincr(usageKey, "unpricedRuns", metering.unpricedRuns, options);
  await hincrFloat(usageKey, "estimatedCostEur", metering.estimatedCostEur, options);

  let consecutiveFailures = 0;
  if (success || blocked) {
    await redisCommand(["SET", CONSECUTIVE_FAILURES_KEY, "0"], options);
  } else {
    consecutiveFailures = Number(redisResult(await redisCommand(["INCR", CONSECUTIVE_FAILURES_KEY], options))) || 0;
  }

  const control = await getJarvisControl(options);
  let paused = false;
  if (!success && !blocked && control.errorGuard.autoPause && consecutiveFailures >= control.errorGuard.maxConsecutiveFailures) {
    await saveJarvisControl({
      ...control,
      pausedByGuard: true,
      pausedReason: `Automatisch pausiert nach ${consecutiveFailures} aufeinanderfolgenden Worker-Fehlern.`,
      pausedAt: now.toISOString(),
    }, { ...options, now: now.toISOString() });
    paused = true;
  }

  return { metering, consecutiveFailures, paused };
}

export {
  CONTROL_KEY,
  CONSECUTIVE_FAILURES_KEY,
  DEFAULT_CONTROL,
  MODES,
  SLOT_DAY_PREFIX,
  SLOT_HOUR_PREFIX,
  USAGE_MONTH_PREFIX,
  dateKeys,
  decisionFrom,
  providerPricing,
};
