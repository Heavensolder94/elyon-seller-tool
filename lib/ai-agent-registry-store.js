import { listAgentStructure } from "./ai-workforce-structure-v2.js";

const REGISTRY_KEY = "elyon:ai:agent-registry:v1";
const MAX_CUSTOM_AGENTS = 50;
const CUSTOM_AGENT_ID = /^custom-[a-z0-9][a-z0-9-]{2,80}$/;
const PROVIDERS = new Set(["openai", "deepseek", "local"]);
const AUTONOMY_MODES = new Set(["off", "manual", "assisted", "semi", "auto_internal", "auto_external"]);
const DEPARTMENTS = new Set(["general", "product", "research", "listing", "operations", "support"]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringList(value, maxItems = 40, itemLength = 300) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => text(typeof entry === "string" ? entry : entry?.name || entry?.label || entry?.id || "", itemLength))
    .filter(Boolean)
    .slice(0, maxItems);
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
  if (!config.url || !config.token) throw new Error("Persistenter Agent-Registry-Speicher ist nicht konfiguriert.");
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

function parseStoredList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.value)) return raw.value;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
    if (Array.isArray(parsed?.value)) return parsed.value;
    return [];
  } catch {
    return [];
  }
}

function coreIds() {
  const ids = new Set();
  for (const agent of listAgentStructure()) {
    if (agent.id) ids.add(String(agent.id).toLowerCase());
    if (agent.backendAgentId) ids.add(String(agent.backendAgentId).toLowerCase());
  }
  return ids;
}

function normalizeContextAccess(value) {
  const source = plainObject(value);
  return {
    product: source.product !== false,
    listing: source.listing === true,
    market: source.market === true,
    orders: source.orders === true,
    returns: source.returns === true,
    tasks: source.tasks === true,
  };
}

function normalizeCustomAgent(value, { existing = null } = {}) {
  const source = plainObject(value);
  const existingSource = plainObject(existing);
  const id = text(source.id || existingSource.id, 100).toLowerCase();
  if (!CUSTOM_AGENT_ID.test(id)) throw new Error("Ungültige Custom-Agent-ID.");
  if (coreIds().has(id)) throw new Error("Die Agent-ID ist für einen Elyon-Kernagenten reserviert.");

  const name = text(source.name ?? existingSource.name, 120);
  const role = text(source.role ?? existingSource.role, 1200);
  const systemPrompt = text(source.systemPrompt ?? existingSource.systemPrompt, 16000);
  if (!name || !role || !systemPrompt) throw new Error("Name, Rolle und System-Prompt sind Pflichtfelder.");

  const providerCandidate = text(source.provider ?? existingSource.provider, 50).toLowerCase();
  const autonomyCandidate = text(source.autonomyMode ?? existingSource.autonomyMode, 50).toLowerCase();
  const departmentCandidate = text(source.department ?? existingSource.department, 80).toLowerCase();
  const now = new Date().toISOString();

  return {
    id,
    kind: "custom",
    locked: false,
    enabled: source.enabled !== false,
    name,
    role,
    department: DEPARTMENTS.has(departmentCandidate) ? departmentCandidate : "general",
    icon: text(source.icon ?? existingSource.icon, 12) || "🤖",
    systemPrompt,
    capabilities: stringList(source.capabilities ?? existingSource.capabilities, 40, 300),
    reportsTo: text(source.reportsTo ?? existingSource.reportsTo, 100) || "elyon-manager",
    provider: PROVIDERS.has(providerCandidate) ? providerCandidate : "deepseek",
    model: text(source.model ?? existingSource.model, 200),
    allowFallback: source.allowFallback !== false,
    temperature: Math.max(0, Math.min(1.2, finiteNumber(source.temperature ?? existingSource.temperature, 0.2))),
    maxTokens: Math.max(500, Math.min(12000, Math.trunc(finiteNumber(source.maxTokens ?? existingSource.maxTokens, 4000)))),
    autonomyMode: AUTONOMY_MODES.has(autonomyCandidate) ? autonomyCandidate : "manual",
    contextAccess: normalizeContextAccess(source.contextAccess ?? existingSource.contextAccess),
    outputDetail: ["compact", "standard", "detailed"].includes(text(source.outputDetail ?? existingSource.outputDetail, 30))
      ? text(source.outputDetail ?? existingSource.outputDetail, 30)
      : "standard",
    allowedTools: stringList(source.allowedTools ?? existingSource.allowedTools, 60, 160),
    createdAt: text(existingSource.createdAt || source.createdAt, 100) || now,
    updatedAt: now,
  };
}

