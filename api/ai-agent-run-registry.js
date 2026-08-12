import customAgentHandler from "./ai-agent-run-custom.js";
import { getCustomAgentRegistryItem } from "../lib/ai-agent-registry-store.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

export default async function handler(req, res) {
  if (String(req?.method || "").toUpperCase() !== "POST") {
    return customAgentHandler(req, res);
  }

  const body = plainObject(req.body);
  if (body.customAgent || body.agent) return customAgentHandler(req, res);

  const agentId = text(body.agentId || body.task?.agentId, 100).toLowerCase();
  if (!agentId) {
    return res.status(400).json({
      ok: false,
      error: "agent_id_required",
      message: "Für den Registry-Runner ist eine Agent-ID erforderlich.",
    });
  }

  try {
    const agent = await getCustomAgentRegistryItem(agentId);
    if (!agent || agent.enabled === false) {
      return res.status(404).json({
        ok: false,
        error: "registry_agent_not_found",
        message: "Der angeforderte Registry-Mitarbeiter wurde nicht gefunden oder ist deaktiviert.",
      });
    }
    req.body = { ...body, customAgent: agent };
    return customAgentHandler(req, res);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "registry_agent_lookup_failed",
      message: text(error?.message, 2000) || "Registry-Mitarbeiter konnte nicht geladen werden.",
    });
  }
}
