import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness() {
  const values = new Map([
    ['elyonProducts', JSON.stringify([{id:'local-test-product'}])],
    ['elyonSelectedSellerProductId','local-test-product'],
    ['elyonEbayProductionSelectionV1',JSON.stringify({autoPublishEnabled:true})],
  ]);
  const localStorage = {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const elements = new Map();
  const document = {readyState:'loading',addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',value:'',dataset:{},disabled:false});return elements.get(id)}};
  const calls=[];
  const sandbox={document,localStorage,console,CustomEvent:class {constructor(type,init){this.type=type;this.detail=init?.detail}},
    fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body||'{}')});return {ok:true,json:async()=>({ok:true,offerId:'test-offer',sku:'test-sku',draftCreated:true})}}};
  sandbox.window={addEventListener(){},dispatchEvent(){},confirm:()=>false};
  const source=fs.readFileSync(new URL('../seller-ebay-production-readiness.js',import.meta.url),'utf8');
  const exposed=source.replace('  window.ElyonEbayProductionReadiness = {', '  window.__test = { createDraft, publish };\n  window.ElyonEbayProductionReadiness = {');
  vm.runInNewContext(exposed,sandbox);
  return {calls,values,actions:sandbox.window.__test};
}

test('creating a draft never publishes even when old stored Auto-Live was enabled', async()=>{
  const {calls,values,actions}=harness();
  await actions.createDraft({dataset:{},textContent:'draft',disabled:false});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/action=create-draft/);
  assert.equal(calls[0].body.autoPublishEnabled,false);
  const saved=JSON.parse(values.get('elyonProducts'))[0].autoListerDraft;
  assert.equal(saved.manualApprovalRequired,true);
  assert.equal(saved.automaticPublishingAllowed,false);
  assert.equal(JSON.parse(values.get('elyonEbayProductionSelectionV1')).autoPublishEnabled,true);
});

test('rejecting manual publish confirmation makes no eBay request', async()=>{
  const {calls,actions}=harness();
  await actions.createDraft({dataset:{},textContent:'draft',disabled:false});
  await actions.publish({dataset:{},textContent:'publish',disabled:false});
  assert.equal(calls.length,1);
});
