import {
  listJarvisMemory,
  listRecentJarvisAgentRuns,
  listRecentJarvisTasks,
  safeJson,
} from "./jarvis-memory-store.js";
import { loadConversationContext } from "./jarvis-conversation-store.js";
import { readWorkingMemory } from "./jarvis-working-memory-store.js";
import { DEFAULT_WORKING_MEMORY, normalizeWorkingMemoryState } from "./jarvis-working-memory-policy.js";

const CURRENT_STATE_QUESTION = /(?:was\s+ist\s+(?:mein|unser)\s+(?:aktuelles?\s+)?(?:ziel|fokus)|was\s+blockiert\s+(?:mich|uns)|(?:meine|unsere)\s+aktuellen?\s+blocker|woran\s+arbeite(?:n\s+wir|\s+ich)?\s+(?:gerade|aktuell)|was\s+ist\s+(?:mein|unser)\s+n(?:ä|ae)chster\s+schritt)/i;

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

function rankMemories(memories, command, limit = 8) {
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
    .slice(0, Math.max(1, Number(limit) || 8))
    .map((entry) => entry.memory);
}

function operationalSearchText(item) {
  return [
    item?.id,
    item?.agentId,
    item?.title,
    item?.status,
    item?.summary,
    item?.result?.summary,
    ...(Array.isArray(item?.result?.blockers) ? item.result.blockers : []),
    ...(Array.isArray(item?.result?.warnings) ? item.result.warnings : []),
  ].filter(Boolean).join(" ");
}

function rankOperationalHistory(items, command, workingMemory = {}, limit = 4) {
  if (CURRENT_STATE_QUESTION.test(text(command, 12000))) return [];
  const focusText = [command, workingMemory.currentGoal, workingMemory.currentFocus].filter(Boolean).join(" ");
  const focusTokens = tokens(focusText);
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const itemTokens = tokens(operationalSearchText(item));
      let overlap = 0;
      for (const token of focusTokens) if (itemTokens.has(token)) overlap += 1;
      const updatedAt = Date.parse(item?.updatedAt || item?.createdAt || "");
      const ageHours = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 3600000) : 9999;
      const recency = Math.max(0, 2 - Math.min(2, ageHours / 48));
      return { item, score: overlap * 4 + recency };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Number(limit) || 4))
    .map((entry) => entry.item);
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
      listRecentJarvisTasks({ limit: 10, env }),
      listRecentJarvisAgentRuns({ limit: 10, env }),
    ]);
  } catch {
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

  const relevantMemories = rankMemories(memories, command, 8);
  const relevantTasks = rankOperationalHistory(tasks, command, workingMemory, 4);
  const relevantRuns = rankOperationalHistory(agentRuns, command, workingMemory, 4);
  const currentTurnEvidence = safeJson(requestContext?.context?.autoDelegation || requestContext?.autoDelegation) || null;

  return safeJson({
    generatedAt: new Date().toISOString(),
    objective: text(command, 12000),
    contextPriority: {
      order: [
        "current_request",
        "current_turn_evidence",
        "working_memory",
        "conversation",
        "durable_memory",
        "background_operational_history",
      ],
      rules: [
        "Working memory describes the active goal, focus and blockers and outranks older task history.",
        "Durable memories are rules/preferences/decisions, not active blockers unless working memory explicitly says so.",
        "Recent tasks and agent runs are background only; mention them only when directly relevant to the current request or active goal.",
        "Never change the meaning of a durable user rule when paraphrasing it.",
      ],
    },
    system: {
      product: "Elyon Seller Tool",
      role: "Jarvis is the central Elyon business assistant and orchestrator.",
      externalActionsLocked: true,
      livePublishingAllowed: false,
      defaultListingMode: "draft",
    },
    currentTurnEvidence,
    workingMemory,
    conversation,
    memories: relevantMemories,
    backgroundOperationalHistory: {
      policy: CURRENT_STATE_QUESTION.test(text(command, 12000)) ? "suppressed_for_current_state_question" : "relevance_filtered_background_only",
      recentTasks: relevantTasks,
      recentAgentRuns: relevantRuns,
    },
    plan: planForBrainContext(plan),
    agents: compactAgents(registry),
    requestContext: safeJson(requestContext) || {},
    warnings,
  }) || {};
}

export {
  buildJarvisContext,
  planForBrainContext,
  rankMemories,
  rankOperationalHistory,
  resolveConversationId,
};
