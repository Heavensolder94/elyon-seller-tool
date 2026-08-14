import {
  listJarvisMemory,
  listRecentJarvisAgentRuns,
  listRecentJarvisTasks,
  safeJson,
} from "./jarvis-memory-store.js";
import { loadConversationContext } from "./jarvis-conversation-store.js";
import { readWorkingMemory } from "./jarvis-working-memory-store.js";
import { DEFAULT_WORKING_MEMORY, normalizeWorkingMemoryState } from "./jarvis-working-memory-policy.js";

function text(value, max = 6000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalize(value) {
  return text(value, 12000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(/\s+/).filter((entry) => entry.length >= 3));
}

function memorySearchText(memory) {
  return [memory?.memoryType, memory?.source, JSON.stringify(memory?.content || {})].join(" ");
}

function rankMemories(memories, command, limit = 10) {
  const commandTokens = tokens(command);
  return (Array.isArray(memories) ? memories : [])
    .map((memory) => {
      const memoryTokens = tokens(memorySearchText(memory));
      let overlap = 0;
      for (const token of commandTokens) if (memoryTokens.has(token)) overlap += 1;
      const importance = Number(memory?.importance || 0);
      const confidence = Number(memory?.confidence || 0);
      const updatedAt = Date.parse(memory?.updatedAt || memory?.createdAt || "");
      const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86400000) : 3650;
      const recency = Math.max(0, 2 - Math.min(2, ageDays / 365));
      return { memory, score: overlap * 8 + importance * 3 + confidence + recency };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Number(limit) || 10))
    .map((entry) => entry.memory);
}

function compactAgents(registry = {}) {
  return (Array.isArray(registry.agents) ? registry.agents : []).slice(0, 40).map((agent) => ({
    id: text(agent?.id, 100),
    name: text(agent?.name, 160),
    department: text(agent?.department, 80),
    role: text(agent?.role, 600),
    enabled: agent?.enabled !== false,
    capabilities: (Array.isArray(agent?.capabilities) ? agent.capabilities : []).slice(0, 20).map((entry) => text(entry, 160)),
  }));
}

function resolveConversationId(requestContext = {}) {
  return text(
    requestContext?.conversationId ||
    requestContext?.context?.jarvisConversationId ||
    requestContext?.input?.jarvisConversationId,
    100
  );
}

function planForBrainContext(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const safePlan = safeJson(plan);
  if (!safePlan) return null;
  const genericNoAgent = text(safePlan?.intent?.id, 100) === "generic" && safePlan?.executable === false;
  if (!genericNoAgent) return safePlan;
  return {
    ...safePlan,
    status: "brain_handled",
    blockers: [],
    warnings: [],
    routingNote: "Direct Brain conversation; no specialist delegation is required for this turn.",
  };
}

async function buildJarvisContext({ command, registry = {}, requestContext = {}, plan = null, env = process.env } = {}) {
  const warnings = [];
  let memories = [];
  let tasks = [];
  let agentRuns = [];

  try {
    [memories, tasks, agentRuns] = await Promise.all([
      listJarvisMemory({ limit: 24, env }),
      listRecentJarvisTasks({ limit: 6, env }),
      listRecentJarvisAgentRuns({ limit: 8, env }),
    ]);
  } catch (error) {
    warnings.push("jarvis_context_store_unavailable");
  }

  const conversationId = resolveConversationId(requestContext);
  let conversation = { id: conversationId || null, channel: requestContext.channel || "seller_tool", summary: "", recentMessages: [] };
  let workingMemory = normalizeWorkingMemoryState(DEFAULT_WORKING_MEMORY);
  if (conversationId) {
    try {
      const result = await loadConversationContext({ conversationId, env });
      conversation = result.conversation || conversation;
      warnings.push(...(result.warnings || []));
    } catch {
      warnings.push("conversation_context_unavailable");
    }
    try {
      const row = await readWorkingMemory({ conversationId, scope: requestContext.scope || "seller", env });
      if (row?.state) workingMemory = row.state;
    } catch {
      warnings.push("working_memory_unavailable");
    }
  }

  const relevantMemories = rankMemories(memories, command, 10);
  return safeJson({
    generatedAt: new Date().toISOString(),
    objective: text(command, 12000),
    system: {
      product: "Elyon Seller Tool",
      role: "Jarvis is the central Elyon business assistant and orchestrator.",
      externalActionsLocked: true,
      livePublishingAllowed: false,
      defaultListingMode: "draft",
    },
    plan: planForBrainContext(plan),
    agents: compactAgents(registry),
    memories: relevantMemories,
    recentTasks: tasks,
    recentAgentRuns: agentRuns,
    conversation,
    workingMemory,
    requestContext: safeJson(requestContext) || {},
    warnings,
  }) || {};
}

export { buildJarvisContext, planForBrainContext, rankMemories, resolveConversationId };