const ORCHESTRATOR_VERSION = 1;
const MANAGER_AGENT_ID = "elyon-operations-manager";

const WORKFLOW_LIMITS = Object.freeze({
  maxDepth: 3,
  maxAgentRuns: 7,
  maxRetriesPerAgent: 1,
  timeoutMs: 35_000,
  cooldownMs: 30_000,
});

const BLOCKED_EXTERNAL_ACTIONS = Object.freeze([
  "publish_listing",
  "change_live_price",
  "place_supplier_order",
  "send_customer_message",
  "issue_refund",
  "delete_product",
  "change_legal_data",
  "publishListing",
  "updateLivePrice",
  "placeSupplierOrder",
  "sendCustomerMessage",
  "issueRefund",
]);

const PRODUCT_STEPS = Object.freeze([
  Object.freeze({ agentId: "elyon-product-data-checker", action: "analyze_product", label: "Produktdaten-Check", stopOnBlocker: true }),
  Object.freeze({ agentId: "elyon-compliance-guard", action: "analyze_product", label: "Compliance Guard", stopOnBlocker: true }),
  Object.freeze({ agentId: "elyon-profit-analyst", action: "analyze_product", label: "Profit Analyst", stopOnBlocker: true }),
  Object.freeze({ agentId: "elyon-listing-pro", action: "analyze_listing", label: "Listing Pro", stopOnBlocker: true }),
]);

const OPERATIONS_STEPS = Object.freeze([
  Object.freeze({ agentId: "elyon-order-coordinator", action: "analyze_order", label: "Order Coordinator", stopOnBlocker: false }),
  Object.freeze({ agentId: "elyon-support-assistant", action: "analyze_return", label: "Support Assistant", stopOnBlocker: false }),
]);

const EVENT_STEP_MAP = Object.freeze({
  "product-approved": Object.freeze({ level2: [PRODUCT_STEPS[1]], level3: PRODUCT_STEPS }),
  "listing-updated": Object.freeze({ level2: [PRODUCT_STEPS[3]], level3: [PRODUCT_STEPS[1], PRODUCT_STEPS[2], PRODUCT_STEPS[3]] }),
  "new-order": Object.freeze({ level2: [OPERATIONS_STEPS[0]], level3: [OPERATIONS_STEPS[0]] }),
  "return-created": Object.freeze({ level2: [OPERATIONS_STEPS[1]], level3: [OPERATIONS_STEPS[1]] }),
});

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 1000) {
  const result = String(value ?? "").trim();
  return result.length > max ? result.slice(0, max) : result;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(items) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean))];
}

function stableSerialize(value, depth = 0) {
  if (depth > 5) return "null";
  if (value === null || value === undefined) return "null";
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.slice(0, 60).map((entry) => stableSerialize(entry, depth + 1)).join(",")}]`;
  if (typeof value !== "object") return "null";
  return `{${Object.keys(value).sort().slice(0, 100).map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], depth + 1)}`).join(",")}}`;
}

