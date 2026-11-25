import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {handleSellerOperator} from '../lib/operator-auth.js';
const origin='https://elyonsellertool.vercel.app',company='https://elyon-company-os.vercel.app';
const flags={executionAuthorized:false,publishAuthorized:false,automaticApprovalAllowed:false,liveEnabled:false};
const env={VERCEL_ENV:'production',ELYON_OPERATOR_AUTH_ENABLED:'1',ELYON_BRIDGE_SECRET:'fixture-bridge'};
const rand=()=>randomBytes(32).toString('base64url');
const actor=rand(),session=rand();
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;}};}
const view={schemaVersion:'elyon-operator-v1',authenticated:true,actorId:actor,workspaceId:'elyon_company_os:'+'a'.repeat(32),expiresAtMs:Date.now()+600000,account:{fingerprint:'a'.repeat(16)},...flags};
async function req(body,{cookie='',requestOrigin=origin,config=env,fetchImpl=async()=>assert.fail('unexpected upstream call')}={}){
 const res=response();await handleSellerOperator({method:'POST',query:{operator:'1'},headers:{origin:requestOrigin,cookie},body},res,{env:config,fetchImpl});return res;
}
test('Seller Operator is disabled in preview, rejects cross-origin requests and never accepts shared code as identity',async()=>{
 assert.equal((await req({action:'begin'},{config:{...env,VERCEL_ENV:'preview'}})).code,503);
 assert.equal((await req({action:'begin'},{requestOrigin:'https://foreign.invalid'})).code,403);
 assert.equal((await req({action:'status',actorId:actor})).code,422);
 assert.equal((await req({action:'status'},{cookie:'elyon_seller_session=shared'})).data.authenticated,false);
});
test('Seller Operator uses host-only PKCE cookies and central verification; token never returned to browser JSON',async()=>{
 const begin=await req({action:'begin'});assert.equal(begin.code,200);
 const url=new URL(begin.data.url);assert.equal(url.origin,company);assert.equal(url.pathname,'/operator-auth.html');assert.equal(url.search,'');
 const [cookie,...attributes]=begin.headers['Set-Cookie'].split('; ');assert.ok(attributes.includes('HttpOnly'));assert.ok(attributes.includes('Secure'));assert.ok(attributes.includes('SameSite=Strict'));
 const [verifier,state]=cookie.slice(cookie.indexOf('=')+1).split('.'),query=new URLSearchParams(url.hash.slice(1));
 assert.equal(query.get('pkce'),createHash('sha256').update(verifier).digest('base64url'));assert.equal(query.get('state'),state);assert.ok(!begin.data.url.includes(verifier));
 const code=rand();
 assert.equal((await req({action:'exchange',code,state:rand()},{cookie})).code,403);
 let calls=0,revoked=false;
 const fetchImpl=async(url,init)=>{calls++;assert.equal(url,company+'/api/product-master-v2?operatorAuth=1');assert.equal(init.redirect,'error');assert.equal(init.headers['X-Elyon-Bridge-Secret'],env.ELYON_BRIDGE_SECRET);
 const b=JSON.parse(init.body);
 if(b.action==='seller_exchange'){assert.deepEqual(b,{action:'seller_exchange',code,verifier,state});return Response.json({ok:true,value:session,age:600,view,...flags});}
 assert.equal(b.session,session);
 if(b.action==='seller_logout'){revoked=true;return Response.json({ok:true,...flags});}
 assert.equal(b.action,'seller_status');return Response.json({ok:true,...view,authenticated:!revoked,...flags});
 };
 const exchange=await req({action:'exchange',code,state},{cookie,fetchImpl});assert.equal(exchange.code,200);assert.equal(exchange.data.actorId,actor);assert.equal(exchange.data.authenticated,true);assert.ok(!JSON.stringify(exchange.data).includes(session));
 assert.equal(exchange.headers['Set-Cookie'].length,2);
 const sessionCookie=exchange.headers['Set-Cookie'][1].split(';')[0];assert.equal(sessionCookie,'__Host-elyon_seller_operator='+session);
 assert.equal((await req({action:'status'},{cookie:sessionCookie,fetchImpl})).data.authenticated,true);
 assert.equal((await req({action:'logout'},{cookie:sessionCookie,fetchImpl})).data.authenticated,false);
 assert.equal((await req({action:'status'},{cookie:sessionCookie,fetchImpl})).data.authenticated,false);assert.equal(calls,4);
 const bad=await req({action:'status'},{cookie:sessionCookie,fetchImpl:async()=>Response.json({ok:true,...view,executionAuthorized:true})});assert.equal(bad.code,503);assert.equal(bad.data.executionAuthorized,false);
});