function normalizeStoredAgents(value) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    try {
      const agent = normalizeCustomAgent(entry, { existing: entry });
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      result.push(agent);
    } catch {
      // Ignore corrupt legacy entries instead of breaking the whole registry.
    }
    if (result.length >= MAX_CUSTOM_AGENTS) break;
  }
  return result;
}

export function hasAgentRegistryStorage(env = process.env) {
  const config = getRedisConfig(env);
  return Boolean(config.url && config.token);
}

export function getAgentRegistryStorageInfo(env = process.env) {
  const config = getRedisConfig(env);
  return { configured: Boolean(config.url && config.token), source: config.source };
}

export function listCoreRegistryAgents() {
  return listAgentStructure().map((agent) => ({
    ...agent,
    kind: "core",
    locked: true,
    enabled: true,
    reportsTo: agent.type === "manager" ? "" : "elyon-manager",
    capabilities: Array.isArray(agent.capabilities) ? [...agent.capabilities] : [],
  }));
}

export async function readCustomAgentRegistry(options = {}) {
  if (!hasAgentRegistryStorage(options.env || process.env)) return [];
  const data = await redisCommand(["GET", REGISTRY_KEY], options);
  return normalizeStoredAgents(parseStoredList(data?.result));
}

export async function replaceCustomAgentRegistry(items, options = {}) {
  const env = options.env || process.env;
  const config = getRedisConfig(env);
  if (!config.url || !config.token) {
    return { persisted: false, source: config.source, agents: normalizeStoredAgents(items) };
  }
  const agents = normalizeStoredAgents(items);
  await redisCommand(["SET", REGISTRY_KEY, JSON.stringify(agents)], options);
  return { persisted: true, source: config.source, agents };
}

export async function upsertCustomAgentRegistryItem(incoming, options = {}) {
  const current = await readCustomAgentRegistry(options);
  const id = text(incoming?.id, 100).toLowerCase();
  const existing = current.find((agent) => agent.id === id) || null;
  const agent = normalizeCustomAgent(incoming, { existing });
  const next = current.filter((entry) => entry.id !== agent.id);
  next.unshift(agent);
  const persisted = await replaceCustomAgentRegistry(next, options);
  return { ...persisted, agent, status: existing ? "updated" : "created" };
}

export async function deleteCustomAgentRegistryItem(id, options = {}) {
  const normalizedId = text(id, 100).toLowerCase();
  if (!CUSTOM_AGENT_ID.test(normalizedId)) throw new Error("Ungültige Custom-Agent-ID.");
  const current = await readCustomAgentRegistry(options);
  const next = current.filter((agent) => agent.id !== normalizedId);
  const deleted = next.length !== current.length;
  const persisted = await replaceCustomAgentRegistry(next, options);
  return { ...persisted, deleted, id: normalizedId };
}

export async function getCustomAgentRegistryItem(id, options = {}) {
  const normalizedId = text(id, 100).toLowerCase();
  if (!CUSTOM_AGENT_ID.test(normalizedId)) return null;
  const current = await readCustomAgentRegistry(options);
  return current.find((agent) => agent.id === normalizedId) || null;
}

export async function listCombinedAgentRegistry(options = {}) {
  const customAgents = await readCustomAgentRegistry(options);
  return {
    coreAgents: listCoreRegistryAgents(),
    customAgents,
    agents: [...listCoreRegistryAgents(), ...customAgents],
    storage: getAgentRegistryStorageInfo(options.env || process.env),
  };
}

export {
  CUSTOM_AGENT_ID,
  MAX_CUSTOM_AGENTS,
  REGISTRY_KEY,
  normalizeCustomAgent,
  normalizeStoredAgents,
};
