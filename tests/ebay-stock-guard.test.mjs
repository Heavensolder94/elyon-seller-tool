import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { evaluateStockGuard } from '../lib/ebay-production.js';

test('ohne Bestandsquelle gilt eine Obergrenze von 1 Stueck', () => {
  assert.equal(evaluateStockGuard({ quantity: 1 }).blockers.length, 0);
  const over = evaluateStockGuard({ quantity: 2 });
  assert.equal(over.blockers.length, 1);
  assert.match(over.blockers[0], /Obergrenze von 1/);
  assert.equal(over.limit, 1);
});

test('Obergrenze ist ueber ELYON_MAX_LISTED_QUANTITY konfigurierbar', () => {
  const original = process.env.ELYON_MAX_LISTED_QUANTITY;
  process.env.ELYON_MAX_LISTED_QUANTITY = '3';
  try {
    assert.equal(evaluateStockGuard({ quantity: 3, maxQuantity: process.env.ELYON_MAX_LISTED_QUANTITY }).blockers.length, 0);
    assert.equal(evaluateStockGuard({ quantity: 4, maxQuantity: process.env.ELYON_MAX_LISTED_QUANTITY }).blockers.length, 1);
  } finally {
    if (original === undefined) delete process.env.ELYON_MAX_LISTED_QUANTITY;
    else process.env.ELYON_MAX_LISTED_QUANTITY = original;
  }
});

test('ausdruecklicher Bestand 0 sperrt die Veroeffentlichung', () => {
  for (const stock of [0, '0', false]) {
    const result = evaluateStockGuard({ quantity: 1, stock });
    assert.equal(result.blockers.length, 1, 'Bestand ' + JSON.stringify(stock) + ' muss sperren');
    assert.match(result.blockers[0], /nicht verfügbar|0/);
  }
  assert.equal(evaluateStockGuard({ quantity: 1, available: false }).blockers.length, 1);
  assert.equal(evaluateStockGuard({ quantity: 1, supplierAvailable: false }).blockers.length, 1);
});

test('unbekannter Bestand sperrt nicht, warnt aber', () => {
  const result = evaluateStockGuard({ quantity: 1 });
  assert.equal(result.blockers.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /bestand ist unbekannt/i);
  assert.equal(evaluateStockGuard({ quantity: 1, stock: 5 }).warnings.length, 0);
});

test('publishEbayOffer nutzt den Guard und meldet Warnungen zurueck', async () => {
  const source = await readFile(new URL('../lib/ebay-production.js', import.meta.url), 'utf8');
  const publishStart = source.indexOf('export async function publishEbayOffer');
  const publishBody = source.slice(publishStart, source.indexOf('export async function withdrawEbayOffer', publishStart));
  assert.match(publishBody, /evaluateStockGuard\(/, 'publish muss den Guard aufrufen');
  assert.match(publishBody, /blockers\.push\(\.\.\.stockGuard\.blockers\)/, 'Guard-Blocker muessen in blockers landen');
  assert.match(publishBody, /stockWarnings: stockGuard\.warnings/, 'Warnungen muessen in der Antwort stehen');
});
