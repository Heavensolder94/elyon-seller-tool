async function getEbayUserAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder EBAY_REFRESH_TOKEN fehlt in Vercel.");
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

    const token = await getEbayUserAccessToken();

    const filters = [];
    filters.push(`creationdate:[${daysAgoIso(days)}..${new Date().toISOString()}]`);

    if (status !== "all") {
      filters.push(`orderfulfillmentstatus:{${status}}`);
    }

    const url =
      "https://api.ebay.com/sell/fulfillment/v1/order" +
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
