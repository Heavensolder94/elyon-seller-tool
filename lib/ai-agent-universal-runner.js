import { backendAgentId, canonicalV2AgentId } from "./ai-workforce-structure-v2.js";
import { getAgentDefinition } from "./ai-workforce.js";

const CUSTOM_AGENT_ID = /^custom-[a-z0-9][a-z0-9-]{2,80}$/;
const EXTERNAL_ACTIONS = new Set([
  "publish_listing",
  "change_live_price",
  "place_supplier_order",
  "send_customer_message",
  "issue_refund",
  "delete_product",
  "change_legal_data",
]);
const CUSTOM_ACTIONS = new Set(["run_agent", "retry_task"]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function safeJson(value, depth = 0) {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (["boolean", "number"].includes(typeof value)) return value;
  if (typeof value === "string") return text(value, 12000);
  if (Array.isArray(value)) {
    return value.slice(0, 60).map((item) => safeJson(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, entry]) => [text(key, 120), safeJson(entry, depth + 1)])
      .filter(([key, entry]) => key && entry !== undefined)
  );
}

function orderSummary(order = {}) {
  const source = plainObject(order);
  return {
    id: text(source.id || source.orderId || source.ebayOrderId, 200),
    status: text(source.status || source.orderStatus || source.fulfillmentStatus, 100),
    orderDate: text(source.orderDate || source.createdAt, 100),
    shippingDeadline: text(source.shippingDeadline || source.shipByDate, 100),
    trackingNumber: text(source.trackingNumber || source.tracking, 300),
    total: safeJson(source.total || source.totalAmount),
    currency: text(source.currency, 20) || "EUR",
    items: (Array.isArray(source.items) ? source.items : []).slice(0, 20).map((item) => ({
      sku: text(item?.sku, 200),
      title: text(item?.title || item?.name, 500),
      quantity: Number(item?.quantity || 0) || 0,
      price: safeJson(item?.price),
    })),
  };
}

function returnSummary(item = {}) {
  const source = plainObject(item);
  return {
    id: text(source.id || source.returnId || source.caseId, 200),
    orderId: text(source.orderId || source.ebayOrderId, 200),
    status: text(source.status || source.state, 100),
    reason: text(source.reason || source.returnReason || source.issue, 2000),
    createdAt: text(source.createdAt || source.date, 100),
    amount: safeJson(source.amount || source.refundAmount),
  };
}

function taskSummary(task = {}) {
  const source = plainObject(task);
  return {
    id: text(source.id, 200),
    agentId: text(source.agentId, 100),
    title: text(source.title, 500),
    status: text(source.status, 100),
    summary: text(source.result?.summary || source.summary, 2000),
    updatedAt: text(source.updatedAt || source.createdAt, 100),
  };
}

function firstObject(source, keys) {
  for (const key of keys) {
    if (source?.[key] && typeof source[key] === "object" && !Array.isArray(source[key])) return source[key];
  }
  return {};
}

function firstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) return source[key];
  }
  return [];
}

export function isCustomAgentId(value) {
  return CUSTOM_AGENT_ID.test(text(value, 100).toLowerCase());
}

export function resolveCoreExecution(value) {
  const visibleId = canonicalV2AgentId(value);
  if (!visibleId) return null;

  if (visibleId === "elyon-manager") {
    return {
      kind: "core",
      visibleId,
      backendAgentId: "elyon-operations-manager",
      runner: "workforce_v2",
      defaultAction: "run_manager",
      allowedActions: ["run_manager", "run_agent"],
    };
  }

  if (visibleId === "elyon-draft-quality-guard") {
    return {
      kind: "core",
      visibleId,
      backendAgentId: "elyon-draft-quality-guard",
      runner: "workforce_v2",
      defaultAction: "run_draft_quality",
      allowedActions: ["run_draft_quality", "run_agent"],
    };
  }

  const backendId = backendAgentId(visibleId);
  const definition = getAgentDefinition(backendId);
  if (!backendId || !definition) return null;
  const preferred = {
    "elyon-product-data-specialist": "analyze_product",
    "elyon-compliance-specialist": "analyze_product",
    "elyon-profit-specialist": "analyze_product",
    "elyon-listing-specialist": "analyze_listing",
    "elyon-order-specialist": "analyze_order",
    "elyon-customer-support-specialist": "analyze_return",
  }[visibleId] || "run_agent";

  return {
    kind: "core",
    visibleId,
    backendAgentId: backendId,
    runner: "advanced",
    defaultAction: preferred,
    allowedActions: [...definition.actions],
  };
}

