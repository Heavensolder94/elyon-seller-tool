import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKleinunternehmerInvoiceDraft, validateKleinunternehmerSeller } from '../lib/kleinunternehmer-invoice-core.js';
import { mergeFinanceState } from '../lib/finance-store.js';

const settings = {
  taxMode: 'small_business', sellerLegalName: 'ELYON Musterinhaber',
  sellerStreet: 'Beispielweg 1', sellerPostalCode: '12345',
  sellerCity: 'Musterstadt', sellerCountry: 'DE',
  sellerTaxId: 'MUSTER-STEUERNUMMER', invoicePrefix: 'ELYON'
};
const order = () => ({
  orderId: '12345-67890-12345', orderPaymentStatus: 'PAID',
  creationDate: '2026-11-20T09:40:00.000Z',
  fulfillmentStartInstructions: [{ shippingStep: { shipTo: {
    fullName: 'Max Muster', contactAddress: {
      addressLine1: 'Teststraße 1', postalCode: '54321',
      city: 'Stadt', countryCode: 'DE'
    }
  } } }],
  lineItems: [{ title: 'Baumwoll-Spannbettlaken', quantity: 2,
    lineItemCost: { value: '24.00', currency: 'EUR' }, sku: 'ELY-000001' }],
  pricingSummary: {
    total: { value: '29.00', currency: 'EUR' },
    deliveryCost: { value: '5.00', currency: 'EUR' }
  }
});

test('§19 German seller has required legal identity and tax ID', () => {
  assert.equal(validateKleinunternehmerSeller(settings).ok, true);
  assert.equal(validateKleinunternehmerSeller({ ...settings, sellerTaxId: '' }).ok, false);
  assert.equal(validateKleinunternehmerSeller({ ...settings, taxMode: 'unconfigured' }).ok, false);
});

test('valid German eBay order produces a complete EUR no-VAT draft', () => {
  const result = buildKleinunternehmerInvoiceDraft(order(), settings);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.draft.total, 29);
  assert.equal(result.draft.shipping, 5);
  assert.equal(result.draft.lineItems.length, 1);
  assert.match(result.draft.note, /§ 19 UStG/);
  assert.equal(result.draft.seller.taxId, settings.sellerTaxId);
  assert.equal(result.draft.buyer.name, 'Max Muster');
  assert.equal(result.draft.taxMode, 'small_business');
  assert.equal('vatAmount' in result.draft, false);
});

test('incomplete buyer, missing order lines and foreign delivery fail closed', () => {
  const raw = order(); raw.fulfillmentStartInstructions[0].shippingStep.shipTo.fullName = '';
  raw.fulfillmentStartInstructions[0].shippingStep.shipTo.contactAddress.countryCode = 'NL';
  raw.lineItems = [];
  const result = buildKleinunternehmerInvoiceDraft(raw, settings);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(s => /Käufername/.test(s)));
  assert.ok(result.errors.some(s => /Auslandsbestellung/.test(s)));
  assert.ok(result.errors.some(s => /Artikelposition/.test(s)));
});

test('wrong currency, mismatched totals and marketplace tax never result in invoice', () => {
  const raw = order(); raw.pricingSummary.total.value = '35.00';
  raw.pricingSummary.tax = { value: '1.00', currency: 'EUR' };
  assert.equal(buildKleinunternehmerInvoiceDraft(raw, settings).ok, false);
  raw.pricingSummary.total.currency = 'USD';
  assert.equal(buildKleinunternehmerInvoiceDraft(raw, settings).ok, false);
});

test('legacy sync cannot inject an issued invoice or mutate a signed server snapshot', () => {
  const issued = { immutable: true, invoiceNumber: 'ELYON-2026-00001',
    invoice: { invoiceNumber: 'ELYON-2026-00001', total: 29 }, snapshotHash: 'abc', status: 'issued' };
  const normal = mergeFinanceState({}, { invoiceMeta: { abc: issued } });
  assert.equal(normal.state.invoiceMeta.abc, undefined);
  const official = mergeFinanceState({}, { invoiceMeta: { abc: issued } }, {}, { allowIssuedInvoices: true });
  assert.equal(official.state.invoiceMeta.abc.invoiceNumber, issued.invoiceNumber);
  const stale = mergeFinanceState(official.state, { invoiceMeta: {
    abc: { invoiceNumber: 'FAKE', immutable: false, invoice: { total: 1 }, status: 'cancelled' }
  } });
  assert.equal(stale.state.invoiceMeta.abc.invoiceNumber, issued.invoiceNumber);
  assert.equal(stale.state.invoiceMeta.abc.invoice.total, 29);
});


test('one-cent mismatch or missing line currency cannot be issued as a confirmed EUR invoice', () => {
  const mismatch = order(); mismatch.pricingSummary.total.value = '29.01';
  assert.equal(buildKleinunternehmerInvoiceDraft(mismatch, settings).ok, false);
  const unknownCurrency = order(); delete unknownCurrency.lineItems[0].lineItemCost.currency;
  assert.equal(buildKleinunternehmerInvoiceDraft(unknownCurrency, settings).ok, false);
});


test('archived invoice snapshot detects tampering and missing checksum', async () => {
  const { createHash } = await import('node:crypto');
  const { verifyInvoiceSnapshot } = await import('../lib/kleinunternehmer-invoice-store.js');
  const invoice = { invoiceNumber: 'TEST-1', total: 12 };
  const record = { invoice, snapshotHash: createHash('sha256').update(JSON.stringify(invoice)).digest('hex') };
  assert.equal(verifyInvoiceSnapshot(record), true);
  assert.equal(verifyInvoiceSnapshot({ ...record, invoice: { ...invoice, total: 1 } }), false);
  assert.equal(verifyInvoiceSnapshot({ invoice }), false);
});
