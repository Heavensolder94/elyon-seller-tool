import { buildCookieHeaders, getGoogleAuthUrl, getOrigin } from "../../../lib/google-drive.js";

function setResponseCookies(req, res, cookies) {
  const headers = buildCookieHeaders(req, cookies);
  if (headers.length) {
    res.setHeader("Set-Cookie", headers);
  }
}

function makeState() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).send("Nur GET oder POST erlaubt.");
    }

    const state = makeState();
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

    res.statusCode = 302;
    res.setHeader("Location", authUrl);
    return res.end("Weiterleitung zu Google OAuth...");
  } catch (error) {
    const message = error.message || "Google Drive OAuth konnte nicht gestartet werden.";
    const redirectTo = `${getOrigin(req)}/?googleDrive=error&googleDriveMessage=${encodeURIComponent(message)}`;
    res.statusCode = 302;
    res.setHeader("Location", redirectTo);
    return res.end(message);
  }
}
