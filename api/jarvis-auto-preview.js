import { requireSellerAccess } from "../lib/seller-access.js";
import { listCombinedAgentRegistry } from "../lib/ai-agent-registry-store.js";
import { autoDelegationDecision, isBrainFirstCommand, isExplicitPlanOnly } from "../lib/jarvis-autonomy-policy.js";
import { createJarvisPlan } from "../lib/elyon-jarvis-core.js";
import { isMarketScoutCommand } from "../lib/jarvis-market-scout.js";

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function specialistPreview(plan = {}) {
  return (Array.isArray(plan.delegations) ? plan.delegations : []).slice(0, 3).map((delegation, index) => ({
    index,
    agentId: text(delegation.agentId, 100),
    agentName: text(delegation.agentName || delegation.agentId, 160),
    capability: text(delegation.capability, 100),
    reason: text(delegation.reason || delegation.taskPrompt, 600),
    kind: text(delegation.kind, 50) || "core",
    state: index === 0 ? "working" : "queued",
  }));
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 128 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis-Preview", "brain-v2-a2");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur POST ist erlaubt." });
  }

  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const command = text(body.command || body.objective || body.taskPrompt || body.prompt, 12000);
    if (!command) {
      return res.status(400).json({ ok: false, error: "jarvis_command_required", message: "Jarvis benötigt einen Auftrag." });
    }

    const registry = await listCombinedAgentRegistry();
    const agents = Array.isArray(registry.agents) ? registry.agents : [];
    const plan = createJarvisPlan({
      command,
      agents,
      explicitAgentId: text(body.agentId, 100),
      requestedCapability: text(body.capability, 100),
      maxAgents: body.maxAgents,
    });

    const marketScout = isMarketScoutCommand(command, plan);
    if (marketScout && body.autoDelegate !== false && !isExplicitPlanOnly(command)) {
      return res.status(200).json({
        ok: true,
        phase: "Brain V2-A.2",
        previewOnly: true,
        willAutoDelegate: true,
        type: "market_scout",
        reason: "read_only_market_research",
        specialists: [{
          index: 0,
          agentId: "elyon-market-scout",
          agentName: "Market Scout",
          capability: "market_research",
          reason: "Read-only Markt- und Produktsuche",
          kind: "system",
          state: "working",
        }],
        safety: { externalActionsLocked: true, livePublishingAllowed: false, nothingExecuted: true },
      });
    }

    if (isBrainFirstCommand(command)) {
      return res.status(200).json({
        ok: true,
        phase: "Brain V2-A.2",
        previewOnly: true,
        willAutoDelegate: false,
        type: "brain",
        reason: "brain_first_conversation",
        specialists: [],
        safety: { externalActionsLocked: true, nothingExecuted: true },
      });
    }

    const decision = autoDelegationDecision({ body: { ...body, autoDelegate: body.autoDelegate !== false }, plan, command });
    return res.status(200).json({
      ok: true,
      phase: "Brain V2-A.2",
      previewOnly: true,
      willAutoDelegate: decision.allowed === true,
      type: decision.allowed ? "specialist_delegation" : "plan",
      reason: decision.reason,
      specialists: decision.allowed ? specialistPreview(plan) : [],
      plan: {
        status: text(plan.status, 50),
        intent: { id: text(plan?.intent?.id, 100), confidence: Number(plan?.intent?.confidence || 0) },
        delegationCount: Array.isArray(plan.delegations) ? plan.delegations.length : 0,
      },
      safety: {
        externalActionsLocked: true,
        livePublishingAllowed: false,
        nothingExecuted: true,
        previewHasNoSideEffects: true,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "jarvis_preview_failed",
      message: text(error?.message, 2000) || "Delegations-Vorschau konnte nicht erstellt werden.",
    });
  }
}

export { specialistPreview };
