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

// Vercel's public alias and the internal forwarded hostname may differ.
// Both are valid only when they match the browser Origin exactly.
export function isSameOriginSellerMutation(headers = {}) {
  const origin = only(headers.origin);
  const hosts = [headers.host, headers["x-forwarded-host"]]
    .flatMap((value) => String(value ?? "").split(","))
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!origin || hosts.length === 0) return false;
  if (headers["sec-fetch-site"] && headers["sec-fetch-site"] !== "same-origin") return false;
  try {
    const parsed = new URL(origin);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    return (parsed.protocol === "https:" || (local && parsed.protocol === "http:"))
      && hosts.includes(parsed.host.toLowerCase())
      && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  if (!requireSellerAccess(req, res, { maxBodyBytes: 4096 })) return;

  // Prevent cross-site use of the session cookie for a destructive mutation.
  if (!isSameOriginSellerMutation(req.headers || {})) {
    console.warn("ebay_offer_delete_rejected", { code: "origin_denied" });
    return res.status(403).json({
      ok: false, error: "origin_denied",
      message: "Sicherheitsprüfung blockiert: Die Browser-Adresse wurde nicht als dieselbe Seller-Tool-Domain erkannt.",
    });
  }

  try {
    const result = await deleteRegisteredUnpublishedOffer(req.body || {});
    console.info("ebay_offer_delete_verified", { verified: result.verified, registryUpdated: result.registryUpdated });
    return res.status(200).json(result);
  } catch (error) {
    const code = only(error?.code || "delete_failed");
    const status = Number(error?.status || 502);
    // No credentials, SKU, or customer information in diagnostics.
    console.warn("ebay_offer_delete_failed", { code, status });
    return res.status(status).json({
      ok: false, error: code,
      message: only(error?.message || "Angebot konnte nicht gelöscht werden."),
    });
  }
}
