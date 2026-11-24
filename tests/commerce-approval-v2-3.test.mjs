import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createSimulationBinding,resolveAuthenticatedCommerceScope,describeBlockedCommerceReview} from '../lib/commerce-approval-v2-3.js';
import {createSimulationLedger} from '../lib/commerce-simulation-ledger.js';
import {fixtureInput,binding,fingerprint} from './commerce-approval-fixtures.mjs';

test('shared seller credential proves access only, never client identities',()=>{
 const old=process.env.ELYON_SELLER_ACCESS_TOKEN;process.env.ELYON_SELLER_ACCESS_TOKEN='fixture-secret';
 try{
  const scope=resolveAuthenticatedCommerceScope({headers:{authorization:'Bearer fixture-secret'},body:{userId:'fake',workspaceId:'fake',ebayAccountId:'fake'}});
  assert.equal(scope.sellerAccess,true);assert.equal(scope.authenticated,false);
  for(const field of ['userId','workspaceId','ebayAccountId','environment','marketplace'])assert.equal(scope[field],null);
  assert.equal(resolveAuthenticatedCommerceScope({headers:{}}).sellerAccess,false);
  const off={executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,evidenceAuthenticated:false};
  const d={...off,ok:true,schemaVersion:'elyon-price-stock-proposal-v2.2',scopeAuthenticated:false,ruleRevision:2,checkedAt:new Date().toISOString(),
    economicsRulesSha256:fingerprint('rules'),validationRuleVersion:'1.0.0',proposals:[{target:{sku:'0001'},current:{price:'20',quantity:'3'},proposed:{quantity:'0'},targetSha256:fingerprint('target'),contentSha256:fingerprint('content'),productRevision:fingerprint('product'),missing:[],blockers:[]}]};
  const a=describeBlockedCommerceReview(d,scope);
  assert.equal(a.status,'EVIDENCE_REQUIRED');assert.equal(a.id,null);assert.equal(a.persisted,false);assert.equal(a.confirmationAllowed,false);
  assert.equal(a.reservationAllowed,false);assert.equal(a.scopeAuthenticated,false);assert.equal(a.executionAuthorized,false);
  assert.throws(()=>describeBlockedCommerceReview({...d,executionAuthorized:true},scope));
  assert.throws(()=>describeBlockedCommerceReview(d,{sellerAccess:false,authenticated:false}));
  assert.notEqual(a.evidenceSha256,describeBlockedCommerceReview({...d,ruleRevision:3},scope).evidenceSha256);
  assert.notEqual(a.evidenceSha256,describeBlockedCommerceReview({...d,validationRuleVersion:'2.0.0'},scope).evidenceSha256);
  const missing=describeBlockedCommerceReview({...d,economicsRulesSha256:null,validationRuleVersion:null},scope);
  assert.ok(missing.blockers.includes('canonical_rules_fingerprint_missing'));assert.ok(missing.blockers.includes('validation_rule_version_missing'));
 }finally{if(old===undefined)delete process.env.ELYON_SELLER_ACCESS_TOKEN;else process.env.ELYON_SELLER_ACCESS_TOKEN=old;}
});
test('operation identity normalized and independent of actor, batch order, review time; expected state matters',()=>{
 const checkedAt=new Date().toISOString(),opts={checkedAt,targets:t=>[t(1),t(2)]};
 const a=binding(opts),b=binding({...opts,actor:'fixture:bob',workspace:'fixture:other',targets:t=>[t(2),t(1)]});
 assert.equal(a.operationKey,b.operationKey);assert.equal(a.contentSha256,b.contentSha256);assert.notEqual(a.bindingSha256,b.bindingSha256);
 assert.equal(a.targets[0].listingId,'0001');assert.equal(a.targets[0].proposed.quantity,'0');
 assert.equal(a.operationKey,binding({...opts,ruleRevision:2}).operationKey);
 assert.notEqual(a.bindingSha256,binding({...opts,ruleRevision:2}).bindingSha256);
 assert.notEqual(a.operationKey,binding({...opts,account:'fixture:other-account'}).operationKey);
 assert.notEqual(a.operationKey,binding({...opts,environment:'production'}).operationKey);
 const c=binding({...opts,targets:t=>[t(1,{stateRevision:'ebay-state-2'}),t(2)]});assert.notEqual(a.operationKey,c.operationKey);
 assert.throws(()=>{a.targets[0].proposed.quantity='5';},TypeError);
});
test('rejects incomplete scope, mismatched environment/account, invalid evidence, increases and duplicate target',()=>{
 const base=fixtureInput();
 for(const scope of [{...base.scope,userId:null},{...base.scope,simulation:false},{...base.scope,marketplace:'EBAY_US'},{...base.scope,userId:'real-user'}])assert.throws(()=>createSimulationBinding({...base,scope}));
 for(const patch of [{environment:'production'},{ebayAccountId:'fixture:other'},{currency:'USD'},{supplier:null},{offerCheckedAt:null},{economicsStatus:'RISK'},{status:'DRAFT'},{proposed:{quantity:'4'}},{proposed:{quantity:'1'}},{proposed:{price:null,quantity:'3'}},{listingId:1}])assert.throws(()=>createSimulationBinding({...base,targets:[{...base.targets[0],...patch}]}));
 assert.throws(()=>createSimulationBinding({...base,targets:[base.targets[0],base.targets[0]]}),/duplicate_target/);
});
test('command adapter is simulation-only, single EVAL, no automatic retry on unknown response',async()=>{
 const calls=[];const ledger=createSimulationLedger(async command=>{calls.push(command);throw Error('timeout');},{namespace:randomUUID()});
 const a=binding();await assert.rejects(ledger.create(a),/ledger_unavailable_outcome_unknown/);assert.equal(calls.length,1);
 assert.equal(calls[0][0],'EVAL');assert.equal(calls[0][2],1);assert.match(calls[0][3],/^elyon:commerce:v2\.3:simulation:/);
 await assert.rejects(ledger.create({...a}),/unrecognized_simulation_binding/);assert.equal(calls.length,1);
 assert.throws(()=>createSimulationLedger(()=>{},{}),/isolated_test_namespace_required/);
});
test('production route adds a blocked descriptor only; UI has no operational confirmation or ledger call',async()=>{
 const api=await readFile(new URL('../api/price-stock-preview.js',import.meta.url),'utf8');
 const ui=await readFile(new URL('../seller-price-stock-review.js',import.meta.url),'utf8');
 assert.match(api,/requireSellerAccess/);assert.match(api,/describeBlockedCommerceReview\(data,resolveAuthenticatedCommerceScope\(req\)\)/);
 assert.doesNotMatch(api,/createSimulationLedger|\.reserve\(|\.confirm\(/);
 assert.match(ui,/confirmation\.disabled=true/);assert.match(ui,/Es wurde keine Freigabe gespeichert/);
 assert.match(ui,/Offline-CSV exportieren/);
});
