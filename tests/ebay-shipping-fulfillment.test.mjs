import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createEbayShippingFulfillment, normalizeFulfillmentInput } from '../lib/ebay-production.js';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

function fixture(t, options = {}) {
  const env = {
    EBAY_ENV: 'sandbox',
    EBAY_CLIENT_ID: 'qa-client',
    EBAY_CLIENT_SECRET: 'qa-placeholder',
    EBAY_REFRESH_TOKEN: 'qa-placeholder',
    EBAY_TOKEN_STORE_URL: 'https://tokens.example.test',
    EBAY_TOKEN_STORE_TOKEN: 'qa-placeholder'
  };
  for (const [key, value] of Object.entries(env)) {
    const original = process.env[key];
    process.env[key] = value;
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  }
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (raw, init = {}) => {
    const url = new URL(raw);
    const method = init.method || 'GET';
    calls.push({ url, method, body: init.body });
    if (url.hostname === 'tokens.example.test') return response({ result: null });
    assert.equal(url.hostname, 'api.sandbox.ebay.com', 'alle eBay-Aufrufe bleiben in der Sandbox');
    if (url.pathname.endsWith('/oauth2/token')) return response({ access_token: 'qa-token', scope: '' });
    if (url.pathname === '/sell/fulfillment/v1/order/1234567890') {
      return response(options.order || { orderId: '1234567890', orderFulfillmentStatus: 'NOT_FULFILLED' });
    }
    if (url.pathname === '/sell/fulfillment/v1/order/1234567890/shipping_fulfillment' && method === 'POST') {
      if (options.failWith) return response({ errors: [{ longMessage: options.failWith }] }, 400);
      return response({ fulfillmentId: 'qa-fulfillment' });
    }
    assert.fail('unerwarteter Aufruf: ' + method + ' ' + url.pathname);
  });
  return { calls };
}

test('Bestellnummer, Sendungsnummer und Carrier werden geprueft', () => {
  assert.throws(() => normalizeFulfillmentInput({}), (error) => error.code === 'ebay_order_id_invalid');
  assert.throws(() => normalizeFulfillmentInput({ orderId: '12' }), (error) => error.code === 'ebay_order_id_invalid');
  assert.throws(() => normalizeFulfillmentInput({ orderId: '1234567890' }), (error) => error.code === 'ebay_tracking_number_required');
  assert.throws(
    () => normalizeFulfillmentInput({ orderId: '1234567890', trackingNumber: 'X1', carrier: '../evil' }),
    (error) => error.code === 'ebay_carrier_invalid'
  );
});

test('Carrier wird normalisiert und LineItems werden uebernommen', () => {
  const normalized = normalizeFulfillmentInput({ orderId: '1234567890', trackingNumber: ' 00340434161094000000 ', carrier: 'dhl' });
  assert.equal(normalized.shippingCarrierCode, 'DHL');
  assert.equal(normalized.trackingNumber, '00340434161094000000');
  assert.deepEqual(normalized.lineItems, []);
  const withItems = normalizeFulfillmentInput({ orderId: '1234567890', trackingNumber: 'X1', lineItems: ['a', { lineItemId: 'b' }, ''] });
  assert.deepEqual(withItems.lineItems, [{ lineItemId: 'a' }, { lineItemId: 'b' }]);
});

test('bereits versendete Bestellung wird nicht erneut gemeldet', async (t) => {
  const { calls } = fixture(t, { order: { orderId: '1234567890', orderFulfillmentStatus: 'FULFILLED' } });
  const result = await createEbayShippingFulfillment({ orderId: '1234567890', trackingNumber: 'X1' }, 'sandbox');
  assert.equal(result.alreadyFulfilled, true);
  assert.equal(calls.some((call) => call.url.pathname.endsWith('/shipping_fulfillment')), false, 'kein zweiter Schreibvorgang');
});

test('Sendungsnummer wird mit Carrier an eBay gemeldet', async (t) => {
  const { calls } = fixture(t);
  const result = await createEbayShippingFulfillment(
    { orderId: '1234567890', trackingNumber: '00340434161094000000', carrier: 'DHL' },
    'sandbox'
  );
  assert.equal(result.fulfilled, true);
  assert.equal(result.alreadyFulfilled, false);
  assert.equal(result.fulfillmentId, 'qa-fulfillment');
  const post = calls.find((call) => call.method === 'POST' && call.url.pathname.endsWith('/shipping_fulfillment'));
  assert.ok(post, 'POST auf shipping_fulfillment fehlt');
  const body = JSON.parse(post.body);
  assert.equal(body.trackingNumber, '00340434161094000000');
  assert.equal(body.shippingCarrierCode, 'DHL');
});

test('eBay-Fehler werden als Service-Fehler zurueckgegeben', async (t) => {
  fixture(t, { failWith: 'Die Bestellung wurde bereits versendet.' });
  await assert.rejects(
    () => createEbayShippingFulfillment({ orderId: '1234567890', trackingNumber: 'X1' }, 'sandbox'),
    (error) => error.code === 'ebay_api_error' && /bereits versendet/.test(error.message)
  );
});

test('Route ist registriert, geschuetzt und nur per POST erreichbar', async () => {
  const proxy = await readFile(new URL('../api/ebay/index.js', import.meta.url), 'utf8');
  const internal = await readFile(new URL('../internal/ebay/index.js', import.meta.url), 'utf8');
  assert.match(internal, /action === "fulfill-order"/);
  assert.match(internal, /"withdraw", "fulfill-order"/);
  assert.match(proxy, /"withdraw", "fulfill-order"\]\);/);
  assert.match(proxy, /action === "fulfill-order" && req\.method !== "POST"/);
});
