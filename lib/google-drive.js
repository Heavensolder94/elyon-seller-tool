const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_BACKUP_FOLDER_ID = "1m7FpcvfLpX7wrBvVMWfjlRVBrABqSiwP";

function getOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim() || "localhost";
  const fallbackProto = /localhost|127\.0\.0\.1|::1/i.test(host) ? "http" : "https";
  const proto = forwardedProto || fallbackProto;
  return `${proto}://${host}`;
}

function getRedirectUri() {
  return String(process.env.GOOGLE_REDIRECT_URI || "").trim();
}

function getClientConfig() {
  return {
    clientId: String(process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    folderId: String(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || DEFAULT_BACKUP_FOLDER_ID).trim(),
    redirectUri: getRedirectUri(),
  };
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (forwardedProto.includes("https")) return true;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return !/localhost|127\.0\.0\.1|::1/i.test(host);
}

function makeState() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  const raw = String(cookieHeader || "");
  raw.split(";").forEach(pair => {
    const index = pair.indexOf("=");
    if (index < 0) return;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!name) return;
    cookies[name] = decodeURIComponent(value);
  });
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value ?? ""))}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAge) || 0))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, options = {}) {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

function getGoogleAuthUrl(state) {
  const config = getClientConfig();
  if (!config.clientId || !config.redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID oder GOOGLE_REDIRECT_URI fehlt in Vercel.");
  }

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  url.searchParams.set("hl", "de");
  return url.toString();
}

async function exchangeGoogleCode(code) {
  const config = getClientConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET oder GOOGLE_REDIRECT_URI fehlt in Vercel.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google OAuth Code konnte nicht eingetauscht werden.");
  }

  return data;
}

async function refreshGoogleAccessToken(refreshToken) {
  const config = getClientConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID oder GOOGLE_CLIENT_SECRET fehlt in Vercel.");
  }
  if (!refreshToken) {
    throw new Error("Kein Google Drive refresh_token vorhanden.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google Drive Access Token konnte nicht erneuert werden.");
  }

  return data;
}

function normalizeBackupData(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    app: String(source.app || "Elyon Seller Tool"),
    version: String(source.version || "1.0"),
    exportedAt: String(source.exportedAt || new Date().toISOString()),
    products: Array.isArray(source.products) ? source.products : [],
    sales: Array.isArray(source.sales) ? source.sales : [],
    suppliers: Array.isArray(source.suppliers) ? source.suppliers : [],
    runningCosts: Array.isArray(source.runningCosts) ? source.runningCosts : [],
    returns: Array.isArray(source.returns) ? source.returns : [],
    shopifyReturns: Array.isArray(source.shopifyReturns) ? source.shopifyReturns : [],
    invoices: Array.isArray(source.invoices) ? source.invoices : [],
    listingDraft: source.listingDraft || null,
    settings: source.settings && typeof source.settings === "object" ? source.settings : {},
    invoiceSettings: source.invoiceSettings && typeof source.invoiceSettings === "object" ? source.invoiceSettings : {},
    googleSheetsSync: source.googleSheetsSync && typeof source.googleSheetsSync === "object" ? source.googleSheetsSync : {},
  };
}

function validateBackupData(data) {
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      errors: ["Backup-Datei ist kein JSON-Objekt."],
      warnings: [],
    };
  }

  const warnings = [];
  const requiredArrays = ["products", "sales", "suppliers", "runningCosts", "returns", "shopifyReturns", "invoices"];
  const hasAnyKnownKey = ["products", "sales", "settings", "invoiceSettings", "listingDraft"].some(key => Object.prototype.hasOwnProperty.call(data, key));
  if (!hasAnyKnownKey) {
    warnings.push("Die Datei sieht nicht wie ein Elyon-Komplett-Backup aus, lässt sich aber trotzdem normalisieren.");
  }

  for (const key of requiredArrays) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      warnings.push(`${key} ist vorhanden, aber kein Array.`);
    }
  }

  if (data.settings !== undefined && (typeof data.settings !== "object" || Array.isArray(data.settings))) {
    warnings.push("settings ist vorhanden, aber kein Objekt.");
  }
  if (data.invoiceSettings !== undefined && (typeof data.invoiceSettings !== "object" || Array.isArray(data.invoiceSettings))) {
    warnings.push("invoiceSettings ist vorhanden, aber kein Objekt.");
  }

  return {
    ok: true,
    errors: [],
    warnings,
    normalized: normalizeBackupData(data),
  };
}

function formatDriveBackupFilename(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const pad = value => String(value).padStart(2, "0");
  return `elyon-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}.json`;
}

function buildMultipartBody({ metadata, fileContent }) {
  const boundary = `----elyon-drive-${makeState().replace(/-/g, "")}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    fileContent,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return { boundary, body };
}

async function uploadBackupToDrive({ refreshToken, backup, fileName }) {
  const config = getClientConfig();
  const normalized = normalizeBackupData(backup);
  const tokenData = await refreshGoogleAccessToken(refreshToken);
  const accessToken = tokenData.access_token;
  const finalFileName = String(fileName || formatDriveBackupFilename(normalized.exportedAt)).trim() || formatDriveBackupFilename(normalized.exportedAt);

  const metadata = {
    name: finalFileName,
    parents: [config.folderId],
    mimeType: "application/json",
  };

  const { boundary, body } = buildMultipartBody({
    metadata,
    fileContent: JSON.stringify(normalized, null, 2),
  });

  const response = await fetch(`${GOOGLE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink,parents,modifiedTime`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error_description || data.message || "Google Drive Upload fehlgeschlagen.");
  }

  return {
    file: data,
    backup: normalized,
    uploadedAt: new Date().toISOString(),
    fileName: finalFileName,
    folderId: config.folderId,
  };
}

function getOAuthStateCookie(req) {
  return parseCookies(req.headers.cookie || "")["elyon_google_drive_oauth_state"] || "";
}

function getRefreshTokenCookie(req) {
  return parseCookies(req.headers.cookie || "")["elyon_google_drive_refresh_token"] || "";
}

function getLastBackupMeta(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return {
    lastBackupAt: cookies["elyon_last_google_drive_backup_at"] || "",
    lastBackupFileName: cookies["elyon_last_google_drive_backup_file"] || "",
    lastBackupFileId: cookies["elyon_last_google_drive_backup_id"] || "",
    lastBackupError: cookies["elyon_last_google_drive_backup_error"] || "",
  };
}

function buildCookieHeaders(req, cookies = []) {
  const secure = isSecureRequest(req);
  const normalized = cookies.map(cookie => serializeCookie(cookie.name, cookie.value, {
    path: cookie.path || "/",
    maxAge: cookie.maxAge,
    sameSite: cookie.sameSite || "Lax",
    secure,
    httpOnly: cookie.httpOnly !== false,
  }));
  return normalized.filter(Boolean);
}

export {
  clearCookie,
  exchangeGoogleCode,
  formatDriveBackupFilename,
  getClientConfig,
  getGoogleAuthUrl,
  getLastBackupMeta,
  getOAuthStateCookie,
  getOrigin,
  getRefreshTokenCookie,
  normalizeBackupData,
  parseCookies,
  refreshGoogleAccessToken,
  serializeCookie,
  buildCookieHeaders,
  uploadBackupToDrive,
  validateBackupData,
};
