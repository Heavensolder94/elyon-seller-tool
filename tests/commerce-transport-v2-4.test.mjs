import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSimulationBinding} from '../lib/commerce-approval-v2-3.js';
import {inventoryRequestParts,inspectTransportReadback,normalizeInventoryFixtureResult} from '../lib/commerce-inventory-transport.js';
import {binding,fixtureInput} from './commerce-approval-fixtures.mjs';
const now=Date.now();
const at=new Date(now-1000).toISOString();
const b=binding({checkedAt:at,targets:t=>[t(1,{proposed:{price:'21.00',quantity:'0'}}),t(2,{variantId:'variant-2',proposed:{price:'22.00',quantity:null},supplier:{quantity:'5',available:true,checkedAt:at}}),t(3)]});
import {readback,response} from './commerce-transport-fixtures.mjs';
test('V2.4 inventory request representation: deterministic bounded single SKU, exact offer, zero, omitted unchanged fields',()=>{
 const parts=inventoryRequestParts(b);
 assert.equal(parts.length,3);
 for(const p of parts){assert.equal(p.body.requests.length,1);assert.equal(p.body.requests[0].offers.length,1);assert.equal(p.body.requests[0].sku,p.target.sku);assert.equal(p.body.requests[0].offers[0].offerId,p.target.offerId);assert.equal('shipToLocationAvailability' in p.body.requests[0],false);assert.match(p.requestSha256,/^[a-f0-9]{64}$/);}
 assert.equal(parts[0].body.requests[0].offers[0].availableQuantity,0);
 assert.equal(parts[0].body.requests[0].offers[0].price.value,'21.00');
 assert.equal('availableQuantity' in parts[1].body.requests[0].offers[0],false);
 assert.equal('price' in parts[2].body.requests[0].offers[0],false);
 assert.throws(()=>{parts[0].body.requests[0].sku='forged';},TypeError);
 assert.throws(()=>inventoryRequestParts({...b}),/unrecognized_simulation_binding/);
 const many=binding({checkedAt:at,targets:t=>Array.from({length:50},(_,i)=>t(i+1))});
 assert.equal(inventoryRequestParts(many).length,50);
 assert.deepEqual(inventoryRequestParts(many).map(p=>p.id),Array.from({length:50},(_,i)=>'part:'+String(i+1).padStart(2,'0')));
});
test('V2.4 preflight rejects scope, identity, revision, stale observations and changed state',()=>{
 const rb=readback(b,{checkedAt:at});
 assert.equal(inspectTransportReadback(b,rb,{now,preflight:true}).ok,true);
 for(const patch of [{sku:'wrong'},{offerId:'999'},{listingId:'999'},{variantId:'wrong'},{ebayAccountId:'fixture:other'},{environment:'production'},{marketplace:'EBAY_US'},{currency:'USD'},{origin:'trading'},{status:'DRAFT'},{productRevision:'new'},{stateRevision:'new'},{ruleRevision:99},{validationRuleVersion:'9.0'},{price:'19.00'},{quantity:'1'},{supplier:null},{checkedAt:new Date(now-3600000).toISOString()}]){
  assert.equal(inspectTransportReadback(b,{simulation:true,rows:[{...rb.rows[0],...patch},...rb.rows.slice(1)]},{now,preflight:true}).ok,false,JSON.stringify(patch));
 }
 assert.equal(inspectTransportReadback(b,{simulation:true,rows:rb.rows.slice(1)},{now,preflight:true}).ok,false);
 assert.equal(inspectTransportReadback(b,{simulation:true,rows:[...rb.rows,rb.rows[0]]},{now,preflight:true}).ok,false);
 const f=fixtureInput({checkedAt:at});
 for(const patch of [{origin:'trading'},{origin:'unknown'},{proposed:{quantity:'-1'}},{proposed:{price:'0'}},{proposed:{quantity:'4'}}])assert.throws(()=>createSimulationBinding({...f,targets:[{...f.targets[0],...patch}]}));
 assert.throws(()=>createSimulationBinding({...f,targets:[f.targets[0],{...f.targets[0],offerId:'1234'}]}),/duplicate_target/);
});
test('V2.4 response normalization requires exact row identity and unambiguous status',()=>{
 const t=b.targets[0],p=inventoryRequestParts(b)[0],normalize=x=>normalizeInventoryFixtureResult(b,p.id,x);
 const good=normalize(response(t,{warnings:[{errorId:123}]}));assert.equal(good.status,'SUCCEEDED');assert.deepEqual(good.warnings,[123]);assert.equal(good.confirmed,null);assert.equal(good.externalStateVerified,false);
 const failed=normalize(response(t,{statusCode:400,errors:[{errorId:456}]}));assert.equal(failed.status,'FAILED');
 for(const f of [undefined,{simulation:true,kind:'timeout'},response(t,{sku:'wrong'}),response(t,{offerId:'999'}),response(t,{listingId:'999'}),response(t,{statusCode:200,errors:[{errorId:456}]}),response(t,{statusCode:500}),response(t,{statusCode:429,errors:[{errorId:1}]}),response(t,{errors:'bad'}),response(t,{statusCode:400}),{...response(t),body:{responses:[]}},{...response(t),body:{responses:[response(t).body.responses[0],response(t).body.responses[0]]}},{...response(t),httpStatus:500},{...response(t),body:{unexpected:true}}]){
  const n=normalize(f);assert.equal(n.status,'UNKNOWN_OUTCOME');assert.equal(n.retryAllowed,false);assert.equal(n.executionAuthorized,false);
 }
});
test('V2.4 reconciliation separates desired, original, partial, different and unknown states from causality',()=>{
 const before=readback(b,{checkedAt:at}),after=readback(b,{desired:true,checkedAt:at});
 assert.equal(inspectTransportReadback(b,after,{now}).status,'TARGET_STATE_CONFIRMED');
 assert.equal(inspectTransportReadback(b,after,{now}).causalityVerified,false);
 assert.equal(inspectTransportReadback(b,before,{now}).rows[0].status,'ORIGINAL_STATE_CONFIRMED');
 const mixed={simulation:true,rows:[{...after.rows[0],quantity:before.rows[0].quantity},after.rows[1],{...after.rows[2],price:'99.00'}]};
 const r=inspectTransportReadback(b,mixed,{now});assert.deepEqual(r.rows.map(x=>x.status),['PARTIAL_STATE_CONFIRMED','TARGET_STATE_CONFIRMED','DIFFERENT_STATE']);
 assert.equal(inspectTransportReadback(b,{simulation:true,rows:[]},{now}).rows[0].status,'STATE_UNKNOWN');
 assert.equal(inspectTransportReadback(b,after,{now,notBefore:now}).rows[0].status,'EVIDENCE_STALE');
 assert.equal(inspectTransportReadback(b,{simulation:true,rows:[{...after.rows[0],sku:'wrong'},...after.rows.slice(1)]},{now}).rows[0].status,'IDENTITY_CONFLICT');
 assert.equal(r.retryAllowed,false);
});
test('V2.4 transport is not reachable from production preview route',async()=>{
 const code=await readFile(new URL('../lib/commerce-inventory-transport.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|ebayUserSession|callEbayJson|node:https|node:http/);
 const api=await readFile(new URL('../api/price-stock-preview.js',import.meta.url),'utf8');
 assert.doesNotMatch(api,/commerce-inventory-transport|commerce-simulation-ledger|simulateTransport|prepareTransport/);
});
