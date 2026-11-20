import crypto from 'node:crypto';
import {
  readFinanceState, writeFinanceState, reserveFinanceInvoiceNumber,
  getFinanceStoreDescription,
} from './finance-store.js';
import { renderInvoiceOriginalPdf, renderInvoiceCorrectionPdf } from './invoice-original-pdf.js';
import { uploadFinanceDocumentToDrive, downloadFinanceDocumentFromDrive } from './google-drive.js';
import { buildKleinunternehmerInvoiceDraft } from './kleinunternehmer-invoice-core.js';

const text = value => String(value ?? '').trim();

export function verifyInvoiceSnapshot(record) {
  if (!record?.invoice || !/^[a-f0-9]{64}$/.test(text(record.snapshotHash))) return false;
  const calculated = crypto.createHash('sha256').update(JSON.stringify(record.invoice)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(record.snapshotHash, 'hex'));
}

export async function issueKleinunternehmerInvoice(ebayOrder, options = {}) {
  const store = getFinanceStoreDescription();
  if (!store.persistent || !store.configured) return {
    ok: false, status: 503,
    message: 'Dauerhafter Finance-Server/Redis fehlt. Keine Rechnungsnummer oder Rechnung wurde erstellt.'
  };
  const state = await readFinanceState();
  const orderId = text(ebayOrder?.orderId);
  const existing = state.invoiceMeta[orderId];
  if (existing?.immutable === true && existing.invoice) {
    if (!verifyInvoiceSnapshot(existing)) return { ok: false, status: 409, message: 'Rechnungssnapshot oder Prüfsumme ist nicht überprüfbar. Keine erneute Ausstellung; Archivbestand prüfen.' };
    return { ok: true, existing: true, invoice: existing.invoice, invoiceNumber: existing.invoiceNumber, snapshotHash: existing.snapshotHash };
  }
  if (existing) return {
    ok: false, status: 409,
    message: 'Zu dieser Bestellung existieren ältere Rechnungsdaten. Erst Bestandsabgleich durchführen; keine zweite Rechnung erstellen.'
  };
  const prepared = buildKleinunternehmerInvoiceDraft(ebayOrder, state.settings);
  if (!prepared.ok) return {
    ok: false, status: 422,
    message: 'Rechnung nicht freigegeben: ' + prepared.errors.join(' · '),
    blockers: prepared.errors
  };
  if (!text(options.refreshToken)) return {ok:false,status:503,message:'Google Drive ist nicht verbunden; kein Rechnungs-PDF archiviert und keine Rechnung ausgestellt.'};
  const prefix = text(state.settings.invoicePrefix || 'ELYON');
  const issuedAt = new Date().toISOString();
  const year = new Date(issuedAt).getUTCFullYear();
  const reserved = await reserveFinanceInvoiceNumber(orderId, prefix, year);
  if (!reserved.ok || !reserved.invoiceNumber) return {
    ok: false, status: 503, message: reserved.error || 'Rechnungsnummer nicht verfügbar.'
  };
  const invoice = {
    ...prepared.draft,
    invoiceNumber: reserved.invoiceNumber,
    issuedAt,
  };
  let pdf, archived;
  const documentId = 'doc_invoice_' + crypto.createHash('sha256').update(orderId).digest('hex').slice(0, 32);
  try {
    pdf = await renderInvoiceOriginalPdf(invoice);
    archived = await uploadFinanceDocumentToDrive({refreshToken:options.refreshToken, documentId, fileName:'VORLAEUFIG-' + reserved.invoiceNumber + '.pdf', mimeType:'application/pdf', base64:pdf.base64, sha256:pdf.sha256});
    await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken, documentId, fileId:archived.fileId, sha256:pdf.sha256});
  } catch {
    return {ok:false,status:503,message:'Original-PDF konnte nicht erstellt und in Drive geprüft werden. Keine Rechnung ausgestellt; Drive und Angaben prüfen.'};
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex');
  const record = {
    immutable: true,
    status: 'issued',
    orderId,
    invoiceNumber: reserved.invoiceNumber,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    snapshotHash: hash,
    pdfArchive: { documentId, fileId: archived.fileId, sha256: pdf.sha256, size:pdf.size, storedAt:archived.uploadedAt },
    invoice,
  };
  const saved = await writeFinanceState(
    { invoiceMeta: { [orderId]: record } },
    { action: 'kleinunternehmer_invoice_issued', actor: 'seller',
      source: 'seller_tool_verified_ebay', summary: 'Rechnung ' + reserved.invoiceNumber + ' erstellt.' },
    { allowIssuedInvoices: true }
  );
  if (!saved.ok) return {
    ok: false, status: saved.conflict ? 409 : 503,
    message: saved.error || 'Rechnung konnte nicht persistent gespeichert werden. Bestellstand erneut laden, niemals blind erneut erstellen.'
  };
  const actual = saved.state.invoiceMeta[orderId];
  if (actual?.immutable === true && actual.invoice && !verifyInvoiceSnapshot(actual)) return { ok: false, status: 409, message: 'Gespeicherter Rechnungssnapshot ist nicht überprüfbar. Archivbestand prüfen.' };
  if (actual?.immutable !== true || !actual.invoice) return {
    ok: false, status: 409,
    message: 'Während der Ausstellung wurden ältere Rechnungsdaten gefunden. Keine neue Rechnung ausgestellt; Bestandsabgleich erforderlich.'
  };
  return { ok: true, existing: actual.invoiceNumber !== reserved.invoiceNumber,
    invoiceNumber: actual.invoiceNumber, invoice: actual.invoice, snapshotHash: actual.snapshotHash, pdfArchive: actual.pdfArchive || null };
}


