import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

function getEbayTokenEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
}

function getTokenStorePath() {
  return process.env.EBAY_TOKEN_STORE_PATH || "./data/ebay-refresh-token.json";
}

async function ensureDirectoryFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readStoredToken() {
  const filePath = getTokenStorePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function storeToken(payload) {
  const filePath = getTokenStorePath();
  try {
    await ensureDirectoryFor(filePath);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: error.message, path: filePath };
  }
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

    const storeResult = await storeToken(tokenRecord);
    const storedToken = await readStoredToken();

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
      stored_token_preview: storedToken?.refresh_token ? `${String(storedToken.refresh_token).slice(0, 12)}...` : null
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
