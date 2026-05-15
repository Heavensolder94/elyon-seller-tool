const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function isSecureRequest(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (forwardedProto.includes("https")) return true;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "");
  return !/localhost|127\.0\.0\.1|::1/i.test(host);
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

function getOAuthStateCookie(req) {
  return parseCookies(req?.headers?.cookie || "")["elyon_google_drive_oauth_state"] || "";
}

async function exchangeGoogleCode(code) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET oder GOOGLE_REDIRECT_URI fehlt in Vercel.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google OAuth Code konnte nicht eingetauscht werden.");
  }

  return data;
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
