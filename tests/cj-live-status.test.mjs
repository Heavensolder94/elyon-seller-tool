import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCjConnection } from '../lib/cj-live-status.js';
import search from '../api/cj/search.js';

const now = () => '2026-11-19T12:00:00.000Z';
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const success = { code: 200, result: true, data: { openId: 123, openEmail: 'private@example.test', isSandbox: true } };
const invoke = (env, fetchImpl) => verifyCjConnection({ env, fetchImpl, now });

test('missing and invalid configurations do not contact CJ', async () => {
  const never = () => { throw new Error('must not be called'); };
  assert.equal((await invoke({}, never)).status, 'missing_config');
  assert.equal((await invoke({ CJ_ACCESS_TOKEN: 'test', CJ_API_KEY: 'test-key' }, never)).status, 'invalid_config');
});

test('access token is verified by read-only settings request and no response contains account data or secret', async () => {
  let calls = 0;
  const result = await invoke({ CJ_ACCESS_TOKEN: 'private-token' }, async (url, init) => {
    calls++;
    assert.match(url, /\/setting\/get$/);
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['CJ-Access-Token'], 'private-token');
    assert.equal(init.redirect, 'error');
    return response(success);
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'connected'); assert.equal(result.verified, true);
  assert.doesNotMatch(JSON.stringify(result), /private-token|private@example/);
});

test('API key obtains token only for this explicit check and never returns secrets', async () => {
  const calls = [];
  const result = await invoke({ CJ_API_KEY: 'private-key' }, async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? response({ code: 200, result: true, data: { accessToken: 'private-new-token' } })
      : response(success);
  });
  assert.equal(result.status, 'connected'); assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.headers['CJ-Access-Token'], 'private-new-token');
  assert.doesNotMatch(JSON.stringify(result), /private-key|private-new-token|private@example/);
});

for (const [name, upstream, expected] of [
  ['HTTP authentication failure', () => response({ message: 'secret' }, 401), 'auth_failed'],
  ['CJ authentication failure', () => response({ code: 1600001, result: false }), 'auth_failed'],
  ['HTTP rate limit', () => response({}, 429), 'rate_limited'],
  ['CJ rate limit', () => response({ code: 1600200, result: false }), 'rate_limited'],
  ['disabled account', () => response({ code: 1600014, result: false }), 'access_disabled'],
  ['provider outage', () => response({}, 503), 'unreachable'],
  ['unexpected result', () => response({ code: 200, result: false }), 'check_failed'],
  ['empty settings without account identity', () => response({ code: 200, result: true, data: {} }), 'check_failed'],
  ['contradictory result', () => response({ ...success, success: false }), 'check_failed'],
  ['network failure', () => { throw new Error('secret in network error'); }, 'unreachable'],
]) {
  test(name + ' is not reported as connected', async () => {
    const result = await invoke({ CJ_ACCESS_TOKEN: 'private-token' }, async () => upstream());
    assert.equal(result.status, expected); assert.equal(result.connected, false); assert.equal(result.verified, false);
    assert.doesNotMatch(JSON.stringify(result), /secret|private-token/);
  });
}

test('verify endpoint requires POST and an authenticated seller before any external request', async t => {
  const old = process.env.ELYON_SELLER_ACCESS_TOKEN;
  process.env.ELYON_SELLER_ACCESS_TOKEN = 'local-seller-placeholder';
  t.after(() => { if (old === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN; else process.env.ELYON_SELLER_ACCESS_TOKEN = old; });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('must not call CJ'); });
  const makeRes = () => ({ setHeader() {}, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } });
  const get = makeRes(); await search({ method:'GET', query:{action:'verify-status'}, headers:{} }, get); assert.equal(get.code,405);
  const denied = makeRes(); await search({ method:'POST', query:{action:'verify-status'}, headers:{} }, denied); assert.equal(denied.code,403);
});

test('authenticated verify endpoint performs the live check and returns only sanitized status', async t => {
  const before = { access: process.env.ELYON_SELLER_ACCESS_TOKEN, token: process.env.CJ_ACCESS_TOKEN };
  process.env.ELYON_SELLER_ACCESS_TOKEN = 'local-seller-placeholder';
  process.env.CJ_ACCESS_TOKEN = 'local-cj-placeholder';
  t.after(() => { for (const [key, value] of [['ELYON_SELLER_ACCESS_TOKEN', before.access], ['CJ_ACCESS_TOKEN', before.token]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  t.mock.method(globalThis, 'fetch', async () => response(success));
  const res = { setHeader() {}, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } };
  await search({ method:'POST', query:{action:'verify-status'}, headers:{ 'x-elyon-seller-token':'local-seller-placeholder' } }, res);
  assert.equal(res.code,200); assert.equal(res.body.status,'connected');
  assert.doesNotMatch(JSON.stringify(res.body), /local-seller-placeholder|local-cj-placeholder|private@example/);
});
