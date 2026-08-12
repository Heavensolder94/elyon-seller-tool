import { createHash } from "node:crypto";

const EVENT_PREFIX = "elyon:jarvis:event:v1:";
const JOB_PREFIX = "elyon:jarvis:job:v1:";
const EVENT_INDEX_KEY = "elyon:jarvis:events:v1";
const JOB_INDEX_KEY = "elyon:jarvis:jobs:v1";
const MAX_EVENTS = 250;
const MAX_JOBS = 250;
const MAX_ATTEMPTS = 3;

const EVENT_PROFILES = Object.freeze({
  "nova.product.created": {
    capability: "product_data",
    priority: "medium",
    command: "Prüfe das neu eingegangene Nova-Produkt vollständig und bestimme die nächsten internen Prüfschritte.",
  },
  "product.enrichment.completed": {
    capability: "product_data",
    priority: "medium",
    command: "Prüfe die angereicherten Produktdaten auf Vollständigkeit und Prozessreife.",
  },
  "product.check.completed": {
    capability: "workflow",
    priority: "medium",
    command: "Bewerte das Ergebnis der Produktprüfung und bestimme den nächsten sicheren Workflow-Schritt.",
  },
  "market.analysis.completed": {
    capability: "market_research",
    priority: "medium",
    command: "Bewerte die abgeschlossene Marktanalyse und fasse Nachfrage, Wettbewerb und Risiken zusammen.",
  },
  "market.decision.approved": {
    capability: "workflow",
    priority: "medium",
    command: "Die Marktentscheidung wurde freigegeben. Plane die nächsten internen Schritte bis zur Listing-Vorbereitung.",
  },
  "listing.design.completed": {
    capability: "draft_quality",
    priority: "medium",
    command: "Prüfe das fertiggestellte Listing-Design auf Qualität, Widersprüche und fehlende Pflichtangaben.",
  },
  "ebay.draft.created": {
    capability: "draft_quality",
    priority: "high",
    command: "Prüfe den neu erstellten unveröffentlichten eBay-Entwurf vor der manuellen Freigabe.",
  },
  "supplier.price.changed": {
    capability: "profit",
    priority: "high",
    command: "Prüfe nach der Lieferantenpreisänderung Gewinn, Marge und Wirtschaftlichkeit erneut.",
  },
  "margin.below_threshold": {
    capability: "profit",
    priority: "high",
    command: "Prüfe den Margen- oder Gewinn-Blocker und nenne die wirtschaftlich sicheren nächsten Schritte.",
  },
  "order.created": {
    capability: "orders",
    priority: "high",
    command: "Prüfe die neue Bestellung auf Versandfrist, Fulfillment-Risiken und notwendige interne Schritte.",
  },
  "return.created": {
    capability: "support",
    priority: "high",
    command: "Prüfe den neuen Retourenfall und erstelle einen internen Handlungsvorschlag ohne Kundennachricht oder Erstattung auszuführen.",
  },
  "automation.failed": {
    capability: "workflow",
    priority: "high",
    command: "Analysiere den fehlgeschlagenen Automationsschritt, identifiziere den Blocker und schlage einen sicheren Wiederanlauf vor.",
  },
});

const BLOCKED_ACTIONS = new Set([
  "publish_listing",
  "change_live_price",
  "place_supplier_order",
  "send_customer_message",
  "issue_refund",
  "delete_product",
  "change_legal_data",
]);

