import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadSalesSnapshot, mergeSales, normalizeSale, saveSalesSnapshot } from '../lib/sales-snapshot.js';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

function fixture(t) {
  const previous = {};
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_BACKUP_URL', 'UPSTASH_BACKUP_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
    previous[key] = process.env[key];
  }
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token';
  delete process.env.UPSTASH_BACKUP_URL;
  delete process.env.UPSTASH_BACKUP_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const store = new Map();
  const commands = [];
  t.mock.method(globalThis, 'fetch', async (raw, init = {}) => {
    assert.equal(String(raw), 'https://redis.example.test');
    const command = JSON.parse(init.body);
    commands.push(command[0]);
    if (command[0] === 'GET') return response({ result: store.get(command[1]) ?? null });
    if (command[0] === 'SET') { store.set(command[1], command[2]); return response({ result: 'OK' }); }
    return response({ error: 'unsupported' }, 400);
  });
  return { store, commands };
}

test('normalizeSale behaelt nur fachliche Felder', () => {
  const sale = normalizeSale({ orderNo: ' 123 ', product: 'Test', price: '19.99', qty: '2', geheim: 'x', customerEmail: 'a@b.test' });
  assert.equal(sale.orderNo, '123');
  assert.equal(sale.price, 19.99);
  assert.equal(sale.qty, 2);
  assert.equal('geheim' in sale, false);
  assert.equal('customerEmail' in sale, false);
});

test('mergeSales entdoppelt ueber orderNo und nimmt den spaeteren Stand', () => {
  const merged = mergeSales(
    [{ orderNo: 'A', status: 'Bezahlt' }, { orderNo: 'B', status: 'Bezahlt' }],
    [{ orderNo: 'A', status: 'Versendet' }, { orderNo: 'C', status: 'Bezahlt' }]
  );
  assert.equal(merged.length, 3);
  const a = merged.find((sale) => sale.orderNo === 'A');
  assert.equal(a.status, 'Versendet');
  assert.deepEqual(merged.map((sale) => sale.orderNo), ['A', 'B', 'C']);
});

test('mergeSales ignoriert Eintraege ohne Identitaet und respektiert das Limit', () => {
  const merged = mergeSales([], [{ product: 'ohne alles' }, { id: 'x1' }], { limit: 1 });
  assert.deepEqual(merged.map((sale) => sale.id), ['x1']);
});

test('saveSalesSnapshot fuehrt bestehende und neue Verkaeufe zusammen', async (t) => {
  const { store, commands } = fixture(t);
  store.set('elyon:prod:seller_tool:sales:v1', JSON.stringify([{ orderNo: 'A', status: 'Bezahlt' }]));
  const result = await saveSalesSnapshot([{ orderNo: 'A', status: 'Versendet' }, { orderNo: 'B', status: 'Bezahlt' }]);
  assert.equal(result.ok, true);
  assert.equal(result.stored, 2);
  assert.deepEqual(commands, ['GET', 'SET']);
  const stored = JSON.parse(store.get('elyon:prod:seller_tool:sales:v1'));
  assert.equal(stored.find((sale) => sale.orderNo === 'A').status, 'Versendet');
});

test('loadSalesSnapshot liefert bei leerem oder defektem Speicher eine leere Liste', async (t) => {
  const { store } = fixture(t);
  assert.deepEqual(await loadSalesSnapshot(), []);
  store.set('elyon:prod:seller_tool:sales:v1', '{kaputt');
  assert.deepEqual(await loadSalesSnapshot(), []);
});

test('ohne Speicherkonfiguration gibt es einen klaren Fehler', async (t) => {
  const previous = { ...process.env };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_BACKUP_URL;
  delete process.env.UPSTASH_BACKUP_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  t.after(() => { for (const [key, value] of Object.entries(previous)) process.env[key] = value; });
  await assert.rejects(() => loadSalesSnapshot(), (error) => error.code === 'storage_not_configured');
});

test('Route ist geschuetzt und nimmt begrenzte Payloads', async () => {
  const route = await readFile(new URL('../api/sales/snapshot.js', import.meta.url), 'utf8');
  assert.match(route, /requireSellerAccess\(req, res, \{ maxBodyBytes: 2 \* 1024 \* 1024 \}\)/);
  assert.match(route, /req\.method === "GET"/);
  assert.match(route, /req\.method !== "POST"/);
  assert.match(route, /saveSalesSnapshot\(sales\)/);
});
