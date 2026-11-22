import ebayHandler from "./index.js";
import sellerListingAiHandler from "../seller-listing-ai.js";
import { applyExtensionSellerSession } from "../../lib/seller-extension-bridge.js";
import { createSellerHubDraft, getSellerHubDraftTask } from "../../lib/ebay-seller-hub-drafts.js";
import { getElyonDraftRegistryRecords, registerElyonExternalDraftIdentity, previewManuallyDeletedSellerHubFeed, markManuallyDeletedSellerHubFeed } from "../../lib/ebay-draft-registry.js";
import { findRecentSellerHubFeedForSku, listRecentAmazonDraftRecoveryCandidates } from "../../lib/ebay-feed-task-recovery.js";
import { syncAmazonPriceReference } from "../../lib/amazon-price-reference-sync.js";
import { planExternalFeedRegistration, feedRegistrationFailureMessage } from "../../lib/ebay-external-feed-identity.js";

const ALLOWED_ACTIONS = new Set(["setup", "create-draft", "draft", "draft-status", "recover-draft", "list-draft-recovery-candidates", "preview-deleted-feed", "mark-deleted-feed", "publish", "withdraw", "listing-ai"]);
const EBAY_INVENTORY_DESCRIPTION_MAX = 4000;
const EBAY_ASPECT_NAME_MAX = 40;
const EBAY_ASPECT_VALUE_MAX = 50;
const EBAY_IMAGE_MAX = 24;

