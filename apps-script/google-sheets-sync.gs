const SHEET_CONFIG = {
  inventory: {
    sheetName: "Inventar",
    keyColumn: "Artikel-ID"
  },
  suppliers: {
    sheetName: "Supplier Liste",
    keyColumn: "Supplier-ID"
  },
  sales: {
    sheetName: "InventarTracker",
    legacySheetNames: ["Bestellungen", "Sales & Klarna"],
    keyColumn: "Sale-ID"
  },
  costs: {
    sheetName: "Laufende Kosten",
    keyColumn: "Kosten-ID"
  }
};

const HEADERS_BY_TYPE = {
  inventory: [
    "Artikel-ID",
    "Bezeichnung",
    "Typ",
    "Preis EK",
    "Versand mind.",
    "PreisGesamt EK",
    "Preis VK (ebay)",
    "Ebay gebühren",
    "Gewinn",
    "Zielgewinn",
    "Emph. Zielpreis",
    "Versand ab",
    "Stock",
    "Status",
    "Lieferant",
    "Versandzeit",
    "Ebay Link",
    "Hinweise"
  ],
  suppliers: [
    "Supplier-ID",
    "Name",
    "Plattform",
    "Website",
    "Kontakt",
    "Versandländer",
    "Versandzeit",
    "Rückgabe möglich",
    "Zahlungsart",
    "Bewertung",
    "Status",
    "Notizen"
  ],
  sales: [
    "Sale-ID",
    "Datum",
    "eBay Bestellnummer",
    "Artikel-ID",
    "Produkt",
    "Verkaufspreis",
    "eBay Gebühren",
    "Einkaufspreis",
    "Versandkosten",
    "Gewinn",
    "Auszahlung erhalten",
    "Klarna genutzt",
    "Klarna Betrag",
    "Klarna Fällig am",
    "Supplier bestellt",
    "Trackingnummer",
    "Status",
    "Notizen"
  ],
  costs: [
    "Kosten-ID",
    "Datum",
    "Kategorie",
    "Beschreibung",
    "Betrag",
    "Zahlungsart",
    "Wiederkehrend",
    "Intervall",
    "Nächste Fälligkeit",
    "Status",
    "Notizen"
  ]
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = parsePayload_(e);
    validatePayload_(payload);

    const ss = getSpreadsheet_();
    const result = upsertRecords_(ss, payload.type, Array.isArray(payload.records) ? payload.records : []);

    return jsonResponse_({
      ok: true,
      action: payload.action,
      type: payload.type,
      sheetName: result.sheetName,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      totalRows: result.totalRows,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : "Unerwarteter Fehler",
      details: error && error.stack ? String(error.stack) : "",
      status: 500
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    validateQuery_(e);
    const type = String((e && e.parameter && e.parameter.type) || "").trim();
    const ss = getSpreadsheet_();
    const records = readRecords_(ss, type);

    return jsonResponse_({
      ok: true,
      action: "getRecords",
      type: type,
      count: records.length,
      records: records,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : "Unerwarteter Fehler",
      details: error && error.stack ? String(error.stack) : "",
      status: 500
    });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Fehlender JSON-Body.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Ungultiges JSON empfangen.");
  }
}

function validatePayload_(payload) {
  const expectedToken = getExpectedToken_();
  if (!expectedToken) {
    throw new Error("SYNC_TOKEN fehlt in den Script Properties.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Payload fehlt.");
  }

  if (payload.token !== expectedToken) {
    throw new Error("Ungultiger Sync Token.");
  }

  if (payload.action !== "upsertRecords") {
    throw new Error("Unbekannte action: " + String(payload.action || ""));
  }

  if (!SHEET_CONFIG[payload.type]) {
    throw new Error("Unbekannter type: " + String(payload.type || ""));
  }
}

function validateQuery_(e) {
  const expectedToken = getExpectedToken_();
  if (!expectedToken) {
    throw new Error("SYNC_TOKEN fehlt in den Script Properties.");
  }

  const token = String((e && e.parameter && e.parameter.token) || "").trim();
  const action = String((e && e.parameter && e.parameter.action) || "getRecords").trim();
  const type = String((e && e.parameter && e.parameter.type) || "").trim();

  if (token !== expectedToken) {
    throw new Error("Ungultiger Sync Token.");
  }

  if (action !== "getRecords") {
    throw new Error("Unbekannte action: " + String(action || ""));
  }

  if (!SHEET_CONFIG[type]) {
    throw new Error("Unbekannter type: " + String(type || ""));
  }
}

function getExpectedToken_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("SYNC_TOKEN") || props.getProperty("ELYON_SYNC_TOKEN") || props.getProperty("GOOGLE_SYNC_TOKEN") || "";
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }

  const spreadsheetId = normalizeSpreadsheetId_(
    props.getProperty("SPREADSHEET_ID") || props.getProperty("GOOGLE_SPREADSHEET_ID") || ""
  );
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  throw new Error("Kein Spreadsheet gefunden. Bitte SPREADSHEET_ID setzen oder das Script an ein Spreadsheet binden.");
}

