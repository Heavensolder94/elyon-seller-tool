import { buildCookieHeaders, getGoogleAuthUrl, getOrigin } from "../../../lib/google-drive.js";

function setResponseCookies(req, res, cookies) {
  const headers = buildCookieHeaders(req, cookies);
  if (headers.length) {
    res.setHeader("Set-Cookie", headers);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
    }

    const state = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const authUrl = getGoogleAuthUrl(state);
    setResponseCookies(req, res, [
      {
        name: "elyon_google_drive_oauth_state",
        value: state,
        maxAge: 10 * 60,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    return res.status(200).json({
      ok: true,
      service: "Google Drive",
      authUrl,
      state,
      redirectUri: String(process.env.GOOGLE_REDIRECT_URI || ""),
      origin: getOrigin(req),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Google Drive Auth-URL konnte nicht erstellt werden.",
    });
  }
}
