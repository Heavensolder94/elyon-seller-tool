import crypto from "node:crypto";

const COOKIE_NAME = "elyon_seller_session";
const DEFAULT_SESSION_SECONDS = 12 * 60 * 60;
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function accessSecret() {
  return text(
    process.env.ELYON_SELLER_ACCESS_TOKEN ||
      process.env.ELYON_ADMIN_TOKEN ||
      process.env.FEATURE_FLAGS_ADMIN_TOKEN
  );
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64url(value) {
  try {
    return Buffer.from(String(value || ""), "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function equalSecret(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(payload, secret = accessSecret()) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(req) {
  const header = text(req?.headers?.cookie);
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function suppliedToken(req) {
  const authorization = text(req?.headers?.authorization);
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return text(
    req?.headers?.["x-elyon-seller-token"] ||
      req?.headers?.["x-elyon-access-token"] ||
      bearer
  );
}

function requestBodyBytes(req) {
  try {
    if (typeof req?.body === "string") return Buffer.byteLength(req.body, "utf8");
    return Buffer.byteLength(JSON.stringify(req?.body ?? {}), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isSecureRequest(req) {
  const proto = text(req?.headers?.["x-forwarded-proto"]).toLowerCase();
  const host = text(req?.headers?.host).toLowerCase();
  return proto === "https" || (!host.startsWith("localhost") && !host.startsWith("127.0.0.1"));
}

function cookieHeader(value, req, maxAge) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Number(maxAge || 0))}`,
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export function sellerAccessConfigured() {
  return Boolean(accessSecret());
}

export function verifySellerToken(token) {
  const expected = accessSecret();
  return Boolean(expected && equalSecret(token, expected));
}

export function createSellerSession(req, res, token, options = {}) {
  if (!verifySellerToken(token)) return { ok: false, error: "seller_access_denied" };
  const ttlSeconds = Math.min(
    Math.max(Number(options.ttlSeconds || DEFAULT_SESSION_SECONDS), 15 * 60),
    24 * 60 * 60
  );
  const payload = base64url(
    JSON.stringify({ scope: "seller", exp: Math.floor(Date.now() / 1000) + ttlSeconds })
  );
  const value = `${payload}.${signature(payload)}`;
  res.setHeader("Set-Cookie", cookieHeader(value, req, ttlSeconds));
  return { ok: true, expiresIn: ttlSeconds };
}

export function clearSellerSession(req, res) {
  res.setHeader("Set-Cookie", cookieHeader("", req, 0));
}

export function isSellerAuthenticated(req) {
  const secret = accessSecret();
  if (!secret) return false;

  const direct = suppliedToken(req);
  if (direct && equalSecret(direct, secret)) return true;

  const value = parseCookies(req)[COOKIE_NAME] || "";
  const [payload, providedSignature] = value.split(".");
  if (!payload || !providedSignature) return false;
  const expectedSignature = signature(payload, secret);
  if (!equalSecret(providedSignature, expectedSignature)) return false;

  try {
    const data = JSON.parse(decodeBase64url(payload));
    return data?.scope === "seller" && Number(data?.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function setSellerSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function requireSellerAccess(req, res, options = {}) {
  setSellerSecurityHeaders(res);

  if (!sellerAccessConfigured()) {
    res.status(503).json({
      ok: false,
      error: "seller_access_not_configured",
      message: "Seller-Zugriff ist gesperrt, bis ELYON_SELLER_ACCESS_TOKEN serverseitig gesetzt ist.",
    });
    return false;
  }

  if (!isSellerAuthenticated(req)) {
    res.status(403).json({
      ok: false,
      error: "seller_access_denied",
      message: "Seller-Tool-Sitzung fehlt oder ist abgelaufen.",
    });
    return false;
  }

  const maxBodyBytes = Number(options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES);
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(String(req?.method || "").toUpperCase()) &&
    requestBodyBytes(req) > maxBodyBytes
  ) {
    res.status(413).json({
      ok: false,
      error: "request_too_large",
      message: "Seller-Tool-Anfrage ist zu groß.",
    });
    return false;
  }

  return true;
}

export function requireCronOrSellerAccess(req, res, options = {}) {
  const cronSecret = text(process.env.CRON_SECRET);
  const authorization = text(req?.headers?.authorization);
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (cronSecret && equalSecret(bearer, cronSecret)) {
    setSellerSecurityHeaders(res);
    return true;
  }
  return requireSellerAccess(req, res, options);
}
