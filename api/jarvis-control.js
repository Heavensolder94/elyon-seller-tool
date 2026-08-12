import { requireSellerAccess } from "../lib/seller-access.js";
import {
  getJarvisControlSnapshot,
  updateJarvisControl,
} from "../lib/elyon-jarvis-control-store.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function allowedPatch(body = {}) {
  const source = plainObject(body);
  return {
    ...(Object.prototype.hasOwnProperty.call(source, "mode") ? { mode: source.mode } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "killSwitch") ? { killSwitch: source.killSwitch === true } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "resume") ? { resume: source.resume === true } : {}),
    ...(source.automations ? { automations: plainObject(source.automations) } : {}),
    ...(source.limits ? { limits: plainObject(source.limits) } : {}),
    ...(source.budget ? { budget: plainObject(source.budget) } : {}),
    ...(source.errorGuard ? { errorGuard: plainObject(source.errorGuard) } : {}),
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis-Control", "phase-e4-v1");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const snapshot = await getJarvisControlSnapshot();
      return res.status(200).json({ ok: true, ...snapshot });
    }

    if (req.method !== "PUT") {
      return res.status(405).json({
        ok: false,
        error: "method_not_allowed",
        message: "Jarvis E4 Control erlaubt nur GET und PUT.",
      });
    }

    const patch = allowedPatch(req.body);
    await updateJarvisControl(patch);
    const snapshot = await getJarvisControlSnapshot();
    return res.status(200).json({
      ok: true,
      ...snapshot,
      safety: {
        ...snapshot.safety,
        externalActionsLocked: true,
        livePublishingAllowed: false,
      },
    });
  } catch (error) {
    const code = text(error?.code, 120);
    const storageError = code === "jarvis_control_storage_unconfigured";
    return res.status(storageError ? 503 : 500).json({
      ok: false,
      phase: "E4",
      error: code || "jarvis_control_failed",
      message: text(error?.message, 2000) || "Jarvis Autopilot Control konnte nicht geladen oder gespeichert werden.",
      safety: {
        failClosed: true,
        externalActionsLocked: true,
        livePublishingAllowed: false,
      },
    });
  }
}

export { allowedPatch };
