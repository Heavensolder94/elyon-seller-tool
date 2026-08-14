import {
  listJarvisMemory,
  listRecentJarvisAgentRuns,
  listRecentJarvisTasks,
  safeJson,
} from "./jarvis-memory-store.js";

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
    warnings.push(String(error?.message || "jarvis_context_store_unavailable").slice(0, 300));
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
    plan: plan ? safeJson(plan) : null,
    agents: compactAgents(registry),
    memories: relevantMemories,
    recentTasks: tasks,
    recentAgentRuns: agentRuns,
    requestContext: safeJson(requestContext) || {},
    warnings,
  }) || {};
}

export { buildJarvisContext, rankMemories };
