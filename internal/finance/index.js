import { recognizePdfIsolated } from '../../lib/receipt-pdf-isolated.js';
import { extractUblReceipt } from '../../lib/receipt-ubl.js';
import { requireSellerAccess } from "../../lib/seller-access.js";
import { financeSigningStatus, signFinancesGetRequest } from "../../lib/ebay-finance-signature.js";
import { ebayUserSession, callEbayJson, publicEbayError } from "../../lib/ebay-production.js";
import { readFinanceState, writeFinanceState, getFinanceStoreDescription, reserveFinanceInvoiceNumber } from "../../lib/finance-store.js";
import { normalizeEbayApiTransactions, mergeTransactions, calculateMetrics, buildEurSummary, selectApprovedEurTransactions, buildReceiptCostProposal, buildSupplierRefundProposal, getSupplierRefundTaxReview } from "../../seller-finance-core.js";
import { issueKleinunternehmerInvoice, verifyInvoiceSnapshot, cancelIssuedInvoice, issueReplacementInvoice, issueInvoiceCorrection } from "../../lib/kleinunternehmer-invoice-store.js";
import { getRefreshTokenCookie, downloadFinanceDocumentFromDrive } from "../../lib/google-drive.js";
import { readGoogleDriveToken } from "../../lib/google-drive-token-store.js";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function actionFrom(req) {
  const explicit = text(req?.query?.action || req?.query?.endpoint || req?.query?.path);
  if (explicit) return explicit.replace(/^\/+/, "");
  try {
    const url = new URL(req?.url || "/api/finance", `https://${req?.headers?.host || "localhost"}`);
    return url.pathname.replace(/^\/api\/finance\/?/, "") || "status";
  } catch {
    return "status";
  }
}

function environmentFrom(req) {
  const raw = req?.method === "POST" ? req?.body?.environment : req?.query?.environment;
  return text(raw || process.env.EBAY_ENV).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function financesRoot(environment) {
  return environment === "sandbox" ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com";
}

function daysAgoIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(1, Math.min(Number(days || 90), 730)));
  return date.toISOString();
}

function ebayHeaders(accessToken, requestUrl) {
  return {
    ...signFinancesGetRequest(requestUrl),
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Accept-Language": "de-DE",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
  };
}

export async function fetchTransactions(environment, days = 90) {
  const session = await ebayUserSession(environment);
  const limit = 1000;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const transactions = [];
  const from = daysAgoIso(days);
  const to = new Date().toISOString();
  const filter = `transactionDate:[${from}..${to}]`;

  while (offset < total && offset < 10000) {
    const url = new URL(`${financesRoot(session.environment)}/sell/finances/v1/transaction`);
    url.searchParams.set("filter", filter);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const data = await callEbayJson(url.toString(), { headers: ebayHeaders(session.accessToken, url.toString()) });
    const page = Array.isArray(data.transactions) ? data.transactions : [];
    transactions.push(...page);
    total = Number.isFinite(Number(data.total)) ? Number(data.total) : transactions.length;
    if (!page.length || page.length < limit) break;
    offset += page.length;
  }

  return {
    environment: session.environment,
    days: Number(days),
    from,
    to,
    total: transactions.length,
    transactions,
    scopes: session.scopes,
  };
}

async function fetchPayouts(environment, days = 90) {
  const session = await ebayUserSession(environment);
  const from = daysAgoIso(days);
  const to = new Date().toISOString();
  const url = new URL(`${financesRoot(session.environment)}/sell/finances/v1/payout`);
  url.searchParams.set("filter", `payoutDate:[${from}..${to}]`);
  url.searchParams.set("limit", "200");
  const data = await callEbayJson(url.toString(), { headers: ebayHeaders(session.accessToken, url.toString()) });
  return {
    environment: session.environment,
    days: Number(days),
    from,
    to,
    total: Number(data.total || data.payouts?.length || 0),
    payouts: Array.isArray(data.payouts) ? data.payouts : [],
  };
}

