import crypto from 'node:crypto';
const COMPANY='https://elyon-company-os.vercel.app',SELLER='https://elyonsellertool.vercel.app';
const SESSION='__Host-elyon_seller_operator',PENDING='__Host-elyon_operator_handoff';
const flags={executionAuthorized:false,publishAuthorized:false,automaticApprovalAllowed:false,liveEnabled:false};
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const random=()=>crypto.randomBytes(32).toString('base64url');
const hash=v=>crypto.createHash('sha256').update(v).digest('base64url');
const eq=(a,b)=>token(a)&&token(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fail=(code,status=403)=>{throw Object.assign(Error(code),{code,status});};
const check=(v,code,status)=>{if(!v)fail(code,status);};
const cookie=(name,value,age)=>name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age;
function readCookie(req,name){
 const matches=String(req?.headers?.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
 return matches.length===1?matches[0].slice(name.length+1):null;
}
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
export async function handleSellerOperator(req,res,{env=process.env,fetchImpl=fetch}={}){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 try{
  check(env.VERCEL_ENV==='production'&&env.ELYON_OPERATOR_AUTH_ENABLED==='1','operator_not_configured',503);
  check(req.method==='POST'&&req.query?.operator==='1'&&Object.keys(req.query).length===1,'operator_request_invalid',422);
  check(req.headers?.origin===SELLER,'operator_origin_denied');
  const secret=String(env.ELYON_BRIDGE_SECRET||env.ELYON_COMPANY_OS_BRIDGE_SECRET||'').trim();
  check(secret,'operator_bridge_not_configured',503);
  let b=req.body;if(typeof b==='string'){check(Buffer.byteLength(b)<=4096,'operator_request_invalid',422);try{b=JSON.parse(b);}catch{fail('operator_request_invalid',422);}}
  check(b&&typeof b==='object'&&Buffer.byteLength(JSON.stringify(b))<=4096,'operator_request_invalid',422);
  const actions={begin:['action'],exchange:['action','code','state'],status:['action'],logout:['action']};check(Object.hasOwn(actions,b.action)&&exact(b,actions[b.action]),'operator_request_invalid',422);
  const upstream=async body=>{
   const r=await fetchImpl(COMPANY+'/api/product-master-v2?operatorAuth=1',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-Elyon-Bridge-Secret':secret},body:JSON.stringify(body)});
   const d=await r.json();check(r.ok&&d.ok===true&&Object.keys(flags).every(k=>d[k]===false),'operator_central_unavailable',r.status===403?403:503);return d;
  };
  const view=v=>{
   check(v?.schemaVersion==='elyon-operator-v1'&&typeof v.authenticated==='boolean'&&Object.keys(flags).every(k=>v[k]===false),'operator_central_contract_invalid',503);
   if(v.authenticated)check(token(v.actorId)&&/^elyon_company_os:[a-f0-9]{32}$/.test(v.workspaceId||'')&&Number.isSafeInteger(v.expiresAtMs)&&v.expiresAtMs>Date.now()&&v.expiresAtMs<=Date.now()+900000,'operator_central_contract_invalid',503);
   return {schemaVersion:v.schemaVersion,authenticated:v.authenticated,actorId:v.authenticated?v.actorId:null,expiresAtMs:v.authenticated?v.expiresAtMs:null,accountBound:v.authenticated&&!!v.account,...flags};
  };
  let data;
  switch(b.action){
   case 'begin':{const verifier=random(),state=random();res.setHeader('Set-Cookie',cookie(PENDING,verifier+'.'+state,900));data={url:COMPANY+'/operator-auth.html#'+new URLSearchParams({pkce:hash(verifier),state})};break;}
   case 'exchange':{
    const raw=readCookie(req,PENDING),parts=raw?.split('.')??[],[verifier,state]=parts;
    res.setHeader('Set-Cookie',cookie(PENDING,'',0));
    check(parts.length===2&&token(verifier)&&eq(state,b.state)&&token(b.code),'operator_handoff_invalid');
    const d=await upstream({action:'seller_exchange',code:b.code,verifier,state});
    const v=view(d.view);check(v.authenticated&&token(d.value)&&Number.isSafeInteger(d.age)&&d.age>0&&d.age<=900,'operator_central_contract_invalid',503);
    res.setHeader('Set-Cookie',[cookie(PENDING,'',0),cookie(SESSION,d.value,d.age)]);data=v;break;
   }
   case 'status':{const session=readCookie(req,SESSION);data=token(session)?view(await upstream({action:'seller_status',session})): {authenticated:false,...flags};break;}
   case 'logout':{const session=readCookie(req,SESSION);if(token(session))await upstream({action:'seller_logout',session});res.setHeader('Set-Cookie',cookie(SESSION,'',0));data={authenticated:false};break;}
  }
  return res.status(200).json({ok:true,...data,...flags});
 }catch(e){return res.status(Number(e?.status||500)).json({ok:false,error:typeof e?.code==='string'&&/^operator_[a-z_]+$/.test(e.code)?e.code:'operator_request_failed',...flags});}
}