export async function cancelIssuedInvoice(orderId, reason, options = {}) {
  orderId = text(orderId); reason = text(reason);
  if (!/^[A-Za-z0-9_-]{6,70}$/.test(orderId) || reason.length < 3 || reason.length > 300) return {ok:false,status:422,message:'Bestellung und nachvollziehbarer Stornogrund (3–300 Zeichen) erforderlich.'};
  const store = getFinanceStoreDescription();
  if (!store.persistent || !store.configured || !text(options.refreshToken)) return {ok:false,status:503,message:'Persistenter Finance-Speicher und Google Drive sind erforderlich.'};
  const state = await readFinanceState();
  const original = state.invoiceMeta[orderId];
  if (!original?.immutable || !verifyInvoiceSnapshot(original) || !original.pdfArchive || original.invoice.documentKind) return {ok:false,status:409,message:'Ursprungsrechnung oder archiviertes Original-PDF ist nicht überprüfbar; kein automatisches Storno.'};
  const key = 'storno_' + crypto.createHash('sha256').update(orderId).digest('hex').slice(0,32);
  const existing = state.invoiceMeta[key];
  if (existing) {
    if (!existing.immutable || !verifyInvoiceSnapshot(existing) || existing.invoice.documentKind !== 'cancellation' || existing.invoice.originalOrderId !== orderId) return {ok:false,status:409,message:'Stornobestand unklar; bitte manuell prüfen.'};
    return {ok:true,existing:true,recordId:key,invoice:existing.invoice};
  }
  try { await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken,documentId:original.pdfArchive.documentId,fileId:original.pdfArchive.fileId,sha256:original.pdfArchive.sha256}); }
  catch { return {ok:false,status:503,message:'Original-PDF nicht überprüfbar; kein Storno ausgestellt.'}; }
  const issuedAt = new Date().toISOString();
  const reserved = await reserveFinanceInvoiceNumber(key, state.settings.invoicePrefix || 'ELYON', new Date(issuedAt).getUTCFullYear());
  if (!reserved.ok) return {ok:false,status:503,message:'Stornonummer nicht verfügbar.'};
  const source = original.invoice;
  const invoice = {...source, documentKind:'cancellation', originalOrderId:orderId, originalInvoiceNumber:source.invoiceNumber,
    cancellationReason:reason, invoiceNumber:reserved.invoiceNumber, issuedAt,
    lineItems:source.lineItems.map(item=>({...item,total:-Math.abs(item.total)})), shipping:-Math.abs(source.shipping || 0),
    discount:-Math.abs(source.discount || 0), total:-Math.abs(source.total)};
  const documentId = 'doc_invoice_' + crypto.createHash('sha256').update(key).digest('hex').slice(0,32);
  let pdf, file;
  try {
    pdf = await renderInvoiceOriginalPdf(invoice);
    file = await uploadFinanceDocumentToDrive({refreshToken:options.refreshToken,documentId,fileName:'VORLAEUFIG-Storno-'+reserved.invoiceNumber+'.pdf',mimeType:'application/pdf',base64:pdf.base64,sha256:pdf.sha256});
    await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken,documentId,fileId:file.fileId,sha256:pdf.sha256});
  } catch {return {ok:false,status:503,message:'Storno-PDF konnte nicht archiviert und geprüft werden. Kein Storno ausgestellt.'};}
  const record = {immutable:true,status:'issued',orderId:key,invoiceNumber:reserved.invoiceNumber,createdAt:issuedAt,updatedAt:issuedAt,
    snapshotHash:crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex'),
    pdfArchive:{documentId,fileId:file.fileId,sha256:pdf.sha256,size:pdf.size,storedAt:file.uploadedAt},invoice};
  const saved = await writeFinanceState({invoiceMeta:{[key]:record}},{action:'invoice_cancellation_issued',actor:'seller',source:'seller_tool',summary:'Stornorechnung '+reserved.invoiceNumber+' erstellt.'},{allowIssuedInvoices:true});
  if (!saved.ok) return {ok:false,status:saved.conflict?409:503,message:'Stornostatus unklar; Serverstand laden und prüfen.'};
  const actual = saved.state.invoiceMeta[key];
  if (!actual?.immutable || !verifyInvoiceSnapshot(actual) || actual.invoice.documentKind !== 'cancellation' || actual.invoice.originalOrderId !== orderId) return {ok:false,status:409,message:'Stornobestand unklar; keine weitere Rechnung ausstellen.'};
  return {ok:true,existing:actual.snapshotHash!==record.snapshotHash,recordId:key,invoice:actual.invoice};
}


