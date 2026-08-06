import {
  AGENT_STRUCTURE,
  OPERATIONS_WORKFLOW,
  PRODUCT_WORKFLOW,
  assessWorkflow,
  canonicalV2AgentId,
  readinessFindings,
} from "./ai-workforce-structure-v2.js";

const text = (value) => String(value ?? "").trim();

function outcome(task) {
  if (!task) return "pending";
  const state = text(task.status).toLowerCase();
  const result = text(task.result?.status).toLowerCase();
  if (["failed", "blocked", "rejected"].includes(state) || result === "blocked") return "blocked";
  if (["approved", "completed"].includes(state) || result === "passed") return "completed";
  if (["approval_required", "draft_ready"].includes(state) || ["warning", "manualreviewrequired"].includes(result)) return "review";
  if (["queued", "analyzing"].includes(state)) return "running";
  return "pending";
}

function latestMap(tasks = []) {
  const result = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const id = canonicalV2AgentId(task?.agentId);
    if (id && !result.has(id)) result.set(id, task);
  }
  return result;
}

function createProductPlan({ context = {}, tasks = [] } = {}) {
  const plan = assessWorkflow({ context, tasks });
  const latest = latestMap(tasks);
  const dataAgentId = PRODUCT_WORKFLOW[0];
  const dataTask = latest.get(dataAgentId);
  const readiness = readinessFindings(context);
  if (!dataTask) {
    return {
      ...plan,
      status: "ready",
      summary: "Der Product Data Specialist muss zuerst die Produktgrundlage prüfen und fehlende Angaben strukturieren.",
      nextAgentId: dataAgentId,
      nextAgentName: AGENT_STRUCTURE[dataAgentId].name,
      blockers: [],
      warnings: Array.from(new Set([...readiness.blockers, ...readiness.warnings])),
    };
  }
  if (outcome(dataTask) === "completed" && readiness.blockers.length) {
    return {
      ...plan,
      status: "blocked",
      summary: "Die Produktdatenprüfung ist abgeschlossen, aber kritische Pflichtwerte fehlen weiterhin.",
      nextAgentId: "",
      nextAgentName: "",
      blockers: Array.from(new Set([...plan.blockers, ...readiness.blockers])),
    };
  }
  return plan;
}

function createOperationsPlan({ context = {}, tasks = [] } = {}) {
  const latest = latestMap(tasks);
  const steps = OPERATIONS_WORKFLOW.map((agentId, index) => ({
    agentId,
    name: AGENT_STRUCTURE[agentId].name,
    order: index + 1,
    outcome: outcome(latest.get(agentId)),
  }));
  const blocked = steps.find((step) => step.outcome === "blocked");
  const review = steps.find((step) => step.outcome === "review");
  const hasReturn = Boolean(context.returnCase || context.context?.returns?.length || context.returns?.length);
  const hasOrder = Boolean(context.order || context.context?.orders?.length || context.orders?.length);
  let nextAgentId = hasReturn ? "elyon-customer-support-specialist" : hasOrder ? "elyon-order-specialist" : steps.find((step) => step.outcome === "pending")?.agentId || "";
  if (blocked || review) nextAgentId = "";
  return {
    version: 2,
    managerAgentId: "elyon-manager",
    workflowType: "operations",
    status: blocked ? "blocked" : review ? "manual_review_required" : nextAgentId ? "ready" : "manual_approval_required",
    summary: blocked ? `${blocked.name} hat einen operativen Blocker gemeldet.` : review ? `${review.name} wartet auf deine Prüfung.` : nextAgentId ? `${AGENT_STRUCTURE[nextAgentId].name} ist der nächste operative Fachagent.` : "Die operativen Vorgänge sind aktuell abgearbeitet.",
    nextAgentId,
    nextAgentName: nextAgentId ? AGENT_STRUCTURE[nextAgentId].name : "",
    blockers: blocked ? [`${blocked.name} hat den Vorgang blockiert.`] : [],
    warnings: hasOrder || hasReturn ? [] : ["Es wurde kein konkreter Bestell- oder Supportvorgang gefunden."],
    productWorkflow: [],
    operationsWorkflow: steps,
    requiresManualApproval: true,
  };
}

function createManagerPlan(input = {}) {
  return input.workflowType === "operations" ? createOperationsPlan(input) : createProductPlan(input);
}

export { createManagerPlan, createOperationsPlan, createProductPlan };
