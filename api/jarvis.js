import { requireSellerAccess } from "../lib/seller-access.js";
import { listCombinedAgentRegistry } from "../lib/ai-agent-registry-store.js";
import registryRunnerHandler from "./ai-agent-run-registry.js";
import { runJarvisBrain } from "../lib/jarvis-brain.js";
import { explicitMemoryFromCommand } from "../lib/jarvis-memory-policy.js";
import { appendConversationMessage, getOrCreateConversation, updateConversationSummary } from "../lib/jarvis-conversation-store.js";
import { readWorkingMemory, upsertWorkingMemory } from "../lib/jarvis-working-memory-store.js";
import { buildWorkingMemorySummary, mergeWorkingMemoryState, parseWorkingMemoryCommand } from "../lib/jarvis-working-memory-policy.js";
import {
  CAPABILITY_PROFILES,
  createJarvisPlan,
  summarizeJarvisRuns,
} from "../lib/elyon-jarvis-core.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function safeJson(value, depth = 0) {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (["boolean", "number"].includes(typeof value)) return value;
  if (typeof value === "string") return text(value, 12000);
  if (Array.isArray(value)) return value.slice(0, 80).map((entry) => safeJson(entry, depth + 1)).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 120)
      .map(([key, entry]) => [text(key, 120), safeJson(entry, depth + 1)])
      .filter(([key, entry]) => key && entry !== undefined)
  );
}

function publicAgent(agent = {}) {
  const execution = plainObject(agent.execution);
  return {
    id: text(agent.id, 100),
    name: text(agent.name, 160),
    kind: agent.kind === "custom" ? "custom" : "core",
    role: text(agent.role, 1200),
    department: text(agent.department, 80),
    enabled: agent.enabled !== false,
    locked: agent.locked === true,
    capabilities: (Array.isArray(agent.capabilities) ? agent.capabilities : []).slice(0, 40).map((entry) => text(entry, 300)).filter(Boolean),
    autonomyMode: text(agent.autonomyMode, 50),
    execution: {
      runner: text(execution.runner, 100),
      defaultAction: text(execution.defaultAction, 100),
      allowedActions: (Array.isArray(execution.allowedActions) ? execution.allowedActions : []).slice(0, 20).map((entry) => text(entry, 100)).filter(Boolean),
    },
  };
}

function createCaptureResponse() {
  const capture = {
    statusCode: 200,
    headers: new Map(),
    payload: null,
    ended: false,
  };
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      capture.headers.set(String(name).toLowerCase(), value);
      return this;
    },
    getHeader(name) {
      return capture.headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = Number(code) || 200;
      capture.statusCode = this.statusCode;
      return this;
    },
    json(payload) {
      capture.statusCode = this.statusCode || capture.statusCode || 200;
      capture.payload = payload;
      capture.ended = true;
      return this;
    },
    send(payload) {
      capture.statusCode = this.statusCode || capture.statusCode || 200;
      capture.payload = payload;
      capture.ended = true;
      return this;
    },
    end(payload) {
      capture.statusCode = this.statusCode || capture.statusCode || 200;
      if (payload !== undefined) capture.payload = payload;
      capture.ended = true;
      return this;
    },
  };
  return { capture, res };
}

async function invokeRegistryRunner(parentReq, payload) {
  const childReq = Object.assign(Object.create(parentReq || null), {
    method: "POST",
    body: payload,
    query: {},
  });
  const { capture, res } = createCaptureResponse();
  await registryRunnerHandler(childReq, res);
  const statusCode = Number(capture.statusCode || res.statusCode || 500);
  const responsePayload = capture.payload && typeof capture.payload === "object"
    ? capture.payload
    : { ok: statusCode >= 200 && statusCode < 300, message: text(capture.payload, 2000) };
  return {
    ok: statusCode >= 200 && statusCode < 300 && responsePayload?.ok !== false,
    statusCode,
    payload: responsePayload,
    message: text(responsePayload?.message || responsePayload?.error, 2000),
  };
}

function taskSummaryFromRun(run = {}) {
  const task = plainObject(run?.payload?.task);
  const result = plainObject(task.result || run?.payload?.result);
  if (!task.id && !result.summary) return null;
  return {
    id: text(task.id, 200),
    agentId: text(task.agentId, 100),
    title: text(task.title, 500),
    status: text(task.status, 100),
    updatedAt: text(task.updatedAt || task.createdAt, 100),
    result: {
      status: text(result.status, 100),
      summary: text(result.summary, 2000),
      blockers: (Array.isArray(result.blockers) ? result.blockers : []).slice(0, 20).map((entry) => text(entry, 700)),
      warnings: (Array.isArray(result.warnings) ? result.warnings : []).slice(0, 20).map((entry) => text(entry, 700)),
    },
  };
}

function shouldStopAfterRun(run, stopOnBlocker) {
  if (!stopOnBlocker) return false;
  if (!run?.ok) return true;
  const result = plainObject(run?.payload?.result || run?.payload?.task?.result);
  return text(result.status, 100).toLowerCase() === "blocked" || (Array.isArray(result.blockers) && result.blockers.length > 0);
}

