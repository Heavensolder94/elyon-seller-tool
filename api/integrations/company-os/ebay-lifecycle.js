import { requireBridgeAccess } from "../../../lib/bridge-access.js";
import {
  getElyonDraftRegistryRecords,
  markElyonDraftState,
  registerElyonExternalDraftIdentity,
} from "../../../lib/ebay-draft-registry.js";
import { fetchSellerState } from "../../ebay/seller-state.js";

function text(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function environmentName(value) {
  return text(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function identity(body = {}) {
  return {
    offerId: text(body.offerId, 120),
    sku: text(body.sku, 120),
    listingId: text(body.listingId, 120),
    sourceProductId: text(body.sourceProductId || body.importId, 180),
  };
}

function findRecord(records = [], candidate = {}) {
  if (candidate.offerId) {
    const match = records.find((record) => record.offerId && record.offerId === candidate.offerId);
    if (match) return match;
  }
  if (candidate.listingId) {
    const match = records.find((record) => record.listingId && record.listingId === candidate.listingId);
    if (match) return match;
  }
  if (candidate.sku) {
    const match = records.find((record) => record.sku && record.sku === candidate.sku);
    if (match) return match;
  }
  if (candidate.sourceProductId) {
    return records.find((record) => record.sourceProductId && record.sourceProductId === candidate.sourceProductId) || null;
  }
  return null;
}

function publicRecord(record) {
  if (!record) return null;
  return {
    offerId: record.offerId,
    sku: record.sku,
    listingId: record.listingId,
    sourceProductId: record.sourceProductId,
    state: record.state,
    previousState: record.previousState,
    visibilityMode: record.visibilityMode,
    externalDraftId: record.externalDraftId,
    externalTaskId: record.externalTaskId,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
    removedAt: record.removedAt,
    endedAt: record.endedAt,
    lastEbaySyncAt: record.lastEbaySyncAt,
    lastSeenAt: record.lastSeenAt,
    missingCount: record.missingCount,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!requireBridgeAccess(req, res, { maxBodyBytes: 128 * 1024 })) return;

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/integrations/company-os/ebay-lifecycle",
      actions: ["register", "status", "mark_removed"],
      matching: ["offerId", "listingId", "sku", "sourceProductId"],
      safety: {
        productHardDelete: false,
        missingConfirmations: 2,
        sellerHubFeedDraftDeletion: "manual_confirmation_required",
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST erlaubt." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = text(body.action, 80);
  const environment = environmentName(body.environment);
  const candidate = identity(body);

  try {
    if (action === "register") {
      const result = await registerElyonExternalDraftIdentity({
        environment,
        sku: candidate.sku,
        sourceProductId: candidate.sourceProductId,
        externalDraftId: text(body.draftId, 180),
        externalTaskId: text(body.taskId, 220),
        source: "company_os_seller_hub_feed",
      });
      if (!result.record) {
        return res.status(409).json({ ok: false, error: result.reason || "stable_identity_missing", message: "Für den Seller-Hub-Entwurf fehlt eine stabile Produkt-ID oder SKU." });
      }
      return res.status(200).json({
        ok: true,
        action,
        lifecycle: publicRecord(result.record),
        storage: result.storage,
        message: "Company-OS-Seller-Hub-Entwurf wurde für den Lifecycle-Abgleich registriert.",
      });
    }

    if (action === "mark_removed") {
      if (body.confirmation !== "seller_hub_removed" || body.publish === true) {
        return res.status(403).json({
          ok: false,
          error: "seller_hub_removed_confirmation_required",
          message: "Ein Seller-Hub-Entwurf darf nur nach ausdrücklicher Bestätigung als entfernt markiert werden.",
        });
      }
      const result = await markElyonDraftState({
        environment,
        ...candidate,
        state: "removed",
      });
      if (!result.record) {
        return res.status(404).json({ ok: false, error: result.reason || "lifecycle_identity_not_found", message: "Der registrierte eBay-Lifecycle-Datensatz wurde nicht gefunden." });
      }
      return res.status(200).json({
        ok: true,
        action,
        lifecycle: publicRecord(result.record),
        storage: result.storage,
        message: "Der Seller-Hub-Entwurf wurde als bei eBay entfernt markiert. Die Produkt- und Verlaufdaten bleiben erhalten.",
      });
    }

    if (action === "status") {
      // Refreshes both authoritative snapshots before resolving the exact identity.
      // Any snapshot failure aborts instead of turning an outage into a deletion.
      const sellerState = await fetchSellerState(environment);
      const records = await getElyonDraftRegistryRecords(environment);
      const record = findRecord(records, candidate);
      return res.status(200).json({
        ok: true,
        action,
        lifecycle: publicRecord(record),
        found: Boolean(record),
        syncedAt: sellerState.syncedAt,
        reliable: sellerState.ebayLifecycle?.reliable !== false,
        automaticDraftDeletionObservable: record?.visibilityMode !== "seller_hub_feed",
        message: record
          ? "eBay-Lifecycle für den Company-OS-Artikel wurde aktualisiert."
          : "Für diese stabile Produkt-ID ist noch kein eBay-Lifecycle registriert.",
      });
    }

    return res.status(400).json({ ok: false, error: "unknown_action", message: `Unbekannte Lifecycle-Aktion: ${action || "leer"}` });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      ok: false,
      error: error?.code || "company_os_ebay_lifecycle_failed",
      message: text(error?.message || "eBay-Lifecycle konnte nicht synchronisiert werden."),
    });
  }
}
