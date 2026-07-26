import { getSettingsStoreDescription, readSettings, writeSettings } from "../lib/google-sheets-sync-settings-store.js";
import { requireSellerAccess } from "../lib/seller-access.js";

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

function publicSettings(input) {
  const settings = sanitizeSettings(input);
  return {
    ...settings,
    token: "",
    tokenConfigured: Boolean(settings.token),
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 32 * 1024 })) return;

  try {
    if (req.method === "GET") {
      const stored = await readSettings();
      return res.status(200).json({
        ok: true,
        settings: stored ? publicSettings(stored) : null,
        store: getSettingsStoreDescription(),
      });
    }

    if (req.method === "POST") {
      const current = (await readSettings()) || {};
      const incoming = sanitizeSettings(req.body?.settings || req.body || {});
      const payload = {
        ...sanitizeSettings(current),
        ...incoming,
        token: incoming.token || String(current.token || "").trim(),
      };
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
        settings: publicSettings(payload),
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
