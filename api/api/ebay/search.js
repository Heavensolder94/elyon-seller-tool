async function getEbayAppToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt in Vercel.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description ||
      data.error ||
      "eBay Token konnte nicht erstellt werden."
    );
  }

  return data.access_token;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const query = req.query.q || req.query.keyword || "iphone";
    const limit = Math.min(Number(req.query.limit || 5), 20);
    const debug = req.query.debug === "1";

    const token = await getEbayAppToken();

    const ebayUrl =
      "https://api.ebay.com/buy/browse/v1/item_summary/search" +
      `?q=${encodeURIComponent(query)}` +
      `&limit=${limit}`;

    const ebayResponse = await fetch(ebayUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
        "Accept-Language": "de-DE",
        "Content-Type": "application/json",
      },
    });

    const ebayData = await ebayResponse.json();

    if (!ebayResponse.ok) {
      return res.status(ebayResponse.status).json({
        ok: false,
        error:
          ebayData.errors?.[0]?.message ||
          ebayData.error_description ||
          ebayData.message ||
          "eBay Search Fehler",
        details: ebayData,
      });
    }

    const items = ebayData.itemSummaries || [];

    return res.status(200).json({
      ok: true,
      query,
      limit,
      total: ebayData.total || 0,
      count: items.length,
      items,
      debug: debug
        ? {
            ebayUrl,
            rawKeys: Object.keys(ebayData),
            rawTotal: ebayData.total,
            rawItemSummaryCount: ebayData.itemSummaries?.length || 0,
            raw: ebayData,
          }
        : undefined,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
