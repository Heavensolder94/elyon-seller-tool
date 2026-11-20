import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUblReceipt } from '../lib/receipt-ubl.js';
const invoice = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:a="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:b="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><b:ID>INV-42</b:ID><b:IssueDate>2026-11-20</b:IssueDate><b:DocumentCurrencyCode>EUR</b:DocumentCurrencyCode><a:OrderReference><b:ID>ORDER-1</b:ID></a:OrderReference><a:AccountingSupplierParty><a:Party><a:PartyLegalEntity><b:RegistrationName>Lieferant GmbH</b:RegistrationName></a:PartyLegalEntity></a:Party></a:AccountingSupplierParty><a:LegalMonetaryTotal><b:PayableAmount currencyID="EUR">12.50</b:PayableAmount></a:LegalMonetaryTotal></Invoice>`;
test('recognizes exact UBL namespaces without making a booking or inferring payment',()=>{
 const p=extractUblReceipt(invoice);assert.equal(p.documentType,'supplier_invoice');assert.equal(p.supplier,'Lieferant GmbH');assert.equal(p.invoiceReference,'INV-42');assert.equal(p.orderReference,'ORDER-1');assert.equal(p.amount,'12.50');assert.equal(p.currency,'EUR');assert.equal(p.documentDate,'2026-11-20');assert.equal('paymentDate' in p,false);
});
test('rejects DTD, malformed documents, oversize and namespace impersonation',()=>{
 for(const value of ['<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+invoice,invoice.replace('Invoice-2','Wrong-2'),'<Invoice>', 'x'.repeat(1000001)])assert.throws(()=>extractUblReceipt(value));
});
test('does not guess conflicting currency, duplicate amount or invalid date',()=>{
 const p=extractUblReceipt(invoice.replace('currencyID="EUR"','currencyID="USD"').replace('2026-11-20','2026-02-30'));
 assert.equal(p.amount,'');assert.equal(p.documentDate,'');assert.equal(p.warnings.length,2);
 const duplicate=extractUblReceipt(invoice.replace('</a:LegalMonetaryTotal>','<b:PayableAmount currencyID="EUR">99.00</b:PayableAmount></a:LegalMonetaryTotal>'));
 assert.equal(duplicate.amount,'');
});
test('conflicting supplier names are not automatically resolved',()=>{
 const p=extractUblReceipt(invoice.replace('<a:PartyLegalEntity>','<a:PartyName><b:Name>Another Co</b:Name></a:PartyName><a:PartyLegalEntity>'));
 assert.equal(p.supplier,'');assert.ok(p.warnings.length);
});
