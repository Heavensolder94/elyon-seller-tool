function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

function isGoogleSheetsUrl(url) {
  return typeof url === "string" && /^https:\/\/script\.google\.com\/macros\/s\/.+\/(exec|dev)(\?.*)?$/i.test(url.trim());
}

function buildUrlWithParams(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function isGoogleSheetsSyncRequest(req) {
  return Boolean(
    req?.body?.url ||
      req?.query?.url ||
      req?.body?.action ||
      req?.query?.action ||
      req?.body?.token ||
      req?.query?.token ||
      req?.body?.payload
  );
}

async function handleGoogleSheetsSync(req, res) {
  try {
    const method = String(req.body?.method || req.query.method || "POST").toUpperCase();
    const targetUrl = String(req.body?.url || req.query.url || "").trim();

    if (!isGoogleSheetsUrl(targetUrl)) {
      return res.status(400).json({
        ok: false,
        error: "Ungültige Google Apps Script Web-App-URL."
      });
    }

    let response;
    if (method === "GET") {
      const url = buildUrlWithParams(targetUrl, {
        action: req.body?.action || req.query.action || "getRecords",
        type: req.body?.type || req.query.type || "",
        token: req.body?.token || req.query.token || ""
      });

      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*"
        }
      });
    } else if (method === "POST") {
      const payload = req.body?.payload || req.body || {};
      response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: "Unbekannte Methode für Google Sheets Sync."
      });
    }

    const text = await response.text();
    const trimmed = String(text || "").trim().toLowerCase();
    if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
      return res.status(502).json({
        ok: false,
        error: "Die Apps-Script-Web-App liefert HTML statt JSON. Bitte Web-App neu bereitstellen."
      });
    }

    const data = safeJsonParse(text);
    if (!response.ok) {
      return res.status(response.status).json(
        data && typeof data === "object"
          ? data
          : {
              ok: false,
              error: text.slice(0, 240) || `HTTP ${response.status}`
            }
      );
    }

    return res.status(200).json(
      data && typeof data === "object"
        ? data
        : {
            ok: false,
            error: "Ungültige JSON-Antwort von Apps Script."
          }
    );
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : "Google Sheets Sync Proxy Fehler"
    });
  }
}

export default async function handler(req, res) {
  if (isGoogleSheetsSyncRequest(req)) {
    return handleGoogleSheetsSync(req, res);
  }

  return res.status(200).json({
    ok: true,
    ebayClientId: !!process.env.EBAY_CLIENT_ID,
    ebayClientSecret: !!process.env.EBAY_CLIENT_SECRET,
    cjApiKey: !!process.env.CJ_API_KEY
  });
}