async function executePlan(req, plan, body) {
  const runs = [];
  const baseInput = plainObject(safeJson(body.input || body.context || body.data || {})) || {};
  const priorTasks = [];
  const stopOnBlocker = body.stopOnBlocker !== false;

  for (const delegation of plan.delegations || []) {
    const input = {
      ...baseInput,
      ...(priorTasks.length ? { tasks: [...(Array.isArray(baseInput.tasks) ? baseInput.tasks.slice(0, 20) : []), ...priorTasks].slice(0, 40) } : {}),
    };
    const run = await invokeRegistryRunner(req, {
      agentId: delegation.agentId,
      action: "run_agent",
      title: text(body.title, 500) || `Jarvis · ${delegation.agentName}`,
      taskPrompt: delegation.taskPrompt || plan.objective,
      priority: text(body.priority, 50) || "medium",
      sourceId: text(body.sourceId, 300),
      sourceType: text(body.sourceType, 100),
      conversationId: text(body.conversationId || body.conversation_id, 100),
      channel: text(body.channel, 50) || "seller_tool",
      scope: text(body.scope, 100) || "seller",
      input,
    });
    runs.push({
      ...run,
      agentId: delegation.agentId,
      agentName: delegation.agentName,
      capability: delegation.capability,
    });
    const summary = taskSummaryFromRun(run);
    if (summary) priorTasks.push(summary);
    if (shouldStopAfterRun(run, stopOnBlocker)) break;
  }
  return runs;
}

async function getRegistry() {
  const registry = await listCombinedAgentRegistry();
  return {
    ...registry,
    agents: Array.isArray(registry.agents) ? registry.agents : [],
  };
}

function isMemoryRecallCommand(command) {
  return /(?:wie lautet|wie war(?: nochmal)?|woran soll ich mich erinnern|was ist unsere|erinner(?:e|ung)).*(?:regel|compliance|freigabe|vorgabe|präferenz|entscheidung|memory|erinnerung)|(?:unsere|meine)\s+(?:compliance|business|geschäfts|system)\s*regel/i.test(text(command, 12000));
}

function shouldRouteToBrain(body, plan, command) {
  const mode = text(body?.mode, 30).toLowerCase();
  const hasExplicitSpecialist = Boolean(text(body?.agentId, 100) || text(body?.capability, 100));
  if (hasExplicitSpecialist) return false;
  if (explicitMemoryFromCommand(command)) return true;
  if (body?.brain === true || mode === "brain") return true;
  if (isMemoryRecallCommand(command)) return true;
  if (/\b(?:jarvis|elyon)\b.*\b(?:system|aktuell|nächst(?:es|e)|naechstes|weiter|empfiehl|meinung|denkst)\b|\b(?:system|geschäft|geschaeft)\b.*\b(?:aktuell|status|aufgestellt)\b/i.test(command)) return true;
  if (text(plan?.intent?.id, 100) === "generic") return true;
  return plan?.executable === false;
}

async function executeBrain(command, registry, plan, body) {
  return runJarvisBrain({
    command,
    registry,
    plan,
    requestContext: {
      input: safeJson(body.input || {}),
      context: safeJson(body.context || {}),
      data: safeJson(body.data || {}),
      sourceId: text(body.sourceId, 300),
      sourceType: text(body.sourceType, 100),
    },
  });
}

async function prepareConversation(body) {
  try {
    return { session: await getOrCreateConversation({ conversationId: text(body.conversationId || body.conversation_id, 100), channel: text(body.channel, 50) || "seller_tool", scope: text(body.scope, 100) || "seller" }), warnings: [] };
  } catch {
    return { session: { id: text(body.conversationId || body.conversation_id, 100) || crypto.randomUUID(), channel: text(body.channel, 50) || "seller_tool", scope: text(body.scope, 100) || "seller", summary: "" }, warnings: ["conversation_session_unavailable"] };
  }
}

