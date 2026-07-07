import { readToken } from "../../lib/ebay-token-store.js";

function normalizeEnvironment(value) {
  return String(value || process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ connected: false });
  }

  try {
    const environment = normalizeEnvironment(req.query.environment || req.query.env);
    const stored = await readToken(environment);
    const connected = Boolean(stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN);

    res.setHeader("Cache-Control", "no-store");

    // Wichtig für Chrome Extension: keine Tokens, keine Previews, keine Secrets.
    return res.status(200).json({ connected });
  } catch {
    return res.status(200).json({ connected: false });
  }
}
