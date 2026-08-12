import { requireSellerAccess } from "../lib/seller-access.js";
import {
  getJarvisEventStorageInfo,
  listJarvisJobs,
} from "../lib/elyon-jarvis-event-store.js";

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function limit(value) {
  const parsed = Number(value);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? Math.trunc(parsed) : 20));
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis-Jobs", "phase-e1-v1");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "jarvis_jobs_read_only",
      message: "Phase E1 stellt die Cloud-Queue nur lesend bereit. Autonome Job-Ausführung ist noch deaktiviert.",
      safety: {
        autonomousExecutionEnabled: false,
        livePublishingAllowed: false,
      },
    });
  }

  try {
    const storage = getJarvisEventStorageInfo();
    const jobs = storage.configured
      ? await listJarvisJobs({
          limit: limit(req.query?.limit),
          status: text(req.query?.status, 50),
        })
      : [];
    return res.status(200).json({
      ok: true,
      phase: "E1",
      jobs,
      storage,
      queue: {
        mode: "manual_dispatch",
        autonomousExecutionEnabled: false,
        retryMetadataEnabled: true,
        workerEnabled: false,
      },
      safety: {
        externalActionsLocked: true,
        livePublishingAllowed: false,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "jarvis_jobs_read_failed",
      message: text(error?.message) || "Jarvis-Cloud-Jobs konnten nicht geladen werden.",
    });
  }
}
