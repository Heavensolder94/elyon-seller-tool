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
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope"
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "eBay Token konnte nicht erstellt werden.");
  }

  return data.access_token;
}

export default async function handler(req, res) {
  try {
    const keyword = req.query.keyword || req.query.q || "iphone";
    const limit = Math.min(Number(req.query.limit || 20), 50);

    const token = await getEbayAppToken();

    const url =
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data.errors?.[0]?.message || data.message || "eBay Competition Fehler",
        details: data
      });
    }

    const items = data.itemSummaries || [];

    const prices = items
      .map(item => Number(item.price?.value || 0))
      .filter(price => price > 0);

    const low = prices.length ? Math.min(...prices) : 0;
    const high = prices.length ? Math.max(...prices) : 0;
    const avg = prices.length
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length
      : 0;

    return res.status(200).json({
      ok: true,
      keyword,
      count: items.length,
      low,
      high,
      avg,
      items
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