export async function issueReplacementInvoice(ebayOrder, options = {}) {
  const orderId = text(ebayOrder?.orderId);
  if (!/^[A-Za-z0-9_-]{6,70}$/.test(orderId)) return {ok:false,status:422,message:'Gültige eBay-Bestellung erforderlich.'};
  const store = getFinanceStoreDescription();
  if (!store.persistent || !store.configured || !text(options.refreshToken)) return {ok:false,status:503,message:'Finance-Server und Google Drive sind erforderlich.'};
  const state = await readFinanceState();
  const hash = crypto.createHash('sha256').update(orderId).digest('hex').slice(0,32);
  const original = state.invoiceMeta[orderId], cancellation = state.invoiceMeta['storno_'+hash];
  if (!original?.immutable || !verifyInvoiceSnapshot(original) || original.invoice.documentKind || !original.pdfArchive || !cancellation?.immutable || !verifyInvoiceSnapshot(cancellation) || cancellation.invoice.documentKind !== 'cancellation' || cancellation.invoice.originalInvoiceNumber !== original.invoice.invoiceNumber || !cancellation.pdfArchive) return {ok:false,status:409,message:'Geprüfte Original- und Stornorechnung erforderlich; keine Ersatzrechnung ausgestellt.'};
  const key = 'ersatz_' + hash;
  const existing = state.invoiceMeta[key];
  if (existing) {
    if (!existing.immutable || !verifyInvoiceSnapshot(existing) || existing.invoice.documentKind !== 'replacement' || existing.invoice.originalInvoiceNumber !== original.invoice.invoiceNumber) return {ok:false,status:409,message:'Ersatzrechnungsbestand unklar; manuell prüfen.'};
    return {ok:true,existing:true,recordId:key,invoice:existing.invoice};
  }
  const prepared = buildKleinunternehmerInvoiceDraft(ebayOrder, state.settings);
  if (!prepared.ok) return {ok:false,status:422,message:'eBay-Daten nicht zur Ausstellung geeignet: '+prepared.errors.join(' · ')};
  try {
    for (const source of [original,cancellation]) await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken,documentId:source.pdfArchive.documentId,fileId:source.pdfArchive.fileId,sha256:source.pdfArchive.sha256});
  } catch { return {ok:false,status:503,message:'Original oder Storno-PDF nicht überprüfbar; keine Ersatzrechnung ausgestellt.'}; }
  const issuedAt = new Date().toISOString();
  const reserved = await reserveFinanceInvoiceNumber(key, state.settings.invoicePrefix || 'ELYON', new Date(issuedAt).getUTCFullYear());
  if (!reserved.ok) return {ok:false,status:503,message:'Ersatzrechnungsnummer nicht verfügbar.'};
  const invoice = {...prepared.draft,documentKind:'replacement',originalInvoiceNumber:original.invoice.invoiceNumber,cancellationInvoiceNumber:cancellation.invoice.invoiceNumber,invoiceNumber:reserved.invoiceNumber,issuedAt};
  const documentId = 'doc_invoice_' + crypto.createHash('sha256').update(key).digest('hex').slice(0,32);
  let pdf,file;
  try {
    pdf=await renderInvoiceOriginalPdf(invoice);
    file=await uploadFinanceDocumentToDrive({refreshToken:options.refreshToken,documentId,fileName:'VORLAEUFIG-Ersatz-'+reserved.invoiceNumber+'.pdf',mimeType:'application/pdf',base64:pdf.base64,sha256:pdf.sha256});
    await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken,documentId,fileId:file.fileId,sha256:pdf.sha256});
  } catch {return {ok:false,status:503,message:'Ersatz-PDF konnte nicht archiviert und geprüft werden; keine Ersatzrechnung ausgestellt.'};}
  const record={immutable:true,status:'issued',orderId:key,invoiceNumber:reserved.invoiceNumber,createdAt:issuedAt,updatedAt:issuedAt,snapshotHash:crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex'),pdfArchive:{documentId,fileId:file.fileId,sha256:pdf.sha256,size:pdf.size,storedAt:file.uploadedAt},invoice};
  const saved=await writeFinanceState({invoiceMeta:{[key]:record}},{action:'replacement_invoice_issued',actor:'seller',source:'seller_tool_verified_ebay',summary:'Ersatzrechnung '+reserved.invoiceNumber+' erstellt.'},{allowIssuedInvoices:true});
  if (!saved.ok) return {ok:false,status:saved.conflict?409:503,message:'Status der Ersatzrechnung unklar; Serverstand prüfen.'};
  const actual=saved.state.invoiceMeta[key];
  if (!actual?.immutable || !verifyInvoiceSnapshot(actual) || actual.invoice.documentKind !== 'replacement' || actual.invoice.originalInvoiceNumber !== original.invoice.invoiceNumber) return {ok:false,status:409,message:'Ersatzrechnungsbestand unklar; bitte prüfen.'};
  return {ok:true,existing:actual.snapshotHash!==record.snapshotHash,recordId:key,invoice:actual.invoice};
}