function fingerprint(value) {
  const raw = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function createWorkflowId(seed = "") {
  const clean = text(seed, 120).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `elyon-wf-${clean ? `${clean}-` : ""}${suffix}`;
}

function normalizeExecutionMode(value) {
  const mode = text(value, 50).toLowerCase();
  if (["manual", "event_level_2", "event_level_3"].includes(mode)) return mode;
  return "manual";
}

function normalizeWorkflowType(value) {
  const type = text(value, 50).toLowerCase();
  if (["product", "operations", "seller", "briefing"].includes(type)) return type;
  return "seller";
}

function hasOrderContext(context = {}) {
  const root = plainObject(context);
  return Boolean(root.order || root.orderId || (Array.isArray(root.orders) && root.orders.length) || (Array.isArray(root.context?.orders) && root.context.orders.length));
}

function hasReturnContext(context = {}) {
  const root = plainObject(context);
  return Boolean(root.returnCase || root.return || root.returnId || (Array.isArray(root.returns) && root.returns.length) || (Array.isArray(root.context?.returns) && root.context.returns.length));
}

function hasProductContext(context = {}) {
  const root = plainObject(context);
  return Boolean(root.product || root.productId || (Array.isArray(root.products) && root.products.length) || (Array.isArray(root.context?.products) && root.context.products.length));
}

function planWorkflow({ workflowType, executionMode, eventType, context } = {}) {
  const type = normalizeWorkflowType(workflowType);
  const mode = normalizeExecutionMode(executionMode);
  const event = text(eventType, 80).toLowerCase();
  let steps = [];

  if (mode !== "manual" && EVENT_STEP_MAP[event]) {
    steps = mode === "event_level_2" ? EVENT_STEP_MAP[event].level2 : EVENT_STEP_MAP[event].level3;
  } else if (type === "product") {
    steps = PRODUCT_STEPS;
  } else if (type === "operations") {
    if (hasOrderContext(context)) steps.push(OPERATIONS_STEPS[0]);
    if (hasReturnContext(context)) steps.push(OPERATIONS_STEPS[1]);
  } else if (type === "seller") {
    if (hasProductContext(context)) steps.push(...PRODUCT_STEPS);
    if (hasOrderContext(context)) steps.push(OPERATIONS_STEPS[0]);
    if (hasReturnContext(context)) steps.push(OPERATIONS_STEPS[1]);
  }

  return unique(steps.map((step) => step.agentId))
    .map((agentId) => [...PRODUCT_STEPS, ...OPERATIONS_STEPS].find((step) => step.agentId === agentId))
    .filter(Boolean)
    .slice(0, WORKFLOW_LIMITS.maxAgentRuns - 1);
}

function sourceIdFor(agentId, context = {}) {
  const root = plainObject(context);
  if (["elyon-product-data-checker", "elyon-compliance-guard", "elyon-profit-analyst", "elyon-listing-pro"].includes(agentId)) {
    const product = plainObject(root.product || root.context?.product || (Array.isArray(root.products) ? root.products[0] : null) || (Array.isArray(root.context?.products) ? root.context.products[0] : null));
    return text(product.productId || product.id || product.sku || root.productId, 240);
  }
  if (agentId === "elyon-order-coordinator") {
    const order = plainObject(root.order || (Array.isArray(root.orders) ? root.orders[0] : null) || (Array.isArray(root.context?.orders) ? root.context.orders[0] : null));
    return text(order.orderId || order.id || order.ebayOrderId || root.orderId, 240);
  }
  if (agentId === "elyon-support-assistant") {
    const item = plainObject(root.returnCase || root.return || (Array.isArray(root.returns) ? root.returns[0] : null) || (Array.isArray(root.context?.returns) ? root.context.returns[0] : null));
    return text(item.returnId || item.id || item.caseId || root.returnId, 240);
  }
  return "operations";
}

function contextForAgent(agentId, input = {}) {
  const root = plainObject(input);
  if (["elyon-product-data-checker", "elyon-compliance-guard", "elyon-profit-analyst", "elyon-listing-pro"].includes(agentId)) {
    const product = plainObject(root.product || root.context?.product || (Array.isArray(root.products) ? root.products[0] : null) || (Array.isArray(root.context?.products) ? root.context.products[0] : null));
    return { product };
  }
  if (agentId === "elyon-order-coordinator") {
    const order = plainObject(root.order || (Array.isArray(root.orders) ? root.orders[0] : null) || (Array.isArray(root.context?.orders) ? root.context.orders[0] : null));
    return { order };
  }
  if (agentId === "elyon-support-assistant") {
    const returnCase = plainObject(root.returnCase || root.return || (Array.isArray(root.returns) ? root.returns[0] : null) || (Array.isArray(root.context?.returns) ? root.context.returns[0] : null));
    return { returnCase };
  }
  return { context: plainObject(root.context || root) };
}

function makeDedupeKey({ workflowId, agentId, action, sourceId, context } = {}) {
  return [
    text(workflowId, 200),
    text(agentId, 100),
    text(action, 100),
    text(sourceId, 240) || "no-source",
    fingerprint(contextForAgent(agentId, context)),
  ].join(":");
}

function taskOutcome(task = {}) {
  const status = text(task.status, 80).toLowerCase();
  const resultStatus = text(task.result?.status, 80).toLowerCase();
  if (["failed", "blocked", "rejected"].includes(status) || resultStatus === "blocked") return "blocked";
  if (["queued", "analyzing", "running"].includes(status)) return "running";
  if (["passed", "completed", "approved"].includes(resultStatus) || ["completed", "approved"].includes(status)) return "completed";
  if (["warning", "manualreviewrequired"].includes(resultStatus) || ["approval_required", "draft_ready"].includes(status)) return "review";
  return "pending";
}

function reusableTask(tasks, dedupeKey) {
  return (Array.isArray(tasks) ? tasks : []).find((task) =>
    task?.dedupeKey === dedupeKey &&
    !["failed", "rejected"].includes(text(task.status, 80).toLowerCase()) &&
    task?.result
  ) || null;
}

function resultLists(task = {}) {
  return {
    blockers: Array.isArray(task.result?.blockers) ? task.result.blockers.filter(Boolean) : [],
    warnings: Array.isArray(task.result?.warnings) ? task.result.warnings.filter(Boolean) : [],
    missingFacts: Array.isArray(task.result?.missingFacts) ? task.result.missingFacts.filter(Boolean) : [],
  };
}

function requiresUserApproval(task = {}) {
  const agentId = text(task.agentId, 100);
  const outcome = taskOutcome(task);
  const lists = resultLists(task);
  if (agentId === "elyon-listing-pro") return true;
  if (agentId === "elyon-support-assistant") return true;
  if (agentId === "elyon-compliance-guard") return outcome === "blocked" || lists.blockers.length > 0 || lists.missingFacts.length > 0;
  if (agentId === "elyon-profit-analyst") {
    const passesMinimum = task.result?.generatedContent?.calculation?.passesMinimum;
    return passesMinimum === false || outcome === "blocked" || lists.missingFacts.length > 0;
  }
  if (agentId === "elyon-product-data-checker") return outcome === "blocked";
  return false;
}

function priorityForTask(task = {}) {
  const agentId = text(task.agentId, 100);
  const outcome = taskOutcome(task);
  const lists = resultLists(task);
  if (outcome === "blocked" && agentId === "elyon-order-coordinator") return "critical";
  if (outcome === "blocked" || lists.blockers.length) return "high";
  if (requiresUserApproval(task)) return "high";
  if (lists.warnings.length || lists.missingFacts.length) return "medium";
  return "low";
}

function normalizeDelegatedTask(task = {}) {
  const approvalRequired = requiresUserApproval(task);
  const outcome = taskOutcome(task);
  let status = text(task.status, 80) || "completed";
  if (!approvalRequired && ["approval_required", "draft_ready"].includes(status) && ["completed", "review"].includes(outcome)) status = "completed";
  return {
    ...task,
    status,
    approvalRequired,
    managerPriority: priorityForTask(task),
  };
}

function buildApprovalItem(task = {}) {
  const lists = resultLists(task);
  const labels = {
    "elyon-listing-pro": "Listing-Freigabe",
    "elyon-support-assistant": "Kundenantwort / Retoure",
    "elyon-compliance-guard": "Compliance-Fall",
    "elyon-profit-analyst": "Preis-/Margenentscheidung",
    "elyon-product-data-checker": "Unsichere Produktdaten",
  };
  return {
    id: text(task.id, 200),
    taskId: text(task.id, 200),
    workflowId: text(task.workflowId, 200),
    agentId: text(task.agentId, 100),
    type: labels[task.agentId] || "Freigabe",
    title: text(task.title, 500) || labels[task.agentId] || "Freigabe erforderlich",
    priority: priorityForTask(task),
    summary: text(task.result?.summary, 1500),
    blockers: lists.blockers.slice(0, 12),
    warnings: lists.warnings.slice(0, 12),
    missingFacts: lists.missingFacts.slice(0, 12),
    createdAt: text(task.updatedAt || task.createdAt, 100),
  };
}

function buildManagerDecision(tasks = []) {
  const list = (Array.isArray(tasks) ? tasks : []).map(normalizeDelegatedTask);
  const approvals = list.filter((task) => task.approvalRequired).map(buildApprovalItem);
  const blockers = unique(list.flatMap((task) => resultLists(task).blockers));
  const attention = list.filter((task) => !task.approvalRequired && ["critical", "high", "medium"].includes(priorityForTask(task)));
  const automatedDone = list.filter((task) => !task.approvalRequired && taskOutcome(task) === "completed");
  return {
    status: blockers.length ? "blocked" : approvals.length ? "approval_required" : attention.length ? "attention" : "completed",
    approvals,
    blockers,
    attention: attention.map((task) => ({ taskId: task.id, agentId: task.agentId, title: task.title, priority: priorityForTask(task), summary: text(task.result?.summary, 1200) })),
    automatedDone: automatedDone.map((task) => ({ taskId: task.id, agentId: task.agentId, title: task.title, summary: text(task.result?.summary, 800) })),
  };
}

function buildBriefing(tasks = [], managerDecision = buildManagerDecision(tasks)) {
  const buckets = { critical: [], high: [], medium: [], low: [] };
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const priority = priorityForTask(task);
    const summary = text(task.result?.summary || task.title, 800);
    if (summary && buckets[priority]) buckets[priority].push(summary);
  }
  return {
    generatedAt: new Date().toISOString(),
    relevantCount: (Array.isArray(tasks) ? tasks : []).length,
    critical: unique(buckets.critical).slice(0, 12),
    high: unique(buckets.high).slice(0, 12),
    medium: unique(buckets.medium).slice(0, 12),
    low: unique(buckets.low).slice(0, 12),
    approvals: managerDecision.approvals.slice(0, 20),
    automatedDone: managerDecision.automatedDone.slice(0, 20),
    blockers: managerDecision.blockers.slice(0, 20),
  };
}

