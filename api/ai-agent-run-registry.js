import { requireSellerAccess } from "../lib/seller-access.js";
import advancedAgentHandler from "./ai-agent-run-advanced.js";
import customAgentHandler from "./ai-agent-run-custom.js";
import workforceV2Handler from "./ai-workforce-v2.js";
import {
  getCustomAgentRegistryItem,
  listCombinedAgentRegistry,
} from "../lib/ai-agent-registry-store.js";
import {
  buildStrictCoreRequest,
  filterCustomAgentInput,
  hasInlineAgentDefinition,
  isCustomAgentId,
  publicExecutionDescriptor,
  resolveCoreExecution,
  resolveRegistryAction,
} from "../lib/ai-agent-universal-runner.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function actionError(res, result) {
  const external = result?.error === "external_action_locked";
  return res.status(403).json({
    ok: false,
    error: result?.error || "action_not_allowed",
    message: external
      ? "Diese externe Aktion ist im Elyon Registry Runner technisch gesperrt."
      : "Diese Aktion ist für den gewählten Mitarbeiter nicht freigegeben.",
    action: result?.action || "",
  });
}

async function registrySnapshot() {
  const registry = await listCombinedAgentRegistry();
  return {
    ...registry,
    agents: (registry.agents || []).map((agent) => ({
      ...agent,
      execution: publicExecutionDescriptor(agent),
    })),
    coreAgents: (registry.coreAgents || []).map((agent) => ({
      ...agent,
      execution: publicExecutionDescriptor(agent),
    })),
    customAgents: (registry.customAgents || []).map((agent) => ({
      ...agent,
      execution: publicExecutionDescriptor(agent),
    })),
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Agent-Runner", "registry-v2");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    try {
      const registry = await registrySnapshot();
      return res.status(200).json({
        ok: true,
        version: 2,
        route: "/api/ai-agent-run-registry",
        universalRunner: true,
        ...registry,
        safety: {
          registryIsSourceOfTruth: true,
          inlineAgentDefinitionsAccepted: false,
          externalActionsLocked: true,
          manualReviewRequired: true,
        },
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "registry_snapshot_failed",
        message: text(error?.message, 2000) || "Agent Registry konnte nicht geladen werden.",
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
  }

  const body = plainObject(req.body);
  if (hasInlineAgentDefinition(body)) {
    return res.status(400).json({
      ok: false,
      error: "inline_agent_definition_forbidden",
      message: "Der Registry Runner akzeptiert nur eine Agent-ID. Rolle, System-Prompt, Provider und Rechte werden ausschließlich serverseitig aus der Agent Registry geladen.",
    });
  }

  const agentId = text(body.agentId || body.task?.agentId, 100).toLowerCase();
  if (!agentId) {
    return res.status(400).json({
      ok: false,
      error: "agent_id_required",
      message: "Für den Registry Runner ist eine Agent-ID erforderlich.",
    });
  }

  try {
    const coreTarget = resolveCoreExecution(agentId);
    if (coreTarget) {
      const action = resolveRegistryAction(body.action, coreTarget);
      if (!action.ok) return actionError(res, action);

      req.body = buildStrictCoreRequest(body, coreTarget, action.action);
      res.setHeader("X-Elyon-Agent-Kind", "core");
      res.setHeader("X-Elyon-Agent-Id", coreTarget.visibleId);
      return coreTarget.runner === "workforce_v2"
        ? workforceV2Handler(req, res)
        : advancedAgentHandler(req, res);
    }

    if (!isCustomAgentId(agentId)) {
      return res.status(404).json({
        ok: false,
        error: "registry_agent_not_found",
        message: "Der angeforderte Mitarbeiter ist in der Agent Registry nicht bekannt.",
      });
    }

    const agent = await getCustomAgentRegistryItem(agentId);
    if (!agent || agent.enabled === false) {
      return res.status(404).json({
        ok: false,
        error: "registry_agent_not_found",
        message: "Der angeforderte Registry-Mitarbeiter wurde nicht gefunden oder ist deaktiviert.",
      });
    }

    const action = resolveRegistryAction(body.action, { kind: "custom" });
    if (!action.ok) return actionError(res, action);

    const rawInput = plainObject(body.input || body.context || body.data || {});
    req.body = {
      action: action.action,
      customAgent: agent,
      title: text(body.title, 500),
      priority: text(body.priority, 50),
      taskPrompt: text(body.taskPrompt || body.prompt || body.description, 8000),
      input: filterCustomAgentInput(agent, rawInput),
    };
    res.setHeader("X-Elyon-Agent-Kind", "custom");
    res.setHeader("X-Elyon-Agent-Id", agent.id);
    return customAgentHandler(req, res);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "registry_agent_execution_failed",
      message: text(error?.message, 2000) || "Registry-Mitarbeiter konnte nicht ausgeführt werden.",
    });
  }
}