const SENSITIVE_KEY = /^(?:buyer|buyername|buyeremail|customer|customername|customeremail|email|phone|phonenumber|shippingaddress|shipto|contactaddress|addressline1|addressline2|street|firstname|lastname)$/i;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function safeLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  return Math.max(1, Math.min(max, Number.isFinite(parsed) ? Math.trunc(parsed) : fallback));
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
  if (!config.url || !config.token) throw new Error("Persistenter Jarvis-Event-Speicher ist nicht konfiguriert.");
  const response = await fetchImpl(config.url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Redis REST ${response.status}`);
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

function scrubPayload(value, depth = 0) {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (["boolean", "number"].includes(typeof value)) return value;
  if (typeof value === "string") return text(value, 4000);
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((entry) => scrubPayload(entry, depth + 1)).filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  const entries = [];
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    const safeKey = text(key, 120);
    if (!safeKey || SENSITIVE_KEY.test(safeKey.replace(/[_\-\s]/g, ""))) continue;
    const safeEntry = scrubPayload(entry, depth + 1);
    if (safeEntry !== undefined) entries.push([safeKey, safeEntry]);
  }
  return Object.fromEntries(entries);
}

function stableSerialize(value, depth = 0) {
  if (depth > 6) return "null";
  if (value === null || value === undefined) return "null";
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry, depth + 1)).join(",")}]`;
  if (typeof value !== "object") return "null";
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], depth + 1)}`).join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function blockedActionFrom(value = {}) {
  const source = plainObject(value);
  const candidates = [source.action, source.requestedAction, source.operation, source.payload?.action, source.data?.action]
    .map((entry) => text(entry, 100).toLowerCase())
    .filter(Boolean);
  return candidates.find((entry) => BLOCKED_ACTIONS.has(entry)) || "";
}

function dangerousType(type) {
  return /(?:publish|live[-_. ]?listing|supplier[-_. ]?order|refund|customer[-_. ]?message|delete[-_. ]?product|legal[-_. ]?data)/i.test(type);
}

function normalizeIncomingEvent(value = {}, now = new Date().toISOString()) {
  const source = plainObject(value);
  const type = text(source.type || source.eventType, 120).toLowerCase();
  if (dangerousType(type)) throw Object.assign(new Error("Dieses Ereignis würde eine gesperrte externe Aktion repräsentieren."), { code: "event_action_blocked" });
  if (!EVENT_PROFILES[type]) throw Object.assign(new Error("Nicht unterstützter Jarvis-Ereignistyp."), { code: "event_type_not_supported" });
  const blockedAction = blockedActionFrom(source);
  if (blockedAction) throw Object.assign(new Error(`Die Aktion ${blockedAction} ist für Jarvis technisch gesperrt.`), { code: "event_action_blocked" });

  const eventSource = text(source.source || source.origin, 100) || "elyon";
  const sourceId = text(source.sourceId || source.entityId || source.productId || source.orderId || source.returnId, 300);
  const subjectId = text(source.subjectId || source.productId || source.orderId || source.returnId || source.entityId, 300) || sourceId;
  const payload = scrubPayload(source.payload || source.data || source.context || {});
  const explicitKey = text(source.idempotencyKey, 500);
  const dedupeBasis = explicitKey
    ? `${type}|${eventSource}|${explicitKey}`
    : `${type}|${eventSource}|${sourceId}|${subjectId}|${stableSerialize(payload)}`;
  const hash = digest(dedupeBasis);
  const eventId = `evt-${hash.slice(0, 24)}`;
  const jobId = `job-${hash.slice(0, 24)}`;
  const correlationId = text(source.correlationId, 160) || `corr-${hash.slice(0, 24)}`;
  const profile = EVENT_PROFILES[type];

  return {
    event: {
      version: 1,
      eventId,
      type,
      source: eventSource,
      sourceId,
      subjectId,
      correlationId,
      idempotencyKey: explicitKey || `derived:${hash.slice(0, 32)}`,
      payload: payload && typeof payload === "object" ? payload : {},
      receivedAt: now,
      createdAt: now,
    },
    job: {
      version: 1,
      jobId,
      eventId,
      correlationId,
      type: "jarvis_event_job",
      eventType: type,
      source: eventSource,
      sourceId,
      subjectId,
      status: "QUEUED",
      executionPolicy: "manual_dispatch",
      autoExecute: false,
      command: profile.command,
      capability: profile.capability,
      priority: profile.priority,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextRunAt: now,
      lastAttemptAt: "",
      lastError: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function getStored(key, options = {}) {
  const response = await redisCommand(["GET", key], options);
  return parseStoredObject(redisResult(response));
}

async function setNx(key, value, options = {}) {
  const response = await redisCommand(["SET", key, JSON.stringify(value), "NX"], options);
  return redisResult(response) === "OK";
}

async function indexNew(indexKey, id, maxItems, options = {}) {
  await redisCommand(["LPUSH", indexKey, id], options);
  await redisCommand(["LTRIM", indexKey, 0, maxItems - 1], options);
}

async function listStored(indexKey, prefix, options = {}) {
  const limit = safeLimit(options.limit, 20, 100);
  const idsResponse = await redisCommand(["LRANGE", indexKey, 0, limit - 1], options);
  const ids = Array.isArray(redisResult(idsResponse)) ? redisResult(idsResponse).map((entry) => text(entry, 120)).filter(Boolean) : [];
  if (!ids.length) return [];
  const valuesResponse = await redisCommand(["MGET", ...ids.map((id) => `${prefix}${id}`)], options);
  const values = Array.isArray(redisResult(valuesResponse)) ? redisResult(valuesResponse) : [];
  return values.map(parseStoredObject).filter(Boolean);
}

export function hasJarvisEventStorage(env = process.env) {
  const config = getRedisConfig(env);
  return Boolean(config.url && config.token);
}

export function getJarvisEventStorageInfo(env = process.env) {
  const config = getRedisConfig(env);
  return { configured: Boolean(config.url && config.token), source: config.source };
}

export async function ingestJarvisEvent(incoming, options = {}) {
  if (!hasJarvisEventStorage(options.env || process.env)) throw new Error("Persistenter Jarvis-Event-Speicher ist nicht konfiguriert.");
  const normalized = normalizeIncomingEvent(incoming, options.now || new Date().toISOString());
  const eventKey = `${EVENT_PREFIX}${normalized.event.eventId}`;
  const jobKey = `${JOB_PREFIX}${normalized.job.jobId}`;

  const eventCreated = await setNx(eventKey, normalized.event, options);
  if (eventCreated) await indexNew(EVENT_INDEX_KEY, normalized.event.eventId, MAX_EVENTS, options);
  const event = eventCreated ? normalized.event : (await getStored(eventKey, options)) || normalized.event;

  const jobCreated = await setNx(jobKey, normalized.job, options);
  if (jobCreated) await indexNew(JOB_INDEX_KEY, normalized.job.jobId, MAX_JOBS, options);
  const job = jobCreated ? normalized.job : (await getStored(jobKey, options)) || normalized.job;

  return {
    event,
    job,
    duplicate: !eventCreated,
    eventCreated,
    jobCreated,
    storage: getJarvisEventStorageInfo(options.env || process.env),
  };
}

export async function listJarvisEvents(options = {}) {
  if (!hasJarvisEventStorage(options.env || process.env)) return [];
  return listStored(EVENT_INDEX_KEY, EVENT_PREFIX, options);
}

export async function listJarvisJobs(options = {}) {
  if (!hasJarvisEventStorage(options.env || process.env)) return [];
  const jobs = await listStored(JOB_INDEX_KEY, JOB_PREFIX, options);
  const status = text(options.status, 50).toUpperCase();
  return status ? jobs.filter((job) => text(job?.status, 50).toUpperCase() === status) : jobs;
}

export {
  BLOCKED_ACTIONS,
  EVENT_INDEX_KEY,
  EVENT_PREFIX,
  EVENT_PROFILES,
  JOB_INDEX_KEY,
  JOB_PREFIX,
  MAX_ATTEMPTS,
  normalizeIncomingEvent,
  scrubPayload,
  stableSerialize,
};
