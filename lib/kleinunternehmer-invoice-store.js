import crypto from 'node:crypto';
import {
  readFinanceState, writeFinanceState, reserveFinanceInvoiceNumber,
  getFinanceStoreDescription,
} from './finance-store.js';
import { buildKleinunternehmerInvoiceDraft } from './kleinunternehmer-invoice-core.js';
import { createKleinunternehmerInvoicePdf } from './kleinunternehmer-invoice-pdf.js';

const text = value => String(value ?? '').trim();

export async function issueKleinunternehmerInvoice(ebayOrder) {
  const store = getFinanceStoreDescription();
  if (!store.persistent || !store.configured) return {
    ok: false, status: 503,
    message: 'Dauerhafter Finance-Server/Redis fehlt. Keine Rechnungsnummer oder Rechnung wurde erstellt.'
  };
  const state = await readFinanceState();
  const orderId = text(ebayOrder?.orderId);
  const existing = state.invoiceMeta[orderId];
  if (existing?.immutable === true && existing.invoice) return {
    ok: true, existing: true, invoice: existing.invoice, invoiceNumber: existing.invoiceNumber
  };
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
  // Render a temporary layout before reserving a number, so unsupported
  // characters and overly long content cannot create orphaned invoice numbers.
  try {
    createKleinunternehmerInvoicePdf({
      ...prepared.draft, invoiceNumber: 'ELYON-PREFLIGHT-000001',
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    return { ok: false, status: 422,
      message: 'DIN-A4-PDF konnte nicht vorbereitet werden: ' + error.message };
  }
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
  let pdf;
  try { pdf = createKleinunternehmerInvoicePdf(invoice); }
  catch (error) {
    return { ok: false, status: 422,
      message: 'PDF konnte nicht erzeugt werden. Rechnungsnummer reserviert; bitte Bestellstand prüfen: ' + error.message };
  }
  if (pdf.length > 300_000) return { ok: false, status: 422,
    message: 'PDF zu umfangreich. Keine Rechnung gespeichert; bitte Bestellstand prüfen.' };
  const pdfSha256 = crypto.createHash('sha256').update(pdf).digest('hex');
  const hash = crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex');
  const record = {
    immutable: true,
    status: 'issued',
    orderId,
    invoiceNumber: reserved.invoiceNumber,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    snapshotHash: hash,
    pdfTemplate: 'elyon-a4-v1',
    pdfSha256,
    pdfSizeBytes: pdf.length,
    pdfArchiveBase64: pdf.toString('base64'),
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
  if (actual?.immutable !== true || !actual.invoice) return {
    ok: false, status: 409,
    message: 'Rechnungsstatus unklar; bitte Bestellstand neu laden.'
  };
  return { ok: true, existing: actual.invoiceNumber !== reserved.invoiceNumber,
    invoiceNumber: actual.invoiceNumber, invoice: actual.invoice, snapshotHash: actual.snapshotHash };
}