export function resolveRegistryAction(requestedAction, target) {
  const action = text(requestedAction, 100).toLowerCase();
  if (EXTERNAL_ACTIONS.has(action)) {
    return { ok: false, error: "external_action_locked", action };
  }

  if (target?.kind === "custom") {
    const normalized = action || "run_agent";
    if (!CUSTOM_ACTIONS.has(normalized)) return { ok: false, error: "action_not_allowed", action: normalized };
    return { ok: true, action: normalized };
  }

  if (!target) return { ok: false, error: "unknown_agent", action };
  if (!action || action === "run_agent") return { ok: true, action: target.defaultAction };
  if (!target.allowedActions.includes(action)) return { ok: false, error: "action_not_allowed", action };
  return { ok: true, action };
}

export function filterCustomAgentInput(agent, input = {}) {
  const access = plainObject(agent?.contextAccess);
  const source = plainObject(input);
  const output = {};

  if (access.product !== false) {
    output.product = safeJson(firstObject(source, ["product", "productData", "sourceProduct"]));
  }
  if (access.listing === true) {
    output.listingDraft = safeJson(firstObject(source, ["listingDraft", "listing", "draft"]));
  }
  if (access.market === true) {
    output.market = safeJson(firstObject(source, ["market", "marketResearch", "marketCheck", "ebayMarketResearch"]));
  }
  if (access.orders === true) {
    output.orders = firstArray(source, ["orders", "sales"]).slice(0, 10).map(orderSummary);
  }
  if (access.returns === true) {
    output.returns = firstArray(source, ["returns", "returnCases"]).slice(0, 10).map(returnSummary);
  }
  if (access.tasks === true) {
    output.tasks = firstArray(source, ["tasks", "agentTasks"]).slice(0, 20).map(taskSummary);
  }

  return output;
}

export function buildStrictCoreRequest(body, target, action) {
  const source = plainObject(body);
  const input = safeJson(plainObject(source.input || source.context || source.data || {})) || {};
  const task = plainObject(source.task);
  return {
    action,
    agentId: target.runner === "advanced" ? target.backendAgentId : target.visibleId,
    title: text(source.title, 500),
    taskPrompt: text(source.taskPrompt || source.prompt || source.description, 8000),
    priority: text(source.priority, 50),
    sourceId: text(source.sourceId, 300),
    sourceType: text(source.sourceType, 100),
    input,
    ...(action === "retry_task" && task.id ? { task: safeJson(task) } : {}),
  };
}

export function hasInlineAgentDefinition(body = {}) {
  const source = plainObject(body);
  return Boolean(source.customAgent || source.agent || source.systemPrompt || source.configuration || source.settings);
}

export function publicExecutionDescriptor(agent) {
  if (!agent) return null;
  if (agent.kind === "custom") {
    return {
      id: agent.id,
      kind: "custom",
      enabled: agent.enabled !== false,
      runner: "registry_custom",
      defaultAction: "run_agent",
      allowedActions: [...CUSTOM_ACTIONS],
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.slice(0, 40) : [],
      contextAccess: plainObject(agent.contextAccess),
      allowedTools: Array.isArray(agent.allowedTools) ? agent.allowedTools.slice(0, 60) : [],
    };
  }
  const target = resolveCoreExecution(agent.id || agent.backendAgentId);
  return target ? {
    id: target.visibleId,
    kind: "core",
    enabled: true,
    runner: target.runner,
    defaultAction: target.defaultAction,
    allowedActions: [...target.allowedActions],
    capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.slice(0, 40) : [],
  } : null;
}

export { EXTERNAL_ACTIONS };
