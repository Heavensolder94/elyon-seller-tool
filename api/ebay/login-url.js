const SANDBOX_AUTH_URL = "https://auth.sandbox.ebay.com/oauth2/authorize";
const PRODUCTION_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";

function normalizeEnvironment(value) {
  return String(value || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getRedirectUri() {
  return process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || "";
}

function getScopes() {
  const raw = process.env.EBAY_SCOPES || "https://api.ebay.com/oauth/api_scope";
  return String(raw)
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function buildAuthUrl({ environment, clientId, redirectUri, scopes, state }) {
  const baseUrl = environment === "sandbox" ? SANDBOX_AUTH_URL : PRODUCTION_AUTH_URL;
  const url = new URL(baseUrl);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("locale", "de-DE");
  url.searchParams.set("prompt", "login");
  url.searchParams.set("state", state);

  return url.toString();
}

function makeState() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function handler(req, res) {
  const environment = normalizeEnvironment(req.query.environment || req.query.env);
  const clientId = process.env.EBAY_CLIENT_ID || "";
  const redirectUri = getRedirectUri();
  const scopes = getScopes();
  const state = typeof req.query.state === "string" && req.query.state.trim() ? req.query.state.trim() : makeState();

  if (!clientId || !redirectUri) {
    return res.status(400).json({
      ok: false,
      error: "EBAY_CLIENT_ID oder EBAY_REDIRECT_URI / EBAY_RUNAME fehlt.",
      required: {
        EBAY_CLIENT_ID: Boolean(clientId),
        EBAY_REDIRECT_URI: Boolean(redirectUri),
      },
    });
  }

  const authUrl = buildAuthUrl({
    environment,
    clientId,
    redirectUri,
    scopes,
    state,
  });

  return res.status(200).json({
    ok: true,
    environment,
    state,
    authUrl,
  });
}
