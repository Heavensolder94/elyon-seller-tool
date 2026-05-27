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
import {
  getGoogleDriveTokenStoreDescription,
  readGoogleDriveOAuthState,
  readGoogleDriveToken,
  writeGoogleDriveOAuthState,
  writeGoogleDriveToken,
} from "../lib/google-drive-token-store.js";

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

async function getStoredRefreshToken(req) {
  const cookieToken = getRefreshTokenCookie(req);
  if (cookieToken) return { refreshToken: cookieToken, source: "cookie" };

  const stored = await readGoogleDriveToken();
  const refreshToken = stored?.refresh_token || stored?.refreshToken || "";
  return { refreshToken, source: refreshToken ? "token-store" : "none", stored };
}

async function createGoogleOAuthStart(req, res, { json = false } = {}) {
  const state = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const storeResult = await writeGoogleDriveOAuthState(state, {
    origin: getOrigin(req),
    userAgent: String(req.headers["user-agent"] || ""),
  });
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

  if (json) {
    return res.status(200).json({
      ok: true,
      service: "Google Drive",
      authUrl,
      state,
      stateStored: storeResult.ok,
      stateStoreError: storeResult.ok ? null : storeResult.error,
      redirectUri: String(process.env.GOOGLE_REDIRECT_URI || ""),
      origin: getOrigin(req),
    });
  }

  res.statusCode = 302;
  res.setHeader("Location", authUrl);
  return res.end("Weiterleitung zu Google OAuth...");
}

async function handleStatus(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
    }

    const tokenResult = await getStoredRefreshToken(req);
    const meta = getLastBackupMeta(req);
    const store = getGoogleDriveTokenStoreDescription();

    if (!tokenResult.refreshToken) {
      return res.status(200).json({
        ok: true,
        connected: false,
        service: "Google Drive",
        error: "Nicht verbunden. Bitte Google Drive verbinden.",
        tokenSource: tokenResult.source,
        store_mode: store.mode,
        store_target: store.key || store.path || null,
        ...meta,
      });
    }

    const tokenData = await refreshGoogleAccessToken(tokenResult.refreshToken);
    return res.status(200).json({
      ok: true,
      connected: true,
      service: "Google Drive",
      tokenSource: tokenResult.source,
      store_mode: store.mode,
      store_target: store.key || store.path || null,
      tokenType: tokenData.token_type || "Bearer",
      scope: tokenData.scope || null,
      expiresIn: tokenData.expires_in || null,
      ...meta,
    });
  } catch (error) {
    const meta = getLastBackupMeta(req);
    const store = getGoogleDriveTokenStoreDescription();
    return res.status(200).json({
      ok: true,
      connected: false,
      service: "Google Drive",
      error: error.message || "Google Drive Status konnte nicht geprueft werden.",
      store_mode: store.mode,
      store_target: store.key || store.path || null,
      ...meta,
    });
  }
}

async function handleAuthUrl(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
    }

    return createGoogleOAuthStart(req, res, { json: true });
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

    return createGoogleOAuthStart(req, res, { json: false });
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

    const expectedCookieState = getOAuthStateCookie(req);
    const storedState = await readGoogleDriveOAuthState(state);
    const stateIsValid = Boolean(
      (expectedCookieState && state && state === expectedCookieState) ||
      (storedState && storedState.state === state)
    );

    if (!stateIsValid) {
      return res.status(400).json({
        ok: false,
        error: "OAuth state fehlt oder ist abgelaufen. Bitte Login neu starten.",
        cookieState: Boolean(expectedCookieState),
        serverState: Boolean(storedState),
      });
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

    const storeResult = await writeGoogleDriveToken({
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token || null,
      token_type: tokenData.token_type || null,
      expires_in: tokenData.expires_in || null,
      scope: tokenData.scope || null,
      saved_at: new Date().toISOString(),
      source: "oauth-code-grant",
    });
    const store = getGoogleDriveTokenStoreDescription();

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
      stored: storeResult.ok,
      storage_error: storeResult.ok ? null : storeResult.error,
      store_mode: store.mode,
      store_target: store.key || store.path || null,
      stateSource: storedState ? "server-store" : "cookie",
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

    const tokenResult = await getStoredRefreshToken(req);
    if (!tokenResult.refreshToken) {
      return res.status(401).json({
        ok: false,
        error: "Google Drive ist nicht verbunden. Bitte zuerst verbinden.",
        tokenSource: tokenResult.source,
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
      refreshToken: tokenResult.refreshToken,
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
      tokenSource: tokenResult.source,
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
