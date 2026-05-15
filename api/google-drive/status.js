import { getLastBackupMeta, getRefreshTokenCookie, refreshGoogleAccessToken } from "../../lib/google-drive.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
    }

    const refreshToken = getRefreshTokenCookie(req);
    const meta = getLastBackupMeta(req);

    if (!refreshToken) {
      return res.status(200).json({
        ok: true,
        connected: false,
        service: "Google Drive",
        error: "Nicht verbunden. Bitte Google Drive verbinden.",
        ...meta,
      });
    }

    const tokenData = await refreshGoogleAccessToken(refreshToken);
    return res.status(200).json({
      ok: true,
      connected: true,
      service: "Google Drive",
      tokenType: tokenData.token_type || "Bearer",
      scope: tokenData.scope || null,
      expiresIn: tokenData.expires_in || null,
      ...meta,
    });
  } catch (error) {
    const meta = getLastBackupMeta(req);
    return res.status(200).json({
      ok: true,
      connected: false,
      service: "Google Drive",
      error: error.message || "Google Drive Status konnte nicht geprüft werden.",
      ...meta,
    });
  }
}