async function handleStatus(req, res) {
  const state = await readFinanceState();
  const metrics = calculateMetrics(state.transactions);
  return res.status(200).json({
    ok: true,
    service: "Elyon Finance",
    version: 2,
    revision: state.revision,
    store: getFinanceStoreDescription(),
    ebayFinancesSignature: financeSigningStatus(),
    counts: {
      transactions: state.transactions.length,
      documents: state.documents.length,
      imports: state.imports.length,
      auditEvents: state.auditLog.length,
    },
    metrics,
    safety: state.safety || { livePublishingEnabled: false, trackingSyncEnabled: false },
    safetyPolicy: {
      readOnlyEbayApi: true,
      automaticTaxFiling: false,
      automaticPosting: false,
      manualReviewRequired: true,
      destructiveDelete: false,
    },
  });
}

async function handleLoad(req, res) {
  const state = await readFinanceState();
  return res.status(200).json({ ok: true, state, store: getFinanceStoreDescription() });
}

async function handleSave(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  const body = object(req.body);
  if (!body.state || typeof body.state !== "object") return res.status(400).json({ ok: false, error: "state fehlt." });
  const revisionProvided = Object.hasOwn(body, "expectedRevision");
  if (revisionProvided && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)) {
    return res.status(400).json({ ok: false, error: "invalid_revision" });
  }
  // Finance UI writes are rejected when the browser has not read a revision.
  if (body.source === "seller_finance_v2" && !revisionProvided) {
    return res.status(409).json({ ok: false, error: "finance_revision_required", message: "Bitte zuerst den Finance-Serverstand laden." });
  }
  const result = await writeFinanceState(body.state, {
    action: text(body.action) || "finance_manual_sync",
    actor: "seller",
    source: text(body.source) || "seller_finance_ui",
    summary: text(body.summary) || "Finanzdaten aus dem Seller Tool synchronisiert.",
  }, revisionProvided ? { expectedRevision: body.expectedRevision } : {});
  if (!result.ok) return res.status(result.conflict ? 409 : 503).json({
    ok: false, error: result.conflict ? "finance_conflict" : "finance_store_unavailable",
    message: result.error, currentRevision: result.currentRevision, store: getFinanceStoreDescription(),
  });
  return res.status(200).json({ ok: true, state: result.state, merge: result.merge, store: getFinanceStoreDescription() });
}

async function handleReceiptCosts(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  const store = getFinanceStoreDescription();
  if (!store.persistent || !store.configured) return res.status(503).json({ ok: false, error: "finance_store_unavailable", message: "Ein persistenter Finance-Speicher ist erforderlich." });
  const expected = req.body?.expectedRevision;
  if (!Number.isSafeInteger(expected) || expected < 0) return res.status(400).json({ ok: false, error: "invalid_revision" });
  const current = await readFinanceState();
  if (current.revision !== expected) return res.status(409).json({ ok: false, error: "finance_conflict", message: "Finance-Daten geändert; bitte Serverstand neu laden und Vorschau prüfen." });
  const doc = current.documents.find(item => item.id === text(req.body?.documentId));
  if (!doc) return res.status(404).json({ ok: false, error: "document_not_found", message: "Beleg fehlt im Finance-Serverstand." });
  const proposal = buildReceiptCostProposal(doc, req.body?.allocations, current.transactions, current.documents, current.monthClosures);
  if (!proposal.ok) return res.status(409).json({ ok: false, error: "receipt_cost_blocked", message: proposal.errors.join(" · "), blockers: proposal.errors });
  // A cloud ID in browser-supplied metadata alone does not prove that the
  // original exists or still matches. Reuse the bound Drive download verifier.
  try {
    const cookie = getRefreshTokenCookie(req);
    const stored = cookie ? null : await readGoogleDriveToken();
    const refreshToken = cookie || stored?.refresh_token || stored?.refreshToken || "";
    if (!refreshToken) throw new Error("drive_not_connected");
    await downloadFinanceDocumentFromDrive({ refreshToken, documentId: doc.id, fileId: doc.cloudFileId, sha256: doc.sha256 });
    if (text(doc.currency).toUpperCase() !== 'EUR') {
      const proof = current.documents.find(item => item.id === doc.receiptPaymentProofIdV1);
      await downloadFinanceDocumentFromDrive({ refreshToken, documentId: proof.id, fileId: proof.cloudFileId, sha256: proof.sha256 });
    }
  } catch {
    return res.status(503).json({ ok: false, error: "receipt_original_unavailable", message: "Originalbeleg konnte in Google Drive nicht geprüft werden. Keine Kosten erfasst; Drive-Verbindung und Datei prüfen." });
  }
  const result = await writeFinanceState({ transactions: proposal.allocations }, {
    action: "supplier_receipt_costs_recorded", source: "supplier_receipt_verified", actor: "seller", summary: `Prüfbedürftige Lieferantenkosten aus Beleg ${doc.id} erfasst.`
  }, { expectedRevision: expected, allowReceiptCosts: true });
  if (!result.ok) return res.status(result.conflict ? 409 : 503).json({ ok: false, error: result.conflict ? "finance_conflict" : "finance_store_unavailable", message: result.error });
  return res.status(200).json({ ok: true, state: result.state, recorded: proposal.allocations.length });
}

