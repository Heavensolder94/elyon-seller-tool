import { supabaseJarvisRequest } from "./jarvis-memory-store.js";
import { DEFAULT_WORKING_MEMORY, normalizeWorkingMemoryState } from "./jarvis-working-memory-policy.js";

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalizeRow(row = {}) {
  return {
    id: text(row.id, 100),
    conversationId: text(row.conversation_id, 100),
    scope: text(row.scope, 100) || "seller",
    state: normalizeWorkingMemoryState(row.state || DEFAULT_WORKING_MEMORY),
    version: Math.max(1, Number(row.version) || 1),
    source: text(row.source, 160),
    createdAt: text(row.created_at, 100),
    updatedAt: text(row.updated_at, 100),
  };
}

async function readWorkingMemory({ conversationId, scope = "seller", env = process.env } = {}) {
  if (!conversationId) return null;
  const rows = await supabaseJarvisRequest(`/rest/v1/jarvis_working_memory?select=*&conversation_id=eq.${encodeURIComponent(conversationId)}&scope=eq.${encodeURIComponent(scope)}&limit=1`, { method: "GET" }, env);
  return Array.isArray(rows) && rows[0] ? normalizeRow(rows[0]) : null;
}

async function upsertWorkingMemory({ conversationId, scope = "seller", state = {}, source = "jarvis_brain_v2_a", env = process.env } = {}) {
  if (!conversationId) throw new Error("jarvis_working_memory_conversation_required");
  const current = await readWorkingMemory({ conversationId, scope, env });
  const nextState = normalizeWorkingMemoryState(state, current?.state || DEFAULT_WORKING_MEMORY);
  const payload = { conversation_id: conversationId, scope: text(scope, 100) || "seller", state: nextState, version: (current?.version || 0) + 1, source: text(source, 160), updated_at: new Date().toISOString() };
  const rows = current
    ? await supabaseJarvisRequest(`/rest/v1/jarvis_working_memory?id=eq.${encodeURIComponent(current.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }, env)
    : await supabaseJarvisRequest("/rest/v1/jarvis_working_memory", { method: "POST", headers: { Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify(payload) }, env);
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeRow(row) : { ...payload, id: current?.id || "", state: nextState, version: payload.version };
}

export { normalizeRow, readWorkingMemory, upsertWorkingMemory };
