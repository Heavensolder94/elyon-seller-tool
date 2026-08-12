import { requireSellerAccess } from "../lib/seller-access.js";
import { getJarvisControlSnapshot } from "../lib/elyon-jarvis-control-store.js";
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
  res.setHeader("X-Elyon-Jarvis-Jobs", "phase-e4-v1");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "jarvis_jobs_read_only",
      message: "Die Cloud-Queue bleibt über diese API read-only. E4-Ausführung erfolgt ausschließlich über den geschützten und kontrollierten Cloud-Worker.",
      safety: {
        autonomousScope: "company-os:nova.product.created",
        externalActionsLocked: true,
        livePublishingAllowed: false,
      },
    });
  }

  try {
    const storage = getJarvisEventStorageInfo();
    const [jobs, control] = await Promise.all([
      storage.configured
        ? listJarvisJobs({
            limit: limit(req.query?.limit),
            status: text(req.query?.status, 50),
          })
        : Promise.resolve([]),
      storage.configured ? getJarvisControlSnapshot() : Promise.resolve(null),
    ]);
    const workerAllowed = control?.decision?.allowed === true;
    return res.status(200).json({
      ok: true,
      phase: "E4",
      jobs,
      storage,
      control,
      queue: {
        mode: text(control?.control?.mode, 30) || "assisted",
        autonomousExecutionEnabled: workerAllowed,
        autonomousScope: "company-os:nova.product.created",
        retryMetadataEnabled: true,
        workerScheduled: true,
        workerEnabled: workerAllowed,
        workerState: text(control?.decision?.state, 30) || "paused",
        schedule: "*/5 * * * *",
        maxJobsPerRun: Number(control?.decision?.batchLimit || 0),
        hardMaxJobsPerRun: 2,
        maxAgentsPerJob: 1,
      },
      safety: {
        externalActionsLocked: true,
        livePublishingAllowed: false,
        supplierOrdersAllowed: false,
        customerMessagesAllowed: false,
        refundsAllowed: false,
        legalDataChangesAllowed: false,
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