async function handleSupplierRefund(req,res) {
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Nur POST erlaubt.'});
  if(req.body?.confirm!==true)return res.status(400).json({ok:false,error:'confirmation_required'});
  const store=getFinanceStoreDescription();if(!store.persistent||!store.configured)return res.status(503).json({ok:false,error:'finance_store_unavailable'});
  const expected=req.body?.expectedRevision;if(!Number.isSafeInteger(expected)||expected<0)return res.status(400).json({ok:false,error:'invalid_revision'});
  const state=await readFinanceState();if(state.revision!==expected)return res.status(409).json({ok:false,error:'finance_conflict',message:'Finanzdaten geändert; Erstattung erneut prüfen.'});
  const doc=state.documents.find(item=>item.id===text(req.body?.documentId));if(!doc)return res.status(404).json({ok:false,error:'document_not_found'});
  const originalId=text(req.body?.originalTransactionId);
  const proposal=buildSupplierRefundProposal(doc,originalId,state.transactions,state.monthClosures);
  if(!proposal.ok)return res.status(409).json({ok:false,error:'supplier_refund_blocked',message:proposal.errors.join(' · '),blockers:proposal.errors});
  const original=state.transactions.find(row=>row.transactionId===originalId);
  const originalDoc=state.documents.find(item=>item.id===original?.supplierReceipt?.documentId);
  if(!originalDoc||text(originalDoc.sha256).toLowerCase()!==text(original.supplierReceipt.sha256).toLowerCase()||!text(originalDoc.cloudFileId))return res.status(409).json({ok:false,error:'original_receipt_unavailable',message:'Ursprünglicher Einkaufsbeleg fehlt oder ist widersprüchlich.'});
  const paymentEvidence = original.supplierReceipt.paymentProofDocumentId ? state.documents.find(item=>item.id===original.supplierReceipt.paymentProofDocumentId) : null;
  if(original.supplierReceipt.paymentProofDocumentId&&(!paymentEvidence||text(paymentEvidence.sha256).toLowerCase()!==original.supplierReceipt.paymentProofSha256||!text(paymentEvidence.cloudFileId)))return res.status(409).json({ok:false,error:'original_payment_proof_unavailable',message:'Der ursprüngliche EUR-Zahlungsnachweis fehlt oder ist widersprüchlich.'});
  try {
    const cookie=getRefreshTokenCookie(req),stored=cookie?null:await readGoogleDriveToken();
    const refreshToken=cookie||stored?.refresh_token||stored?.refreshToken||'';if(!refreshToken)throw new Error('drive_not_connected');
    for(const item of [originalDoc,doc,...(paymentEvidence?[paymentEvidence]:[])])await downloadFinanceDocumentFromDrive({refreshToken,documentId:item.id,fileId:item.cloudFileId,sha256:item.sha256});
  } catch {return res.status(503).json({ok:false,error:'receipt_original_unavailable',message:'Einkaufsbeleg oder Erstattungsnachweis konnte in Drive nicht geprüft werden.'});}
  const saved=await writeFinanceState({transactions:proposal.allocations},{action:'supplier_refund_recorded',source:'supplier_receipt_verified',actor:'seller',summary:`Prüfbedürftige Lieferantenerstattung aus Beleg ${doc.id} erfasst.`},{expectedRevision:expected,allowReceiptCosts:true});
  if(!saved.ok)return res.status(saved.conflict?409:503).json({ok:false,error:saved.conflict?'finance_conflict':'finance_store_unavailable',message:saved.error});
  return res.status(200).json({ok:true,state:saved.state,recorded:1});
}

