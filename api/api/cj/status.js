export default function handler(req, res) {
  const hasApiKey = Boolean(process.env.CJ_API_KEY);

  res.status(200).json({
    ok: true,
    service: "Elyon CJ Dropshipping Integration",
    connected: false,
    mode: "read-first",
    config: {
      CJ_API_KEY: hasApiKey ? "gesetzt" : "fehlt"
    },
    nextSteps: [
      "CJ API-Key in Vercel Environment Variables setzen",
      "Token-Route bauen",
      "später: Produktdaten nur lesend abrufen",
      "keine automatische Bestellung ohne manuelle Prüfung"
    ]
  });
}
