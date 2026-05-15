const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_BACKUP_FOLDER_ID = "1m7FpcvfLpX7wrBvVMWfjlRVBrABqSiwP";

function getOrigin(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "localhost").split(",")[0].trim() || "localhost";
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
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (forwardedProto.includes("https")) return true;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "");
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

function buildCookieHeaders(req, cookies = []) {
  const secure = isSecureRequest(req);
  return cookies.map(cookie => {
    if (cookie.maxAge === 0 || cookie.value === "" || cookie.value === null || cookie.value === undefined) {
      return clearCookie(cookie.name, { httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, secure });
    }
    return serializeCookie(cookie.name, cookie.value, {
      maxAge: cookie.maxAge,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure,
    });
  });
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

function getOAuthStateCookie(req) {
  return parseCookies(req?.headers?.cookie || "")["elyon_google_drive_oauth_state"] || "";
}

export {
  buildCookieHeaders,
  clearCookie,
  exchangeGoogleCode,
  getGoogleAuthUrl,
  getOAuthStateCookie,
  getOrigin,
  isSecureRequest,
  makeState,
  parseCookies,
  serializeCookie,
};
