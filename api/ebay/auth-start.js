import { createEbayOAuthState } from "../../lib/ebay-oauth-state.js";

const SANDBOX_AUTH_URL = "https://auth.sandbox.ebay.com/oauth2/authorize";
const PRODUCTION_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";

function normalizeEnvironment(value) {
  return String(value || process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getRedirectUri() {
  return process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || "";
}

function getScopes() {
  const required = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
  ];
  const configured = String(process.env.EBAY_SCOPES || "")
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
  return [...new Set([...required, ...configured])];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
  }

  const environment = normalizeEnvironment(req.query.environment || req.query.env);
  const source = req.query.source || "amazon-importer-extension";
  const clientId = process.env.EBAY_CLIENT_ID || "";
  const redirectUri = getRedirectUri();

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      ok: false,
      error: "EBAY_CLIENT_ID oder EBAY_REDIRECT_URI / EBAY_RUNAME fehlt in Vercel.",
      connected: false,
    });
  }

  let state;
  try { state = createEbayOAuthState({ source, environment }); }
  catch (error) {
    return res.status(503).json({ ok: false, connected: false, error: error.message || "OAuth-State konnte nicht erstellt werden." });
  }

  const url = new URL(environment === "sandbox" ? SANDBOX_AUTH_URL : PRODUCTION_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getScopes().join(" "));
  url.searchParams.set("locale", "de-DE");
  url.searchParams.set("prompt", "login");
  url.searchParams.set("state", state);

  res.statusCode = 302;
  res.setHeader("Location", url.toString());
  res.setHeader("Cache-Control", "no-store");
  return res.end();
}
