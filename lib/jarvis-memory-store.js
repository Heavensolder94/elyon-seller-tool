const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_TEXT = 12000;
const SECRET_KEY_PATTERN = /(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|service[_-]?role)/i;

function text(value, max = MAX_TEXT) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function safeJson(value, depth = 0) {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((entry) => safeJson(entry, depth + 1)).filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(String(key || "")))
      .map(([key, entry]) => [text(key, 120), safeJson(entry, depth + 1)])
      .filter(([key, entry]) => key && entry !== undefined)
  );
}

function containsSensitiveValue(value) {
  if (typeof value !== "string") return false;
  return /(?:\b(?:sk|ghp|github_pat|xox[baprs]|sb_secret)_[a-z0-9_-]{8,}\b|\beyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b)/i.test(value);
}

function normalizeSupabaseUrl(value = process.env.SUPABASE_URL) {
  const raw = text(value, 1000).replace(/\/+$/, "");
  if (!raw) throw new Error("jarvis_memory_supabase_not_configured");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") throw new Error("jarvis_memory_supabase_invalid_url");
  return parsed.toString().replace(/\/+$/, "");
}

function supabaseHeaders(key = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const clean = text(key, 3000);
  if (!clean) throw new Error("jarvis_memory_supabase_not_configured");
  if (clean.startsWith("sb_secret_")) return { apikey: clean };
  return { apikey: clean, Authorization: `Bearer ${clean}` };
}

async function supabaseJarvisRequest(path, init = {}, env = process.env) {
  const url = normalizeSupabaseUrl(env.SUPABASE_URL);
  const headers = supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`jarvis_memory_supabase_http_${response.status}`);
    error.status = response.status;
    error.detail = text(body, 1000);
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function normalizeMemoryRow(row = {}) {
  return {
    id: text(row.id, 100),
    memoryType: text(row.memory_type, 80),
    content: safeJson(row.content) ?? {},
    importance: clamp01(row.importance),
    confidence: clamp01(row.confidence),
    source: text(row.source, 160),
    createdAt: text(row.created_at, 100),
    updatedAt: text(row.updated_at, 100),
  };
}

async function listJarvisMemory({ limit = DEFAULT_LIMIT, env = process.env } = {}) {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const rows = await supabaseJarvisRequest(
    `/rest/v1/jarvis_memory?select=id,memory_type,content,importance,confidence,source,created_at,updated_at&order=importance.desc,updated_at.desc&limit=${safeLimit}`,
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map(normalizeMemoryRow) : [];
}

async function listRecentJarvisTasks({ limit = 6, env = process.env } = {}) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 6));
  const rows = await supabaseJarvisRequest(
    `/rest/v1/jarvis_tasks?select=id,type,status,output,error,progress,created_at,updated_at&order=updated_at.desc&limit=${safeLimit}`,
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map((row) => ({
    id: text(row.id, 100),
    type: text(row.type, 100),
    status: text(row.status, 50),
    progress: Number(row.progress ?? 0),
    output: safeJson(row.output) ?? null,
    error: text(row.error, 1000) || null,
    createdAt: text(row.created_at, 100),
    updatedAt: text(row.updated_at, 100),
  })) : [];
}

async function listRecentJarvisAgentRuns({ limit = 8, env = process.env } = {}) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));
  const rows = await supabaseJarvisRequest(
    `/rest/v1/jarvis_agent_runs?select=id,task_id,agent_name,status,output,error,model,cost,created_at,finished_at&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map((row) => ({
    id: text(row.id, 100),
    taskId: text(row.task_id, 100),
    agentName: text(row.agent_name, 160),
    status: text(row.status, 50),
    output: safeJson(row.output) ?? null,
    error: text(row.error, 1000) || null,
    model: text(row.model, 200) || null,
    cost: Number.isFinite(Number(row.cost)) ? Number(row.cost) : null,
    createdAt: text(row.created_at, 100),
    finishedAt: text(row.finished_at, 100) || null,
  })) : [];
}

async function writeJarvisMemory({ memoryType, content, importance = 0.7, confidence = 0.8, source = "jarvis_brain_v1", env = process.env } = {}) {
  const cleanType = text(memoryType, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  const cleanContent = safeJson(plainObject(content));
  if (!cleanType || !cleanContent || Object.keys(cleanContent).length === 0) {
    throw new Error("jarvis_memory_invalid_payload");
  }
  if (containsSensitiveValue(JSON.stringify(cleanContent))) {
    throw new Error("jarvis_memory_sensitive_content_blocked");
  }
  const rows = await supabaseJarvisRequest("/rest/v1/jarvis_memory", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      memory_type: cleanType,
      content: cleanContent,
      importance: clamp01(importance, 0.7),
      confidence: clamp01(confidence, 0.8),
      source: text(source, 160) || "jarvis_brain_v1",
      updated_at: new Date().toISOString(),
    }),
  }, env);
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeMemoryRow(row) : null;
}

export {
  listJarvisMemory,
  listRecentJarvisAgentRuns,
  listRecentJarvisTasks,
  safeJson,
  containsSensitiveValue,
  supabaseHeaders,
  supabaseJarvisRequest,
  writeJarvisMemory,
};