function normalizeSpreadsheetId_(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^https?:\/\//i.test(raw)) {
    const directMatch = raw.match(/[?&]id=([a-zA-Z0-9-_]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
  }

  return raw.split(/[/?#]/)[0];
}

function upsertRecords_(ss, type, records) {
  const config = SHEET_CONFIG[type];
  const headers = HEADERS_BY_TYPE[type];
  const sheet = ensureSheet_(ss, config.sheetName, headers);
  const effectiveHeaders = ensureHeaderRow_(sheet, headers);
  const keyIndex = effectiveHeaders.indexOf(config.keyColumn);
  if (keyIndex < 0) {
    throw new Error("Key Column '" + config.keyColumn + "' nicht in '" + config.sheetName + "' gefunden.");
  }

  const existingMap = buildExistingRowIndex_(sheet, keyIndex, effectiveHeaders.length);
  let inserted = 0;
  let updated = 0;
  let processed = 0;

  records.forEach(function (record) {
    const row = normalizeRecord_(record, effectiveHeaders);
    const key = normalizeKey_(row[keyIndex]);

    if (key && existingMap.has(key)) {
      const rowNumber = existingMap.get(key);
      sheet.getRange(rowNumber, 1, 1, effectiveHeaders.length).setValues([padRow_(row, effectiveHeaders.length)]);
      updated += 1;
    } else {
      sheet.appendRow(padRow_(row, effectiveHeaders.length));
      inserted += 1;
      if (key) {
        existingMap.set(key, sheet.getLastRow());
      }
    }

    processed += 1;
  });

  return {
    sheetName: config.sheetName,
    inserted: inserted,
    updated: updated,
    processed: processed,
    totalRows: Math.max(0, sheet.getLastRow() - 1)
  };
}

function readRecords_(ss, type) {
  const config = SHEET_CONFIG[type];
  const headers = HEADERS_BY_TYPE[type];
  let sheet = ss.getSheetByName(config.sheetName);
  if (!sheet && Array.isArray(config.legacySheetNames)) {
    for (let i = 0; i < config.legacySheetNames.length; i += 1) {
      sheet = ss.getSheetByName(config.legacySheetNames[i]);
      if (sheet) {
        break;
      }
    }
  }
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const effectiveHeaders = ensureHeaderRow_(sheet, headers);
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), effectiveHeaders.length);
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return values.map(function (row) {
    const record = {};
    effectiveHeaders.forEach(function (header, index) {
      if (!header) {
        return;
      }
      record[header] = row[index];
    });
    return record;
  });
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    for (const configKey of Object.keys(SHEET_CONFIG)) {
      const config = SHEET_CONFIG[configKey];
      if (config.sheetName === sheetName && Array.isArray(config.legacySheetNames)) {
        for (let i = 0; i < config.legacySheetNames.length; i += 1) {
          sheet = ss.getSheetByName(config.legacySheetNames[i]);
          if (sheet) {
            break;
          }
        }
      }
      if (sheet) {
        break;
      }
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function ensureHeaderRow_(sheet, fallbackHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), fallbackHeaders.length);
  const row = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return String(value || "").trim();
  });

  if (row.every(function (cell) { return !cell; })) {
    sheet.getRange(1, 1, 1, fallbackHeaders.length).setValues([fallbackHeaders]);
    return fallbackHeaders.slice();
  }

  return row;
}

function buildExistingRowIndex_(sheet, keyIndex, width) {
  const map = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return map;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), width)).getValues();
  values.forEach(function (row, index) {
    const key = normalizeKey_(row[keyIndex]);
    if (key && !map.has(key)) {
      map.set(key, index + 2);
    }
  });
  return map;
}

function normalizeRecord_(record, headers) {
  if (Array.isArray(record)) {
    return padRow_(record, headers.length);
  }

  if (!record || typeof record !== "object") {
    return headers.map(function () { return ""; });
  }

  return headers.map(function (header) {
    return lookupObjectValue_(record, header);
  });
}

function lookupObjectValue_(obj, headerName) {
  const target = normalizeFieldName_(headerName);
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    if (normalizeFieldName_(keys[i]) === target) {
      return obj[keys[i]];
    }
  }
  return "";
}

function normalizeFieldName_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeKey_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function padRow_(row, width) {
  const out = Array.isArray(row) ? row.slice(0, width) : [];
  while (out.length < width) {
    out.push("");
  }
  return out;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
