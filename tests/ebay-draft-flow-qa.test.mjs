import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrUpdateEbayDraft } from '../lib/ebay-production.js';
import directDraft from '../api/ebay/create-draft.js';
import ebayHandler from '../api/ebay/index.js';
import { fetchEbayListingSnapshot } from '../api/ebay/listings.js';
import { fetchSellerState } from '../api/ebay/seller-state.js';
import lifecycleBridge from '../api/integrations/company-os/ebay-lifecycle.js';

const input = {
  sourceProductId: 'qa-product', sku: 'ELY-900001', title: 'QA Testprodukt',
  description: 'Sachliche Testbeschreibung', categoryId: '12345', conditionId: '1000',
  price: 19.99, images: ['https://example.test/product.jpg'], itemSpecifics: { Farbe: ['Blau'] },
};
const offer = { offerId: 'qa-offer', sku: input.sku, marketplaceId: 'EBAY_DE', format: 'FIXED_PRICE', status: 'UNPUBLISHED' };
function response(body, status = 200) { return new Response(JSON.stringify(body), { status }); }
function fixture(t, options = {}) {
  const env = { EBAY_ENV: 'sandbox', EBAY_CLIENT_ID: 'qa-client', EBAY_CLIENT_SECRET: 'qa-placeholder',
    EBAY_REFRESH_TOKEN: 'qa-placeholder', ELYON_SELLER_ACCESS_TOKEN: 'qa-access', ELYON_BRIDGE_SECRET: 'qa-bridge',
    EBAY_TOKEN_STORE_URL: 'https://tokens.example.test', EBAY_TOKEN_STORE_TOKEN: 'qa-placeholder',
    UPSTASH_BACKUP_URL: 'https://registry.example.test', UPSTASH_BACKUP_TOKEN: 'qa-placeholder' };
  for (const [key, value] of Object.entries(env)) {
    const original = process.env[key]; process.env[key] = value;
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  }
  const calls = []; let registry = []; let currentOffer = options.existing ? { ...offer, ...options.existing } : null;
  t.mock.method(globalThis, 'fetch', async (raw, init = {}) => {
    const url = new URL(raw); const method = init.method || 'GET'; calls.push({ url, method, body: init.body });
    if (url.hostname === 'tokens.example.test') return response({ result: null });
    if (url.hostname === 'registry.example.test') {
      if (options.registryFailure) return response({ error: 'offline' }, 503);
      const command = JSON.parse(init.body);
      if (command[0] === 'GET') return response({ result: JSON.stringify(registry) });
      if (command[0] === 'SET') { registry = JSON.parse(command[2]); return response({ result: 'OK' }); }
    }
    assert.equal(url.hostname, 'api.sandbox.ebay.com', 'all eBay calls must remain in the requested sandbox');
    if (url.pathname.endsWith('/oauth2/token')) return response({ access_token: 'qa-placeholder', scope: '' });
    for (const [name, plural, id] of [['fulfillment', 'fulfillmentPolicies', 'fulfillmentPolicyId'], ['payment', 'paymentPolicies', 'paymentPolicyId'], ['return', 'returnPolicies', 'returnPolicyId']]) {
      if (url.pathname.endsWith('/' + name + '_policy')) return response({ [plural]: [{ [id]: 'qa-' + name }] });
    }
    if (url.pathname.endsWith('/location')) return response({ locations: [{ merchantLocationKey: 'qa-location' }] });
    if (url.pathname.endsWith('/get_regulatory_policies')) return response({ regulatoryPolicies: [] });
    if (url.pathname.endsWith('/inventory_item')) return response(options.inventoryPage || { inventoryItems: [{ sku: input.sku }], total: 1 });
    if (url.pathname.endsWith('/ws/api.dll')) return new Response(options.tradingXml || '<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfPages>0</TotalNumberOfPages><TotalNumberOfEntries>0</TotalNumberOfEntries></PaginationResult></ActiveList></GetMyeBaySellingResponse>');
    if (url.pathname.endsWith('/offer') && method === 'GET') {
      if (options.lookupFailure) return response({ errors: [{ errorId: 25001, message: 'Service unavailable' }] }, 503);
      if (options.empty404) return response({ errors: [{ errorId: 25713, message: 'This Offer is not available.' }] }, 404);
      if (options.offerPage) return response(options.offerPage);
      return response({ offers: currentOffer ? [currentOffer] : [], total: currentOffer ? 1 : 0 });
    }
    if (url.pathname.includes('/inventory_item/') && method === 'PUT') return response({});
    if (url.pathname.endsWith('/offer') && method === 'POST') {
      currentOffer = { ...offer }; return response({ offerId: offer.offerId });
    }
    if (url.pathname.endsWith('/offer/qa-offer')) {
      if (method === 'PUT') return response({});
      return response(currentOffer || offer);
    }
    if (url.pathname.endsWith('/offer/qa-offer-2') && method === 'GET') return response({ ...offer, offerId: 'qa-offer-2', sku: 'ELY-900002' });
    assert.fail('Unexpected fixture request: ' + method + ' ' + url.pathname);
  });
  return { calls, registry: () => registry, writes: () => calls.filter(c => /sell\/inventory/.test(c.url.pathname) && c.method !== 'GET') };
}
function req(body = {}) {
  return { method: 'POST', url: '/api/ebay/create-draft', query: {}, headers: { 'x-elyon-seller-token': 'qa-access' }, body: { ...input, ...body } };
}
function res() { return { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test('direct draft endpoint persists the same registry used by Seller Tool', async t => {
  const f = fixture(t); const result = res(); await directDraft(req(), result);
  assert.equal(result.statusCode, 200); assert.equal(result.body.draftRegistry.persisted, true);
  assert.equal(f.registry().length, 1); assert.equal(f.registry()[0].offerId, offer.offerId);
  assert.equal(f.registry()[0].sourceProductId, input.sourceProductId);
  assert.equal(f.registry()[0].environment, 'sandbox');
});

test('an Inventory item without an offer does not break the listing snapshot', async t => {
  fixture(t, { empty404: true });
  const snapshot = await fetchEbayListingSnapshot('sandbox');
  assert.equal(snapshot.inventoryItemCount, 1); assert.equal(snapshot.items.length, 0);
});

test('a partial inventory page is never accepted as an authoritative empty snapshot', async t => {
  fixture(t, { inventoryPage: { inventoryItems: [], total: 2 } });
  await assert.rejects(fetchEbayListingSnapshot('sandbox'), { code: 'ebay_inventory_snapshot_incomplete' });
});

test('malformed offer lookup does not cause a new creation', async t => {
  const f = fixture(t, { offerPage: {} });
  await assert.rejects(createOrUpdateEbayDraft(input, 'sandbox'), { code: 'ebay_offer_lookup_incomplete' });
  assert.equal(f.writes().length, 0);
});

test('known empty-offer response allows first draft creation', async t => {
  const f = fixture(t, { empty404: true });
  const result = await createOrUpdateEbayDraft(input, 'sandbox');
  assert.equal(result.draftCreated, true); assert.equal(f.writes().length, 2);
});

test('explicit draft identity is verified and reused', async t => {
  const f = fixture(t, { existing: {} });
  const result = await createOrUpdateEbayDraft({ ...input, offerId: offer.offerId }, 'sandbox');
  assert.equal(result.offerId, offer.offerId);
  assert.equal(f.writes().some(c => c.method === 'POST'), false);
});

test('invalid Trading response does not reconcile lifecycle history', async t => {
  const f = fixture(t, { tradingXml: '<html>Temporary service issue</html>' });
  await assert.rejects(fetchSellerState('sandbox'));
  assert.equal(f.calls.some(c => c.url.hostname === 'registry.example.test'), false);
});

test('canonical draft endpoint uses EBAY_ENV consistently for API and registry', async t => {
  const f = fixture(t); const request = req(); request.query.action = 'create-draft';
  const result = res(); await ebayHandler(request, result);
  assert.equal(result.statusCode, 200); assert.equal(f.registry()[0].environment, 'sandbox');
});

test('registry outage preserves successful eBay result without repeating creation', async t => {
  const f = fixture(t, { registryFailure: true }); const result = res(); await directDraft(req(), result);
  assert.equal(result.statusCode, 200); assert.equal(result.body.draftCreated, true);
  assert.equal(result.body.draftRegistry.persisted, false);
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.url.pathname.endsWith('/offer')).length, 1);
});

