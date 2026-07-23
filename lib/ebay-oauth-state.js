import crypto from "node:crypto";

const MAX_STATE_AGE_MS = 15 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function stateSecret() {
  return text(process.env.EBAY_OAUTH_STATE_SECRET || process.env.EBAY_CLIENT_SECRET);
}

function sign(encodedPayload) {
  const secret = stateSecret();
  if (!secret) throw new Error("EBAY_OAUTH_STATE_SECRET oder EBAY_CLIENT_SECRET fehlt.");
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function equalSignature(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createEbayOAuthState(options = {}) {
  const payload = {
    v: 1,
    source: text(options.source || "amazon-importer-extension").replace(/[^a-z0-9._:-]/gi, "").slice(0, 80) || "amazon-importer-extension",
    environment: text(options.environment).toLowerCase() === "sandbox" ? "sandbox" : "production",
    nonce: crypto.randomUUID(),
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyEbayOAuthState(value, options = {}) {
  const state = text(value);
  const [encoded, signature, extra] = state.split(".");
  if (!encoded || !signature || extra) return { ok: false, error: "oauth_state_invalid" };

  let expected;
  try { expected = sign(encoded); }
  catch (error) { return { ok: false, error: "oauth_state_not_configured", message: error.message }; }
  if (!equalSignature(signature, expected)) return { ok: false, error: "oauth_state_signature_invalid" };

  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { return { ok: false, error: "oauth_state_payload_invalid" }; }

  const age = Date.now() - Number(payload.issuedAt || 0);
  const maxAgeMs = Number(options.maxAgeMs || MAX_STATE_AGE_MS);
  if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) return { ok: false, error: "oauth_state_expired" };

  const expectedEnvironment = text(options.environment);
  if (expectedEnvironment && payload.environment !== (expectedEnvironment.toLowerCase() === "sandbox" ? "sandbox" : "production")) {
    return { ok: false, error: "oauth_state_environment_mismatch" };
  }

  return { ok: true, payload };
}

export function readEbayOAuthState(req) {
  const direct = text(req?.body?.state || req?.query?.state);
  if (direct) return direct;
  const referer = text(req?.headers?.referer || req?.headers?.referrer);
  if (!referer) return "";
  try {
    const url = new URL(referer);
    return text(url.searchParams.get("state"));
  } catch {
    return "";
  }
}
