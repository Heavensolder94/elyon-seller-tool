import { requireSellerAccess } from "../lib/seller-access.js";
import advancedAgentHandler from "./ai-agent-run-advanced.js";
import { createManagerPlan } from "../lib/ai-workforce-manager-v2.js";
import { runManagerOrchestration } from "../lib/ai-workforce-orchestrator-v1.js";
import {
  AGENT_STRUCTURE,
  EXTERNAL_ACTIONS_LOCKED,
  MAIN_AGENT_ID,
  STRUCTURE_VERSION,
  backendAgentId,
  evaluateDraftQuality,
  listAgentStructure,
} from "../lib/ai-workforce-structure-v2.js";

const DELEGATED_ACTIONS = Object.freeze({
  "elyon-product-data-specialist": "analyze_product",
  "elyon-compliance-specialist": "analyze_product",
  "elyon-profit-specialist": "analyze_product",
  "elyon-listing-specialist": "analyze_listing",
  "elyon-order-specialist": "analyze_order",
  "elyon-customer-support-specialist": "analyze_return",
});

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
    sourceId: text(task?.sourceId, 300),
    parentTaskId: text(task?.parentTaskId, 200),
    workflowId: text(task?.workflowId, 200),
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

function createTask({ agentId, title, result, sourceId = "", id = "", status = "approval_required", model = "", usage = null }) {
  const now = new Date().toISOString();
  return {
    id: text(id, 200) || `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    agentId,
    type: agentId === MAIN_AGENT_ID ? "workflow_orchestration" : "draft_quality_analysis",
    title,
    sourceType: agentId === MAIN_AGENT_ID ? "workflow" : "listing",
    sourceId: text(sourceId, 300),
    priority: agentId === MAIN_AGENT_ID ? "critical" : "high",
    status,
    provider: "local",
    model: model || (agentId === MAIN_AGENT_ID ? "deterministic-orchestrator-v2" : "deterministic-draft-qa-v2"),
    inputSnapshot: {},
    result,
    warnings: [],
    errors: [],
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
    usage,
    durationMs: 0,
    fallbackUsed: false,
  };
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

function captureResponse() {
  const capture = { statusCode: 200, payload: null };
  return {
    capture,
    res: {
      status(code) {
        capture.statusCode = code;
        return this;
      },
      json(payload) {
        capture.payload = payload;
        return this;
      },
      setHeader() {
        return this;
      },
      end() {
        return this;
      },
    },
  };
}

function decorateDelegatedTask(task, meta) {
  const now = new Date().toISOString();
  const definition = AGENT_STRUCTURE[meta.agentId];
  return {
    ...plainObject(task),
    id: text(task?.id, 200) || `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    agentId: meta.agentId,
    title: text(task?.title, 500) || `${definition?.name || meta.agentId} · Manager-Delegation`,
    sourceId: text(task?.sourceId || meta.sourceId, 300),
    parentTaskId: meta.parentTaskId,
    workflowId: meta.workflowId,
    delegatedBy: MAIN_AGENT_ID,
    orchestrationStage: meta.stage,
    orchestrationWorkflowType: meta.workflowType,
    updatedAt: text(task?.updatedAt, 100) || now,
    createdAt: text(task?.createdAt, 100) || now,
  };
}

async function invokeAdvancedAgent(req, meta, testMode) {
  const backendId = backendAgentId(meta.agentId);
  const action = DELEGATED_ACTIONS[meta.agentId];
  if (!backendId || !action) throw new Error(`Agent ${meta.agentId} ist nicht für Manager-Delegation freigegeben.`);

  const { capture, res } = captureResponse();
  const delegatedBody = {
    action,
    agentId: backendId,
    title: `${AGENT_STRUCTURE[meta.agentId]?.name || meta.agentId} · Manager-Delegation`,
    sourceId: meta.sourceId,
    sourceType: meta.workflowType,
    priority: "high",
    input: meta.context,
    taskPrompt: [
      "Interner Arbeitsauftrag des Elyon Managers.",
      meta.goal ? `Gesamtziel: ${meta.goal}` : "",
      `Bearbeite ausschließlich deine feste Fachrolle (${AGENT_STRUCTURE[meta.agentId]?.role || meta.agentId}).`,
      "Gib keine externen Aktionen frei und halte alle bestehenden Fakten- und Sicherheitsregeln ein.",
    ].filter(Boolean).join("\n"),
    ...(testMode ? { agent: { provider: "local", model: "", allowFallback: false } } : {}),
  };
  const childReq = {
    ...req,
    method: "POST",
    query: {},
    body: delegatedBody,
  };
  await advancedAgentHandler(childReq, res);
  if (!capture.payload?.task) {
    throw new Error(capture.payload?.message || capture.payload?.error || `Delegierter Agent fehlgeschlagen (HTTP ${capture.statusCode}).`);
  }
  return decorateDelegatedTask(capture.payload.task, meta);
}

async function executeDelegatedAgent(req, meta, testMode) {
  if (meta.agentId === "elyon-draft-quality-guard") {
    return decorateDelegatedTask(runDraftQuality({
      input: meta.context,
      sourceId: meta.sourceId,
      title: "Draft Quality Guard · Manager-Delegation",
    }), meta);
  }
  return invokeAdvancedAgent(req, meta, testMode);
}

