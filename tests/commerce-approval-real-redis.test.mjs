import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createSimulationLedger} from '../lib/commerce-simulation-ledger.js';
import {binding} from './commerce-approval-fixtures.mjs';

// Only a disposable GitHub Actions Redis service is accepted. Never use
// production REST credentials, remote endpoints, or a real account namespace.
const container=process.env.COMMERCE_TEST_REDIS_CONTAINER||'';
const real=container!==''&&/^[a-f0-9]{64}$/i.test(container);
const exec=promisify(execFile);
async function command(args){
 const {stdout}=await exec('docker',['exec',container,'redis-cli','--raw',...args.map(String)],{timeout:15000,maxBuffer:1024*1024});
 if(/^(ERR|WRONGTYPE|NOAUTH|OOM|Could not connect)/.test(stdout))throw Error('redis_test_command_failed');
 return stdout.trim();
}
const ledger=(adapter=command,namespace=randomUUID())=>createSimulationLedger(adapter,{namespace});
const it=(name,fn)=>test(name,{skip:!real},fn);
async function confirmed(l,b){
 const c=await l.create(b);assert.equal(c.ok,true,JSON.stringify(c));assert.equal(c.approval.status,'AWAITING_CONFIRMATION');
 const a=await l.confirm(b,c.approval.id,c.approval.revision);assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.approval.status,'CONFIRMED');return a.approval;
}
const never=r=>{for(const k of ['executionAuthorized','operationalEnabled','uploadVerified','releaseEligible','evidenceAuthenticated'])assert.equal(r[k],false);};
it('real Redis: atomic consumption, parallel double-click, persisted recovery after new ledger instance',async()=>{
 const ns=randomUUID(),l=ledger(command,ns),b=binding(),a=await confirmed(l,b);
 const attempts=await Promise.all([l.reserve(b,a.id,a.revision),l.reserve(b,a.id,a.revision)]);
 assert.equal(attempts.filter(x=>x.ok).length,1);assert.equal(attempts.find(x=>!x.ok).code,'approval_already_consumed');
 const winner=attempts.find(x=>x.ok);never(winner);assert.equal(winner.approval.status,'CONSUMED');assert.equal(winner.operation.status,'RESERVED');
 assert.equal(winner.operation.externalReference,null);
 const fresh=ledger(command,ns);
 const again=await fresh.get(b,a.id);assert.equal(again.approval.operationId,winner.operation.id);
 const op=await fresh.getOperation(b,winner.operation.id);assert.equal(op.operation.id,winner.operation.id);
 assert.ok(op.operation.audit.some(x=>x.event==='simulation_reserved'));
 assert.equal((await fresh.confirm(b,a.id,a.revision)).ok,false);
});
it('real Redis: same operation across users and reordered batch, overlapping targets, no partial batch lock',async()=>{
 const l=ledger(),checkedAt=new Date().toISOString();
 const a=binding({checkedAt,targets:t=>[t(1),t(2)]}),b=binding({checkedAt,actor:'fixture:bob',targets:t=>[t(2),t(1)]});
 const aa=await confirmed(l,a),bb=await confirmed(l,b);
 const r=await Promise.all([l.reserve(a,aa.id,aa.revision),l.reserve(b,bb.id,bb.revision)]);
 assert.equal(r.filter(x=>x.ok).length,1);assert.equal(r.find(x=>!x.ok).code,'duplicate_operation');
 const c=binding({checkedAt,targets:t=>[t(2),t(3)]}),cc=await confirmed(l,c);
 assert.equal((await l.reserve(c,cc.id,cc.revision)).code,'target_conflict');
 const d=binding({checkedAt,targets:t=>[t(3)]}),dd=await confirmed(l,d);
 assert.equal((await l.reserve(d,dd.id,dd.revision)).ok,true);
 const other=binding({checkedAt,account:'fixture:other',targets:t=>[t(1),t(2)]}),oo=await confirmed(l,other);
 assert.equal((await l.reserve(other,oo.id,oo.revision)).ok,true);
});
it('real Redis: price/stock conflict, listing-wide variant conflict and scope isolation',async()=>{
 const l=ledger(),checkedAt=new Date().toISOString(),a=binding({checkedAt}),aa=await confirmed(l,a);
 assert.equal((await l.reserve(a,aa.id,aa.revision)).ok,true);
 const b=binding({checkedAt,targets:t=>[t(1,{proposed:{price:'21.00',quantity:null},supplier:{quantity:'5',available:true,checkedAt}})]}),bb=await confirmed(l,b);
 assert.equal((await l.reserve(b,bb.id,bb.revision)).code,'target_conflict');
 const c=binding({checkedAt,targets:t=>[t(2,{listingId:'0001',variantId:'variant-2'})]}),cc=await confirmed(l,c);
 assert.equal((await l.reserve(c,cc.id,cc.revision)).code,'target_conflict');
 const d=binding({checkedAt,actor:'fixture:bob'});assert.equal((await l.get(d,aa.id)).code,'approval_not_found');
 const e=binding({checkedAt,workspace:'fixture:other-workspace'});assert.equal((await l.get(e,aa.id)).code,'approval_not_found');
});
it('real Redis: expiry, revocation, revision mismatch, changed content and evidence fail closed',async()=>{
 const l=ledger(),checkedAt=new Date().toISOString(),b=binding({checkedAt});
 const exp=await l.create(b,{ttlMs:5});await delay(20);
 const expired=await l.get(b,exp.approval.id);assert.equal(expired.approval.status,'EXPIRED');
 assert.equal((await l.confirm(b,exp.approval.id,expired.approval.revision)).code,'approval_expired');
 const a=await confirmed(l,b);
 assert.equal((await l.reserve(b,a.id,a.revision-1)).code,'revision_conflict');
 const revoked=await l.revoke(b,a.id,a.revision);assert.equal(revoked.approval.status,'REVOKED');
 assert.equal((await l.reserve(b,a.id,revoked.approval.revision)).code,'approval_revoked');
 for(const changed of [binding({checkedAt,ruleRevision:2}),binding({checkedAt,targets:t=>[t(1,{productRevision:'p-rev-2'})]}),
  binding({checkedAt,targets:t=>[t(1,{proposed:{price:'25.00',quantity:'0'}})]}),
  binding({checkedAt,targets:t=>[t(1,{current:{price:'19.00',quantity:'3'}})]})]){
  const x=await confirmed(l,b),result=await l.reserve(changed,x.id,x.revision);
  assert.equal(result.code,'revalidation_required');assert.equal(result.approval.status,'SUPERSEDED');
 }
 const stale=binding({checkedAt:new Date(Date.now()-25*3600000).toISOString()});
 assert.equal((await l.create(stale)).code,'evidence_stale_or_future');
 const future=binding({checkedAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal((await l.create(future)).code,'evidence_stale_or_future');
});
it('real Redis: lost response after reservation, unknown outcome survives and blocks new operation',async()=>{
 const ns=randomUUID(),normal=ledger(command,ns),b=binding(),a=await confirmed(normal,b);
 let calls=0;const lost=ledger(async args=>{calls++;await command(args);throw Error('lost HTTP response');},ns);
 await assert.rejects(lost.reserve(b,a.id,a.revision),/ledger_unavailable_outcome_unknown/);assert.equal(calls,1);
 const recovered=await normal.get(b,a.id);assert.equal(recovered.approval.status,'CONSUMED');
 const op=(await normal.getOperation(b,recovered.approval.operationId)).operation;
 const unknown=await normal.transition(b,op.id,op.revision,'UNKNOWN_OUTCOME');assert.equal(unknown.operation.reconciliationStatus,'REQUIRED');
 const restart=ledger(command,ns),pending=await restart.getOperation(b,op.id);
 assert.equal(pending.operation.status,'UNKNOWN_OUTCOME');
 const reconcile=await restart.transition(b,op.id,pending.operation.revision,'RECONCILIATION_REQUIRED');
 assert.equal(reconcile.operation.reconciliationStatus,'REQUIRED');
 assert.equal((await restart.transition(b,op.id,reconcile.operation.revision,'RESOLVED')).code,'invalid_operation_transition');
 const changed=binding({targets:t=>[t(1,{stateRevision:'new-state'})]}),ca=await confirmed(restart,changed);
 assert.equal((await restart.reserve(changed,ca.id,ca.revision)).code,'target_conflict');
});
it('real Redis: definitive simulation resolution releases semantic targets but never reuses consumed operation',async()=>{
 const l=ledger(),b=binding(),a=await confirmed(l,b),r=await l.reserve(b,a.id,a.revision);assert.equal(r.ok,true);
 const prepared=await l.transition(b,r.operation.id,r.operation.revision,'PREPARED');
 const simulated=await l.transition(b,r.operation.id,prepared.operation.revision,'SIMULATED');
 const resolved=await l.transition(b,r.operation.id,simulated.operation.revision,'RESOLVED');assert.equal(resolved.operation.status,'RESOLVED');
 const again=await confirmed(l,b);assert.equal((await l.reserve(b,again.id,again.revision)).code,'duplicate_operation');
 const next=binding({targets:t=>[t(1,{stateRevision:'ebay-state-2',current:{price:'20.00',quantity:'0'},proposed:{price:'22.00',quantity:null}})]});
 const na=await confirmed(l,next);const n=await l.reserve(next,na.id,na.revision);assert.equal(n.ok,true);
 assert.equal((await l.transition(next,n.operation.id,n.operation.revision,'CANCELLED')).operation.status,'CANCELLED');
 never(n);
});