async function persistBrainState(command, brain, session, warnings = []) {
  if (!session?.id) return { workingMemory: null, warnings };
  try {
    const deterministic = parseWorkingMemoryCommand(command) || {};
    const candidate = brain?.workingMemoryUpdate?.shouldUpdate ? brain.workingMemoryUpdate : {};
    const current = await readWorkingMemory({ conversationId: session.id, scope: session.scope });
    const mergedCandidate = { ...candidate, ...deterministic };
    for (const key of ["openTasks", "blockers", "pendingApprovals"]) {
      if (Array.isArray(deterministic[key])) mergedCandidate[key] = [...(current?.state?.[key] || []), ...deterministic[key]];
    }
    const state = mergeWorkingMemoryState(current?.state || {}, mergedCandidate);
    const stored = await upsertWorkingMemory({ conversationId: session.id, scope: session.scope, state });
    const summary = buildWorkingMemorySummary(stored.state);
    if (summary) await updateConversationSummary({ conversationId: session.id, summary });
    return { workingMemory: stored.state, warnings };
  } catch {
    return { workingMemory: null, warnings: [...warnings, "working_memory_unavailable"] };
  }
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis", "brain-v1");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const registry = await getRegistry();
      return res.status(200).json({
        ok: true,
        version: 2,
        phase: "Brain V2-A",
        jarvis: "ready",
        mode: "brain_or_registry_orchestrator",
        agents: registry.agents.map(publicAgent),
        capabilities: Object.keys(CAPABILITY_PROFILES),
        storage: registry.storage,
        brain: {
          enabled: true,
          version: "2-A",
          generalConversation: true,
          durableMemory: "supabase",
          workingMemory: true,
          conversationSessions: true,
          semanticMemory: false,
          experienceLearning: false,
          specialistRoutingPreserved: true,
        },
        safety: {
          registryIsSourceOfTruth: true,
          deterministicAgentSelection: true,
          externalActionsLocked: true,
          livePublishingAllowed: false,
          defaultExecutionMode: "plan",
          maxDelegations: 4,
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
    }

    const body = plainObject(req.body);
    const command = text(body.command || body.objective || body.taskPrompt || body.prompt, 12000);
    if (!command) {
      return res.status(400).json({
        ok: false,
        error: "jarvis_command_required",
        message: "Jarvis benötigt einen Auftrag oder ein Ziel.",
      });
    }

    const registry = await getRegistry();
    const plan = createJarvisPlan({
      command,
      agents: registry.agents,
      explicitAgentId: text(body.agentId, 100),
      requestedCapability: text(body.capability, 100),
      maxAgents: body.maxAgents,
    });

    if (plan.status === "blocked") {
      return res.status(403).json({
        ok: false,
        error: "jarvis_action_blocked",
        phase: "Brain V2-A",
        plan,
        safety: { externalActionsLocked: true, livePublishingAllowed: false },
      });
    }

    const conversationResult = await prepareConversation(body);
    const session = conversationResult.session;
    const conversationWarnings = conversationResult.warnings;
    try { await appendConversationMessage({ conversationId: session.id, role: "user", content: command }); } catch { conversationWarnings.push("conversation_history_unavailable"); }

    if (shouldRouteToBrain(body, plan, command)) {
      const brain = await executeBrain(command, registry, plan, body);
      const stateResult = await persistBrainState(command, brain, session, conversationWarnings);
      try { if (brain.answer) await appendConversationMessage({ conversationId: session.id, role: "assistant", content: brain.answer }); } catch { stateResult.warnings.push("conversation_history_unavailable"); }
      const statusCode = brain.ok === false
        ? (brain.mode === "brain_degraded" ? 503 : 502)
        : 200;
      return res.status(statusCode).json({
        ...brain,
        phase: "Brain V2-A",
        conversationId: session.id,
        conversation: { id: session.id, channel: session.channel, scope: session.scope },
        workingMemory: stateResult.workingMemory,
        contextWarnings: stateResult.warnings,
        plan: {
          ...plan,
          answerDirectly: true,
          brainHandled: true,
        },
        summary: {
          status: brain.ok === false ? "failed" : "completed",
          summary: text(brain.answer || brain.message, 4000),
          successful: brain.ok === false ? 0 : 1,
          failed: brain.ok === false ? 1 : 0,
          blockers: [],
          warnings: [...(Array.isArray(brain?.context?.warnings) ? brain.context.warnings : []), ...stateResult.warnings],
        },
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          answerDirectly: true,
          nothingExecuted: true,
          durableMemoryEnabled: true,
        },
      });
    }

    const execute = body.execute === true || text(body.mode, 30).toLowerCase() === "execute";
    if (!plan.executable) {
      return res.status(422).json({
        ok: false,
        error: "jarvis_no_suitable_agent",
        phase: "Brain V1",
        mode: execute ? "execute" : "plan",
        plan,
      });
    }

    if (!execute) {
      return res.status(200).json({
        ok: true,
        phase: "Brain V1",
        mode: "plan",
        plan,
        summary: summarizeJarvisRuns(plan, []),
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          nothingExecuted: true,
        },
      });
    }

    const runs = await executePlan(req, plan, body);
    const summary = summarizeJarvisRuns(plan, runs);
    const successful = runs.some((run) => run.ok);
    return res.status(successful ? 200 : 502).json({
      ok: successful,
      phase: "Brain V1",
      mode: "execute",
      correlationId: plan.correlationId,
      plan,
      runs,
      summary,
      safety: {
        externalActionsLocked: true,
        livePublishingAllowed: false,
        registryIsSourceOfTruth: true,
        stopOnBlocker: body.stopOnBlocker !== false,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "jarvis_orchestration_failed",
      message: text(error?.message, 2000) || "Jarvis konnte den Auftrag nicht orchestrieren.",
    });
  }
}

export { executeBrain, executePlan, invokeRegistryRunner, isMemoryRecallCommand, publicAgent, shouldRouteToBrain };
