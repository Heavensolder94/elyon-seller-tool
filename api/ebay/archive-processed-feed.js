import { archiveElyonProcessedFeed } from "../../lib/ebay-draft-registry.js";
import { requireSellerAccess } from "../../lib/seller-access.js";
import { isSameOriginSellerMutation } from "./delete-unpublished-offer.js";

const text = (v) => String(v ?? "").trim();
const DREAMZIE_SKU = "AMZ-B0BWND9WBR";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!requireSellerAccess(req, res, { maxBodyBytes: 4096 })) return;
  if (!isSameOriginSellerMutation(req.headers || {})) {
    return res.status(403).json({
      ok: false, error: "origin_denied",
      message: "Feed-Archivierung nur im angemeldeten Seller Tool möglich.",
    });
  }

  const sku = text(req.body?.sku).toUpperCase();
  const externalTaskId = text(req.body?.externalTaskId);
  if (sku !== DREAMZIE_SKU || !externalTaskId || externalTaskId.length > 220
    || req.body?.confirmation !== "ARCHIVE_FEED_LOCALLY") {
    return res.status(400).json({
      ok: false, error: "confirmation_required",
      message: "Nur der bestätigte Dreamzie-Feed-Auftrag kann gezielt archiviert werden.",
    });
  }

  try {
    const result = await archiveElyonProcessedFeed({ sku, externalTaskId, environment: "production" });
    if (result.persisted !== true) {
      return res.status(409).json({
        ok: false, error: result.reason || "archive_not_persisted",
        message: "Archivierung wurde nicht bestätigt. Der Feed-Auftrag bleibt in der bisherigen Ansicht.",
      });
    }
    return res.status(200).json({
      ok: true, archived: true, alreadyArchived: result.alreadyArchived === true,
      sku, externalTaskId, archivedAt: result.record.archivedAt,
      companyOsChanged: false, ebayOfferChanged: false, feedTaskDeleted: false,
      message: "Dreamzie-Feed in ELYON archiviert. Der Seller-Hub-Bestand wurde nicht verändert oder live überprüft.",
    });
  } catch {
    return res.status(502).json({
      ok: false, error: "feed_archive_failed",
      message: "Archivierung konnte nicht gespeichert werden; bitte nicht als abgeschlossen betrachten.",
    });
  }
}