async function handleSupplierRefundTaxReview(req,res) {
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Nur POST erlaubt.'});
  const expected=req.body?.expectedRevision, transactionId=text(req.body?.transactionId), method=text(req.body?.method), note=text(req.body?.note);
  if(req.body?.confirm!==true||!Number.isSafeInteger(expected)||expected<0||!/^receipt_refund_[a-f0-9]{64}$/.test(transactionId)||!['expense_reduction','other_income'].includes(method)||note.length<3||note.length>300||/[\r\n\x00-\x1f]/.test(note))return res.status(400).json({ok:false,error:'invalid_refund_tax_review',message:'Bestätigte Auswahl und Begründung (3–300 Zeichen) erforderlich.'});
  const store=getFinanceStoreDescription();if(!store.persistent||!store.configured)return res.status(503).json({ok:false,error:'finance_store_unavailable'});
  const state=await readFinanceState();if(state.revision!==expected)return res.status(409).json({ok:false,error:'finance_conflict',message:'Finanzdaten geändert; bitte erneut prüfen.'});
  const rows=state.transactions.filter(row=>row.transactionId===transactionId),row=rows.length===1?rows[0]:null;
  const receipt=row?.supplierReceipt, amountCents=Math.round(Number(row?.amount)*100),paymentDate=text(row?.transactionDate).slice(0,10);
  if(!row||row.voidedAt||row.status!=='approved'||row.source!=='supplier_receipt_verified'||row.category!=='supplier_refund'||row.currency!=='EUR'||receipt?.kind!=='refund'||!Number.isSafeInteger(amountCents)||amountCents<=0||row.amount!==amountCents/100||receipt.allocationCents!==amountCents||!/^[a-f0-9]{64}$/.test(text(receipt.sha256))||!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||state.monthClosures?.[paymentDate.slice(0,7)]?.closedAt)return res.status(409).json({ok:false,error:'refund_not_reviewable',message:'Erstattung muss geprüft und im offenen Monat nachvollziehbar vorliegen.'});
  const purchase=state.transactions.find(item=>item.transactionId===receipt.originalTransactionId);
  const proof=state.documents.find(item=>item.id===receipt.documentId),originalDoc=state.documents.find(item=>item.id===purchase?.supplierReceipt?.documentId);
  if(!purchase||purchase.voidedAt||purchase.source!=='supplier_receipt_verified'||purchase.category!=='supplier_expense'||receipt.originalDocumentId!==purchase.supplierReceipt?.documentId||!proof||!originalDoc||text(proof.sha256)!==receipt.sha256||text(originalDoc.sha256)!==purchase.supplierReceipt.sha256)return res.status(409).json({ok:false,error:'refund_evidence_missing',message:'Einkauf oder Nachweise sind nicht eindeutig nachvollziehbar.'});
  const paymentEvidence=purchase.supplierReceipt.paymentProofDocumentId?state.documents.find(item=>item.id===purchase.supplierReceipt.paymentProofDocumentId):null;
  if(purchase.supplierReceipt.paymentProofDocumentId&&(!paymentEvidence||text(paymentEvidence.sha256).toLowerCase()!==purchase.supplierReceipt.paymentProofSha256||!text(paymentEvidence.cloudFileId)))return res.status(409).json({ok:false,error:'original_payment_proof_unavailable'});
  const current=state.supplierRefundTaxReviews?.[transactionId];
  if(current!==undefined&&(!Array.isArray(current)||!getSupplierRefundTaxReview(row,state.supplierRefundTaxReviews)))return res.status(409).json({ok:false,error:'refund_review_corrupt',message:'Vorherige Zuordnung ist nicht überprüfbar.'});
  const history=current||[];if(history.length>=50)return res.status(409).json({ok:false,error:'refund_review_limit'});
  if(history.at(-1)?.method===method&&history.at(-1)?.note===note)return res.status(200).json({ok:true,existing:true,state});
  try{const cookie=getRefreshTokenCookie(req),stored=cookie?null:await readGoogleDriveToken(),refreshToken=cookie||stored?.refresh_token||stored?.refreshToken||'';if(!refreshToken)throw new Error('drive_not_connected');for(const item of [originalDoc,proof,...(paymentEvidence?[paymentEvidence]:[])])await downloadFinanceDocumentFromDrive({refreshToken,documentId:item.id,fileId:item.cloudFileId,sha256:item.sha256});}
  catch{return res.status(503).json({ok:false,error:'receipt_original_unavailable',message:'Einkaufsbeleg oder Erstattungsnachweis konnte in Drive nicht geprüft werden.'});}
  const review={version:1,confirmed:true,transactionId,method,note,proofSha:receipt.sha256,originalTransactionId:receipt.originalTransactionId,amountCents,paymentDate,reviewedAt:new Date().toISOString()};
  const saved=await writeFinanceState({supplierRefundTaxReviews:{[transactionId]:[...history,review]}},{action:'supplier_refund_tax_reviewed',actor:'seller',source:'seller_manual_review',summary:`Manuelle Zuordnung für Lieferantenerstattung ${transactionId} dokumentiert.`},{expectedRevision:expected,allowRefundTaxReview:true});
  if(!saved.ok)return res.status(saved.conflict?409:503).json({ok:false,error:saved.conflict?'finance_conflict':'finance_store_unavailable',message:saved.error});
  if(!getSupplierRefundTaxReview(row,saved.state.supplierRefundTaxReviews))return res.status(409).json({ok:false,error:'refund_review_not_saved'});
  return res.status(200).json({ok:true,state:saved.state,existing:false});
}

