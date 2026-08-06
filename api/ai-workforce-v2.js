import { requireSellerAccess } from "../lib/seller-access.js";
import {
  EXTERNAL_ACTIONS_LOCKED,
  MAIN_AGENT_ID,
  STRUCTURE_VERSION,
  assessWorkflow,
  evaluateDraftQuality,
  listAgentStructure,
} from "../lib/ai-workforce-structure-v2.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function safeTasks(value) {
  return (Array.isArray(value) ? value : []).slice(0, 150).map((task) => ({
    id: text(task?.id, 200),
    agentId: text(task?.agentId, 100),
    title: text(task?.title, 500),
    status: text(task?.status, 100),
    updatedAt: text(task?.updatedAt || task?.createdAt, 100),
    result: task?.result && typeof task.result === "object" ? {
      status: text(task.result.status, 100),
      summary: text(task.result.summary, 2000),
      blockers: (Array.isArray(task.result.blockers) ? task.result.blockers : []).slice(0, 30).map((entry) => text(entry, 500)),
      warnings: (Array.isArray(task.result.warnings) ? task.result.warnings : []).slice(0, 30).map((entry) => text(entry, 500)),
    } : null,
    errors: (Array.isArray(task?.errors) ? task.errors : []).slice(0, 10).map((entry) => text(entry, 500)),
  }));
}

function createTask({ agentId, title, result, sourceId = "" }) {
  const now = new Date().toISOString();
  return {
    id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    agentId,
    type: agentId === MAIN_AGENT_ID ? "workflow_orchestration" : "draft_quality_analysis",
    title,
    sourceType: agentId === MAIN_AGENT_ID ? "workflow" : "listing",
    sourceId: text(sourceId, 300),
    priority: agentId === MAIN_AGENT_ID ? "critical" : "high",
    status: "approval_required",
    provider: "local",
    model: agentId === MAIN_AGENT_ID ? "deterministic-orchestrator-v2" : "deterministic-draft-qa-v2",
    inputSnapshot: {},
    result,
    warnings: [],
    errors: [],
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
    usage: null,
    durationMs: 0,
    fallbackUsed: false,
  };
}

function runManager(body) {
  const startedAt = Date.now();
  const context = plainObject(body.input || body.context || body.data);
  const tasks = safeTasks(body.tasks || context.tasks);
  const plan = assessWorkflow({ context, tasks });
  const result = {
    summary: plan.summary,
    status: plan.status === "blocked" ? "blocked" : "manualReviewRequired",
    confidence: 0.95,
    findings: [
      `Workflowstatus: ${plan.status}.`,
      plan.nextAgentName ? `Empfohlener nächster Fachagent: ${plan.nextAgentName}.` : "Derzeit ist kein weiterer Fachagent automatisch empfohlen.",
    ],
    recommendations: plan.nextAgentName ? [`${plan.nextAgentName} als nächsten internen Schritt starten.`] : ["Blocker und offene Freigaben prüfen."],
    missingFacts: [],
    warnings: plan.warnings,
    blockers: plan.blockers,
    suggestedActions: plan.nextAgentId ? [`Internen Fachagenten starten: ${plan.nextAgentName}.`] : [],
    generatedContent: { managerPlan: plan },
    assumptions: [],
  };
  const task = createTask({
    agentId: MAIN_AGENT_ID,
    title: text(body.title, 500) || "Elyon Manager · Workflow prüfen",
    result,
    sourceId: body.sourceId,
  });
  task.durationMs = Date.now() - startedAt;
  return task;
}

function runDraftQuality(body) {
  const startedAt = Date.now();
  const context = plainObject(body.input || body.context || body.data);
  const result = evaluateDraftQuality(context);
  const task = createTask({
    agentId: "elyon-draft-quality-guard",
    title: text(body.title, 500) || "Draft Quality Guard · eBay-Entwurf prüfen",
    result,
    sourceId: body.sourceId,
  });
  task.durationMs = Date.now() - startedAt;
  return task;
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      version: STRUCTURE_VERSION,
      mainAgentId: MAIN_AGENT_ID,
      agents: listAgentStructure(),
      safety: {
        externalActionsLocked: true,
        lockedActions: EXTERNAL_ACTIONS_LOCKED,
        manualReviewRequired: true,
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
  }

  try {
    const body = plainObject(req.body);
    const action = text(body.action, 100) || "run_manager";
    const task = action === "run_draft_quality" ? runDraftQuality(body) : runManager(body);
    return res.status(200).json({
      ok: true,
      version: STRUCTURE_VERSION,
      action,
      task,
      result: task.result,
      provider: task.provider,
      model: task.model,
      safety: {
        manualReviewRequired: true,
        automaticPublishing: false,
        automaticOrdering: false,
        automaticMessaging: false,
        automaticRefunds: false,
        externalActionsLocked: EXTERNAL_ACTIONS_LOCKED,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "ai_workforce_v2_failed",
      message: text(error?.message, 2000) || "Elyon Manager konnte den Workflow nicht auswerten.",
    });
  }
}
