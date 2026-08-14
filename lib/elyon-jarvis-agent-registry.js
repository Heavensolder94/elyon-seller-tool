import { listCombinedAgentRegistry } from "./ai-agent-registry-store.js";
import { publicExecutionDescriptor } from "./ai-agent-universal-runner.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

const CORE_INPUTS = Object.freeze({
  "elyon-manager": ["tasks"],
  "elyon-product-data-specialist": ["product"],
  "elyon-compliance-specialist": ["product"],
  "elyon-profit-specialist": ["product"],
  "elyon-listing-specialist": ["product", "listingDraft"],
  "elyon-draft-quality-guard": ["product", "listingDraft"],
  "elyon-order-specialist": ["orders"],
  "elyon-customer-support-specialist": ["returns"],
});

const CORE_OUTPUT_TYPES = Object.freeze({
  "elyon-manager": "workflow_briefing",
  "elyon-product-data-specialist": "product_analysis",
  "elyon-compliance-specialist": "compliance_report",
  "elyon-profit-specialist": "profit_analysis",
  "elyon-listing-specialist": "listing_draft",
  "elyon-draft-quality-guard": "draft_quality_report",
  "elyon-order-specialist": "order_analysis",
  "elyon-customer-support-specialist": "support_draft",
});

function customRequiredInput(agent) {
  const access = plainObject(agent?.contextAccess);
  const result = [];
  if (access.product !== false) result.push("product");
  if (access.listing === true) result.push("listingDraft");
  if (access.market === true) result.push("market");
  if (access.orders === true) result.push("orders");
  if (access.returns === true) result.push("returns");
  if (access.tasks === true) result.push("tasks");
  return result;
}

function isAvailable(agent, execution) {
  if (!agent || agent.enabled === false) return false;
  if (agent.kind === "custom" && text(agent.autonomyMode, 50).toLowerCase() === "off") return false;
  return Boolean(execution);
}

export function describeJarvisAgent(agent = {}) {
  const execution = publicExecutionDescriptor(agent);
  const available = isAvailable(agent, execution);
  const requiredInput = agent.kind === "custom"
    ? customRequiredInput(agent)
    : [...(CORE_INPUTS[agent.id] || [])];

  return {
    ...agent,
    capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.slice(0, 40) : [],
    requiredInput,
    outputType: agent.kind === "custom" ? "custom_agent_result" : (CORE_OUTPUT_TYPES[agent.id] || "agent_result"),
    handler: "registry_runner",
    endpoint: "/api/ai-agent-run-registry",
    execution,
    availability: {
      available,
      reason: available
        ? "ready"
        : agent.enabled === false
          ? "disabled"
          : agent.kind === "custom" && text(agent.autonomyMode, 50).toLowerCase() === "off"
            ? "autonomy_off"
            : "execution_unavailable",
    },
  };
}

export async function listJarvisAgentRegistry(options = {}) {
  const registry = await listCombinedAgentRegistry(options);
  const agents = (Array.isArray(registry.agents) ? registry.agents : []).map(describeJarvisAgent);
  const coreAgents = agents.filter((agent) => agent.kind !== "custom");
  const customAgents = agents.filter((agent) => agent.kind === "custom");
  return {
    ...registry,
    agents,
    coreAgents,
    customAgents,
  };
}

export { CORE_INPUTS, CORE_OUTPUT_TYPES };
