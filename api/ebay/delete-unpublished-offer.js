import {
  ebayApiRoot,
  ebayUserSession,
  callEbayJson,
  serviceError,
} from "../../lib/ebay-production.js";
import {
  getElyonDraftRegistryRecords,
  markElyonDraftState,
} from "../../lib/ebay-draft-registry.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

const only = (v) => String(v ?? "").trim();
const OFFER_ID = /^[-\w]{6,120}$/;
const SKU = /^[A-Z0-9_-]{5,120}$/;

export async function deleteRegisteredUnpublishedOffer(input = {}, dependencies = {}) {
  const offerId = only(input.offerId);
  const sku = only(input.sku).toUpperCase();
  if (!OFFER_ID.test(offerId) || !SKU.test(sku) ||
      input.confirm !== "DELETE_UNPUBLISHED_OFFER" || only(input.confirmOfferId) !== offerId) {
    throw serviceError(400, "confirmation_required", "Offer-ID, SKU und Löschbestätigung stimmen nicht überein.");
  }

  const env = "production";
  const records = await (dependencies.records || getElyonDraftRegistryRecords)(env);
  if (!records.some((record) => record.offerId === offerId && only(record.sku).toUpperCase() === sku &&
      record.visibilityMode === "inventory_offer" && record.state === "draft")) {
    throw serviceError(409, "not_registered_draft", "Dieses unveröffentlichte API-Angebot ist nicht als ELYON-Entwurf registriert. Es wurde nichts gelöscht.");
  }

  const session = await (dependencies.session || ebayUserSession)(env);
  if (session.environment !== "production" || !session.accessToken) {
    throw serviceError(409, "ebay_production_not_connected", "Die eBay-Produktionsverbindung ist nicht verfügbar.");
  }
  const url = ebayApiRoot(session.environment) + "/sell/inventory/v1/offer/" + encodeURIComponent(offerId);
  const call = dependencies.call || callEbayJson;
  const headers = { Authorization: "Bearer " + session.accessToken, Accept: "application/json" };
  const current = await call(url, { method: "GET", headers });
  if (String(current?.offerId ?? "") !== offerId || only(current?.sku).toUpperCase() !== sku ||
      String(current?.status ?? "").toUpperCase() !== "UNPUBLISHED" || current?.listingId) {
    throw serviceError(409, "offer_state_changed", "Angebotsidentität oder Status stimmt nicht mehr. Nicht gelöscht.");
  }

  // Absolutely never delete a published offer. eBay's deleteOffer would also end
  // an active listing; the fresh status and stable identifiers above are mandatory.
  await call(url, { method: "DELETE", headers });

  let verified = false;
  try {
    await call(url, { method: "GET", headers });
  } catch (error) {
    if (Number(error?.status) === 404) verified = true;
    else throw error;
  }
  if (!verified) {
    throw serviceError(502, "delete_verification_failed", "eBay hat das Angebot nach dem Löschversuch weiterhin zurückgegeben. Bitte Bestand erneut prüfen.");
  }

  let registryUpdated = false;
  try {
    const marked = await (dependencies.mark || markElyonDraftState)({
      offerId, environment: "production", state: "removed",
    });
    registryUpdated = marked?.persisted === true;
  } catch {
    // The eBay offer has already been deleted. Do not retry the DELETE.
    registryUpdated = false;
  }
  return {
    ok: true, deleted: true, verified: true, offerId, sku,
    registryUpdated,
    companyOsChanged: false,
    productMasterChanged: false,
    feedTasksChanged: false,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  if (!requireSellerAccess(req, res, { maxBodyBytes: 4096 })) return;

  // Prevent cross-site use of the session cookie for a destructive mutation.
  const origin = only(req.headers?.origin);
  const host = only(req.headers?.["x-forwarded-host"] || req.headers?.host);
  if (!origin || !host || (() => { try { return new URL(origin).host !== host; } catch { return true; } })()) {
    return res.status(403).json({ ok: false, error: "origin_denied", message: "Löschen nur im angemeldeten Seller Tool möglich." });
  }
  if (req.headers?.["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") {
    return res.status(403).json({ ok: false, error: "cross_site_denied" });
  }

  try {
    return res.status(200).json(await deleteRegisteredUnpublishedOffer(req.body || {}));
  } catch (error) {
    return res.status(Number(error?.status || 502)).json({
      ok: false,
      error: only(error?.code || "delete_failed"),
      message: only(error?.message || "Angebot konnte nicht gelöscht werden."),
    });
  }
}
