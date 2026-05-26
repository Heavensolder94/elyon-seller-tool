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

  const qwenRequired = {
    QWEN_API_KEY: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
  };

  const googleSheetsRequired = {
    GOOGLE_SHEETS_SYNC_URL: Boolean(process.env.GOOGLE_SHEETS_SYNC_URL),
    GOOGLE_SHEETS_SYNC_TOKEN: Boolean(process.env.GOOGLE_SHEETS_SYNC_TOKEN),
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
      ready: Object.values(googleSheetsRequired).every(Boolean),
      missing: [
        !googleSheetsRequired.GOOGLE_SHEETS_SYNC_URL ? "Apps-Script-Web-App-URL" : null,
        !googleSheetsRequired.GOOGLE_SHEETS_SYNC_TOKEN ? "Sync-Token" : null,
      ].filter(Boolean),
      note: "Google Sheets Sync wird mit `GOOGLE_SHEETS_SYNC_URL` und `GOOGLE_SHEETS_SYNC_TOKEN` aktiv.",
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
    qwen: {
      ready: Object.values(qwenRequired).every(Boolean),
      missing: listMissing(qwenRequired),
      note: `Qwen nutzt \`QWEN_API_KEY\` oder \`DASHSCOPE_API_KEY\` und Modell \`${process.env.QWEN_MODEL || "qwen-plus"}\`.`,
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

function sanitizeGoogleSheetsSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    url: String(source.url || "").trim(),
    token: String(source.token || "").trim(),
    lastInventorySyncAt: String(source.lastInventorySyncAt || "").trim(),
    lastSupplierSyncAt: String(source.lastSupplierSyncAt || "").trim(),
    lastSalesSyncAt: String(source.lastSalesSyncAt || "").trim(),
    lastCostsSyncAt: String(source.lastCostsSyncAt || "").trim(),
    lastSalesLoadAt: String(source.lastSalesLoadAt || "").trim(),
  };
}

async function handleGoogleSheetsSyncSettings(req, res) {
  const { getSettingsStoreDescription, readSettings, writeSettings } = await import("../lib/google-sheets-sync-settings-store.js");

  if (req.method === "GET") {
    const stored = await readSettings();
    return res.status(200).json({
      ok: true,
      settings: stored ? sanitizeGoogleSheetsSettings(stored) : null,
      store: getSettingsStoreDescription(),
    });
  }

  if (req.method === "POST") {
    const payload = sanitizeGoogleSheetsSettings(req.body?.settings || req.body || {});
    const result = await writeSettings(payload);
    if (!result?.ok) {
      return res.status(500).json({
        ok: false,
        error: result?.error || "Die Google Sheets Sync-Einstellungen konnten nicht gespeichert werden.",
        store: getSettingsStoreDescription(),
      });
    }

    return res.status(200).json({
      ok: true,
      settings: payload,
      store: getSettingsStoreDescription(),
    });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({
    ok: false,
    error: "Methode nicht erlaubt.",
  });
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

  if (req.query?.action === "google-sheets-sync-settings") {
    try {
      return await handleGoogleSheetsSyncSettings(req, res);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error && error.message ? error.message : "Google Sheets Sync Settings Fehler",
      });
    }
  }

  if (isGoogleSheetsSyncRequest(req)) {
    return handleGoogleSheetsSync(req, res);
  }

  return res.status(200).json({
    ok: true,
    ebayClientId: !!process.env.EBAY_CLIENT_ID,
    ebayClientSecret: !!process.env.EBAY_CLIENT_SECRET,
    cjApiKey: !!process.env.CJ_API_KEY,
    readiness: buildIntegrationReadiness(),
  });
}