test('retry without a local offer ID reuses the existing eBay draft', async t => {
  const f = fixture(t);
  const first = await createOrUpdateEbayDraft(input, 'sandbox');
  const second = await createOrUpdateEbayDraft(input, 'sandbox');
  assert.equal(first.offerId, second.offerId);
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.url.pathname.endsWith('/offer')).length, 1);
  assert.equal(f.calls.some(c => c.url.pathname.endsWith('/publish')), false);
});

test('offer lookup failures stop draft writes', async t => {
  const f = fixture(t, { lookupFailure: true });
  await assert.rejects(createOrUpdateEbayDraft(input, 'sandbox'));
  assert.equal(f.writes().length, 0);
});

test('Company OS variant identities are verified and registered once across retries', async t => {
  const f = fixture(t);
  const request = { method: 'POST', headers: { 'x-elyon-bridge-secret': 'qa-bridge' }, body: {
    action: 'register_inventory', environment: 'sandbox', sourceProductId: 'qa-company-product',
    offers: [{ offerId: offer.offerId, sku: input.sku }, { offerId: 'qa-offer-2', sku: 'ELY-900002' }],
  } };
  for (let i = 0; i < 2; i++) {
    const result = res(); await lifecycleBridge(request, result);
    assert.equal(result.statusCode, 200); assert.equal(result.body.persisted, true); assert.equal(result.body.count, 2);
  }
  assert.equal(f.registry().length, 2);
  assert.ok(f.registry().every(record => record.visibilityMode === 'inventory_offer' && record.sourceProductId === 'qa-company-product'));
  assert.equal(f.writes().length, 0, 'registration must only read from eBay');
});

test('Company OS registration rejects unverified SKU without touching the registry', async t => {
  const f = fixture(t); const result = res();
  await lifecycleBridge({ method: 'POST', headers: { 'x-elyon-bridge-secret': 'qa-bridge' }, body: {
    action: 'register_inventory', environment: 'sandbox', offers: [{ offerId: offer.offerId, sku: 'unknown-sku' }],
  } }, result);
  assert.equal(result.statusCode, 409); assert.equal(f.registry().length, 0);
});

test('draft endpoint returns structured failure when the eBay lookup is unavailable', async t => {
  fixture(t, { lookupFailure: true }); const result = res();
  await directDraft(req(), result);
  assert.equal(result.statusCode, 503); assert.equal(result.body.ok, false);
});
