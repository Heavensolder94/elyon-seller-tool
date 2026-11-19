import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('CJ is unchecked until the explicit check, renders the result and sends only one request', async () => {
  const source = fs.readFileSync(new URL('../seller-jarvis-integration-center.js', import.meta.url), 'utf8');
  assert.match(source, /closest\("\[data-jic-cj-check\]"\)/);
  assert.match(source, /Dieser Status prüft nicht alle Veröffentlichungswege/);
  assert.doesNotMatch(source, /renderHealthCard\("Safety", "online", "LIVE Publishing gesperrt"/);
  const exposed = source.replace('  window.ElyonJarvisIntegrationCenter = Object.freeze({', '  window.__cjTest = { verifyCjStatus, renderApis, state };\n  window.ElyonJarvisIntegrationCenter = Object.freeze({');
  const tab = { innerHTML: '' };
  const calls = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const document = { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'jarvisIntegrationCenterTab' ? tab : null };
  const context = { document, window: {}, structuredClone, localStorage: { getItem: () => null }, Intl, Date, console,
    fetch: async (url, init) => { calls.push({ url, init }); return pending; } };
  vm.runInNewContext(exposed, context);
  const api = context.window.__cjTest;
  assert.match(api.renderApis(), /NICHT GEPRÜFT/);
  assert.equal(calls.length, 0);
  const first = api.verifyCjStatus();
  await api.verifyCjStatus();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'same-origin');
  finish({ ok: true, json: async () => ({ ok: true, status:'connected', message:'CJ geprüft', checkedAt:'2026-11-19T12:00:00Z' }) });
  await first;
  assert.match(api.renderApis(), /VERBINDUNG GEPRÜFT/);
  assert.match(api.renderApis(), /CJ geprüft/);
});
