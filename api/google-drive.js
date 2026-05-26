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

function parseGoogleSheetInput(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error("Bitte Google-Sheets-Link einfügen.");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Das sieht nicht wie ein gültiger Google-Sheets-Link aus.");
  }

  const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) {
    throw new Error("Das sieht nicht wie ein gültiger Google-Sheets-Link aus.");
  }

  const spreadsheetId = match[1];
  const gid = parsed.searchParams.get("gid") || (parsed.hash.match(/gid=([0-9]+)/) || [])[1] || "0";

  return { spreadsheetId, gid, input: raw };
}

function buildGoogleSheetCsvCandidates(input) {
  const { spreadsheetId, gid } = parseGoogleSheetInput(input);
  return [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/pub?output=csv&gid=${gid}`,
  ];
}

function escapeSheetRangeTitle(title) {
  const raw = String(title || "Tabelle1");
  return `'${raw.replace(/'/g, "''")}'`;
}

function matrixToCsv(rows) {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (/[",\r\n;]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  return (Array.isArray(rows) ? rows : []).map((row) => (Array.isArray(row) ? row : []).map(escapeCell).join(",")).join("\r\n");
}

async function fetchGoogleJson(url, accessToken) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Google API Fehler ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.google = data?.error || data;
    throw error;
  }
  return data;
}

async function fetchPrivateGoogleSheetCsv({ refreshToken, sheetUrl }) {
  const tokenData = await refreshGoogleAccessToken(refreshToken);
  const accessToken = tokenData.access_token;
  const { spreadsheetId, gid } = parseGoogleSheetInput(sheetUrl);
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,sheets(properties(sheetId,title,index,hidden))`;
  const metadata = await fetchGoogleJson(metadataUrl, accessToken);
  const sheets = Array.isArray(metadata?.sheets) ? metadata.sheets : [];
  const gidNumber = Number(gid);
  const matchingSheet = sheets.find((sheet) => Number(sheet?.properties?.sheetId) === gidNumber)
    || sheets.find((sheet) => sheet?.properties?.hidden !== true)
    || sheets[0];
  if (!matchingSheet || !matchingSheet.properties || !matchingSheet.properties.title) {
    throw new Error("Google Sheet Tab konnte nicht bestimmt werden.");
  }
  const range = encodeURIComponent(escapeSheetRangeTitle(matchingSheet.properties.title));
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;
  const valuesData = await fetchGoogleJson(valuesUrl, accessToken);
  const values = Array.isArray(valuesData?.values) ? valuesData.values : [];
  if (!values.length) {
    throw new Error("Google Sheet enthält keine lesbaren Zeilen im gewählten Tab.");
  }
  return {
    csvText: matrixToCsv(values),
    sheetTitle: matchingSheet.properties.title,
    spreadsheetId,
  };
}

async function fetchTextWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 12000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "accept": "text/csv,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "ElyonSellerTool/1.0 GoogleSheetImport",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, url };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeHtml(text) {
  const sample = String(text || "").trim().slice(0, 600).toLowerCase();
  return sample.startsWith("<!doctype html") || sample.startsWith("<html") || sample.includes("<body");
}

async function handleImportSheetCsv(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
    }

    const body = readBody(req);
    const sheetUrl = String(body.sheetUrl || req.query?.sheetUrl || "").trim();
    const refreshToken = getRefreshTokenCookie(req);
    const candidates = buildGoogleSheetCsvCandidates(sheetUrl);
    const errors = [];

    if (refreshToken) {
      try {
        const privateResult = await fetchPrivateGoogleSheetCsv({ refreshToken, sheetUrl });
        return res.status(200).json({
          ok: true,
          service: "Google Drive",
          source: "google-sheet-private-api",
          csvText: privateResult.csvText,
          sheetTitle: privateResult.sheetTitle,
          spreadsheetId: privateResult.spreadsheetId,
        });
      } catch (error) {
        errors.push(`Privater Google-Zugriff: ${error.message || "Unbekannter Fehler"}`);
        const insufficientScope = /insufficient authentication scopes|permission/i.test(String(error.message || ""));
        if (error.status === 403 && insufficientScope) {
          return res.status(403).json({
            ok: false,
            code: "GOOGLE_DRIVE_SCOPE_REQUIRED",
            error: "Google Drive ist verbunden, aber ohne Sheets-Leserechte. Bitte Google Drive einmal neu verbinden.",
            details: errors,
          });
        }
      }
    }

    for (const candidate of candidates) {
      try {
        const result = await fetchTextWithTimeout(candidate, { timeoutMs: 12000 });
        if (!result.ok) {
          errors.push(`HTTP ${result.status} bei ${candidate}`);
          continue;
        }
        if (!result.text || !result.text.trim()) {
          errors.push(`Leere Antwort bei ${candidate}`);
          continue;
        }
        if (looksLikeHtml(result.text)) {
          errors.push(`HTML statt CSV bei ${candidate}`);
          continue;
        }
        return res.status(200).json({
          ok: true,
          service: "Google Drive",
          source: "google-sheet-csv",
          csvText: result.text,
          fetchedUrl: candidate,
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          errors.push(`Zeitüberschreitung bei ${candidate}`);
        } else {
          errors.push(`${error.message || "Fehler"} bei ${candidate}`);
        }
      }
    }

    return res.status(400).json({
      ok: false,
      code: refreshToken ? "GOOGLE_SHEET_IMPORT_FAILED" : "GOOGLE_DRIVE_AUTH_REQUIRED",
      error: refreshToken
        ? "Google Sheet konnte nicht geladen werden. Prüfe Freigabe, Tab oder Berechtigungen."
        : "Google Sheet konnte nicht geladen werden. Verbinde Google Drive für private Sheets oder nutze ein öffentlich freigegebenes Sheet.",
      details: errors,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message || "Google Sheet konnte nicht importiert werden.",
    });
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
  if (action === "import-sheet-csv") return handleImportSheetCsv(req, res);

  return res.status(404).json({
    ok: false,
    error: `Unbekannte Google Drive Aktion: ${action}`,
  });
}
