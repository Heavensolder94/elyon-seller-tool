import { containsSensitiveValue, supabaseJarvisRequest } from "./jarvis-memory-store.js";

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalizeSession(row = {}) {
  return { id: text(row.id, 100), channel: text(row.channel, 50) || "seller_tool", scope: text(row.scope, 100) || "seller", status: text(row.status, 30) || "active", summary: text(row.summary, 4000), lastMessageAt: text(row.last_message_at, 100), createdAt: text(row.created_at, 100), updatedAt: text(row.updated_at, 100) };
}

async function getOrCreateConversation({ conversationId, channel = "seller_tool", scope = "seller", env = process.env } = {}) {
  const id = /^[0-9a-f-]{36}$/i.test(text(conversationId, 100)) ? text(conversationId, 100) : null;
  if (id) {
    const rows = await supabaseJarvisRequest(`/rest/v1/jarvis_conversation_sessions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" }, env);
    if (Array.isArray(rows) && rows[0]) return normalizeSession(rows[0]);
  }
  const rows = await supabaseJarvisRequest("/rest/v1/jarvis_conversation_sessions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...(id ? { id } : {}), channel: text(channel, 50) || "seller_tool", scope: text(scope, 100) || "seller", status: "active", summary: "" }) }, env);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error("jarvis_conversation_session_create_failed");
  return normalizeSession(row);
}

async function listRecentMessages({ conversationId, limit = 12, env = process.env } = {}) {
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 12));
  const rows = await supabaseJarvisRequest(`/rest/v1/jarvis_conversation_messages?select=id,role,content,created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.desc&limit=${safeLimit}`, { method: "GET" }, env);
  return (Array.isArray(rows) ? rows : []).reverse().map((row) => ({ id: text(row.id, 100), role: text(row.role, 20), content: text(row.content, 1200), createdAt: text(row.created_at, 100) }));
}

async function appendConversationMessage({ conversationId, role, content, metadata = {}, env = process.env } = {}) {
  const clean = text(content, 1200);
  if (!conversationId || !clean || containsSensitiveValue(clean)) return null;
  const rows = await supabaseJarvisRequest("/rest/v1/jarvis_conversation_messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ conversation_id: conversationId, role: ["user", "assistant", "system"].includes(role) ? role : "user", content: clean, metadata }) }, env);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function updateConversationSummary({ conversationId, summary, env = process.env } = {}) {
  if (!conversationId) return null;
  const rows = await supabaseJarvisRequest(`/rest/v1/jarvis_conversation_sessions?id=eq.${encodeURIComponent(conversationId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ summary: text(summary, 4000), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }, env);
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeSession(row) : null;
}

async function loadConversationContext({ conversationId, env = process.env } = {}) {
  if (!conversationId) return { conversation: { id: null, channel: "seller_tool", summary: "", recentMessages: [] }, warnings: [] };
  const warnings = [];
  let session = null;
  let messages = [];
  try { session = await getOrCreateConversation({ conversationId, env }); } catch (error) { warnings.push("conversation_session_unavailable"); }
  try { messages = await listRecentMessages({ conversationId, env }); } catch (error) { warnings.push("conversation_history_unavailable"); }
  return { conversation: { id: session?.id || conversationId, channel: session?.channel || "seller_tool", scope: session?.scope || "seller", summary: session?.summary || "", recentMessages: messages }, warnings };
}

export { appendConversationMessage, getOrCreateConversation, listRecentMessages, loadConversationContext, normalizeSession, updateConversationSummary };
