function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "ebay-search",
    status,
    error,
    details: details ?? null,
  });
}

function readText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toLimit(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

function getEbayFulfillmentEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search"
    : "https://api.ebay.com/buy/browse/v1/item_summary/search";
}

async function getEbayAppToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt in Vercel.");
  }

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  let data = null;

  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch (error) {
      data = null;
    }
  }

  if (!response.ok) {
    const message = data?.error_description || data?.error || data?.message || rawText || "eBay Token konnte nicht erstellt werden.";
    const error = new Error(`HTTP ${response.status} ${response.statusText || ""} · ${message}`.trim());
    error.status = response.status || 502;
    error.details = {
      upstreamStatus: response.status,
      upstreamStatusText: response.statusText || "",
      upstreamBody: data || rawText || null,
    };
    throw error;
  }

  if (data && data.access_token) {
    return data.access_token;
  }

  throw new Error("eBay Token Antwort enthielt kein access_token.");
}

async function parseUpstreamResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  if (!rawText) {
    return { rawText: "", data: null };
  }

  if (contentType.includes("application/json")) {
    try {
      return { rawText, data: JSON.parse(rawText) };
    } catch (error) {
      return { rawText, data: null };
    }
  }

  return { rawText, data: null };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return jsonError(res, 405, "Nur GET erlaubt.", "METHOD_NOT_ALLOWED");
  }

  const q = readText(req.query.q || req.query.keyword || "");
  const limit = toLimit(req.query.limit, 20);

  if (!q) {
    return jsonError(res, 400, "q fehlt.", "QUERY_MISSING");
  }

  const environment = String(req.query.environment || req.query.env || "production").toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";

  try {
    const accessToken = await getEbayAppToken();
    const upstreamUrl = new URL(getEbayFulfillmentEndpoint(environment));
    upstreamUrl.search = new URLSearchParams({
      q,
      limit: String(limit),
      fieldgroups: "MINIMAL",
      filter: "buyingOptions:{FIXED_PRICE}",
    }).toString();

    const response = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_DE",
        "Accept-Language": "de-DE",
        Accept: "application/json",
      },
    });

    const { rawText, data } = await parseUpstreamResponse(response);

    if (!response.ok) {
      const upstreamError =
        data?.errors?.[0]?.message ||
        data?.error_description ||
        data?.error ||
        data?.message ||
        rawText ||
        "eBay API Fehler";

      return jsonError(
        res,
        response.status || 502,
        upstreamError,
        {
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText || "",
          upstreamBody: data || rawText || null,
        }
      );
    }

    if (!data) {
      return jsonError(
        res,
        502,
        "eBay API lieferte keine JSON-Antwort.",
        {
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText || "",
          upstreamBody: rawText || null,
        }
      );
    }

    const items = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

    return res.status(200).json({
      ok: true,
      source: "ebay-search",
      status: 200,
      environment,
      q,
      limit,
      count: items.length,
      total: Number(data.total || items.length || 0),
      items,
      raw: data,
    });
  } catch (error) {
    const message = error && error.message ? error.message : "Unbekannter eBay Search Fehler";
    const status = error && Number.isFinite(Number(error.status))
      ? Number(error.status)
      : (/EBAY_CLIENT_ID|EBAY_CLIENT_SECRET/.test(message) ? 500 : 502);

    return jsonError(
      res,
      status,
      message,
      {
        hint: "Prüfe EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_MARKETPLACE_ID und die eBay API-Erreichbarkeit.",
        ...(error && error.details ? { upstream: error.details } : {}),
      }
    );
  }
}
