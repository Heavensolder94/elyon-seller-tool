import {
  buildCookieHeaders,
  formatDriveBackupFilename,
  getLastBackupMeta,
  getRefreshTokenCookie,
  normalizeBackupData,
  uploadBackupToDrive,
  validateBackupData,
} from "../../lib/google-drive.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (!req.body) return {};
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

export default async function handler(req, res) {
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

    const body = await readBody(req);
    const sourceBackup = body.backup && typeof body.backup === "object" ? body.backup : body;
    const validation = validateBackupData(sourceBackup);
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: "Backup ist ungültig.",
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
