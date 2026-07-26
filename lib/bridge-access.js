import crypto from "node:crypto";

const MAX_BODY_BYTES = 512 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function expectedSecret(env = process.env) {
  return text(env.ELYON_BRIDGE_SECRET || env.ELYON_COMPANY_OS_BRIDGE_SECRET);
}

function providedSecret(req) {
  const authorization = text(req?.headers?.authorization);
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return text(req?.headers?.["x-elyon-bridge-secret"] || bearer);
}

function equalSecret(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bodyBytes(req) {
  try {
    if (typeof req?.body === "string") return Buffer.byteLength(req.body, "utf8");
    return Buffer.byteLength(JSON.stringify(req?.body ?? {}), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function bridgeAccessConfigured(env = process.env) {
  return Boolean(expectedSecret(env));
}

export function validateBridgeAccess(req, env = process.env, options = {}) {
  const expected = expectedSecret(env);
  if (!expected) return { ok: false, status: 503, error: "bridge_not_configured" };
  const provided = providedSecret(req);
  if (!provided || !equalSecret(provided, expected)) return { ok: false, status: 403, error: "bridge_access_denied" };
  const maxBodyBytes = Number(options.maxBodyBytes || MAX_BODY_BYTES);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(String(req?.method || "").toUpperCase()) && bodyBytes(req) > maxBodyBytes) {
    return { ok: false, status: 413, error: "bridge_request_too_large" };
  }
  return { ok: true };
}

export function requireBridgeAccess(req, res, options = {}) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const result = validateBridgeAccess(req, process.env, options);
  if (result.ok) return true;
  const messages = {
    bridge_not_configured: "Die interne Company-OS-Brücke ist noch nicht konfiguriert.",
    bridge_access_denied: "Company-OS-Brückenzugriff nicht autorisiert.",
    bridge_request_too_large: "Der übertragene Produktdatensatz ist zu groß.",
  };
  res.status(result.status).json({ ok: false, error: result.error, message: messages[result.error] || result.error });
  return false;
}
