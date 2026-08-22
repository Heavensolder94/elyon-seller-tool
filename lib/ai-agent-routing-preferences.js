const ROUTING_COOKIE_NAME = "elyon_ai_routing_v1";
const ALLOWED_PROVIDERS = new Set(["openai", "deepseek", "openrouter", "local"]);
const DEFAULT_AGENT_PROVIDERS = Object.freeze({
  "elyon-profit-analyst": "deepseek",
});

function text(value, max = 300) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function parseCookieHeader(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

function parseRoutingPayload(req) {
  const raw = parseCookieHeader(req?.headers?.cookie)[ROUTING_COOKIE_NAME];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePreference(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const provider = text(input.provider, 40).toLowerCase();
  const model = text(input.model, 220);
  const normalized = {};
  if (ALLOWED_PROVIDERS.has(provider)) normalized.provider = provider;
  if (model) normalized.model = model;
  if (typeof input.allowFallback === "boolean") normalized.allowFallback = input.allowFallback;
  return normalized;
}

function getAgentRoutingPreference(req, agentId) {
  const id = text(agentId, 120);
  const payload = parseRoutingPayload(req);
  const agents = payload?.agents && typeof payload.agents === "object" && !Array.isArray(payload.agents)
    ? payload.agents
    : {};
  const explicit = normalizePreference(agents[id]);
  const defaultProvider = DEFAULT_AGENT_PROVIDERS[id];

  // The routing-center emits `openrouter` with no model when it has no saved
  // per-agent choice yet. Treat only that generated empty state as "no choice";
  // a real OpenRouter model or any explicit OpenAI/DeepSeek/Local selection wins.
  const generatedEmptyOpenRouter = explicit.provider === "openrouter" && !explicit.model;
  if (explicit.provider && !generatedEmptyOpenRouter) return explicit;

  return defaultProvider
    ? { ...explicit, provider: defaultProvider }
    : explicit;
}

export {
  DEFAULT_AGENT_PROVIDERS,
  ROUTING_COOKIE_NAME,
  getAgentRoutingPreference,
  parseRoutingPayload,
};
