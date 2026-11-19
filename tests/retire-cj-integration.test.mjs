import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import integrations from '../api/integrations/status.js';
import mobileHealth from '../api/mobile-health.js';

test('readiness depends on eBay and not a retired supplier integration', async () => {
  let body;
  await integrations({}, {status(code){ assert.equal(code,200); return this; },json(data){ body=data; return this; }});
  assert.ok(body.providers.ebay);
  assert.equal(body.providers.cj, undefined);
  assert.ok(body.readiness.checklist.every(item => item.id !== 'cj_config'));
});

test('Jarvis ignores an old stored supplier registry without erasing other settings', () => {
  let source=fs.readFileSync(new URL('../seller-jarvis-integration-center.js',import.meta.url),'utf8');
  source=source.replace('  window.ElyonJarvisIntegrationCenter = Object.freeze({','  window.__test = {state, renderApis};\n  window.ElyonJarvisIntegrationCenter = Object.freeze({');
  const stored=JSON.stringify({apis:[{id:'cj',name:'CJ Dropshipping',enabled:true},{id:'ebay',name:'eBay',enabled:true}]});
  const document={readyState:'loading',addEventListener(){}};
  const context={document,window:{},structuredClone,localStorage:{getItem:()=>stored},Intl,Date,console};
  vm.runInNewContext(source,context);
  const api=context.window.__test;
  assert.deepEqual(Array.from(api.state.registry.apis,x=>x.id),['ebay']);
  assert.match(api.renderApis(),/eBay/);
  assert.doesNotMatch(api.renderApis(),/CJ Dropshipping|data-jic-cj-check/);
  assert.doesNotMatch(source,/\/api\/cj\//);
});

test('mirrored frontends have no active supplier API and retain Nova import references', () => {
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(html,fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  assert.doesNotMatch(html,/\/api\/cj\/|prepareCjIntegration|searchCjProducts/);
  assert.match(html,/Elyon Nova/);
  assert.match(html,/analyzeSourceOnline/);
  const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(config.rewrites.every(item => !item.destination.includes('/api/cj/')));
});

test('mobile health checks eBay and Drive without calling the removed supplier route', async () => {
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async url => { calls.push(String(url)); return {status:200,ok:true,text:async()=>JSON.stringify({ok:true})}; };
  try {
    let body;
    await mobileHealth({method:'GET',headers:{host:'example.invalid'}},{status(code){assert.equal(code,200);return this;},json(data){body=data;return this;}});
    assert.ok(calls.some(url=>url.includes('/api/ebay/status')));
    assert.ok(calls.some(url=>url.includes('/api/google-drive/status')));
    assert.ok(calls.every(url=>!url.includes('/api/cj/')));
    assert.ok(body.services.every(service=>service.key!=='cj'));
  } finally { globalThis.fetch=original; }
});
