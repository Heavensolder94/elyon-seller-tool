import {
  AGENT_STRUCTURE,
  MAIN_AGENT_ID,
} from "./ai-workforce-structure-v2.js";

const ORCHESTRATION_VERSION = 1;
const MAX_PARALLEL_DELEGATIONS = 3;

const PRODUCT_WAVES = Object.freeze([
  Object.freeze(["elyon-product-data-specialist"]),
  Object.freeze(["elyon-compliance-specialist", "elyon-profit-specialist"]),
  Object.freeze(["elyon-listing-specialist"]),
  Object.freeze(["elyon-draft-quality-guard"]),
]);

const OPERATIONS_AGENT_IDS = Object.freeze([
  "elyon-order-specialist",
  "elyon-customer-support-specialist",
]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function list(value, max = 40) {
  return (Array.isArray(value) ? value : []).map((entry) => text(entry, 1200)).filter(Boolean).slice(0, max);
}

function taskOutcome(task) {
  if (!task) return "failed";
  const taskStatus = text(task.status, 100).toLowerCase();
  const resultStatus = text(task.result?.status, 100).toLowerCase();
  if (["failed", "blocked", "rejected"].includes(taskStatus) || resultStatus === "blocked") return "blocked";
  if (resultStatus === "passed" || ["approved", "completed"].includes(taskStatus)) return "completed";
  if (["warning", "manualreviewrequired"].includes(resultStatus) || ["approval_required"].includes(taskStatus)) return "review";
  if (["queued", "analyzing"].includes(taskStatus)) return "running";
  if (taskStatus === "draft_ready" && resultStatus !== "passed") return "review";
  return "failed";
}

function taskReasons(task) {
  const result = plainObject(task?.result);
  return Array.from(new Set([
    ...list(result.blockers),
    ...list(result.warnings),
    ...list(task?.errors),
  ])).slice(0, 20);
}

function sourceIdFromContext(context = {}) {
  const source = plainObject(context);
  const product = plainObject(source.product || source.selectedProduct);
  const order = plainObject(source.order);
  const returnCase = plainObject(source.returnCase);
  return text(
    product.id || product.productId || product.sku ||
    order.id || order.orderId || order.ebayOrderId ||
    returnCase.id || returnCase.returnId || returnCase.caseId || "",
    300,
  );
}

function operationsWave(context = {}) {
  const source = plainObject(context);
  const nested = plainObject(source.context);
  const orders = Array.isArray(source.orders) ? source.orders : Array.isArray(nested.orders) ? nested.orders : [];
  const returns = Array.isArray(source.returns) ? source.returns : Array.isArray(nested.returns) ? nested.returns : [];
  const hasOrder = Boolean(source.order && Object.keys(plainObject(source.order)).length) || orders.length > 0;
  const hasReturn = Boolean(source.returnCase && Object.keys(plainObject(source.returnCase)).length) || returns.length > 0;
  const wave = [];
  if (hasOrder) wave.push("elyon-order-specialist");
  if (hasReturn) wave.push("elyon-customer-support-specialist");
  return wave.slice(0, MAX_PARALLEL_DELEGATIONS);
}

function workflowWaves(workflowType, context) {
  if (workflowType === "operations") {
    const wave = operationsWave(context);
    return wave.length ? [wave] : [];
  }
  return PRODUCT_WAVES.map((wave) => [...wave]);
}

function validateWave(wave) {
  const safe = (Array.isArray(wave) ? wave : [])
    .map((agentId) => text(agentId, 100))
    .filter((agentId) => agentId !== MAIN_AGENT_ID && AGENT_STRUCTURE[agentId]?.type === "specialist")
    .slice(0, MAX_PARALLEL_DELEGATIONS);
  return Array.from(new Set(safe));
}

function managerSummary(status, childTasks, workflowType) {
  const completed = childTasks.filter((task) => taskOutcome(task) === "completed");
  const review = childTasks.find((task) => taskOutcome(task) === "review");
  const blocked = childTasks.find((task) => taskOutcome(task) === "blocked");
  if (status === "blocked") {
    return `${AGENT_STRUCTURE[blocked?.agentId]?.name || "Ein Fachagent"} hat den ${workflowType === "operations" ? "Betriebs" : "Produkt"}workflow blockiert.`;
  }
  if (status === "manual_review_required") {
    return `${AGENT_STRUCTURE[review?.agentId]?.name || "Ein Fachagent"} benötigt deine manuelle Prüfung, bevor der Manager weiter delegiert.`;
  }
  if (status === "manual_approval_required") {
    return `Alle ${completed.length} vorgesehenen internen Fachprüfungen sind abgeschlossen. Die finale externe Aktion bleibt manuell freigabepflichtig.`;
  }
  return "Der Manager hat den internen Workflow ausgewertet.";
}

async function runManagerOrchestration({
  workflowType = "product",
  context = {},
  workflowId,
  parentTaskId,
  goal = "",
  executeAgent,
} = {}) {
  if (typeof executeAgent !== "function") throw new Error("Orchestrator benötigt einen internen Agent-Executor.");

  const normalizedType = workflowType === "operations" ? "operations" : "product";
  const safeWorkflowId = text(workflowId, 200) || `elyon-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeParentTaskId = text(parentTaskId, 200) || `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceId = sourceIdFromContext(context);
  const waves = workflowWaves(normalizedType, context);
  const childTasks = [];
  const events = [];
  let status = waves.length ? "running" : "manual_review_required";
  let stopReason = waves.length ? "" : "Kein passender Order-, Retouren- oder Produktkontext für eine interne Delegation gefunden.";

  for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
    const wave = validateWave(waves[waveIndex]);
    if (!wave.length) continue;
    events.push({
      type: "wave_started",
      wave: waveIndex + 1,
      agentIds: wave,
      at: new Date().toISOString(),
    });

    const results = await Promise.all(wave.map(async (agentId) => {
      try {
        const task = await executeAgent({
          agentId,
          workflowId: safeWorkflowId,
          parentTaskId: safeParentTaskId,
          workflowType: normalizedType,
          stage: waveIndex + 1,
          goal: text(goal, 4000),
          sourceId,
          context,
        });
        if (!task || typeof task !== "object") throw new Error("Delegierter Agent lieferte keinen Task zurück.");
        return task;
      } catch (error) {
        const now = new Date().toISOString();
        return {
          id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          agentId,
          type: "manager_delegated_task",
          title: `${AGENT_STRUCTURE[agentId]?.name || agentId} · Manager-Delegation`,
          sourceType: normalizedType,
          sourceId,
          priority: "high",
          status: "failed",
          provider: "local",
          model: "manager-orchestrator-v1",
          inputSnapshot: {},
          result: null,
          warnings: [],
          errors: [text(error?.message || error, 1200) || "Interne Delegation fehlgeschlagen."],
          createdAt: now,
          updatedAt: now,
          parentTaskId: safeParentTaskId,
          workflowId: safeWorkflowId,
          delegatedBy: MAIN_AGENT_ID,
          orchestrationStage: waveIndex + 1,
        };
      }
    }));

    for (const task of results) childTasks.push(task);
    events.push({
      type: "wave_completed",
      wave: waveIndex + 1,
      agentIds: wave,
      outcomes: results.map((task) => ({ agentId: task.agentId, outcome: taskOutcome(task) })),
      at: new Date().toISOString(),
    });

    const blocked = results.find((task) => taskOutcome(task) === "blocked");
    if (blocked) {
      status = "blocked";
      stopReason = taskReasons(blocked)[0] || `${AGENT_STRUCTURE[blocked.agentId]?.name || blocked.agentId} hat den Workflow blockiert.`;
      break;
    }

    const review = results.find((task) => taskOutcome(task) === "review");
    if (review) {
      status = "manual_review_required";
      stopReason = taskReasons(review)[0] || `${AGENT_STRUCTURE[review.agentId]?.name || review.agentId} benötigt eine manuelle Prüfung.`;
      break;
    }

    const incomplete = results.find((task) => taskOutcome(task) !== "completed");
    if (incomplete) {
      status = "blocked";
      stopReason = taskReasons(incomplete)[0] || `${AGENT_STRUCTURE[incomplete.agentId]?.name || incomplete.agentId} konnte nicht sauber abgeschlossen werden.`;
      break;
    }
  }

  if (status === "running") status = "manual_approval_required";

  const blockers = childTasks
    .filter((task) => taskOutcome(task) === "blocked")
    .flatMap(taskReasons);
  const warnings = childTasks
    .filter((task) => taskOutcome(task) === "review")
    .flatMap(taskReasons);
  if (stopReason && status === "blocked") blockers.unshift(stopReason);
  if (stopReason && status === "manual_review_required") warnings.unshift(stopReason);

  return {
    version: ORCHESTRATION_VERSION,
    workflowId: safeWorkflowId,
    parentTaskId: safeParentTaskId,
    workflowType: normalizedType,
    status,
    summary: managerSummary(status, childTasks, normalizedType),
    stopReason,
    sourceId,
    goal: text(goal, 4000),
    maxParallelDelegations: MAX_PARALLEL_DELEGATIONS,
    waves: waves.map((wave) => validateWave(wave)),
    childTasks,
    childTaskIds: childTasks.map((task) => text(task.id, 200)).filter(Boolean),
    completedAgentIds: childTasks.filter((task) => taskOutcome(task) === "completed").map((task) => task.agentId),
    blockers: Array.from(new Set(blockers)).slice(0, 30),
    warnings: Array.from(new Set(warnings)).slice(0, 30),
    events,
    manualApprovalRequired: true,
    automaticExternalActions: false,
  };
}

export {
  MAX_PARALLEL_DELEGATIONS,
  OPERATIONS_AGENT_IDS,
  ORCHESTRATION_VERSION,
  PRODUCT_WAVES,
  runManagerOrchestration,
  taskOutcome,
};
