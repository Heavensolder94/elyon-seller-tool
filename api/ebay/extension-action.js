import ebayHandler from "./index.js";
import sellerListingAiHandler from "../seller-listing-ai.js";
import { applyExtensionSellerSession } from "../../lib/seller-extension-bridge.js";
import { createSellerHubDraft, getSellerHubDraftTask } from "../../lib/ebay-seller-hub-drafts.js";
import { getElyonDraftRegistryRecords, registerElyonExternalDraftIdentity } from "../../lib/ebay-draft-registry.js";

const ALLOWED_ACTIONS = new Set(["setup", "create-draft", "draft", "draft-status", "publish", "withdraw", "listing-ai"]);
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
    source: "amazon_importer_feed",
  };
}

async function saveExternalDraft(payload, task, status) {
  const environment = text(task?.environment || payload.environment || "production", 20);
  const records = await getElyonDraftRegistryRecords(environment);
  const existing = records.find((record) => record.externalTaskId && record.externalTaskId === task.taskId) || null;
  const details = externalDraftDetails(payload, task, existing);
  if (!details.sku || !details.externalTaskId) {
    return { persisted: false, reason: "sku_or_task_missing" };
  }
  // A single SKU must not silently switch between unrelated external Feed tasks.
  if (existing && existing.sku !== details.sku) {
    return { persisted: false, reason: "feed_task_sku_mismatch" };
  }
  if (existing && existing.state !== "draft") {
    return { persisted: false, reason: "feed_record_no_longer_draft" };
  }
  const conflictingSku = records.find((record) => record.sku === details.sku
    && (record.visibilityMode !== "seller_hub_feed" || (record.externalTaskId && record.externalTaskId !== details.externalTaskId)));
  if (conflictingSku) {
    return { persisted: false, reason: "existing_sku_belongs_to_another_draft" };
  }
  const result = await registerElyonExternalDraftIdentity({
    ...details,
    externalDraftStatus: status,
  });
  return { persisted: result.persisted === true, reason: result.persisted ? "" : "storage_unavailable" };
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
      if (task.draftVisible === true) {
        // Server-side eBay Feed status is checked before registration. No new eBay draft is created.
        try {
          task.registration = await saveExternalDraft(payload, task, "confirmed");
        } catch {
          task.registration = { persisted: false, reason: "storage_unavailable" };
        }
      }
      return res.status(200).json(task);
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
