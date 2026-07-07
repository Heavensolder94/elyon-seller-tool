import { writeToken } from "../../lib/ebay-token-store.js";

function normalizeEnvironment(value) {
  return String(value || process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getRedirectUri() {
  return process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || "";
}

function getEbayTokenEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
}

function getCode(req) {
  if (req.method === "POST") {
    return String(req.body?.code || req.body?.authorization_code || req.body?.authCode || "").trim();
  }
  return String(req.query.code || req.query.authorization_code || req.query.authCode || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, connected: false, error: "Nur GET oder POST erlaubt." });
  }

  const code = getCode(req);
  if (!code) {
    return res.status(400).json({ ok: false, connected: false, error: "code fehlt." });
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({
      ok: false,
      connected: false,
      error: "EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder EBAY_REDIRECT_URI / EBAY_RUNAME fehlt.",
    });
  }

  const environment = normalizeEnvironment(req.method === "POST" ? req.body?.environment || req.body?.env : req.query.environment || req.query.env);
  const response = await fetch(getEbayTokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status || 500).json({
      ok: false,
      connected: false,
      error: data.error_description || data.error || data.message || "eBay Token Exchange fehlgeschlagen.",
    });
  }

  const tokenRecord = {
    environment,
    refresh_token: data.refresh_token || null,
    access_token: data.access_token || null,
    token_type: data.token_type || null,
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    saved_at: new Date().toISOString(),
    source: "oauth-code-grant",
  };

  const storeResult = await writeToken(environment, tokenRecord);
  const connected = Boolean(storeResult.ok && tokenRecord.refresh_token);

  res.setHeader("Cache-Control", "no-store");

  // Sicherheitsregel: Keine Tokens an Browser/Extension zurückgeben.
  return res.status(200).json({
    ok: connected,
    connected,
    environment,
    stored: storeResult.ok,
    tokenSaved: connected,
    refresh_token: Boolean(data.refresh_token),
    access_token: Boolean(data.access_token),
    message: connected
      ? "eBay verbunden. Du kannst dieses Fenster schließen und zum Amazon Importer zurückkehren."
      : "eBay-Autorisierung verarbeitet, aber kein Refresh Token gespeichert.",
    error: storeResult.ok ? null : storeResult.error,
  });
}
