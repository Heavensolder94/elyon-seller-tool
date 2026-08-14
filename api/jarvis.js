import { requireSellerAccess } from "../lib/seller-access.js";
import registryRunnerHandler from "./ai-agent-run-registry.js";
import { CAPABILITY_PROFILES } from "../lib/elyon-jarvis-core.js";
import {
  JARVIS_BRAIN_INTENTS,
  JARVIS_BRAIN_VERSION,
  runJarvisBrain,
} from "../lib/elyon-jarvis-brain.js";
import { listJarvisAgentRegistry } from "../lib/elyon-jarvis-agent-registry.js";

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
  const availability = plainObject(agent.availability);
  return {
    id: text(agent.id, 100),
    name: text(agent.name, 160),
    kind: agent.kind === "custom" ? "custom" : "core",
    role: text(agent.role, 1200),
    department: text(agent.department, 80),
    enabled: agent.enabled !== false,
    locked: agent.locked === true,
    capabilities: (Array.isArray(agent.capabilities) ? agent.capabilities : []).slice(0, 40).map((entry) => text(entry, 300)).filter(Boolean),
    requiredInput: (Array.isArray(agent.requiredInput) ? agent.requiredInput : []).slice(0, 20).map((entry) => text(entry, 100)).filter(Boolean),
    outputType: text(agent.outputType, 100),
    endpoint: text(agent.endpoint, 200),
    handler: text(agent.handler, 100),
    autonomyMode: text(agent.autonomyMode, 50),
    availability: {
      available: availability.available !== false,
      reason: text(availability.reason, 100),
    },
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
  const registry = await listJarvisAgentRegistry();
  return {
    ...registry,
    agents: Array.isArray(registry.agents) ? registry.agents : [],
  };
}

function logBrainResult(payload, durationMs) {
  const plan = plainObject(payload?.plan);
  const delegations = Array.isArray(plan.delegations) ? plan.delegations : [];
  console.info("[jarvis-brain]", {
    requestId: text(payload?.requestId || plan.correlationId, 120),
    brainVersion: JARVIS_BRAIN_VERSION,
    intent: text(plan.intent?.id, 80),
    selectedAgent: delegations.map((item) => text(item.agentId, 100)).filter(Boolean),
    plan: text(payload?.mode, 30),
    execution: payload?.mode === "execute" ? "executed" : payload?.mode === "plan" ? "planned" : "direct",
    duration: durationMs,
    result: text(payload?.summary?.status, 80),
    error: text(payload?.error, 100),
    fallbackUsed: payload?.routing?.fallbackUsed === true || payload?.ai?.fallbackUsed === true,
  });
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis", "brain-v0.1");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const registry = await getRegistry();
      return res.status(200).json({
        ok: true,
        version: 2,
        phase: "brain-v0.1",
        brainVersion: JARVIS_BRAIN_VERSION,
        jarvis: "ready",
        mode: "brain_orchestrator",
        agents: registry.agents.map(publicAgent),
        intents: [...JARVIS_BRAIN_INTENTS],
        capabilities: Object.keys(CAPABILITY_PROFILES),
        storage: registry.storage,
        safety: {
          registryIsSourceOfTruth: true,
          deterministicAgentSelection: true,
          generalJarvisFallback: true,
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
        message: "Jarvis benötigt eine Nachricht, einen Auftrag oder ein Ziel.",
      });
    }

    const startedAt = Date.now();
    const registry = await getRegistry();
    const execute = body.execute === true || text(body.mode, 30).toLowerCase() === "execute";
    const brainResult = await runJarvisBrain({
      command,
      agents: registry.agents,
      input: plainObject(safeJson(body.input || body.context || body.data || {})) || {},
      explicitAgentId: text(body.agentId, 100),
      requestedCapability: text(body.capability, 100),
      maxAgents: body.maxAgents,
      execute,
      executePlan: (plan) => executePlan(req, plan, body),
    });

    logBrainResult(brainResult.payload, Date.now() - startedAt);
    return res.status(brainResult.statusCode).json(brainResult.payload);
  } catch (error) {
    console.error("[jarvis-brain-error]", {
      name: text(error?.name, 100),
      code: text(error?.code, 100),
    });
    return res.status(500).json({
      ok: false,
      error: "jarvis_brain_failed",
      message: "Jarvis konnte die Anfrage gerade nicht vollständig bearbeiten.",
    });
  }
}

export { executePlan, getRegistry, invokeRegistryRunner, publicAgent };
