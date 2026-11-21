import { requireSellerAccess } from "../../lib/seller-access.js";
import { readFinanceState } from "../../lib/finance-store.js";
import { ebayUserSession, callEbayJson, createEbayShippingFulfillment, normalizeFulfillmentInput } from "../../lib/ebay-production.js";
import { normalizeEbayOrder, paymentConfirmed } from "../../seller-orders-v2-core.js";

const text = (value) => String(value ?? "").trim();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireSellerAccess(req, res, { maxBodyBytes: 16 * 1024 })) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (body.confirmation !== "CONFIRM_EBAY_SHIPPING") return res.status(400).json({
      ok: false, error: "confirmation_required", message: "Die ausdrückliche Versandfreigabe fehlt."
    });
    const shipping = normalizeFulfillmentInput(body);
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) return res.status(409).json({
      ok: false, error: "revision_required", message: "Aktuellen Bestellstand vor der Versandmeldung laden."
    });
    const state = await readFinanceState();
    if (state.revision !== body.expectedRevision) return res.status(409).json({
      ok: false, error: "finance_conflict", message: "Der Bestellstand hat sich geändert. Bitte neu laden."
    });
    const op = state.orderOperations?.[shipping.orderId];
    if (!op || !text(op.supplierName) || !text(op.supplierOrderId)) return res.status(409).json({
      ok: false, error: "supplier_reference_required",
      message: "Vor der eBay-Versandmeldung müssen Lieferant und Lieferantenbestellnummer gespeichert sein."
    });
    if (text(op.carrier).toUpperCase() !== shipping.shippingCarrierCode ||
        text(op.trackingNumber) !== shipping.trackingNumber) return res.status(409).json({
      ok: false, error: "shipping_data_not_saved",
      message: "Versanddienstleister und Trackingnummer zuerst intern speichern und erneut prüfen."
    });
    const session = await ebayUserSession("production");
    const verified = await callEbayJson(
      "https://api.ebay.com/sell/fulfillment/v1/order/" + encodeURIComponent(shipping.orderId),
      { headers: { Authorization: "Bearer " + session.accessToken, Accept: "application/json" } }
    );
    if (text(verified.orderId) !== shipping.orderId) return res.status(409).json({
      ok: false, error: "order_identity_mismatch", message: "eBay-Bestellung wurde nicht eindeutig bestätigt."
    });
    const order = normalizeEbayOrder(verified);
    if (!paymentConfirmed(order) || order.cancelStatus.includes("CANCEL")) return res.status(409).json({
      ok: false, error: "order_unpaid_or_cancelled",
      message: "Versandmeldung gesperrt: Bestellung ist nicht vollständig bezahlt oder wurde storniert."
    });
    const sent = await createEbayShippingFulfillment({
      orderId: shipping.orderId, trackingNumber: shipping.trackingNumber,
      shippingCarrierCode: shipping.shippingCarrierCode, lineItems: shipping.lineItems,
    }, "production");
    return res.status(200).json({ ...sent, ok: true, message: sent.message,
      note: "Nur eBay-Versandmeldung. Interner Auftrag wird nach erneuter eBay-Synchronisierung aktualisiert." });
  } catch (error) {
    return res.status(Number(error?.status || 503)).json({
      ok: false, error: error?.code || "shipping_unavailable", message: error?.message || "Versandmeldung fehlgeschlagen."
    });
  }
}
