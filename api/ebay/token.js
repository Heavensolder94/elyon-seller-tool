export default async function handler(req, res) {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        ok: false,
        error: "EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt"
      });
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope"
    });

    const ebayRes = await fetch("https://api.sandbox.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`
      },
      body
    });

    const data = await ebayRes.json();

    if (!ebayRes.ok) {
      return res.status(ebayRes.status).json({
        ok: false,
        status: ebayRes.status,
        error: data
      });
    }

    res.status(200).json({
      ok: true,
      token_type: data.token_type,
      expires_in: data.expires_in,
      access_token_preview: data.access_token
        ? data.access_token.slice(0, 12) + "..."
        : null
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
