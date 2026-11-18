import crypto from "node:crypto";
import { runAutomaticEbayFinanceSync } from "../lib/ebay-finance-auto-sync.js";

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function authorizeFinanceCron(req, env = process.env) {
  const secret = String(env.CRON_SECRET || "").trim();
  if (!secret) return { ok: false, status: 503, error: "finance_cron_not_configured" };
  const provided = String(req?.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!equalSecret(provided, secret)) return { ok: false, status: 401, error: "finance_cron_access_denied" };
  return { ok: true };
}

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const access = authorizeFinanceCron(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
  try {
    const result = await runAutomaticEbayFinanceSync();
    return res.status(200).json(result);
  } catch (failure) {
    const status = [401, 403, 409, 503].includes(Number(failure?.status))
      ? Number(failure.status) : 500;
    return res.status(status).json({
      ok: false,
      error: String(failure?.code || "finance_auto_sync_failed"),
      message: "Automatischer Finanzabgleich fehlgeschlagen. Vorhandene Buchungen bleiben erhalten.",
    });
  }
}
