export default async function handler(req, res) {
  try {
    const query = req.query.q || "iphone";
    const limit = req.query.limit || 5;

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    // Token holen
    const tokenRes = await fetch("https://api.sandbox.ebay.com/identity/v1/oauth2/token", {
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
    const accessToken = tokenData.access_token;

    // Produktsuche
    const searchRes = await fetch(
      `https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const data = await searchRes.json();

    res.status(200).json({
      ok: true,
      query,
      items: data.itemSummaries || []
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
