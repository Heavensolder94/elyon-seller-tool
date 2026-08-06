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

function listMissing(requiredFlags) {
  return Object.entries(requiredFlags)
    .filter(([, present]) => !present)
    .map(([name]) => name);
}

function buildIntegrationReadiness() {
  const ebayRequired = {
    EBAY_CLIENT_ID: Boolean(process.env.EBAY_CLIENT_ID),
    EBAY_CLIENT_SECRET: Boolean(process.env.EBAY_CLIENT_SECRET),
    EBAY_REDIRECT_URI_OR_RUNAME: Boolean(process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME),
  };

  const cjRequired = {
    CJ_API_KEY: Boolean(process.env.CJ_API_KEY),
  };

  const googleDriveRequired = {
    GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
  };

  const openAiRequired = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
  };

  const deepSeekRequired = {
    DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
  };

  const featureFlagsRequired = {
    FEATURE_FLAGS_ADMIN_TOKEN_OR_ELYON_ADMIN_TOKEN: Boolean(process.env.FEATURE_FLAGS_ADMIN_TOKEN || process.env.ELYON_ADMIN_TOKEN),
    FEATURE_FLAGS_STORE_AVAILABLE: Boolean(
      (process.env.FEATURE_FLAGS_STORE_URL && process.env.FEATURE_FLAGS_STORE_TOKEN) ||
      (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) ||
      (process.env.GOOGLE_DRIVE_TOKEN_STORE_URL && process.env.GOOGLE_DRIVE_TOKEN_STORE_TOKEN)
    ),
  };

  return {
    localBackup: {
      ready: true,
      missing: [],
      note: "Lokale Backups und Browser-Exporte funktionieren ohne externe Zugangsdaten.",
    },
    cj: {
      ready: Object.values(cjRequired).every(Boolean),
      missing: listMissing(cjRequired),
      note: "CJ-Suche, Token-Refresh und Order-Checks brauchen `CJ_API_KEY`.",
    },
    ebay: {
      ready: Object.values(ebayRequired).every(Boolean),
      missing: listMissing(ebayRequired),
      note: "eBay OAuth, Search und Orders brauchen Client-ID, Secret und Redirect-URI.",
    },
    googleDrive: {
      ready: Object.values(googleDriveRequired).every(Boolean),
      missing: listMissing(googleDriveRequired),
      note: "Google-Drive-Backup braucht OAuth-Client, Secret und Callback-URL.",
    },
    googleSheets: {
      ready: false,
      missing: ["Apps-Script-Web-App-URL", "Sync-Token"],
      note: "Google Sheets Sync wird erst mit Web-App-URL und Token aktiv.",
    },
    openai: {
      ready: Object.values(openAiRequired).every(Boolean),
      missing: listMissing(openAiRequired),
      note: "Listing-Optimierung und Produktanalyse brauchen `OPENAI_API_KEY`.",
    },
    deepseek: {
      ready: Object.values(deepSeekRequired).every(Boolean),
      missing: listMissing(deepSeekRequired),
      note: `ELYON Soul nutzt DeepSeek nur mit \`DEEPSEEK_API_KEY\` und Modell \`${process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"}\`.`,
    },
    featureFlags: {
      ready: Object.values(featureFlagsRequired).every(Boolean),
      missing: listMissing(featureFlagsRequired),
      note: "Versions-Schalter brauchen nur einen Admin Token. Als Store wird vorhandener Upstash/eBay/Google-Drive Token Store wiederverwendet, damit keine Extra-Funktion nötig ist.",
    },
  };
}

function buildHealthPayload() {
  return {
    ok: true,
    message: "Health funktioniert",
  };
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
  if (req.query?.action === "health") {
    return res.status(200).json(buildHealthPayload());
  }

  if (isGoogleSheetsSyncRequest(req)) {
    return handleGoogleSheetsSync(req, res);
  }

  return res.status(200).json({
    ok: true,
    ebayClientId: !!process.env.EBAY_CLIENT_ID,
    ebayClientSecret: !!process.env.EBAY_CLIENT_SECRET,
    cjApiKey: !!process.env.CJ_API_KEY,
    featureFlagsAdmin: !!(process.env.FEATURE_FLAGS_ADMIN_TOKEN || process.env.ELYON_ADMIN_TOKEN),
    readiness: buildIntegrationReadiness(),
  });
}