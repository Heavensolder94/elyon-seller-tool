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
"if q.action=='operation_get' or q.action=='transition' then",
" local o=load('o:'..q.id); if not o or o.scopeHash~=q.binding.scopeHash then return reply(false,'operation_not_found',nil,nil) end",
" if q.action=='operation_get' then return reply(true,'found',nil,o) end",
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
 return Object.freeze({
  create:(binding,{ttlMs=900000}={})=>{if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>900000)throw fail('invalid_review_ttl');return run(binding,'create',{id:newReviewId(),ttlMs});},
  get:(binding,id)=>run(binding,'get',{id}),
  confirm:(binding,id,revision)=>run(binding,'confirm',{id,revision}),
  revoke:(binding,id,revision)=>run(binding,'revoke',{id,revision}),
  reserve:(binding,id,revision)=>run(binding,'reserve',{id,revision,operationId:newOperationId(),operationSchema:OPERATION_SCHEMA}),
  getOperation:(binding,id)=>run(binding,'operation_get',{id}),
  transition:(binding,id,revision,next)=>run(binding,'transition',{id,revision,next}),
 });
}
