import { readToken, writeToken, getTokenStoreDescription } from "../../lib/ebay-token-store.js";

function getEbayTokenEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
}

function getCode(req) {
  if (req.method === "POST") {
    return String(
      req.body?.code ||
      req.body?.authorization_code ||
      req.body?.authCode ||
      ""
    ).trim();
  }

  return String(
    req.query.code ||
    req.query.authorization_code ||
    req.query.authCode ||
    ""
  ).trim();
}

function getEnvironment(req) {
  const value =
    (req.method === "POST"
      ? req.body?.environment || req.body?.env
      : req.query.environment || req.query.env) || "production";

  return String(value).toLowerCase();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Nur GET oder POST erlaubt."
      });
    }

    const code = getCode(req);
    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "code fehlt."
      });
    }

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const redirectUri = process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).json({
        ok: false,
        error: "EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder EBAY_REDIRECT_URI / EBAY_RUNAME fehlt."
      });
    }

    const environment = getEnvironment(req);
    const endpoint = getEbayTokenEndpoint(environment);
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`
      },
      body
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status || 500).json({
        ok: false,
        error: data.error_description || data.error || data.message || "eBay Token Exchange fehlgeschlagen.",
        details: data
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
      source: "oauth-code-grant"
    };

    const storeResult = await writeToken(environment, tokenRecord);
    const storedToken = await readToken(environment);
    const storeDescription = getTokenStoreDescription(environment);

    return res.status(200).json({
      ok: true,
      environment,
      token_type: data.token_type,
      expires_in: data.expires_in,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      scope: data.scope,
      stored: storeResult.ok,
      storage_path: storeResult.ok ? storeResult.path : null,
      storage_error: storeResult.ok ? null : storeResult.error,
      store_mode: storeDescription.mode,
      store_target: storeDescription.key || storeDescription.path || null,
      stored_token_preview: storedToken?.refresh_token ? `${String(storedToken.refresh_token).slice(0, 12)}...` : null
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