async function handleEbayPreview(req, res) {
  const environment = environmentFrom(req);
  const days = Math.max(1, Math.min(Number(req?.query?.days || req?.body?.days || 90), 730));
  const raw = await fetchTransactions(environment, days);
  const transactions = normalizeEbayApiTransactions(raw);
  return res.status(200).json({
    ok: true,
    environment,
    days,
    count: transactions.length,
    transactions,
    rawCount: raw.transactions.length,
    scopes: raw.scopes,
    persisted: false,
  });
}

async function handleEbaySync(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  const body = object(req.body);
  if (body.confirm !== true) {
    return res.status(400).json({
      ok: false,
      error: "confirmation_required",
      message: "Der lesende eBay-Abruf darf erst nach ausdrücklicher Bestätigung in Elyon gespeichert werden.",
    });
  }
  const environment = environmentFrom(req);
  const days = Math.max(1, Math.min(Number(body.days || 90), 730));
  const raw = await fetchTransactions(environment, days);
  const incoming = normalizeEbayApiTransactions(raw);
  const current = await readFinanceState();
  const merged = mergeTransactions(current.transactions, incoming);
  const importId = `ebay_api_${new Date().toISOString()}`;
  const next = {
    ...current,
    transactions: merged.transactions,
    imports: [
      ...current.imports,
      {
        id: importId,
        source: "ebay_finances_api",
        environment,
        days,
        rawCount: raw.transactions.length,
        normalizedCount: incoming.length,
        inserted: merged.inserted,
        duplicates: merged.duplicates,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  const result = await writeFinanceState(next, {
    action: "ebay_finances_import",
    actor: "seller",
    source: "ebay_finances_api",
    summary: `eBay-Finanzdaten importiert: ${merged.inserted} neue Datensätze, ${merged.duplicates} bereits bekannt.`,
  });
  if (!result.ok) return res.status(503).json({ ok: false, error: "finance_store_unavailable", message: result.error, preview: incoming });
  return res.status(200).json({
    ok: true,
    environment,
    days,
    state: result.state,
    merge: merged,
    store: getFinanceStoreDescription(),
    readOnlyEbayApi: true,
  });
}

async function handlePayouts(req, res) {
  const environment = environmentFrom(req);
  const days = Math.max(1, Math.min(Number(req?.query?.days || 90), 730));
  const data = await fetchPayouts(environment, days);
  return res.status(200).json({ ok: true, ...data, persisted: false });
}

async function handleEur(req, res) {
  const state = await readFinanceState();
  const selection = selectApprovedEurTransactions(state.transactions,state.supplierRefundTaxReviews);
  if (!selection.ready) return res.status(409).json({
    ok: false,
    error: "eur_export_blocked",
    message: "EÜR-Arbeitsauswertung gesperrt: ungeprüfte Vorgänge, Fremdwährungen oder steuerlich ungeklärte Lieferantenerstattungen vorhanden.",
    unapprovedCount: selection.unapprovedCount,
    unclassifiedRefundCount: selection.unclassifiedRefundCount,
    foreignCurrencies: selection.foreignCurrencies,
  });
  return res.status(200).json({
    ok: true, summary: buildEurSummary(selection.transactions,state.supplierRefundTaxReviews),
    transactionCount: selection.transactions.length,
    generatedAt: new Date().toISOString(),
  });
}

async function handleEurPeriod(req,res) {
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Nur POST erlaubt.'});
  const expected=req.body?.expectedRevision,start=text(req.body?.start),end=text(req.body?.end);
  if(!Number.isSafeInteger(expected)||expected<0||Boolean(start)!==Boolean(end))return res.status(400).json({ok:false,error:'invalid_period'});
  const first=start?Date.parse(start):-Infinity,last=end?Date.parse(end):Infinity;
  if(Number.isNaN(first)||Number.isNaN(last)||first>last||(start&&(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(start)||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(end))))return res.status(400).json({ok:false,error:'invalid_period'});
  const state=await readFinanceState();if(state.revision!==expected)return res.status(409).json({ok:false,error:'finance_conflict',message:'Finanzdaten geändert. Bitte Serverstand laden und Export erneut prüfen.'});
  const rows=state.transactions.filter(row=>{const when=Date.parse(row.transactionDate);return Number.isFinite(when)&&when>=first&&when<=last;});
  const selected=selectApprovedEurTransactions(rows,state.supplierRefundTaxReviews);
  if(!selected.ready)return res.status(409).json({ok:false,error:'eur_export_blocked',message:'Ungeprüfte Vorgänge, Fremdwährungen oder nicht zugeordnete Lieferantenerstattungen vorhanden.',unapprovedCount:selected.unapprovedCount,unclassifiedRefundCount:selected.unclassifiedRefundCount,foreignCurrencies:selected.foreignCurrencies});
  return res.status(200).json({ok:true,summary:buildEurSummary(selected.transactions,state.supplierRefundTaxReviews),transactionCount:selected.transactions.length,revision:state.revision,start,end,generatedAt:new Date().toISOString()});
}

async function handleReserveInvoiceNumber(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  const body = object(req.body);
  const year = Number(body.year || new Date().getUTCFullYear());
  if (Math.abs(year - new Date().getUTCFullYear()) > 1) {
    return res.status(400).json({ ok: false, error: "invoice_year_out_of_range" });
  }
  const result = await reserveFinanceInvoiceNumber(body.orderId, body.prefix, year);
  if (!result.ok) return res.status(503).json(result);
  return res.status(200).json(result);
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 4 * 1024 * 1024 })) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const action = actionFrom(req);
    if (action === "status") return handleStatus(req, res);
    if (action === "load") return handleLoad(req, res);
    if (action === "save") return handleSave(req, res);
    if (action === "recognize-pdf-receipt") {
      if (req.method !== "POST") return res.status(405).json({ok:false,error:"Nur POST erlaubt."});
      try { return res.status(200).json({ok:true,proposal:await recognizePdfIsolated(req.body?.base64)}); }
      catch { return res.status(422).json({ok:false,error:"receipt_pdf_unavailable",message:"PDF konnte nicht sicher ausgelesen werden. Bei Scans oder Fotos Angaben bitte manuell erfassen; falls vorhanden, XML separat importieren."}); }
    }
    if (action === "recognize-ubl-receipt") {
      if (req.method !== "POST") return res.status(405).json({ok:false,error:"Nur POST erlaubt."});
      try {return res.status(200).json({ok:true,proposal:extractUblReceipt(req.body?.xml)});}
      catch(error) {return res.status(422).json({ok:false,error:"receipt_xml_invalid",message:error.message});}
    }
    if (action === "record-receipt-costs") return handleReceiptCosts(req, res);
    if (action === "record-supplier-refund") return handleSupplierRefund(req, res);
    if (action === "review-supplier-refund-tax") return handleSupplierRefundTaxReview(req,res);
    if (action === "ebay-preview" || action === "ebay-transactions") return handleEbayPreview(req, res);
    if (action === "ebay-sync") return handleEbaySync(req, res);
    if (action === "payouts") return handlePayouts(req, res);
    if (action === "eur") return handleEur(req, res);
    if (action === "eur-period") return handleEurPeriod(req,res);
    if (action === "reserve-invoice-number") return handleReserveInvoiceNumber(req, res);
    if (action === "read-issued-invoice") {
      if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
      const orderId = text(req.query?.orderId);
      if (!/^[A-Za-z0-9_-]{6,70}$/.test(orderId)) return res.status(400).json({ok:false,error:"invalid_order_id"});
      const state = await readFinanceState();
      const record = state.invoiceMeta[orderId];
      if (!record || record.immutable !== true || !record.invoice) return res.status(404).json({ok:false,error:"issued_invoice_not_found"});
      if (!verifyInvoiceSnapshot(record)) return res.status(409).json({ok:false,error:"invoice_integrity_failed",message:"Rechnungssnapshot kann nicht überprüft werden. Archivbestand prüfen."});
      let pdfBase64 = null;
      if (record.pdfArchive) {
        try {
          const cookie = getRefreshTokenCookie(req);
          const stored = cookie ? null : await readGoogleDriveToken();
          const refreshToken = cookie || stored?.refresh_token || stored?.refreshToken || "";
          if (!refreshToken) throw new Error("drive_not_connected");
          const file = await downloadFinanceDocumentFromDrive({refreshToken, documentId:record.pdfArchive.documentId,fileId:record.pdfArchive.fileId,sha256:record.pdfArchive.sha256});
          pdfBase64 = file.base64;
        } catch { return res.status(503).json({ok:false,error:"invoice_pdf_unavailable",message:"Archiv-PDF kann nicht überprüft werden. Drive-Verbindung prüfen."}); }
      }
      return res.status(200).json({ok:true, invoice:record.invoice, snapshotHash:record.snapshotHash,pdfBase64});
    }
    if (action === "correct-issued-invoice") {
      if (req.method !== "POST") return res.status(405).json({ok:false,error:"Nur POST erlaubt."});
      const cookie=getRefreshTokenCookie(req);const stored=cookie?null:await readGoogleDriveToken();
      const result=await issueInvoiceCorrection(req.body?.orderId, req.body?.change, {refreshToken:cookie || stored?.refresh_token || stored?.refreshToken || ""});
      return res.status(result.ok?200:result.status||422).json(result);
    }
    if (action === "cancel-issued-invoice") {
      if (req.method !== "POST") return res.status(405).json({ok:false,error:"Nur POST erlaubt."});
      const cookie = getRefreshTokenCookie(req);
      const stored = cookie ? null : await readGoogleDriveToken();
      const result = await cancelIssuedInvoice(req.body?.orderId, req.body?.reason, {refreshToken:cookie || stored?.refresh_token || stored?.refreshToken || ""});
      return res.status(result.ok ? 200 : result.status || 422).json(result);
    }
    if (action === "issue-kleinunternehmer-invoice" || action === "issue-replacement-invoice") {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur POST erlaubt.' });
      const orderId = text(req.body?.orderId);
      if (!/^[A-Za-z0-9_-]{6,70}$/.test(orderId)) return res.status(400).json({
        ok: false, error: 'invalid_order_id', message: 'Gültige eBay-Bestellnummer erforderlich.'
      });
      // Never trust client-provided prices or addresses: fetch the source order
      // again with the authenticated production eBay token before issuance.
      const session = await ebayUserSession('production');
      const original = await callEbayJson(
        'https://api.ebay.com/sell/fulfillment/v1/order/' + encodeURIComponent(orderId),
        { headers: {
          Authorization: 'Bearer ' + session.accessToken,
          Accept: 'application/json',
          'Accept-Language': 'de-DE'
        } }
      );
      if (text(original.orderId) !== orderId) return res.status(502).json({
        ok: false, error: 'order_identity_mismatch', message: 'eBay-Bestellung konnte nicht eindeutig verifiziert werden.'
      });
      const cookie = getRefreshTokenCookie(req);
      const savedToken = cookie ? null : await readGoogleDriveToken();
      const options = {refreshToken:cookie || savedToken?.refresh_token || savedToken?.refreshToken || ''};
      const issued = action === 'issue-replacement-invoice' ? await issueReplacementInvoice(original, options) : await issueKleinunternehmerInvoice(original, options);
      return res.status(issued.ok ? 200 : issued.status || 422).json(issued);
    }

    return res.status(404).json({ ok: false, error: `Unbekannte Finance-Route: ${action}` });
  } catch (error) {
    if (error?.code?.startsWith?.("ebay_")) return res.status(Number(error.status || 500)).json(publicEbayError(error));
    return res.status(Number(error?.status || 500)).json({ ok: false, error: "finance_api_failed", message: error?.message || "Elyon Finance Fehler" });
  }
}
