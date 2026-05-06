async function getCjAccessToken() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY fehlt in Vercel.");
  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    }
  );
  const data = await response.json();
  if (!response.ok || data.result === false) throw new Error(data.message || "CJ Token Fehler");
  return data.data?.accessToken;
}

export default async function handler(req, res) {
  try {
    const { vid } = req.query;
    if (!vid) return res.status(400).json({ ok: false, error: "vid (Variant ID) fehlt" });

    const token = await getCjAccessToken();

    const response = await fetch(
      `https://developers.cjdropshipping.com/api2.0/v1/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`,
      {
        headers: { "CJ-Access-Token": token, "Content-Type": "application/json" }
      }
    );

    const data = await response.json();
    if (!response.ok || data.result === false) {
      return res.status(500).json({ ok: false, error: data.message || "Stock Fehler", details: data });
    }

    return res.status(200).json({ ok: true, stock: data.data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
