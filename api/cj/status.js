export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const hasApiKey = Boolean(process.env.CJ_API_KEY);

  return res.status(200).json({
    ok: hasApiKey,
    service: "CJ Dropshipping",
    route: "/api/cj/status",
    configured: {
      apiKey: hasApiKey
    },
    message: hasApiKey
      ? "CJ ist konfiguriert."
      : "CJ_API_KEY fehlt."
  });
}
