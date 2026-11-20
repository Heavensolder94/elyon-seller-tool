import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeFinanceState, readFinanceState, writeFinanceState } from '../lib/finance-store.js';
import { validateDocumentMetadata } from '../seller-finance.js';

test('issuance never replaces a legacy record that appeared concurrently', () => {
  const legacy = { invoiceNumber: 'OLD-1', createdAt: '2026-01-01' };
  const issued = { immutable: true, invoiceNumber: 'NEW-1', invoice: { total: 2 } };
  const state = mergeFinanceState({ invoiceMeta: { order: legacy } }, { invoiceMeta: { order: issued } }, {}, { allowIssuedInvoices: true }).state;
  assert.equal(state.invoiceMeta.order.invoiceNumber, 'OLD-1');
  assert.equal(state.invoiceMeta.order.immutable, undefined);
});

test('browser sync cannot replace original file fingerprint or Drive identity', () => {
  const original = { id: 'doc-1', name: 'original.pdf', type: 'application/pdf', size: 14, sha256: 'original-hash', cloudFileId: 'original-cloud-id', cloudStoredAt: '2026-01-01' };
  const mutated = { ...original, name: 'other.pdf', sha256: 'other-hash', size: 2, cloudFileId: 'other-id', supplier: 'Sample' };
  const result = mergeFinanceState({ documents: [original] }, { documents: [mutated] }).state.documents[0];
  for (const key of ['name', 'type', 'size', 'sha256', 'cloudFileId', 'cloudStoredAt']) assert.equal(result[key], original[key]);
  assert.equal(result.supplier, 'Sample');
  const firstCloudSave = mergeFinanceState({ documents: [{ id: 'doc-2', sha256: 'hash' }] }, { documents: [{ id: 'doc-2', cloudFileId: 'new-id' }] }).state.documents[0];
  assert.equal(firstCloudSave.cloudFileId, 'new-id');
});

test('invalid finance file fails closed and stays byte-for-byte unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elyon-finance-'));
  const file = join(dir, 'finance.json');
  const names = ['ELYON_FINANCE_STORE_MODE', 'ELYON_FINANCE_STORE_PATH', 'VERCEL', 'VERCEL_ENV', 'NODE_ENV'];
  const old = Object.fromEntries(names.map(n => [n, process.env[n]]));
  process.env.ELYON_FINANCE_STORE_MODE = 'file'; process.env.ELYON_FINANCE_STORE_PATH = file;
  delete process.env.VERCEL; delete process.env.VERCEL_ENV; process.env.NODE_ENV = 'test';
  try {
    await writeFile(file, '{bad json');
    await assert.rejects(readFinanceState(), /beschädigt/);
    await assert.rejects(writeFinanceState({ documents: [{ id: 'new' }] }), /beschädigt/);
    assert.equal(await readFile(file, 'utf8'), '{bad json');
  } finally {
    for (const name of names) old[name] === undefined ? delete process.env[name] : process.env[name] = old[name];
    await rm(dir, { recursive: true, force: true });
  }
});

test('document metadata is manual, unbooked and validates amounts and dates', () => {
  const valid = validateDocumentMetadata({ documentType: 'internal_receipt', supplier: '  Example  ', amount: '12,50', currency: 'usd', documentDate: '2026-11-20' });
  assert.equal(valid.ok, true); assert.equal(valid.data.amount, '12.50');
  assert.equal(valid.data.currency, 'USD'); assert.equal(valid.data.reviewStatus, 'needs_review');
  assert.equal(valid.data.supplier, 'Example');
  for (const value of [{ amount: '-2', currency: 'EUR' }, { amount: '2.345', currency: 'EUR' }, { amount: '2' }, { documentDate: '2026-02-30' }, { documentType: 'invented' }]) assert.equal(validateDocumentMetadata(value).ok, false);
});
