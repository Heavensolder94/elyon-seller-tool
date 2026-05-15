import { buildCookieHeaders, exchangeGoogleCode, getOAuthStateCookie, getOrigin } from "../../../../lib/google-drive.js";

function getCode(req) {
  if (req.method === "POST") {
    return String(req.body?.code || req.body?.authorization_code || "").trim();
  }
  return String(req.query.code || req.query.authorization_code || "").trim();
}

function getState(req) {
  if (req.method === "POST") {
    return String(req.body?.state || "").trim();
  }
  return String(req.query.state || "").trim();
}

function setResponseCookies(req, res, cookies) {
  const headers = buildCookieHeaders(req, cookies);
  if (headers.length) {
    res.setHeader("Set-Cookie", headers);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).send("Nur GET oder POST erlaubt.");
    }

    const code = getCode(req);
    const state = getState(req);
    if (!code) {
      return res.status(400).send("Google OAuth code fehlt.");
    }

    const expectedState = getOAuthStateCookie(req);
    if (!expectedState) {
      return res.status(400).send("OAuth state fehlt oder ist abgelaufen. Bitte Login neu starten.");
    }
    if (state && state !== expectedState) {
      return res.status(400).send("OAuth state stimmt nicht. Bitte Login neu starten.");
    }

    const tokenData = await exchangeGoogleCode(code);
    if (!tokenData.refresh_token) {
      return res.status(500).send("Google hat keinen refresh_token geliefert. Bitte bei Google mit Offline-Zugriff und Zustimmung erneut verbinden.");
    }

    setResponseCookies(req, res, [
      {
        name: "elyon_google_drive_refresh_token",
        value: tokenData.refresh_token,
        maxAge: 60 * 60 * 24 * 365 * 2,
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "elyon_google_drive_connected",
        value: "yes",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: "Lax",
      },
      {
        name: "elyon_google_drive_oauth_state",
        value: "",
        maxAge: 0,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const redirectTo = `${getOrigin(req)}/?googleDrive=connected`;
    res.statusCode = 302;
    res.setHeader("Location", redirectTo);
    return res.end("Google Drive verbunden. Du kannst dieses Fenster schließen.");
  } catch (error) {
    setResponseCookies(req, res, [
      {
        name: "elyon_google_drive_oauth_state",
        value: "",
        maxAge: 0,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const redirectTo = `${getOrigin(req)}/?googleDrive=error&googleDriveMessage=${encodeURIComponent(error.message || "Google Drive OAuth fehlgeschlagen.")}`;
    res.statusCode = 302;
    res.setHeader("Location", redirectTo);
    return res.end("Google Drive Login fehlgeschlagen.");
  }
}
