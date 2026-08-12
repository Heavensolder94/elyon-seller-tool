import { requireSellerAccess } from "../lib/seller-access.js";
import {
  deleteCustomAgentRegistryItem,
  getAgentRegistryStorageInfo,
  getCustomAgentRegistryItem,
  hasAgentRegistryStorage,
  listCombinedAgentRegistry,
  replaceCustomAgentRegistry,
  upsertCustomAgentRegistryItem,
} from "../lib/ai-agent-registry-store.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function mutationUnavailable(res) {
  const storage = getAgentRegistryStorageInfo();
  return res.status(503).json({
    ok: false,
    error: "agent_registry_storage_unconfigured",
    message: "Die serverseitige Agent Registry ist noch nicht mit dem vorhandenen Elyon Redis/KV-Speicher verbunden.",
    storage,
  });
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 1024 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const requestedId = text(req.query?.id, 100).toLowerCase();
      if (requestedId) {
        const agent = await getCustomAgentRegistryItem(requestedId);
        if (!agent) return res.status(404).json({ ok: false, error: "agent_not_found", message: "Mitarbeiter wurde nicht gefunden." });
        return res.status(200).json({ ok: true, agent, storage: getAgentRegistryStorageInfo() });
      }
      const registry = await listCombinedAgentRegistry();
      return res.status(200).json({
        ok: true,
        version: 1,
        ...registry,
        safety: {
          coreAgentsLocked: true,
          liveExternalActionsGrantedByRegistry: false,
        },
      });
    }

    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Erlaubt sind GET, POST, PUT und DELETE." });
    }

    if (!hasAgentRegistryStorage()) return mutationUnavailable(res);

    if (req.method === "POST") {
      const body = plainObject(req.body);
      const incoming = plainObject(body.agent || body.customAgent || body);
      const result = await upsertCustomAgentRegistryItem(incoming);
      return res.status(result.status === "created" ? 201 : 200).json({
        ok: true,
        version: 1,
        status: result.status,
        agent: result.agent,
        customAgents: result.agents,
        storage: { configured: result.persisted, source: result.source },
      });
    }

    if (req.method === "PUT") {
      const body = plainObject(req.body);
      const agents = Array.isArray(body.customAgents) ? body.customAgents : Array.isArray(body.agents) ? body.agents : [];
      const result = await replaceCustomAgentRegistry(agents);
      return res.status(200).json({
        ok: true,
        version: 1,
        status: "replaced",
        customAgents: result.agents,
        storage: { configured: result.persisted, source: result.source },
      });
    }

    const body = plainObject(req.body);
    const id = text(req.query?.id || body.id || body.agentId, 100).toLowerCase();
    if (!id) return res.status(400).json({ ok: false, error: "agent_id_required", message: "Agent-ID fehlt." });
    const result = await deleteCustomAgentRegistryItem(id);
    return res.status(result.deleted ? 200 : 404).json({
      ok: result.deleted,
      version: 1,
      status: result.deleted ? "deleted" : "not_found",
      id,
      customAgents: result.agents,
      storage: { configured: result.persisted, source: result.source },
    });
  } catch (error) {
    const message = text(error?.message, 2000) || "Agent Registry konnte nicht verarbeitet werden.";
    const invalid = /ungültig|pflicht|reserviert/i.test(message);
    return res.status(invalid ? 400 : 500).json({
      ok: false,
      error: invalid ? "invalid_agent_registry_data" : "agent_registry_failed",
      message,
    });
  }
}
