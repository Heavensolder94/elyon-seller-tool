import { isSellerAuthenticated, requireSellerAccess, setSellerSecurityHeaders } from "../lib/seller-access.js";
import { validateBridgeAccess } from "../lib/bridge-access.js";
import { getJarvisControlSnapshot } from "../lib/elyon-jarvis-control-store.js";
import {
  getJarvisEventStorageInfo,
  hasJarvisEventStorage,
  ingestJarvisEvent,
  listJarvisEvents,
} from "../lib/elyon-jarvis-event-store.js";
import { armJarvisJobForWorker } from "../lib/elyon-jarvis-worker-store.js";

const E2_BRIDGE_EVENT_TYPE = "nova.product.created";
const E2_BRIDGE_SOURCE = "company-os";
const E5_BRIDGE_EVENT_TYPES = new Set([
  E2_BRIDGE_EVENT_TYPE,
  "product.check.completed",
  "market.analysis.completed",
  "market.decision.approved",
  "listing.design.completed",
  "ebay.draft.created",
  "automation.failed",
]);
const MAX_BODY_BYTES = 256 * 1024;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function limit(value) {
  const parsed = Number(value);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? Math.trunc(parsed) : 20));
}

function bridgeError(res, result) {
  const messages = {
    bridge_not_configured: "Die interne Elyon-Brücke ist noch nicht konfiguriert.",
    bridge_access_denied: "Elyon-Brückenzugriff nicht autorisiert.",
    bridge_request_too_large: "Der Event-Datensatz ist zu groß.",
  };
  return res.status(result.status || 403).json({
    ok: false,
    error: result.error || "bridge_access_denied",
    message: messages[result.error] || "Elyon-Brückenzugriff nicht autorisiert.",
  });
}

function validateE2BridgeEvent(body = {}) {
  const type = text(body.type || body.eventType, 120).toLowerCase();
  const source = text(body.source || body.origin, 100).toLowerCase();
  const sourceId = text(body.sourceId || body.entityId || body.productId, 300);
  const idempotencyKey = text(body.idempotencyKey, 500);
  if (type !== E2_BRIDGE_EVENT_TYPE || source !== E2_BRIDGE_SOURCE) {
    return { ok: false, error: "jarvis_e2_bridge_event_not_allowed" };
  }
  if (!sourceId || idempotencyKey !== `${E2_BRIDGE_EVENT_TYPE}:${sourceId}`) {
    return { ok: false, error: "jarvis_e2_bridge_identity_invalid" };
  }
  return { ok: true };
}

export function validateE5BridgeEvent(body = {}) {
  const type = text(body.type || body.eventType, 120).toLowerCase();
  const source = text(body.source || body.origin, 100).toLowerCase();
  const sourceId = text(body.sourceId || body.entityId || body.productId, 300);
  const idempotencyKey = text(body.idempotencyKey, 500);
  if (source !== E2_BRIDGE_SOURCE || !E5_BRIDGE_EVENT_TYPES.has(type)) {
    return { ok: false, error: "jarvis_e5_bridge_event_not_allowed" };
  }
  if (!sourceId) return { ok: false, error: "jarvis_e5_bridge_identity_invalid" };
  if (type === E2_BRIDGE_EVENT_TYPE) return validateE2BridgeEvent(body);

  const payload = plainObject(body.payload || body.data || body.context);
  const pipelineJobId = text(payload.pipelineJobId, 200);
  if (!pipelineJobId || idempotencyKey !== `${type}:${pipelineJobId}:${sourceId}`) {
    return { ok: false, error: "jarvis_e5_bridge_identity_invalid" };
  }
  return { ok: true };
}

async function controlSnapshotSafe() {
  try {
    return await getJarvisControlSnapshot();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setSellerSecurityHeaders(res);
  res.setHeader("X-Elyon-Jarvis-Events", "phase-e5-v1");

  if (req.method === "GET") {
    if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
  } else if (req.method === "POST") {
    const sellerAuthenticated = isSellerAuthenticated(req);
    if (sellerAuthenticated) {
      if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
    } else {
      const bridgeAccess = validateBridgeAccess(req, process.env, { maxBodyBytes: MAX_BODY_BYTES });
      if (!bridgeAccess.ok) return bridgeError(res, bridgeAccess);
      const allowed = validateE5BridgeEvent(plainObject(req.body));
      if (!allowed.ok) {
        return res.status(403).json({
          ok: false,
          error: allowed.error,
          message: "Die Company-OS-Brücke akzeptiert nur fest definierte E5-Events mit stabiler Pipeline-Identität.",
        });
      }
    }
  } else if (req.method === "OPTIONS") {
    if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
    return res.status(204).end();
  } else {
    if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Jarvis Events erlaubt nur GET und POST." });
  }

  try {
    if (req.method === "GET") {
      const storage = getJarvisEventStorageInfo();
      const [events, control] = await Promise.all([
        storage.configured ? listJarvisEvents({ limit: limit(req.query?.limit) }) : Promise.resolve([]),
        storage.configured ? controlSnapshotSafe() : Promise.resolve(null),
      ]);
      return res.status(200).json({
        ok: true,
        phase: "E5",
        events,
        storage,
        control,
        safety: {
          autonomousExecutionEnabled: control?.decision?.allowed === true,
          autonomousScope: "company-os:nova.product.created",
          pipelineEventsExecuteAgents: false,
          eventIngestionExecutesAgents: false,
          externalActionsLocked: true,
          livePublishingAllowed: false,
        },
      });
    }

    if (!hasJarvisEventStorage()) {
      return res.status(503).json({
        ok: false,
        error: "jarvis_event_storage_unconfigured",
        message: "Der persistente Jarvis-Event-Speicher ist noch nicht konfiguriert.",
        storage: getJarvisEventStorageInfo(),
      });
    }

    const body = plainObject(req.body);
    const result = await ingestJarvisEvent(body);
    const armed = await armJarvisJobForWorker(result.job);
    const job = armed.job || result.job;
    const control = await controlSnapshotSafe();
    const workerAllowed = armed.armed === true && control?.decision?.allowed === true;
    return res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      phase: "E5",
      duplicate: result.duplicate,
      event: result.event,
      job,
      storage: result.storage,
      control,
      automation: {
        armedForWorker: armed.armed === true,
        workerAllowed,
        workerState: text(control?.decision?.state, 30) || "paused",
        workerScope: armed.armed ? "company-os:nova.product.created" : "event_observation_only",
      },
      safety: {
        autonomousExecutionEnabled: workerAllowed,
        eventIngestionExecutesAgents: false,
        pipelineEventsExecuteAgents: false,
        jobExecutionPolicy: text(job.executionPolicy, 50) || "manual_dispatch",
        externalActionsLocked: true,
        livePublishingAllowed: false,
      },
    });
  } catch (error) {
    const code = text(error?.code, 100);
    if (code === "event_action_blocked") {
      return res.status(403).json({ ok: false, error: code, message: text(error?.message) || "Diese Event-Aktion ist technisch gesperrt.", safety: { externalActionsLocked: true, livePublishingAllowed: false } });
    }
    if (code === "event_type_not_supported") {
      return res.status(400).json({ ok: false, error: code, message: text(error?.message) || "Nicht unterstützter Ereignistyp." });
    }
    return res.status(500).json({ ok: false, error: "jarvis_event_ingestion_failed", message: text(error?.message) || "Jarvis-Ereignis konnte nicht gespeichert werden." });
  }
}

export { E5_BRIDGE_EVENT_TYPES, controlSnapshotSafe, validateE2BridgeEvent };
