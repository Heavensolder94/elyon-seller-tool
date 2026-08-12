import { requireSellerAccess } from "../lib/seller-access.js";
import {
  getJarvisEventStorageInfo,
  hasJarvisEventStorage,
  ingestJarvisEvent,
  listJarvisEvents,
} from "../lib/elyon-jarvis-event-store.js";

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

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis-Events", "phase-e1-v1");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const storage = getJarvisEventStorageInfo();
      const events = storage.configured
        ? await listJarvisEvents({ limit: limit(req.query?.limit) })
        : [];
      return res.status(200).json({
        ok: true,
        phase: "E1",
        events,
        storage,
        safety: {
          autonomousExecutionEnabled: false,
          eventIngestionExecutesAgents: false,
          livePublishingAllowed: false,
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "method_not_allowed",
        message: "E1 erlaubt für Events nur GET und POST.",
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
    return res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      phase: "E1",
      duplicate: result.duplicate,
      event: result.event,
      job: result.job,
      storage: result.storage,
      safety: {
        autonomousExecutionEnabled: false,
        eventIngestionExecutesAgents: false,
        jobExecutionPolicy: "manual_dispatch",
        livePublishingAllowed: false,
      },
    });
  } catch (error) {
    const code = text(error?.code, 100);
    if (code === "event_action_blocked") {
      return res.status(403).json({
        ok: false,
        error: code,
        message: text(error?.message) || "Diese Event-Aktion ist technisch gesperrt.",
        safety: { externalActionsLocked: true, livePublishingAllowed: false },
      });
    }
    if (code === "event_type_not_supported") {
      return res.status(400).json({
        ok: false,
        error: code,
        message: text(error?.message) || "Nicht unterstützter Ereignistyp.",
      });
    }
    return res.status(500).json({
      ok: false,
      error: "jarvis_event_ingestion_failed",
      message: text(error?.message) || "Jarvis-Ereignis konnte nicht gespeichert werden.",
    });
  }
}
