import { getSettingsStoreDescription, readSettings, writeSettings } from "../lib/google-sheets-sync-settings-store.js";

function sanitizeSettings(input) {
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

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const stored = await readSettings();
      return res.status(200).json({
        ok: true,
        settings: stored ? sanitizeSettings(stored) : null,
        store: getSettingsStoreDescription(),
      });
    }

    if (req.method === "POST") {
      const payload = sanitizeSettings(req.body?.settings || req.body || {});
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
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : "Google Sheets Sync Settings Fehler",
    });
  }
}
