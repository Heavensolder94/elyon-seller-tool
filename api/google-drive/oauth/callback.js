import { buildCookieHeaders, exchangeGoogleCode, getOAuthStateCookie } from "../../../lib/google-drive.js";

function setResponseCookies(req, res, cookies) {
  const headers = buildCookieHeaders(req, cookies);
  if (headers.length) {
    res.setHeader("Set-Cookie", headers);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
    }

    const code = String(req.query.code || req.query.authorization_code || "").trim();
    const state = String(req.query.state || "").trim();
    if (!code) {
      return res.status(400).json({ ok: false, error: "Google OAuth code fehlt." });
    }

    const expectedState = getOAuthStateCookie(req);
    if (!expectedState) {
      return res.status(400).json({ ok: false, error: "OAuth state fehlt oder ist abgelaufen. Bitte Login neu starten." });
    }
    if (state && state !== expectedState) {
      return res.status(400).json({ ok: false, error: "OAuth state stimmt nicht. Bitte Login neu starten." });
    }

    const tokenData = await exchangeGoogleCode(code);
    if (!tokenData.refresh_token) {
      return res.status(500).json({
        ok: false,
        error: "Google hat keinen refresh_token geliefert. Bitte bei Google mit Offline-Zugriff und Zustimmung erneut verbinden.",
      });
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

    return res.status(200).json({
      ok: true,
      service: "Google Drive",
      connected: true,
      message: "Google Drive verbunden.",
    });
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

    return res.status(500).json({
      ok: false,
      service: "Google Drive",
      error: error.message || "Google Drive OAuth fehlgeschlagen.",
    });
  }
}
