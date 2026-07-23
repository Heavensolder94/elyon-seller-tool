import crypto from "node:crypto";

const MAX_BODY_BYTES = 512 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function expectedToken() {
  return text(process.env.AMAZON_IMPORTER_ACCESS_TOKEN || process.env.ELYON_IMPORTER_ACCESS_TOKEN);
}

function providedToken(req) {
  const authorization = text(req?.headers?.authorization);
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return text(req?.headers?.["x-elyon-import-token"] || req?.headers?.["x-elyon-access-token"] || bearer);
}

function equalSecret(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hasPersistentImporterStorage() {
  return Boolean(
    (process.env.UPSTASH_BACKUP_URL && process.env.UPSTASH_BACKUP_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  );
}

export function setImporterCors(req, res) {
  const origin = text(req?.headers?.origin);
  if (origin.startsWith("chrome-extension://")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Elyon-Import-Token,X-Elyon-Access-Token");
  res.setHeader("Cache-Control", "no-store");
}

export function estimateRequestBodyBytes(req) {
  try {
    if (typeof req?.body === "string") return Buffer.byteLength(req.body, "utf8");
    return Buffer.byteLength(JSON.stringify(req?.body ?? {}), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function requireImporterAccess(req, res, options = {}) {
  setImporterCors(req, res);
  if (req?.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }

  const expected = expectedToken();
  if (!expected) {
    res.status(503).json({
      ok: false,
      error: "importer_access_not_configured",
      message: "Amazon Importer ist sicher gesperrt, bis AMAZON_IMPORTER_ACCESS_TOKEN serverseitig konfiguriert ist."
    });
    return false;
  }

  const provided = providedToken(req);
  if (!provided || !equalSecret(provided, expected)) {
    res.status(403).json({ ok: false, error: "importer_access_denied", message: "Importer-Zugriff nicht autorisiert." });
    return false;
  }

  if (options.requirePersistentStorage === true && !hasPersistentImporterStorage()) {
    res.status(503).json({
      ok: false,
      error: "persistent_storage_required",
      message: "Produktiver Browser-Import ist ohne Upstash/KV-Persistenz gesperrt."
    });
    return false;
  }

  const maxBodyBytes = Number(options.maxBodyBytes || MAX_BODY_BYTES);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(String(req?.method || "").toUpperCase()) && estimateRequestBodyBytes(req) > maxBodyBytes) {
    res.status(413).json({ ok: false, error: "request_too_large", message: "Importer-Anfrage ist zu groß." });
    return false;
  }

  return true;
}

export function importerAccessConfigured() {
  return Boolean(expectedToken());
}
