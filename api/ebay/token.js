import { readToken, getTokenStoreDescription } from "../../lib/ebay-token-store.js";

function getEbayTokenEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
}

async function getAccessTokenFromRefreshToken(environment, refreshToken) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt");
  }

  if (!refreshToken) {
    throw new Error("Kein gespeicherter EBAY refresh_token vorhanden");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(getEbayTokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope"
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "eBay Token konnte nicht erneuert werden.");
  }

  return data;
}

export default async function handler(req, res) {
  try {
    const environment = String(req.query.environment || req.query.env || "production").toLowerCase() === "sandbox"
      ? "sandbox"
      : "production";
    const stored = await readToken(environment);
    const storeDescription = getTokenStoreDescription(environment);

    const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;
    if (!refreshToken) {
      return res.status(404).json({
        ok: false,
        error: "Kein gespeicherter refresh_token gefunden.",
        store_mode: storeDescription.mode,
        store_target: storeDescription.key || storeDescription.path || null,
        environment
      });
    }

    const data = await getAccessTokenFromRefreshToken(environment, refreshToken);

    return res.status(200).json({
      ok: true,
      environment,
      token_type: data.token_type || null,
      expires_in: data.expires_in || null,
      access_token_preview: data.access_token ? `${String(data.access_token).slice(0, 12)}...` : null,
      stored_refresh_token_preview: String(refreshToken).slice(0, 12) + "...",
      store_mode: storeDescription.mode,
      store_target: storeDescription.key || storeDescription.path || null
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
