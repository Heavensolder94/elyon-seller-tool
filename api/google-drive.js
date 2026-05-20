import {
  buildCookieHeaders,
  clearCookie,
  exchangeGoogleCode,
  formatDriveBackupFilename,
  getGoogleAuthUrl,
  getLastBackupMeta,
  getOAuthStateCookie,
  getOrigin,
  getRefreshTokenCookie,
  normalizeBackupData,
  refreshGoogleAccessToken,
  uploadBackupToDrive,
  validateBackupData,
} from "../lib/google-drive.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function setResponseCookies(req, res, cookies) {
  const headers = buildCookieHeaders(req, cookies);
  if (headers.length) {
    res.setHeader("Set-Cookie", headers);
  }
}

function getRequestedAction(req, body) {
  const fromBody = String(body?.action || body?.endpoint || body?.path || "").trim();
  if (fromBody) return fromBody;

  const fromQuery = String(req.query?.action || req.query?.endpoint || req.query?.path || "").trim();
  if (fromQuery) return fromQuery;

  const url = new URL(req.url || "/api/google-drive", `https://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/^\/api\/google-drive\/?/, "").replace(/\/+$/, "");
  return path || "status";
}

function makeState() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function handleStatus(req, res) {
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
      error: error.message || "Google Drive Status konnte nicht geprueft werden.",
      ...meta,
    });
  }
}

async function handleAuthUrl(req, res) {
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

async function handleStart(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
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

    res.statusCode = 302;
    res.setHeader("Location", authUrl);
    return res.end("Weiterleitung zu Google OAuth...");
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Google Drive OAuth konnte nicht gestartet werden.",
    });
  }
}

async function handleCallback(req, res) {
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
    if (tokenData.error) {
      return res.status(200).json({
        ok: false,
        service: "Google Drive",
        connected: false,
        error: tokenData.error,
        message: tokenData.error,
      });
    }
    if (!tokenData.refresh_token) {
      return res.status(200).json({
        ok: false,
        error: "Google hat keinen refresh_token geliefert. Bitte bei Google mit Offline-Zugriff und Zustimmung erneut verbinden.",
      });
    }

    const headers = buildCookieHeaders(req, [
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

    if (headers.length) {
      res.setHeader("Set-Cookie", headers);
    }

    return res.status(200).json({
      ok: true,
      service: "Google Drive",
      connected: true,
      message: "Google Drive verbunden.",
    });
  } catch (error) {
    const headers = buildCookieHeaders(req, [
      {
        name: "elyon_google_drive_oauth_state",
        value: "",
        maxAge: 0,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    if (headers.length) {
      res.setHeader("Set-Cookie", headers);
    }

    return res.status(500).json({
      ok: false,
      service: "Google Drive",
      error: error.message || "Google Drive OAuth fehlgeschlagen.",
    });
  }
}

async function handleUploadBackup(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
    }

    const refreshToken = getRefreshTokenCookie(req);
    if (!refreshToken) {
      return res.status(401).json({
        ok: false,
        error: "Google Drive ist nicht verbunden. Bitte zuerst verbinden.",
      });
    }

    const body = readBody(req);
    const sourceBackup = body.backup && typeof body.backup === "object" ? body.backup : body;
    const validation = validateBackupData(sourceBackup);
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: "Backup ist ungueltig.",
        details: validation.errors,
      });
    }

    const normalized = validation.normalized || normalizeBackupData(sourceBackup);
    const requestedName = String(body.fileName || body.filename || "").trim();
    const fileName = requestedName || formatDriveBackupFilename(normalized.exportedAt);
    const result = await uploadBackupToDrive({
      refreshToken,
      backup: normalized,
      fileName,
    });

    setResponseCookies(req, res, [
      {
        name: "elyon_last_google_drive_backup_at",
        value: result.uploadedAt,
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: "Lax",
      },
      {
        name: "elyon_last_google_drive_backup_file",
        value: result.fileName,
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: "Lax",
      },
      {
        name: "elyon_last_google_drive_backup_id",
        value: result.file?.id || "",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: "Lax",
      },
      {
        name: "elyon_last_google_drive_backup_error",
        value: "",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: "Lax",
      },
    ]);

    return res.status(200).json({
      ok: true,
      service: "Google Drive",
      connected: true,
      file: result.file,
      fileName: result.fileName,
      uploadedAt: result.uploadedAt,
      backup: normalized,
      warnings: validation.warnings,
      folderId: result.folderId,
      ...getLastBackupMeta(req),
      lastBackupAt: result.uploadedAt,
      lastBackupFileName: result.fileName,
      lastBackupFileId: result.file?.id || "",
      lastBackupError: "",
    });
  } catch (error) {
    setResponseCookies(req, res, [
      {
        name: "elyon_last_google_drive_backup_error",
        value: error.message || "Google Drive Upload fehlgeschlagen.",
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: false,
        sameSite: "Lax",
      },
    ]);

    return res.status(500).json({
      ok: false,
      service: "Google Drive",
      error: error.message || "Google Drive Upload fehlgeschlagen.",
    });
  }
}

export default async function handler(req, res) {
  const body = readBody(req);
  const action = getRequestedAction(req, body);

  if (action === "status") return handleStatus(req, res);
  if (action === "auth-url") return handleAuthUrl(req, res);
  if (action === "start") return handleStart(req, res);
  if (action === "callback") return handleCallback(req, res);
  if (action === "upload-backup") return handleUploadBackup(req, res);

  return res.status(404).json({
    ok: false,
    error: `Unbekannte Google Drive Aktion: ${action}`,
  });
}
