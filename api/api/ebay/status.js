export default function handler(req, res) {
  const hasClientId = Boolean(process.env.EBAY_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.EBAY_CLIENT_SECRET);
  const hasRedirectUri = Boolean(process.env.EBAY_REDIRECT_URI);

  res.status(200).json({
    ok: true,
    service: "Elyon eBay Integration",
    connected: false,
    mode: "read-first",
    config: {
      EBAY_CLIENT_ID: hasClientId ? "gesetzt" : "fehlt",
      EBAY_CLIENT_SECRET: hasClientSecret ? "gesetzt" : "fehlt",
      EBAY_REDIRECT_URI: hasRedirectUri ? "gesetzt" : "fehlt"
    },
    nextSteps: [
      "eBay Developer App erstellen",
      "Environment Variables in Vercel setzen",
      "OAuth Login Route bauen",
      "später: Bestellungen nur lesend abrufen"
    ]
  });
}
