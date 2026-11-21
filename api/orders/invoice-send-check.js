import { requireSellerAccess } from "../../lib/seller-access.js";
import { readFinanceState, getFinanceStoreDescription } from "../../lib/finance-store.js";
import { ebayUserSession, callEbayJson } from "../../lib/ebay-production.js";
import { summarizeEbayIntrospection } from "../ebay/scope-check.js";
import { normalizeEbayOrder, paymentConfirmed } from "../../seller-orders-v2-core.js";
import { attachmentBaseStatus, attachmentUrl, verifiedInvoicePdf, messageDeliveryEnabled } from "../../lib/order-message-attachment.js";

const str = value => String(value ?? "").trim();
const validOrder = value => /^[A-Za-z0-9_-]{6,70}$/.test(str(value)) && !/^DEMO-/i.test(str(value));

// Read-only operational preflight: never reserve an invoice number, modify Finance,
// POST to eBay, or disclose buyer data, invoice content, access tokens or signed URLs.
export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ok:false,error:"method_not_allowed"});
  }
  const orderId = str(req.query?.orderId);
  if (orderId && !validOrder(orderId))
    return res.status(400).json({ok:false,error:"invalid_order_id"});

  const base = attachmentBaseStatus(process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL);
  const store = getFinanceStoreDescription();
  const checks = {
    persistentFinanceStore: store.persistent === true && store.configured === true,
    attachmentBaseValid: base.valid === true,
    sendFeatureEnabled: messageDeliveryEnabled(),
    issuedInvoicePresent: false,
    invoicePdfVerified: false,
    noPreviousSendAttempt: false,
    ebayOrderVerified: false,
    paymentConfirmed: false,
    notCancelled: false,
    recipientVerified: false,
    messageScopeVerified: false,
    attachmentReachable: false,
  };
  const blockers = [];
  if (!checks.persistentFinanceStore) blockers.push("finance_store_unavailable");
  if (!checks.attachmentBaseValid) blockers.push("attachment_base_invalid");
  if (!checks.sendFeatureEnabled) blockers.push("send_feature_disabled");
  if (!orderId) return res.status(200).json({
    ok:true, mode:"read_only", orderCheckPerformed:false,
    readyToSend:false, checks, blockers, ebayMessageSent:false, realInvoiceIssued:false,
  });

  try {
    const state = await readFinanceState();
    const record = state.invoiceMeta?.[orderId];
    checks.issuedInvoicePresent = record?.immutable === true;
    if (!checks.issuedInvoicePresent) blockers.push("invoice_not_issued");
    checks.noPreviousSendAttempt = !state.orderOperations?.[orderId]?.messageDispatch?.status;
    if (!checks.noPreviousSendAttempt) blockers.push("prior_send_attempt");

    let pdf;
    if (checks.issuedInvoicePresent) {
      try { pdf = verifiedInvoicePdf(record, orderId); checks.invoicePdfVerified = true; }
      catch { blockers.push("invoice_integrity_failed"); }
    }
    // No eBay API lookup or public attachment fetch if no valid invoice exists.
    if (checks.invoicePdfVerified) {
      try {
        const session = await ebayUserSession("production");
        const clientId = str(process.env.EBAY_CLIENT_ID);
        const clientSecret = str(process.env.EBAY_CLIENT_SECRET);
        if (clientId && clientSecret) {
          try {
            const introspection = await fetch("https://api.ebay.com/identity/v1/oauth2/token/introspect",{
              method:"POST",
              headers:{
                Authorization:"Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
                "Content-Type":"application/x-www-form-urlencoded",Accept:"application/json",
              },
              body:new URLSearchParams({token:session.accessToken,token_type_hint:"access_token"}),
              signal:AbortSignal.timeout(10000),
            });
            if (introspection.ok) {
              const data = await introspection.json();
              checks.messageScopeVerified = summarizeEbayIntrospection(data).messageScopeGranted === true;
            }
          } catch { /* Fail closed. */ }
        }
        if (!checks.messageScopeVerified) blockers.push("message_scope_not_verified");
        const raw = await callEbayJson(
          "https://api.ebay.com/sell/fulfillment/v1/order/" + encodeURIComponent(orderId),
          {headers:{Authorization:"Bearer " + session.accessToken,Accept:"application/json"}}
        );
        checks.ebayOrderVerified = str(raw?.orderId) === orderId;
        if (checks.ebayOrderVerified) {
          const normalized = normalizeEbayOrder(raw);
          checks.paymentConfirmed = paymentConfirmed(normalized);
          checks.notCancelled = !normalized.cancelStatus.includes("CANCEL");
          checks.recipientVerified = Boolean(str(raw?.buyer?.username)) && str(raw.buyer.username).length <= 120;
        }
        if (!checks.ebayOrderVerified) blockers.push("ebay_order_mismatch");
        if (!checks.paymentConfirmed) blockers.push("payment_not_confirmed");
        if (!checks.notCancelled) blockers.push("order_cancelled_or_unknown");
        if (!checks.recipientVerified) blockers.push("recipient_unavailable");
      } catch {
        blockers.push("ebay_order_lookup_failed");
      }
      if (base.valid) {
        try {
          const url = attachmentUrl({orderId,invoiceHash:record.snapshotHash,baseUrl:base.origin});
          const response = await fetch(url,{
            method:"GET",redirect:"error",headers:{Accept:"application/pdf"},
            signal:AbortSignal.timeout(10000),
          });
          if (response.ok && String(response.headers.get("content-type")||"").toLowerCase().includes("application/pdf")) {
            const bytes = Buffer.from(await response.arrayBuffer());
            checks.attachmentReachable = bytes.equals(pdf);
          }
        } catch { /* Fail closed. */ }
        if (!checks.attachmentReachable) blockers.push("attachment_delivery_failed");
      }
    }
    const readyToSend = Object.values(checks).every(Boolean);
    return res.status(200).json({
      ok:true,mode:"read_only",orderCheckPerformed:true,
      readyToSend,checks,blockers,ebayMessageSent:false,realInvoiceIssued:false,
    });
  } catch {
    return res.status(503).json({
      ok:false,error:"preflight_unavailable",mode:"read_only",readyToSend:false,
      message:"Sichere Versandvorprüfung derzeit nicht möglich.",
      ebayMessageSent:false,realInvoiceIssued:false,
    });
  }
}
