import { requireSellerAccess } from "../../lib/seller-access.js";
import { ebayUserSession, EBAY_REQUIRED_SCOPES } from "../../lib/ebay-production.js";

const MESSAGE_SCOPE = "https://api.ebay.com/oauth/api_scope/commerce.message";
const EBAY_INTROSPECTION_URL = "https://api.ebay.com/identity/v1/oauth2/token/introspect";

export function summarizeEbayIntrospection(response) {
  const data = response && typeof response === "object" && !Array.isArray(response) ? response : {};
  const active = data.active === true;
  const scopeReported = typeof data.scope === "string" && data.scope.trim().length > 0;
  const granted = scopeReported ? new Set(data.scope.trim().split(/\s+/)) : null;
  return {
    tokenActive: active,
    scopeVerified: active && scopeReported,
    messageScopeGranted: !active ? false : granted ? granted.has(MESSAGE_SCOPE) : null,
    scopesComplete: !active ? false : granted ? EBAY_REQUIRED_SCOPES.every((scope) => granted.has(scope)) : null,
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const clientId = String(process.env.EBAY_CLIENT_ID || "");
  const clientSecret = String(process.env.EBAY_CLIENT_SECRET || "");
  if (!clientId || !clientSecret) {
    return res.status(503).json({
      ok: false,
      error: "ebay_scope_check_unavailable",
      message: "eBay-Anmeldedaten fehlen auf dem Server.",
    });
  }

  try {
    const session = await ebayUserSession("production");
    const response = await fetch(EBAY_INTROSPECTION_URL, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret, "utf8").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        token: session.accessToken,
        token_type_hint: "access_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "ebay_introspection_failed",
        message: "eBay konnte die Token-Berechtigungen momentan nicht bestätigen.",
        httpStatus: response.status,
      });
    }
    const data = await response.json().catch(() => ({}));
    return res.status(200).json({
      ok: true,
      environment: "production",
      verification: "ebay_token_introspection",
      ...summarizeEbayIntrospection(data),
    });
  } catch {
    return res.status(503).json({
      ok: false,
      error: "ebay_scope_check_unavailable",
      message: "eBay-Berechtigungsprüfung derzeit nicht verfügbar.",
    });
  }
}