function aggregateUsage(tasks = []) {
  const values = (Array.isArray(tasks) ? tasks : []).map((task) => plainObject(task?.usage));
  const sums = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let any = false;
  for (const usage of values) {
    for (const key of Object.keys(sums)) {
      const value = Number(usage[key]);
      if (Number.isFinite(value)) {
        sums[key] += value;
        any = true;
      }
    }
  }
  return any ? sums : null;
}

function managerResultFromPlan(plan) {
  return {
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
}

async function runManager(body, req) {
  const startedAt = Date.now();
  const context = plainObject(body.input || body.context || body.data);
  const tasks = safeTasks(body.tasks || context.tasks);
  const workflowType = text(body.workflowType, 50) === "operations" ? "operations" : "product";
  const initialPlan = createManagerPlan({ context, tasks, workflowType });
  const taskId = text(body.taskId || body.parentTaskId, 200);

  if (body.autoDelegate !== true) {
    const task = createTask({
      agentId: MAIN_AGENT_ID,
      title: text(body.title, 500) || "Elyon Manager · Workflow prüfen",
      result: managerResultFromPlan(initialPlan),
      sourceId: body.sourceId,
      id: taskId,
    });
    task.durationMs = Date.now() - startedAt;
    return { task, childTasks: [], workflow: null };
  }

  const orchestration = await runManagerOrchestration({
    workflowType,
    context,
    workflowId: body.workflowId,
    parentTaskId: taskId,
    goal: text(body.goal || body.taskPrompt || body.prompt, 4000) || (workflowType === "operations" ? "Operativen Seller-Betrieb prüfen" : "Produkt intern vollständig prüfen"),
    allowedAgentIds: Array.isArray(body.allowedAgentIds) ? body.allowedAgentIds : undefined,
    executeAgent: (meta) => executeDelegatedAgent(req, meta, body.test === true),
  });

  const combinedTasks = safeTasks([...orchestration.childTasks, ...tasks]);
  const finalPlan = createManagerPlan({ context, tasks: combinedTasks, workflowType });
  const { childTasks, ...workflowMeta } = orchestration;
  const finalStatus = orchestration.status === "blocked" ? "blocked" : "manualReviewRequired";
  const recommendation = orchestration.status === "manual_approval_required"
    ? "Interne Prüfungen sind abgeschlossen. Finale externe Aktion manuell prüfen und freigeben."
    : orchestration.status === "manual_review_required"
      ? "Den gemeldeten Fachagenten prüfen und erst danach erneut delegieren."
      : "Blocker beheben und Workflow danach erneut starten.";
  const result = {
    summary: orchestration.summary,
    status: finalStatus,
    confidence: 0.97,
    findings: orchestration.childTasks.map((child) => `${AGENT_STRUCTURE[child.agentId]?.name || child.agentId}: ${text(child.result?.summary || child.errors?.[0] || child.status, 700)}`),
    recommendations: [recommendation],
    missingFacts: [],
    warnings: orchestration.warnings,
    blockers: orchestration.blockers,
    suggestedActions: orchestration.status === "manual_approval_required" ? ["Finale manuelle Freigabe prüfen."] : ["Manager-Workflow nach Prüfung erneut starten."],
    generatedContent: {
      managerPlan: finalPlan,
      orchestration: workflowMeta,
    },
    assumptions: [],
  };
  const task = createTask({
    agentId: MAIN_AGENT_ID,
    title: text(body.title, 500) || "Elyon Manager · Team orchestrieren",
    result,
    sourceId: body.sourceId || orchestration.sourceId,
    id: orchestration.parentTaskId,
    status: finalStatus === "blocked" ? "blocked" : "approval_required",
    model: "manager-orchestrator-v1",
    usage: aggregateUsage(orchestration.childTasks),
  });
  task.workflowId = orchestration.workflowId;
  task.childTaskIds = orchestration.childTaskIds;
  task.durationMs = Date.now() - startedAt;
  return { task, childTasks: orchestration.childTasks, workflow: workflowMeta };
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
      orchestrationVersion: 1,
      mainAgentId: MAIN_AGENT_ID,
      agents: listAgentStructure(),
      safety: {
        externalActionsLocked: true,
        lockedActions: EXTERNAL_ACTIONS_LOCKED,
        manualReviewRequired: true,
        managerInternalDelegation: true,
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
  }

  try {
    const body = plainObject(req.body);
    const action = text(body.action, 100) || "run_manager";
    if (action === "run_draft_quality") {
      const task = runDraftQuality(body);
      return res.status(200).json({
        ok: true,
        version: STRUCTURE_VERSION,
        action,
        task,
        result: task.result,
        provider: task.provider,
        model: task.model,
        childTasks: [],
        workflow: null,
        safety: {
          manualReviewRequired: true,
          automaticPublishing: false,
          automaticOrdering: false,
          automaticMessaging: false,
          automaticRefunds: false,
          externalActionsLocked: EXTERNAL_ACTIONS_LOCKED,
        },
      });
    }

    const managerRun = await runManager(body, req);
    return res.status(200).json({
      ok: true,
      version: STRUCTURE_VERSION,
      orchestrationVersion: 1,
      action,
      delegated: body.autoDelegate === true,
      task: managerRun.task,
      childTasks: managerRun.childTasks,
      workflow: managerRun.workflow,
      result: managerRun.task.result,
      provider: managerRun.task.provider,
      model: managerRun.task.model,
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
