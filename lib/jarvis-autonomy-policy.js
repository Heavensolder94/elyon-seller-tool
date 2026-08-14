import { blockedCommand } from "./elyon-jarvis-core.js";

const MAX_AUTO_DELEGATIONS = 3;
const SAFE_AUTO_CAPABILITIES = new Set([
  "workflow",
  "product_data",
  "compliance",
  "profit",
  "listing",
  "draft_quality",
  "orders",
  "support",
]);

const PLAN_ONLY_PATTERN = /\b(?:nur\s+(?:planen|plan)|erst\s+(?:planen|plan)|nicht\s+(?:ausf(?:ü|ue)hren|delegieren)|keine\s+(?:ausf(?:ü|ue)hrung|delegation)|manuell\s+planen)\b/i;
const BRAIN_FIRST_PATTERN = /(?:was\s+ist\s+(?:mein|unser)\s+(?:aktuelles?\s+)?(?:ziel|fokus)|was\s+blockiert\s+(?:mich|uns)(?:\s+aktuell)?|was\s+sind\s+(?:meine|unsere)\s+(?:aktuellen?\s+)?(?:blocker|offenen?\s+aufgaben)|woran\s+arbeite(?:n\s+wir|\s+ich)?\s+(?:gerade|aktuell)|was\s+ist\s+(?:mein|unser)\s+n(?:ä|ae)chster\s+schritt|was\s+w(?:ü|ue)rdest\s+du\s+(?:jetzt\s+)?empfehlen|fass(?:e)?\s+(?:meinen|unseren)\s+aktuellen\s+stand\s+zusammen)/i;

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function isExplicitPlanOnly(command) {
  return PLAN_ONLY_PATTERN.test(text(command, 12000));
}

function isBrainFirstCommand(command) {
  return BRAIN_FIRST_PATTERN.test(text(command, 12000));
}

function autoDelegationDecision({ body = {}, plan = null, command = "" } = {}) {
  const objective = text(command, 12000);
  if (body?.autoDelegate === false) return { allowed: false, reason: "auto_delegation_disabled" };
  if (body?.execute === true || text(body?.mode, 30).toLowerCase() === "execute") return { allowed: false, reason: "explicit_execute_mode" };
  if (isExplicitPlanOnly(objective)) return { allowed: false, reason: "explicit_plan_only" };
  if (isBrainFirstCommand(objective)) return { allowed: false, reason: "brain_first_conversation" };

  const blocked = blockedCommand(objective);
  if (blocked.blocked) return { allowed: false, reason: "external_action_blocked", action: blocked.action };
  if (!plan || plan.status !== "ready" || plan.executable !== true) return { allowed: false, reason: "no_executable_plan" };
  if (plan.requiresUserApproval === true) return { allowed: false, reason: "user_approval_required" };
  if (Number(plan?.intent?.confidence || 0) < 0.9) return { allowed: false, reason: "routing_confidence_too_low" };

  const delegations = Array.isArray(plan.delegations) ? plan.delegations : [];
  if (!delegations.length) return { allowed: false, reason: "no_delegations" };
  if (delegations.length > MAX_AUTO_DELEGATIONS) return { allowed: false, reason: "too_many_delegations" };

  for (const delegation of delegations) {
    if (delegation?.kind !== "core") return { allowed: false, reason: "custom_agent_requires_manual_start" };
    const capability = text(delegation?.capability, 100);
    if (!SAFE_AUTO_CAPABILITIES.has(capability)) return { allowed: false, reason: "capability_not_auto_safe", capability };
    if (text(delegation?.action, 100) !== "run_agent") return { allowed: false, reason: "delegation_action_not_auto_safe" };
  }

  return {
    allowed: true,
    reason: "safe_internal_analysis",
    maxDelegations: MAX_AUTO_DELEGATIONS,
    capabilities: delegations.map((entry) => text(entry.capability, 100)).filter(Boolean),
    agentIds: delegations.map((entry) => text(entry.agentId, 100)).filter(Boolean),
  };
}

export {
  MAX_AUTO_DELEGATIONS,
  SAFE_AUTO_CAPABILITIES,
  autoDelegationDecision,
  isBrainFirstCommand,
  isExplicitPlanOnly,
};
