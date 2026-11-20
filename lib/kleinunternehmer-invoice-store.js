import crypto from 'node:crypto';
import {
  readFinanceState, writeFinanceState, reserveFinanceInvoiceNumber,
  getFinanceStoreDescription,
} from './finance-store.js';
import { renderInvoiceOriginalPdf } from './invoice-original-pdf.js';
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
