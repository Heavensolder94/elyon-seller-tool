import { isSellerAuthenticated, requireSellerAccess, setSellerSecurityHeaders } from "../lib/seller-access.js";
import { validateBridgeAccess } from "../lib/bridge-access.js";
import {
  getJarvisPipelineControlSnapshot,
  saveJarvisPipelineControl,
} from "../lib/elyon-jarvis-pipeline-control-store.js";

const MAX_BODY_BYTES = 32 * 1024;

function text(value, max = 1000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function bridgeError(res, result) {
  return res.status(result.status || 403).json({
    ok: false,
    error: result.error || "bridge_access_denied",
    message: "Elyon-Pipeline-Control-Zugriff nicht autorisiert.",
  });
}

function publicSnapshot(snapshot = {}) {
  return {
    phase: "E5",
    pipeline: snapshot.pipeline || { enabled: false },
    control: snapshot.control || { mode: "manual", killSwitch: true, pausedByGuard: false, state: "paused" },
    permissions: {
      internalPipelineAllowed: snapshot.permissions?.internalPipelineAllowed === true,
      ebayDraftAllowed: snapshot.permissions?.ebayDraftAllowed === true,
      livePublishingAllowed: false,
      supplierOrdersAllowed: false,
      customerMessagesAllowed: false,
      refundsAllowed: false,
      legalDataChangesAllowed: false,
    },
    reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons.slice(0, 20).map((item) => text(item, 120)) : [],
    autonomyPolicy: snapshot.autonomyPolicy || null,
  };
}

export default async function handler(req, res) {
  setSellerSecurityHeaders(res);
  res.setHeader("X-Elyon-Jarvis-Pipeline-Control", "phase-e5-v2");

  if (req.method === "OPTIONS") {
    if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
    return res.status(204).end();
  }

  if (req.method === "GET") {
    if (!isSellerAuthenticated(req)) {
      const bridge = validateBridgeAccess(req, process.env, { maxBodyBytes: MAX_BODY_BYTES });
      if (!bridge.ok) return bridgeError(res, bridge);
    } else if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) {
      return;
    }

    try {
      const snapshot = await getJarvisPipelineControlSnapshot({ e5V2: true });
      return res.status(200).json({ ok: true, ...publicSnapshot(snapshot) });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        error: text(error?.code, 120) || "jarvis_pipeline_control_unavailable",
        message: text(error?.message, 1000) || "Jarvis-Pipeline-Control ist nicht verfügbar.",
      });
    }
  }

  if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "pipeline_enabled_required", message: "enabled muss true oder false sein." });
    }
    await saveJarvisPipelineControl({ enabled: body.enabled }, { e5V2: true });
    const snapshot = await getJarvisPipelineControlSnapshot({ e5V2: true });
    return res.status(200).json({ ok: true, ...publicSnapshot(snapshot) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: text(error?.code, 120) || "jarvis_pipeline_control_write_failed",
      message: text(error?.message, 1000) || "Jarvis-Pipeline-Control konnte nicht gespeichert werden.",
    });
  }
}

export { publicSnapshot };
