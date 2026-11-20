import crypto from 'node:crypto';
import {
  readFinanceState, writeFinanceState, reserveFinanceInvoiceNumber,
  getFinanceStoreDescription,
} from './finance-store.js';
import { buildKleinunternehmerInvoiceDraft } from './kleinunternehmer-invoice-core.js';

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
  const hash = crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex');
  const record = {
    immutable: true,
    status: 'issued',
    orderId,
    invoiceNumber: reserved.invoiceNumber,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    snapshotHash: hash,
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
