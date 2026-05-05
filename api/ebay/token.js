export default async function handler(req, res) {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope"
    });

    const ebayRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`
      },
      body
    });

    const data = await ebayRes.json();

    res.status(200).json({
      ok: true,
      token_preview: data.access_token?.slice(0, 10)
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
