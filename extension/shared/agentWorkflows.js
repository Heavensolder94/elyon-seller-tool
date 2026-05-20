const AGENT_WORKFLOWS_KEY = "elyon_agent_workflows";

function normalizeWorkflow(item = {}) {
  const now = new Date().toISOString();
  return {
    id: item.id || `${item.agentId || "agent"}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    agentId: item.agentId || "",
    agentName: item.agentName || "",
    title: item.title || "",
    status: item.status || "prepared",
    mode: item.mode || "prepared",
    prompt: item.prompt || "",
    guardrails: Array.isArray(item.guardrails) ? item.guardrails : [],
    url: item.url || "",
    notes: item.notes || "",
    detectedAt: item.detectedAt || now,
    updatedAt: item.updatedAt || now
  };
}

export async function loadAgentWorkflows() {
  const result = await chrome.storage.local.get(AGENT_WORKFLOWS_KEY).catch(() => ({}));
  const items = Array.isArray(result[AGENT_WORKFLOWS_KEY]) ? result[AGENT_WORKFLOWS_KEY] : [];
  return items.map(normalizeWorkflow);
}

export async function saveAgentWorkflows(items) {
  await chrome.storage.local.set({
    [AGENT_WORKFLOWS_KEY]: Array.isArray(items) ? items.map(normalizeWorkflow) : []
  });
}

export async function prepareAgentWorkflow(agent = {}, context = {}) {
  const current = await loadAgentWorkflows();
  const workflow = normalizeWorkflow({
    agentId: agent.id,
    agentName: agent.name,
    title: context.title || `${agent.name} vorbereitet`,
    status: "prepared",
    mode: context.mode || agent.mode || "prepared",
    prompt: agent.prompt,
    guardrails: agent.guardrails,
    url: context.url || "",
    notes: context.notes || "Analyse vorbereitet"
  });
  const next = [workflow, ...current.filter((item) => item.agentId !== agent.id || item.url !== workflow.url)].slice(0, 50);
  await saveAgentWorkflows(next);
  return next;
}