function text(value, max = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeItemSpecifics(value) {
  const output = {};
  for (const [rawName, rawValues] of Object.entries(object(value))) {
    const name = text(rawName, EBAY_ASPECT_NAME_MAX);
    if (!name) continue;
    const values = unique((Array.isArray(rawValues) ? rawValues : [rawValues])
      .map((entry) => text(entry, EBAY_ASPECT_VALUE_MAX)))
      .slice(0, 30);
    if (!values.length) continue;
    output[name] = unique([...(output[name] || []), ...values]).slice(0, 30);
  }
  return output;
}

export function normalizeExtensionEbayPayload(value) {
  const source = object(value);
  const payload = { ...source };

  if ("description" in payload) {
    payload.description = text(payload.description, EBAY_INVENTORY_DESCRIPTION_MAX);
  }
  if ("itemSpecifics" in payload) {
    payload.itemSpecifics = normalizeItemSpecifics(payload.itemSpecifics);
  }
  if (Array.isArray(payload.images)) {
    payload.images = unique(payload.images
      .map((entry) => text(entry, 2000))
      .filter((url) => /^https:\/\//i.test(url)))
      .slice(0, EBAY_IMAGE_MAX);
  }

  return payload;
}

function externalDraftDetails(payload = {}, task = {}, existing = null) {
  return {
    environment: text(task.environment || payload.environment || existing?.environment || "production", 20),
    sku: text(task.sku || payload.sku || existing?.sku, 120),
    sourceProductId: text(payload.sourceProductId || existing?.sourceProductId, 180),
    externalTaskId: text(task.taskId || payload.taskId || existing?.externalTaskId, 220),
    draftTitle: text(payload.title || existing?.draftTitle, 200),
    draftPrice: payload.price ?? existing?.draftPrice ?? 0,
    draftCurrency: text(payload.currency || existing?.draftCurrency || "EUR", 12),
    draftImages: Array.isArray(payload.images) && payload.images.length ? payload.images : (existing?.draftImages || []),
    amazonReferencePrice: payload.amazonReferencePrice ?? existing?.amazonReferencePrice ?? null,
    amazonReferenceCapturedAt: text(payload.amazonReferenceCapturedAt || existing?.amazonReferenceCapturedAt, 80),
    source: "amazon_importer_feed",
  };
}

async function saveExternalDraft(payload, task, status) {
  const environment = text(task?.environment || payload.environment || "production", 20);
  const records = await getElyonDraftRegistryRecords(environment);
  const existing = records.find((record) => record.externalTaskId && record.externalTaskId === task.taskId) || null;
  const details = externalDraftDetails(payload, task, existing);
  const plan = planExternalFeedRegistration(records, details);
  if (!plan.ok) {
    return { persisted: false, reason: plan.reason };
  }
  const result = await registerElyonExternalDraftIdentity({
    ...details,
    externalDraftStatus: status,
  });
  return {
    persisted: result.persisted === true,
    reason: result.persisted ? "" : (result.reason || "storage_unavailable"),
    amazonReferencePrice: result.record?.amazonReferencePrice ?? null,
    amazonReferenceCapturedAt: result.record?.amazonReferenceCapturedAt || "",
  };
}

function publicBridgeError(error) {
  const status = Number(error?.status || 500);
  const details = error?.details && typeof error.details === "object" ? error.details : undefined;
  if (details) {
    console.error("[ebay-extension-action] Seller bridge failure details", JSON.stringify(details));
  }
  return {
    status,
    body: {
      ok: false,
      error: error?.code || "seller_extension_action_error",
      message: error?.message || "Seller-Aktion konnte nicht ausgeführt werden.",
      ...(details ? { details } : {}),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (String(req?.method || "").toUpperCase() !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      message: "Die Extension-Brücke akzeptiert nur POST.",
    });
  }

  const action = text(req?.body?.action).replace(/^\/+/, "");
  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({
      ok: false,
      error: "seller_extension_action_not_allowed",
      message: "Diese Seller-Aktion ist für die Extension-Brücke nicht freigegeben.",
    });
  }

  const session = applyExtensionSellerSession(req);
  if (!session.ok) {
    return res.status(403).json({ ok: false, error: session.error, message: session.message });
  }

  const payload = normalizeExtensionEbayPayload(
    req?.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
  );

  try {
    if (action === "create-draft" || action === "draft") {
      const task = await createSellerHubDraft(payload, payload.environment);
      // The Feed task has only been queued. Never count this as a finished eBay draft.
      try {
        task.registration = await saveExternalDraft(payload, task, "processing");
      } catch {
        task.registration = { persisted: false, reason: "storage_unavailable" };
      }
      return res.status(200).json(task);
    }
    if (action === "draft-status") {
      const task = await getSellerHubDraftTask(payload, payload.environment);
      if (task.feedConfirmed === true) {
        // Server-side eBay Feed status is checked before registration. No new eBay draft is created.
        try {
          task.registration = await saveExternalDraft(payload, task, "confirmed");
          if (task.registration.persisted) {
            task.amazonReferenceSync = await syncAmazonPriceReference({
              sku: task.sku || payload.sku,
              amazonReferencePrice: task.registration.amazonReferencePrice,
              amazonReferenceCapturedAt: task.registration.amazonReferenceCapturedAt,
            });
          }
        } catch {
          task.registration = { persisted: false, reason: "storage_unavailable" };
        }
      }
      return res.status(200).json(task);
    }

    if (action === "preview-deleted-feed") {
      // Read-only ELYON registry lookup. The selected historical eBay task
      // might differ from the active ELYON task that blocks SKU reuse.
      const preview = await previewManuallyDeletedSellerHubFeed({
        sku: payload.sku, environment: payload.environment,
      });
      if (!preview.ok) {
        return res.status(409).json({
          ok: false, error: preview.reason,
          message: preview.reason === "manual_feed_active_sku_ambiguous"
            ? "Mehrere aktive ELYON-Einträge verwenden diese SKU. Zum Schutz der übrigen Entwürfe erfolgt keine automatische Bereinigung."
            : "Kein eindeutig zugeordneter aktiver ELYON-Feed-Entwurf für diese SKU gefunden. Es wurde nichts geändert.",
        });
      }
      return res.status(200).json({ ok: true, record: preview.record, ebayChanged: false });
    }
    if (action === "mark-deleted-feed") {
      // Manual deletion in Seller Hub is not externally verifiable through
      // the Feed API. Require explicit confirmation plus exact registry task ID.
      if (payload.confirmation !== "EBAY_DRAFT_ALREADY_DELETED"
        || payload.environment === "sandbox" || !payload.externalTaskId) {
        return res.status(400).json({
          ok: false, error: "manual_feed_confirmation_required",
          message: "Nur einen bereits bei eBay manuell gelöschten Produktions-Entwurf mit ausdrücklicher Bestätigung bereinigen.",
        });
      }
      const result = await markManuallyDeletedSellerHubFeed({
        sku: payload.sku, environment: "production",
        externalTaskId: payload.externalTaskId,
      });
      if (result.persisted !== true) {
        const reason = result.reason || "manual_feed_cleanup_unconfirmed";
        return res.status(409).json({
          ok: false, error: reason,
          message: reason.includes("ambiguous") || reason.includes("mismatch")
            ? "Der ELYON-Eintrag passt nicht eindeutig zur ausgewählten SKU und Task-ID. Es wurde nichts geändert."
            : "Die gezielte Bereinigung konnte nicht bestätigt werden. Der bestehende ELYON-Eintrag bleibt unverändert.",
        });
      }
      return res.status(200).json({
        ok: true, state: "removed", sku: result.record.sku,
        externalTaskId: result.record.externalTaskId,
        alreadyRemoved: result.alreadyRemoved === true,
        removedAt: result.record.removedAt,
        ebayChanged: false, published: false, productDeleted: false,
        message: "Der manuell bei eBay gelöschte Feed-Entwurf ist in ELYON als entfernt markiert. Historie, SKU und Task-ID bleiben erhalten.",
      });
    }
    if (action === "list-draft-recovery-candidates") {
      // Read-only on eBay and ELYON. The extension can display recovered SKU
      // choices when the user no longer has the original Amazon page loaded.
      const result = await listRecentAmazonDraftRecoveryCandidates({
        environment: payload.environment,
      });
      return res.status(200).json({ ok: true, ...result, published: false, created: false });
    }
    if (action === "recover-draft") {
      // Recover only the existing feed task; never create a new eBay draft.
      const recovery = await findRecentSellerHubFeedForSku({
        sku: payload.sku,
        taskId: payload.taskId,
        environment: payload.environment,
      });
      if (!recovery.found || !recovery.record) {
        return res.status(404).json({
          ok: false,
          error: "feed_recovery_not_found",
          message: "Kein passender eBay-Entwurfs-Task für diese SKU in den letzten sieben Tagen gefunden. Es wurde kein neuer Entwurf angelegt.",
        });
      }
      const matched = recovery.record;
      const task = await getSellerHubDraftTask({ taskId: matched.taskId, environment: payload.environment }, payload.environment);
      if (task.feedConfirmed !== true || !["FX_DRAFT", "FX_LISTING"].includes(text(task.task?.feedType, 60).toUpperCase())) {
        return res.status(409).json({
          ok: false,
          error: "feed_recovery_not_confirmed",
          message: "Die eBay-Feed-Historie enthält die SKU, aber der Task ist nicht eindeutig als erfolgreich abgeschlossener Draft bestätigt.",
        });
      }
      // Historical uploaded CSV is authoritative; do not substitute freshly edited listing fields.
      const verifiedPayload = {
        environment: payload.environment,
        sku: matched.sku,
        sourceProductId: payload.sourceProductId,
        title: matched.title,
        price: matched.price,
        currency: "EUR",
        images: matched.images,
        amazonReferencePrice: payload.amazonReferencePrice,
        amazonReferenceCapturedAt: payload.amazonReferenceCapturedAt,
      };
      const registration = await saveExternalDraft(verifiedPayload, { taskId: matched.taskId, sku: matched.sku, environment: payload.environment }, "confirmed");
      if (!registration.persisted) {
        return res.status(409).json({
          ok: false,
          error: "feed_recovery_registration_failed",
          reason: registration.reason,
          // Report safe reason text in the extension itself; no developer tools
          // and no credentials needed to identify a legitimate conflict.
          message: feedRegistrationFailureMessage(registration.reason),
        });
      }
      const amazonReferenceSync = await syncAmazonPriceReference({
        sku: matched.sku,
        amazonReferencePrice: registration.amazonReferencePrice,
        amazonReferenceCapturedAt: registration.amazonReferenceCapturedAt,
      });
      return res.status(200).json({
        amazonReferenceSync,
        ok: true,
        draftVisible: true, // compatibility alias for confirmed feed processing
        feedConfirmed: true,
        sellerHubVisibility: "not_verified",
        complete: true,
        recovered: true,
        taskId: matched.taskId,
        sku: matched.sku,
        registration,
        message: "Vorhandener eBay-Feed-Entwurf über die Task-Historie gefunden und mit ELYON synchronisiert. Sein aktueller Seller-Hub-Status ist nicht live überprüfbar.",
      });
    }
    if (action === "listing-ai") {
      req.query = { ...(req.query || {}), source: "amazon-importer-extension" };
      req.body = payload;
      req.method = "POST";
      return await sellerListingAiHandler(req, res);
    }

    req.query = { ...(req.query || {}), action };
    req.body = payload;
    req.method = "POST";
    return await ebayHandler(req, res);
  } catch (error) {
    const failure = publicBridgeError(error);
    return res.status(failure.status).json(failure.body);
  }
}
