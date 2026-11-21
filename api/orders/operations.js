import { requireSellerAccess } from "../../lib/seller-access.js";
import { readFinanceState, writeFinanceState, getFinanceStoreDescription } from "../../lib/finance-store.js";
import { normalizeOperationInput, financeOrderCostHints, normalizeEbayOrder, orderCompletionChecklist } from "../../seller-orders-v2-core.js";
import { ebayUserSession, callEbayJson } from "../../lib/ebay-production.js";

const text = (value) => String(value ?? "").trim();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireSellerAccess(req, res, { maxBodyBytes: 32 * 1024 })) return;
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  try {
    const store = getFinanceStoreDescription();
    if (req.method === "GET") {
      const state = await readFinanceState();
      const invoices = Object.fromEntries(Object.entries(state.invoiceMeta || {})
        .filter(([, entry]) => entry?.immutable && entry?.invoiceNumber)
        .map(([id, entry]) => [id, { invoiceNumber: entry.invoiceNumber, issued: true }]));
      return res.status(200).json({
        ok: true, revision: state.revision, orderOperations: state.orderOperations || {},
        invoices, persistent: store.persistent === true,
        financeCostHints: financeOrderCostHints(state.transactions),
      });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const orderId = text(body.orderId);
    if (/^DEMO-/i.test(orderId)) return res.status(400).json({ ok:false, error:"demo_order_blocked", message:"Beispielbestellungen dürfen nicht auf den Server gespeichert werden." });
    if (!/^[\w|:-]{5,120}$/.test(orderId)) {
      return res.status(400).json({ ok: false, error: "invalid_order_id", message: "Ungültige eBay-Bestellnummer." });
    }
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
      return res.status(400).json({ ok: false, error: "revision_required", message: "Vor dem Speichern den Serverstand laden." });
    }
    if (!body.operation || typeof body.operation !== "object" || Array.isArray(body.operation)) {
      return res.status(400).json({ ok: false, error: "operation_required" });
    }
    const operation = { ...normalizeOperationInput(body.operation), updatedAt: new Date().toISOString(), source: "orders_center_v4" };
    if (operation.workflowStatus === "COMPLETED") {
      // Verify independently of client-submitted order data before allowing a final closure.
      const session = await ebayUserSession("production");
      const fresh = await callEbayJson(
        "https://api.ebay.com/sell/fulfillment/v1/order/" + encodeURIComponent(orderId),
        { headers: { Authorization: "Bearer " + session.accessToken, Accept: "application/json" } }
      );
      if (text(fresh.orderId) !== orderId) return res.status(409).json({
        ok: false, error: "order_identity_mismatch", message: "eBay hat die Bestellidentität nicht bestätigt."
      });
      const finance = await readFinanceState();
      if (finance.revision !== body.expectedRevision) return res.status(409).json({
        ok: false, error: "finance_conflict", message: "Der Finanzstand wurde geändert. Bitte neu laden.",
        currentRevision: finance.revision,
      });
      const verifiedInvoice = finance.invoiceMeta?.[orderId];
      const readiness = orderCompletionChecklist(normalizeEbayOrder(fresh), operation, verifiedInvoice);
      if (!readiness.ready) return res.status(409).json({
        ok: false, error: "order_completion_blocked",
        message: "Abschluss gesperrt: " + readiness.blockers.map((item) => item.title).join(" · "),
        blockers: readiness.blockers.map(({ key, title, section }) => ({ key, title, section })),
      });
    }
    const result = await writeFinanceState({ orderOperations: { [orderId]: operation } }, {
      action: "order_operation_updated", actor: "seller", source: "orders_center_v4",
      summary: "Interner Bestellstatus, Lieferanten- oder Kostendaten bearbeitet.",
    }, { expectedRevision: body.expectedRevision });
    if (!result.ok) return res.status(result.conflict ? 409 : 503).json({
      ok: false, error: result.conflict ? "finance_conflict" : "finance_store_unavailable",
      message: result.error, currentRevision: result.currentRevision,
    });
    return res.status(200).json({ ok: true, revision: result.state.revision, operation: result.state.orderOperations[orderId] });
  } catch (error) {
    return res.status(503).json({ ok: false, error: "orders_operation_unavailable", message: error.message || "Bestellstatus nicht gespeichert." });
  }
}
