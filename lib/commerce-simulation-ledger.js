import {createHash} from 'node:crypto';
import {TRANSPORT_SCHEMA,inventoryRequestParts,inspectTransportReadback,normalizeInventoryFixtureResult} from './commerce-inventory-transport.js';
import { assertSimulationBinding,newReviewId,newOperationId,OPERATION_SCHEMA,disabledFlags } from './commerce-approval-v2-3.js';

// All records, idempotency references and semantic locks for an account are
// fields of ONE hash. Every mutation is one HSET after all checks. Lua errors
// cannot occur after a partial sequence of writes. No TTL on unresolved work.
export const RESERVATION_LUA = [
"local key=KEYS[1]",
"local q=cjson.decode(ARGV[1])",
"local clock=redis.call('TIME')",
"local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)",
"local function reply(ok,code,a,o) return cjson.encode({ok=ok,code=code,approval=a,operation=o,simulation=true,executionAuthorized=false,operationalEnabled=false,uploadVerified=false,releaseEligible=false,evidenceAuthenticated=false}) end",
"local function load(field) local raw=redis.call('HGET',key,field); if raw then return cjson.decode(raw) end; return nil end",
"local function audit(r,event) r.audit=r.audit or {}; if #r.audit>=24 then table.remove(r.audit,1); r.auditTruncated=true end; table.insert(r.audit,{event=event,atMs=now}); r.updatedAtMs=now end",
"local function put(fields) local args={}; local extra=0; for k,v in pairs(fields) do if redis.call('HEXISTS',key,k)==0 then extra=extra+1 end; table.insert(args,k);table.insert(args,v) end; if redis.call('HLEN',key)+extra>4000 then return false end; redis.call('HSET',key,unpack(args)); return true end",
"local function save(a) return put({['a:'..a.id]=cjson.encode(a)}) end",
"local function fresh(b) return b.evidenceNewestMs<=now and now-b.evidenceOldestMs<=86400000 end",
"local function deny(a,code) audit(a,code); if not save(a) then return reply(false,'ledger_capacity',nil,nil) end; return reply(false,code,a,nil) end",
"if q.action=='create' then",
" if not fresh(q.binding) then return reply(false,'evidence_stale_or_future',nil,nil) end",
" if load('a:'..q.id) then return reply(false,'review_id_conflict',nil,nil) end",
" local a={id=q.id,schemaVersion=q.binding.schemaVersion,scope=q.binding.scope,scopeHash=q.binding.scopeHash,binding=q.binding,revision=1,status='AWAITING_CONFIRMATION',createdAtMs=now,expiresAtMs=now+q.ttlMs,simulation=true,executionAuthorized=false,operationalEnabled=false,releaseEligible=false,uploadVerified=false,evidenceAuthenticated=false}",
" audit(a,'proposal_created');audit(a,'fixture_review_checked');audit(a,'confirmation_requested');if not save(a) then return reply(false,'ledger_capacity',nil,nil) end;return reply(true,'created',a,nil)",
"end",
"if string.sub(q.action,1,10)=='transport_' then",
" local o=load('o:'..q.id);if not o or o.scopeHash~=q.binding.scopeHash or o.bindingSha256~=q.binding.bindingSha256 or o.simulation~=true then return reply(false,'operation_binding_mismatch',nil,nil) end",
" if o.revision~=q.revision then return reply(false,'revision_conflict',nil,nil) end",
" local a=load('a:'..o.approvalId);if not a or a.status~='CONSUMED' or a.operationId~=o.id or a.binding.bindingSha256~=o.bindingSha256 then return reply(false,'consumed_approval_missing',nil,nil) end",
" for _,t in ipairs(o.targetRefs) do if redis.call('HGET',key,'t:'..t)~=o.id then return reply(false,'target_ownership_conflict',nil,nil) end end",
" local fields={};local tr=o.transport",
" if q.action=='transport_init' then",
"  if o.status~='RESERVED' or tr then return reply(false,'transport_already_initialized',nil,nil) end",
"  if not fresh(q.binding) or now>=a.expiresAtMs or q.readbackNewestMs>now or now-q.readbackOldestMs>900000 then return reply(false,'revalidation_required',nil,nil) end",
"  tr=q.manifest;tr.preparedAtMs=now;tr.readbackOldestMs=q.readbackOldestMs;tr.readbackNewestMs=q.readbackNewestMs;tr.cursor=1;tr.phase='PREPARED';tr.outcome='NOT_SUBMITTED';for _,p in ipairs(tr.parts) do p.phase='NOT_SUBMITTED' end;o.transport=tr;o.status='PREPARED';audit(o,'transport_prepared')",
" else",
"  if not tr or tr.planSha256~=q.planSha256 then return reply(false,'transport_plan_mismatch',nil,nil) end",
"  local p=tr.parts[tr.cursor]",
"  if q.action=='transport_begin' then",
"   if o.status~='PREPARED' or tr.phase~='PREPARED' or not p or p.id~=q.partId or p.phase~='NOT_SUBMITTED' then return reply(false,'transport_not_submittable',nil,nil) end",
"   if not fresh(q.binding) or now>=a.expiresAtMs or now-tr.readbackOldestMs>900000 then return reply(false,'revalidation_required',nil,nil) end",
"   p.phase='MAYBE_SUBMITTED';p.startedAtMs=now;tr.phase='MAYBE_SUBMITTED';audit(o,'fixture_checkpoint_before_submission')",
"  elseif q.action=='transport_record' then",
"   if o.status~='PREPARED' or tr.phase~='MAYBE_SUBMITTED' or not p or p.id~=q.partId or p.phase~='MAYBE_SUBMITTED' or p.targetKey~=q.outcome.targetKey or p.requestSha256~=q.requestSha256 then return reply(false,'transport_checkpoint_conflict',nil,nil) end",
"   p.outcome=q.outcome;p.finishedAtMs=now;p.phase=q.outcome.status=='UNKNOWN_OUTCOME' and 'RESPONSE_UNCERTAIN' or 'RESPONSE_RECEIVED';tr.lastSubmissionMs=now;tr.cursor=tr.cursor+1",
"   if q.outcome.status=='UNKNOWN_OUTCOME' then tr.phase='STOPPED';tr.outcome='UNKNOWN_OUTCOME';o.status='UNKNOWN_OUTCOME';o.reconciliationStatus='REQUIRED';audit(o,'fixture_response_unknown')",
"   elseif tr.cursor>#tr.parts then local successes=0;for _,x in ipairs(tr.parts) do if x.outcome and x.outcome.status=='SUCCEEDED' then successes=successes+1 end end;tr.phase='COMPLETE';tr.outcome=successes==#tr.parts and 'SUCCEEDED' or (successes==0 and 'FAILED' or 'PARTIALLY_SUCCEEDED');o.status='SIMULATED';o.reconciliationStatus='REQUIRED';audit(o,'fixture_response_complete')",
"   else tr.phase='PREPARED';audit(o,'fixture_response_received') end",
"  elseif q.action=='transport_recover' then",
"   if o.status~='PREPARED' then return reply(false,'transport_not_recoverable',nil,nil) end",
"   if p and p.phase=='MAYBE_SUBMITTED' then p.phase='RESPONSE_UNCERTAIN';p.finishedAtMs=now;tr.lastSubmissionMs=now;tr.outcome='UNKNOWN_OUTCOME';o.status='UNKNOWN_OUTCOME' else tr.outcome=tr.cursor==1 and 'NOT_SUBMITTED' or 'RECONCILIATION_REQUIRED';o.status='RECONCILIATION_REQUIRED' end",
"   tr.phase='STOPPED';o.reconciliationStatus='REQUIRED';audit(o,'transport_recovered_without_retry')",
"  elseif q.action=='transport_reconcile' then",
"   if o.status~='SIMULATED' and o.status~='UNKNOWN_OUTCOME' and o.status~='RECONCILIATION_REQUIRED' then return reply(false,'transport_not_reconcilable',nil,nil) end",
"   if q.readbackNewestMs>now or now-q.readbackOldestMs>900000 or q.readbackOldestMs<(tr.lastSubmissionMs or tr.preparedAtMs) then return reply(false,'reconciliation_evidence_stale',nil,nil) end",
"   tr.reconciliation=q.reconciliation;tr.reconciledAtMs=now;tr.phase='RECONCILED';o.reconciliationStatus='REQUIRED'",
"   if o.status=='SIMULATED' and tr.outcome=='SUCCEEDED' and q.reconciliation.ok==true then o.status='RESOLVED';o.reconciliationStatus='SIMULATION_RESOLVED';for _,t in ipairs(o.targetRefs) do fields['t:'..t]='' end else o.status='RECONCILIATION_REQUIRED' end;audit(o,'fixture_reconciliation_recorded')",
"  else return reply(false,'invalid_transport_action',nil,nil) end",
" end",
" o.revision=o.revision+1;fields['o:'..o.id]=cjson.encode(o);if not put(fields) then return reply(false,'ledger_capacity',nil,nil) end;return reply(true,'transport_checkpoint_saved',nil,o)",
"end",
"if q.action=='operation_get' or q.action=='transition' then",
" local o=load('o:'..q.id); if not o or o.scopeHash~=q.binding.scopeHash then return reply(false,'operation_not_found',nil,nil) end",
" if q.action=='operation_get' then return reply(true,'found',nil,o) end",
" if o.transport then return reply(false,'transport_checkpoint_required',nil,nil) end",
" if o.bindingSha256~=q.binding.bindingSha256 then return reply(false,'operation_binding_mismatch',nil,nil) end",
" if o.revision~=q.revision then return reply(false,'revision_conflict',nil,nil) end",
" local graph={RESERVED={PREPARED=true,EXECUTION_BLOCKED=true,CANCELLED=true,UNKNOWN_OUTCOME=true},PREPARED={SIMULATED=true,EXECUTION_BLOCKED=true,CANCELLED=true,UNKNOWN_OUTCOME=true},EXECUTION_BLOCKED={CANCELLED=true},SIMULATED={RESOLVED=true},UNKNOWN_OUTCOME={RECONCILIATION_REQUIRED=true}}",
" if not graph[o.status] or not graph[o.status][q.next] then return reply(false,'invalid_operation_transition',nil,nil) end",
" local fields={};o.status=q.next;o.revision=o.revision+1;o.reconciliationStatus=(q.next=='UNKNOWN_OUTCOME' or q.next=='RECONCILIATION_REQUIRED') and 'REQUIRED' or (q.next=='RESOLVED' and 'SIMULATION_RESOLVED' or 'NOT_REQUIRED');audit(o,'operation_'..q.next)",
" if q.next=='CANCELLED' or q.next=='RESOLVED' then for _,t in ipairs(o.targetRefs) do if redis.call('HGET',key,'t:'..t)~=o.id then return reply(false,'target_ownership_conflict',nil,nil) end;fields['t:'..t]='' end end",
" fields['o:'..o.id]=cjson.encode(o);if not put(fields) then return reply(false,'ledger_capacity',nil,nil) end;return reply(true,'transitioned',nil,o)",
"end",
"local a=load('a:'..q.id)",
"if not a or a.scopeHash~=q.binding.scopeHash then return reply(false,'approval_not_found',nil,nil) end",
"if a.status=='CONSUMED' then if q.action=='get' then return reply(true,'found',a,nil) end;return deny(a,'approval_already_consumed') end",
"if a.status=='AWAITING_CONFIRMATION' or a.status=='CONFIRMED' then if now>=a.expiresAtMs then a.status='EXPIRED';a.revision=a.revision+1;audit(a,'approval_expired');if not save(a) then return reply(false,'ledger_capacity',nil,nil) end end end",
"if q.action=='get' then return reply(true,'found',a,nil) end",
"if a.revision~=q.revision then return deny(a,'revision_conflict') end",
"if a.status~='AWAITING_CONFIRMATION' and a.status~='CONFIRMED' then return deny(a,'approval_'..string.lower(a.status)) end",
"if q.action=='revoke' then a.status='REVOKED';a.revision=a.revision+1;audit(a,'approval_revoked');if not save(a) then return reply(false,'ledger_capacity',nil,nil) end;return reply(true,'revoked',a,nil) end",
"if a.binding.bindingSha256~=q.binding.bindingSha256 or not fresh(q.binding) then a.status='SUPERSEDED';a.revision=a.revision+1;audit(a,'evidence_or_content_changed');if not save(a) then return reply(false,'ledger_capacity',nil,nil) end;return reply(false,'revalidation_required',a,nil) end",
"if q.action=='confirm' then if a.status~='AWAITING_CONFIRMATION' then return deny(a,'already_confirmed') end;a.status='CONFIRMED';a.confirmedAtMs=now;a.revision=a.revision+1;audit(a,'review_confirmed');if not save(a) then return reply(false,'ledger_capacity',nil,nil) end;return reply(true,'confirmed',a,nil) end",
"if q.action~='reserve' or a.status~='CONFIRMED' then return deny(a,'approval_not_confirmed') end",
"if redis.call('HEXISTS',key,'i:'..a.binding.operationKey)==1 then return deny(a,'duplicate_operation') end",
"for _,t in ipairs(a.binding.targetRefs) do local owner=redis.call('HGET',key,'t:'..t);if owner and owner~='' then return deny(a,'target_conflict') end end",
"if load('o:'..q.operationId) then return deny(a,'operation_id_conflict') end",
"local o={id=q.operationId,schemaVersion=q.operationSchema,approvalId=a.id,scope=a.scope,scopeHash=a.scopeHash,operationKey=a.binding.operationKey,targetRefs=a.binding.targetRefs,targets=a.binding.targets,templateId=a.binding.templateId,action=a.binding.action,contentSha256=a.binding.contentSha256,evidenceSha256=a.binding.evidenceSha256,targetsSha256=a.binding.targetsSha256,bindingSha256=a.binding.bindingSha256,ruleRevision=a.binding.ruleRevision,validationRuleVersion=a.binding.validationRuleVersion,status='RESERVED',revision=1,createdAtMs=now,reconciliationStatus='NOT_REQUIRED',externalReference=cjson.null,errorCode=cjson.null,resultReference=cjson.null,simulation=true,executionAuthorized=false,operationalEnabled=false,uploadVerified=false,releaseEligible=false,evidenceAuthenticated=false}",
"a.status='CONSUMED';a.revision=a.revision+1;a.consumedAtMs=now;a.operationId=o.id;a.usageReference=o.id;audit(a,'approval_consumed_and_reserved');audit(o,'simulation_reserved')",
"local fields={['a:'..a.id]=cjson.encode(a),['o:'..o.id]=cjson.encode(o),['i:'..o.operationKey]=o.id};for _,t in ipairs(o.targetRefs) do fields['t:'..t]=o.id end",
"if not put(fields) then return reply(false,'ledger_capacity',nil,nil) end;return reply(true,'reserved',a,o)"
].join('\n');

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reference=/^(review|sim):[a-f0-9-]{36}$/i;
const fail=code=>Object.assign(new Error(code),{code});
export function createSimulationLedger(command,{namespace}={}){
 if(typeof command!=='function'||!uuid.test(namespace||''))throw fail('isolated_test_namespace_required');
 async function run(binding,action,fields={}){
  assertSimulationBinding(binding);
  if(fields.id&&!reference.test(fields.id))throw fail('invalid_reference');
  if(fields.revision!==undefined&&(!Number.isSafeInteger(fields.revision)||fields.revision<1))throw fail('invalid_revision');
  const key='elyon:commerce:v2.3:simulation:'+namespace+':'+binding.accountHash;
  const payload=JSON.stringify({action,binding,...fields});
  if(Buffer.byteLength(payload)>128*1024)throw fail('ledger_payload_too_large');
  let result;
  try{
   const response=await command(['EVAL',RESERVATION_LUA,1,key,payload]);
   const raw=response?.result??response;
   result=typeof raw==='string'?JSON.parse(raw):raw;
   if(!result||typeof result.ok!=='boolean'||result.simulation!==true||
    Object.keys(disabledFlags).some(k=>result[k]!==false))throw Error('unexpected ledger result');
  }catch{throw fail('ledger_unavailable_outcome_unknown');}
  return result;
 }

 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
 function makePlan(binding,operation){
  if(!operation||operation.simulation!==true||operation.bindingSha256!==binding.bindingSha256||
   ['scopeHash','operationKey','contentSha256','targetsSha256','evidenceSha256'].some(k=>operation[k]!==binding[k])||
   Object.keys(disabledFlags).some(k=>operation[k]!==false))throw fail('reserved_binding_required');
  const parts=inventoryRequestParts(binding);
  const manifest=parts.map(p=>({id:p.id,targetKey:p.targetKey,requestSha256:p.requestSha256,sku:p.target.sku,offerId:p.target.offerId,listingId:p.target.listingId}));
  return freeze({schemaVersion:TRANSPORT_SCHEMA,operationId:operation.id,approvalId:operation.approvalId,operationKey:binding.operationKey,
   bindingSha256:binding.bindingSha256,scope:binding.scope,templateId:binding.templateId,action:binding.action,
   transport:'Inventory API',method:'bulkUpdatePriceQuantity',maxSkuPerRequest:1,parts,
   manifest:{schemaVersion:TRANSPORT_SCHEMA,planSha256:hash([operation.id,binding.bindingSha256,manifest]),requestSha256:hash(parts.map(p=>p.requestSha256)),parts:manifest},
   prerequisites:['authenticated_account','fresh_offer_and_supplier_readback','canonical_revision','inventory_quantity_semantics','production_redis_guarantees'],
   simulation:true,retryAllowed:false,...disabledFlags});
 }
 function times(readback,preflight){
  const values=readback.rows.flatMap(r=>[Date.parse(r.checkedAt),...(preflight?[Date.parse(r.supplier?.checkedAt)]:[])]);
  if(!values.length||values.some(v=>!Number.isFinite(v)))throw fail('invalid_readback_time');
  return {readbackOldestMs:Math.min(...values),readbackNewestMs:Math.max(...values)};
 }
 async function prepareTransport(binding,id,readback){
  const prior=await run(binding,'operation_get',{id});
  if(!prior.ok)return prior;
  if(prior.operation.status!=='RESERVED'||prior.operation.transport)return {ok:false,code:'transport_already_initialized',simulation:true,...disabledFlags};
  const checked=inspectTransportReadback(binding,readback,{preflight:true});
  if(!checked.ok)return {ok:false,code:'revalidation_required',readback:checked,simulation:true,...disabledFlags};
  const plan=makePlan(binding,prior.operation);
  const result=await run(binding,'transport_init',{id,revision:prior.operation.revision,manifest:plan.manifest,...times(readback,true)});
  return result.ok?freeze({...result,plan}):result;
 }
 async function simulateTransport(binding,id,readback,fixtures){
  // No injected executable callback, no real transport. Fixtures are bounded
  // plain JSON supplied by tests. Never resume submission on a second call.
  if(!Array.isArray(fixtures)||fixtures.length>50)throw fail('invalid_fixture_batch');
  const serialized=JSON.stringify(fixtures);
  if(Buffer.byteLength(serialized)>128*1024)throw fail('fixture_batch_too_large');
  const inputs=JSON.parse(serialized);
  const prepared=await prepareTransport(binding,id,readback);
  if(!prepared.ok)return prepared;
  let o=prepared.operation;const plan=prepared.plan;
  for(let i=0;i<plan.parts.length;i++){
   const p=plan.parts[i],fixture=inputs[i];
   if(fixture?.simulation===true&&fixture.kind==='before_send'){
    return run(binding,'transport_recover',{id,revision:o.revision,planSha256:plan.manifest.planSha256});
   }
   const started=await run(binding,'transport_begin',{id,revision:o.revision,planSha256:plan.manifest.planSha256,partId:p.id});
   if(!started.ok)return started;
   o=started.operation;
   const outcome=normalizeInventoryFixtureResult(binding,p.id,fixture);
   const saved=await run(binding,'transport_record',{id,revision:o.revision,planSha256:plan.manifest.planSha256,partId:p.id,requestSha256:p.requestSha256,outcome});
   if(!saved.ok)return saved;
   o=saved.operation;
   if(outcome.status==='UNKNOWN_OUTCOME')break;
  }
  return {ok:true,code:'simulation_checkpointed',operation:o,simulation:true,...disabledFlags};
 }
 async function recoverTransport(binding,id){
  const p=await run(binding,'operation_get',{id});if(!p.ok)return p;
  const plan=makePlan(binding,p.operation);
  return run(binding,'transport_recover',{id,revision:p.operation.revision,planSha256:plan.manifest.planSha256});
 }
 async function reconcileTransport(binding,id,readback){
  const p=await run(binding,'operation_get',{id});if(!p.ok)return p;
  const o=p.operation,plan=makePlan(binding,o);
  if(!o.transport)return {ok:false,code:'transport_not_initialized',simulation:true,...disabledFlags};
  const checked=inspectTransportReadback(binding,readback,{notBefore:o.transport.lastSubmissionMs??o.transport.preparedAtMs});
  // Do not discard diagnostic rows with identity/missing/stale errors. They
  // cannot resolve anything. Record using server receipt time if no complete
  // timestamp set, but never claim valid evidence in that case.
  let timing;try{timing=times(readback,false);}catch{return {ok:false,code:'reconciliation_evidence_missing',readback:checked,simulation:true,...disabledFlags};}
  return run(binding,'transport_reconcile',{id,revision:o.revision,planSha256:plan.manifest.planSha256,reconciliation:checked,...timing});
 }

 return Object.freeze({
  prepareTransport,simulateTransport,recoverTransport,reconcileTransport,
  create:(binding,{ttlMs=900000}={})=>{if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>900000)throw fail('invalid_review_ttl');return run(binding,'create',{id:newReviewId(),ttlMs});},
  get:(binding,id)=>run(binding,'get',{id}),
  confirm:(binding,id,revision)=>run(binding,'confirm',{id,revision}),
  revoke:(binding,id,revision)=>run(binding,'revoke',{id,revision}),
  reserve:(binding,id,revision)=>run(binding,'reserve',{id,revision,operationId:newOperationId(),operationSchema:OPERATION_SCHEMA}),
  getOperation:(binding,id)=>run(binding,'operation_get',{id}),
  transition:(binding,id,revision,next)=>run(binding,'transition',{id,revision,next}),
 });
}
