import crypto from "node:crypto";
import { runJarvisWorker } from "../lib/elyon-jarvis-worker.js";
import {
  buildJarvisAutonomyEnv,
  getJarvisE5ControlSnapshot,
} from "../lib/elyon-jarvis-e5-v2-policy.js";

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function equalSecret(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorizeCron(req, env = process.env) {
  const secret = text(env.CRON_SECRET);
  if (!secret) return { ok: false, status: 503, error: "jarvis_worker_cron_unconfigured" };
  const authorization = text(req?.headers?.authorization);
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer || !equalSecret(bearer, secret)) return { ok: false, status: 401, error: "jarvis_worker_access_denied" };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis-Worker", "phase-e5-v2");

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      message: "Der E5-Worker wird ausschließlich durch den geschützten Cloud-Cron aufgerufen.",
    });
  }

  const access = authorizeCron(req);
  if (!access.ok) {
    return res.status(access.status).json({
      ok: false,
      error: access.error,
      message: access.status === 503
        ? "CRON_SECRET ist für den Jarvis-Worker noch nicht konfiguriert."
        : "Jarvis-Worker-Zugriff nicht autorisiert.",
    });
  }

  try {
    const env = buildJarvisAutonomyEnv(process.env);
    const result = await runJarvisWorker({
      limit: 2,
      env,
      controlSnapshotImpl: (options = {}) => getJarvisE5ControlSnapshot({ ...options, e5V2: true }),
    });
    return res.status(200).json(result);
  } catch (error) {
    const code = text(error?.code, 120) || "jarvis_worker_failed";
    const configurationError = [
      "jarvis_worker_seller_access_unconfigured",
      "jarvis_worker_storage_unconfigured",
      "jarvis_control_storage_unconfigured",
    ].includes(code);
    return res.status(configurationError ? 503 : 500).json({
      ok: false,
      phase: "E5",
      error: code,
      message: text(error?.message, 2000) || "Jarvis E5 Worker konnte nicht ausgeführt werden.",
      safety: {
        failClosed: true,
        externalActionsLocked: true,
        livePublishingAllowed: false,
      },
    });
  }
}

export { authorizeCron, equalSecret };
