import ebayHandler from "./index.js";
import { applyExtensionSellerSession } from "../../lib/seller-extension-bridge.js";
import { createSellerHubDraft, getSellerHubDraftTask } from "../../lib/ebay-seller-hub-drafts.js";

const ALLOWED_ACTIONS = new Set(["setup", "create-draft", "draft", "draft-status", "publish", "withdraw"]);
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

function publicBridgeError(error) {
  const status = Number(error?.status || 500);
  const details = error?.details && typeof error.details === "object" ? error.details : undefined;
  if (details) {
    console.error("[ebay-extension-action] eBay failure details", JSON.stringify(details));
  }
  return {
    status,
    body: {
      ok: false,
      error: error?.code || "seller_extension_ebay_error",
      message: error?.message || "eBay-Entwurf konnte nicht erstellt werden.",
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
      return res.status(200).json(await createSellerHubDraft(payload, payload.environment));
    }
    if (action === "draft-status") {
      return res.status(200).json(await getSellerHubDraftTask(payload, payload.environment));
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
