export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const hasClientId = Boolean(process.env.EBAY_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.EBAY_CLIENT_SECRET);

  return res.status(200).json({
    ok: hasClientId && hasClientSecret,
    service: "eBay",
    route: "/api/ebay/status",
    configured: {
      clientId: hasClientId,
      clientSecret: hasClientSecret
    },
    message: hasClientId && hasClientSecret
      ? "eBay ist konfiguriert."
      : "eBay Environment Variables fehlen."
  });
}
