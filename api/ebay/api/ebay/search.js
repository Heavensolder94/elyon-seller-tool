export default async function handler(req, res) {
  try {
    const q = req.query.q || "iphone";
    const limit = req.query.limit || "5";

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

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
      return res.status(tokenRes.status).json({
        ok: false,
        step: "token",
        error: tokenData
      });
    }

    const searchUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${limit}`;

    const ebayRes = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
        Accept: "application/json"
      }
    });

    const data = await ebayRes.json();

    if (!ebayRes.ok) {
      return res.status(ebayRes.status).json({
        ok: false,
        step: "search",
        error: data
      });
    }

    res.status(200).json({
      ok: true,
      query: q,
      count: data.total,
      items: (data.itemSummaries || []).map(item => ({
        title: item.title,
        price: item.price,
        itemWebUrl: item.itemWebUrl,
        condition: item.condition,
        seller: item.seller?.username
      }))
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
