import { readToken } from "./token-store.js";

function getEbayFulfillmentEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/sell/fulfillment/v1/order"
    : "https://api.ebay.com/sell/fulfillment/v1/order";
}

async function getEbayUserAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const environment = String(process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
  const stored = await readToken(environment);
  const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder gespeicherter EBAY refresh_token fehlt.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly"
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "eBay User Token konnte nicht erstellt werden.");
  }

  return data.access_token;
}

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date.toISOString();
}

export default async function handler(req, res) {
  try {
    const days = Number(req.query.days || 7);
    const status = req.query.status || "all";
    const environment = String(req.query.environment || req.query.env || process.env.EBAY_ENV || "production").toLowerCase() === "sandbox"
      ? "sandbox"
      : "production";

    const token = await getEbayUserAccessToken();

    const filters = [];
    filters.push(`creationdate:[${daysAgoIso(days)}..${new Date().toISOString()}]`);

    if (status !== "all") {
      filters.push(`orderfulfillmentstatus:{${status}}`);
    }

    const url =
      getEbayFulfillmentEndpoint(environment) +
      `?limit=50&filter=${encodeURIComponent(filters.join(","))}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data.errors?.[0]?.message || data.message || "eBay Orders Fehler",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      environment,
      days,
      status,
      count: data.orders?.length || 0,
      orders: data.orders || [],
      raw: data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
