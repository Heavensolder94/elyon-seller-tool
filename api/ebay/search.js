export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    version: "MEINE-RICHTIGE-SEARCH-DATEI",
    query: req.query.q || "",
    items: []
  });
}

async function getEbayAppToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt in Vercel.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope"
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    throw new Error(
      tokenData.error_description ||
      tokenData.error ||
      "eBay Token konnte nicht erstellt werden."
    );
  }

  return tokenData.access_token;
}

export default async function handler(req, res) {
  try {
    const query = req.query.q || req.query.keyword || "iphone";
    const limit = Math.min(Number(req.query.limit || 5), 20);

    const accessToken = await getEbayAppToken();

    const searchRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
          "Accept-Language": "de-DE"
        }
      }
    );

    const data = await searchRes.json();

    if (!searchRes.ok) {
      return res.status(searchRes.status).json({
        ok: false,
        error:
          data.errors?.[0]?.message ||
          data.error_description ||
          data.message ||
          "eBay Search Fehler",
        details: data
      });
    }

    res.status(200).json({
      ok: true,
      query,
      limit,
      total: data.total || 0,
      count: data.itemSummaries?.length || 0,
      items: data.itemSummaries || []
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
