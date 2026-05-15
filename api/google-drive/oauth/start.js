const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FALLBACK_GOOGLE_CLIENT_ID = "524424807058-vukfhlqr9kla9m18nspdnlf33u5dikfc.apps.googleusercontent.com";
const FALLBACK_GOOGLE_REDIRECT_URI = "https://elyon-seller-tool.vercel.app/api/google-drive/oauth/callback";

function isSecureRequest(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (forwardedProto.includes("https")) return true;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "");
  return !/localhost|127\.0\.0\.1|::1/i.test(host);
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

function buildCookieHeaders(req, cookies = []) {
  const secure = isSecureRequest(req);
  return cookies.map(cookie =>
    serializeCookie(cookie.name, cookie.value, {
      maxAge: cookie.maxAge,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure,
    })
  );
}

function makeState() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getGoogleAuthUrl(state) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || FALLBACK_GOOGLE_CLIENT_ID || "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || FALLBACK_GOOGLE_REDIRECT_URI || "").trim();
  if (!clientId || !redirectUri) {
    return { error: "GOOGLE_CLIENT_ID oder GOOGLE_REDIRECT_URI fehlt in Vercel." };
  }

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  url.searchParams.set("hl", "de");
  return url.toString();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
    }

    const state = makeState();
    const authUrlResult = getGoogleAuthUrl(state);
    if (authUrlResult.error) {
      return res.status(200).json({
        ok: false,
        service: "Google Drive",
        connected: false,
        error: authUrlResult.error,
        message: authUrlResult.error,
      });
    }

    const authUrl = authUrlResult;
    const headers = buildCookieHeaders(req, [
      {
        name: "elyon_google_drive_oauth_state",
        value: state,
        maxAge: 10 * 60,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    if (headers.length) {
      res.setHeader("Set-Cookie", headers);
    }

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