function resolveAgentSettings(settings = {}, agentId = "") {
  const root = plainObject(settings);
  const agents = plainObject(root.agents);
  const visibleMap = {
    "elyon-operations-manager": "elyon-manager",
    "elyon-product-data-checker": "elyon-product-data-specialist",
    "elyon-compliance-guard": "elyon-compliance-specialist",
    "elyon-profit-analyst": "elyon-profit-specialist",
    "elyon-listing-pro": "elyon-listing-specialist",
    "elyon-order-coordinator": "elyon-order-specialist",
    "elyon-support-assistant": "elyon-customer-support-specialist",
  };
  const source = plainObject(agents[agentId] || agents[visibleMap[agentId]]);
  const mode = text(source.autonomyMode || source.autonomy?.mode, 50).toLowerCase();
  const legacyLevel = finiteNumber(source.autonomyLevel);
  const modeLevel = { off: 0, manual: 1, assisted: 2, semi: 3 }[mode];
  return {
    active: source.active !== false && source.enabled !== false && source.paused !== true,
    autonomyLevel: Math.max(0, Math.min(3, Number.isFinite(modeLevel) ? modeLevel : (legacyLevel ?? 1))),
    provider: text(source.provider, 80).toLowerCase(),
    model: text(source.model, 160),
    allowFallback: source.allowFallback !== false && source.autonomy?.recovery?.useFallbackProvider !== false,
    maxTokens: Math.max(200, Math.min(12000, finiteNumber(source.maxTokens) ?? 4000)),
    temperature: Math.max(0, Math.min(2, finiteNumber(source.temperature) ?? 0.2)),
    dailyLimit: Math.max(0, finiteNumber(source.dailyLimit ?? source.autonomy?.budget?.maximumCostPerTask) ?? 0),
    todayUsage: Math.max(0, finiteNumber(source.todayUsage) ?? 0),
  };
}