export async function issueInvoiceCorrection(orderId, change, options = {}) {
  orderId=text(orderId);
  const fields={buyerName:['buyer','name','Name des Rechnungsempfängers'],buyerStreet:['buyer','addressLine1','Straße und Hausnummer des Rechnungsempfängers'],buyerPostalCode:['buyer','postalCode','Postleitzahl des Rechnungsempfängers'],buyerCity:['buyer','city','Ort des Rechnungsempfängers']};
  const field=text(change?.field), newValue=text(change?.newValue), reason=text(change?.reason), selected=fields[field];
  if (!/^[A-Za-z0-9_-]{6,70}$/.test(orderId)||!selected||newValue.length<1||newValue.length>180||reason.length<3||reason.length>200||/[\r\n\x00-\x1f]/.test(newValue+reason)) return {ok:false,status:422,message:'Gültige Angabe und nachvollziehbarer Berichtigungsgrund erforderlich.'};
  const store=getFinanceStoreDescription();if(!store.persistent||!store.configured||!text(options.refreshToken))return {ok:false,status:503,message:'Finance-Speicher und Google Drive erforderlich.'};
  const state=await readFinanceState(), original=state.invoiceMeta[orderId];
  if(!original?.immutable||!verifyInvoiceSnapshot(original)||original.invoice.documentKind||!original.pdfArchive)return {ok:false,status:409,message:'Geprüfte ursprüngliche Rechnung mit Original-PDF erforderlich.'};
  const cancellationKey='storno_'+crypto.createHash('sha256').update(orderId).digest('hex').slice(0,32);
  if(state.invoiceMeta[cancellationKey])return {ok:false,status:409,message:'Rechnung wurde storniert; Berichtigung blockiert.'};
  if(Object.values(state.invoiceMeta).some(entry=>entry?.immutable && entry.invoice?.documentKind==='correction' && entry.invoice.originalOrderId===orderId && entry.invoice.field===field && entry.invoice.newValue!==newValue))return {ok:false,status:409,message:'Diese Angabe wurde bereits berichtigt; weitere Änderung erfordert manuellen Abgleich.'};
  const oldValue=text(original.invoice[selected[0]]?.[selected[1]]);if(!oldValue||oldValue===newValue)return {ok:false,status:422,message:'Angabe fehlt oder ist unverändert.'};
  const digest=crypto.createHash('sha256').update(JSON.stringify([orderId,field,newValue,reason])).digest('hex');const key='korrektur_'+digest.slice(0,32);
  const existing=state.invoiceMeta[key];if(existing){if(!existing.immutable||!verifyInvoiceSnapshot(existing)||existing.invoice.documentKind!=='correction'||existing.invoice.originalInvoiceNumber!==original.invoice.invoiceNumber)return {ok:false,status:409,message:'Berichtigungsbestand unklar.'};return {ok:true,existing:true,recordId:key,invoice:existing.invoice};}
  try{await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken,documentId:original.pdfArchive.documentId,fileId:original.pdfArchive.fileId,sha256:original.pdfArchive.sha256});}catch{return {ok:false,status:503,message:'Original-PDF nicht überprüfbar; Berichtigung blockiert.'};}
  const issuedAt=new Date().toISOString();const reserved=await reserveFinanceInvoiceNumber(key,state.settings.invoicePrefix||'ELYON',new Date(issuedAt).getUTCFullYear());if(!reserved.ok)return {ok:false,status:503,message:'Belegnummer nicht verfügbar.'};
  const invoice={documentKind:'correction',orderId,originalOrderId:orderId,originalInvoiceNumber:original.invoice.invoiceNumber,invoiceNumber:reserved.invoiceNumber,documentNumber:reserved.invoiceNumber,issuedAt,seller:original.invoice.seller,buyer:original.invoice.buyer,field,fieldLabel:selected[2],oldValue,newValue,reason};
  const documentId='doc_invoice_'+crypto.createHash('sha256').update(key).digest('hex').slice(0,32);let pdf,file;
  try{pdf=await renderInvoiceCorrectionPdf(invoice);file=await uploadFinanceDocumentToDrive({refreshToken:options.refreshToken,documentId,fileName:'VORLAEUFIG-Berichtigung-'+reserved.invoiceNumber+'.pdf',mimeType:'application/pdf',base64:pdf.base64,sha256:pdf.sha256});await downloadFinanceDocumentFromDrive({refreshToken:options.refreshToken,documentId,fileId:file.fileId,sha256:pdf.sha256});}catch{return {ok:false,status:503,message:'Berichtigungs-PDF nicht sicher archiviert; keine Berichtigung ausgestellt.'};}
  const record={immutable:true,status:'issued',orderId:key,invoiceNumber:reserved.invoiceNumber,createdAt:issuedAt,updatedAt:issuedAt,snapshotHash:crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex'),pdfArchive:{documentId,fileId:file.fileId,sha256:pdf.sha256,size:pdf.size,storedAt:file.uploadedAt},invoice};
  const saved=await writeFinanceState({invoiceMeta:{[key]:record}},{action:'invoice_correction_issued',actor:'seller',source:'seller_tool',summary:'Berichtigungsbeleg '+reserved.invoiceNumber+' erstellt.'},{allowIssuedInvoices:true,expectedRevision:state.revision});
  if(!saved.ok)return {ok:false,status:saved.conflict?409:503,message:'Daten wurden geändert oder die Speicherung scheiterte. Archivbestand prüfen; vorläufige Datei kann bestehen.'};
  const actual=saved.state.invoiceMeta[key];if(!actual?.immutable||!verifyInvoiceSnapshot(actual))return {ok:false,status:409,message:'Berichtigungsbestand unklar.'};
  return {ok:true,existing:false,recordId:key,invoice:actual.invoice};
}