function checkBudget(settings = {}, agentId = "") {
  const agent = resolveAgentSettings(settings, agentId);
  const root = plainObject(settings);
  const globalLimit = Math.max(0, finiteNumber(root.globalDailyLimit ?? root.budget?.globalDailyLimit) ?? 0);
  const globalUsage = Math.max(0, finiteNumber(root.globalTodayUsage ?? root.budget?.globalTodayUsage) ?? 0);
  if (!agent.active) return { ok: false, code: "agent_paused", message: "Mitarbeiter ist pausiert oder deaktiviert.", agent };
  if (agent.dailyLimit > 0 && agent.todayUsage >= agent.dailyLimit) return { ok: false, code: "agent_daily_limit", message: "Tageslimit des Mitarbeiters ist erreicht.", agent };
  if (globalLimit > 0 && globalUsage >= globalLimit) return { ok: false, code: "global_daily_limit", message: "Globales KI-Tageslimit ist erreicht.", agent };
  return { ok: true, agent };
}

export {
  BLOCKED_EXTERNAL_ACTIONS,
  MANAGER_AGENT_ID,
  ORCHESTRATOR_VERSION,
  PRODUCT_STEPS,
  OPERATIONS_STEPS,
  WORKFLOW_LIMITS,
  buildApprovalItem,
  buildBriefing,
  buildManagerDecision,
  checkBudget,
  contextForAgent,
  createWorkflowId,
  fingerprint,
  makeDedupeKey,
  normalizeDelegatedTask,
  normalizeExecutionMode,
  normalizeWorkflowType,
  planWorkflow,
  priorityForTask,
  requiresUserApproval,
  resolveAgentSettings,
  reusableTask,
  sourceIdFor,
  taskOutcome,
};
