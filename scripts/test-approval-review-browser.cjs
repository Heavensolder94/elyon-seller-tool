// Actual Chromium/Electron browser regression; uses the existing dev dependency.
// All API data is synthetic and the renderer cannot reach any external origin.
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

const root=path.resolve(__dirname,'..');
const assets=new Set(['seller-selling-flow-core.js','seller-auto-lister-parity-core.js','seller-auto-lister-parity.js','seller-ebay-production-readiness.js']);
const id='fixture-product-1',other='fixture-product-2',flags={executionAuthorized:false,publishAuthorized:false,automaticApprovalAllowed:false,liveEnabled:false};
const requests=[];
const recoveryFlags={executionAuthorized:false,publishAuthorized:false,automaticRetryAllowed:false,reservationReleaseAllowed:false,externalStateVerified:false,sellerHubDraftVerified:false};
let responsePatch={},recoveryPatch={},feedPatch={},held=null,release=null;
const fixture=id=>({id,companyOsProductId:id,rawServerProduct:{id,identity:{productId:id},title:'Synthetic fixture',description:'Synthetic review data only',listing:{title:'Synthetic fixture',descriptionHtml:'<p>Fixture</p>',categoryId:'31519',conditionId:'1000',itemSpecifics:{Material:['Aluminium']}},pricing:{salePrice:25},readiness:{state:'ready_for_manual_listing',score:100,blockers:[]}}});
const html='<!doctype html><meta charset="utf-8"><div id="sellerAutoListerRoot"><input id="sellerAutoTitle" value="Fixture"><textarea id="sellerAutoSpecifics">{}</textarea><aside></aside></div><script>localStorage.setItem("elyonProducts",JSON.stringify('+JSON.stringify([fixture(id),fixture(other)])+'));localStorage.setItem("elyonSelectedSellerProductId",'+JSON.stringify(id)+');</script><script type="module" src="/seller-auto-lister-parity.js"></script><script src="/seller-ebay-production-readiness.js" defer></script>';
let origin;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(html);return;}
  if(assets.has(url.pathname.slice(1))){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'}).end(await readFile(path.join(root,url.pathname.slice(1))));return;}
  if(url.pathname.startsWith('/api/')){
   requests.push({path:url.pathname,method:req.method,query:Object.fromEntries(url.searchParams)});
   if(req.method!=='GET'||url.pathname!=='/api/products/ebay-draft'||url.searchParams.get('approvalReview')!=='1'){res.writeHead(403).end();return;}
   const productId=url.searchParams.get('productId');
   const {draftApprovalReviewText}=await import('../lib/product-master-consumer.js');
   const recoveryPreparation={schemaVersion:'elyon-recovery-review-v4.4.2',productId,articleNumber:'ELY-000001',canonicalJournalAvailable:false,status:'RECONCILIATION_REQUIRED',reservationState:'HELD',skus:['ELY-000001'],historicalOfferIds:[],...recoveryFlags,feedRecovery:{schemaVersion:'elyon-feed-recovery-review-v4.4.2',canonicalJournalAvailable:false,status:'MANUAL_REVIEW_REQUIRED',taskId:'fixture-feed',feedState:'COMPLETED',...recoveryFlags,...feedPatch},...recoveryPatch};
   const summary={recoveryPreparation,...flags,status:'BLOCKED',approvalId:null,productRevision:2,listingRevision:3,transport:'INVENTORY',riskClass:'STANDARD_REVIEW',selectedSkus:['ELY-000001'],blockers:['PRODUCTIVE_APPROVAL_DISABLED'],expiresAtMs:null,auditRef:null};
   const payload={schemaVersion:'elyon-seller-approval-review-v4.4.1',productId,summary,displayText:draftApprovalReviewText(summary),...flags,...responsePatch};
   if(held){const wait=held;held=null;await wait;}
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(payload));return;
  }
  res.writeHead(404).end();
 }catch(e){res.writeHead(500).end();console.error(e);}
});
const wait=async(fn,ms=8000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Browser condition timed out');};
async function main(){
 await app.whenReady();await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const isolated=session.fromPartition('v441-seller-fixture');
 isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')}));
 const win=new BrowserWindow({show:false,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true}});
 const run=js=>win.webContents.executeJavaScript(js,true);
 try{
  await win.loadURL(origin+'/');
  await wait(()=>run('Boolean(document.getElementById("salpApprovalReview")&&document.getElementById("elyonEbayDraftBtn"))'));
  await run('document.querySelector("[data-salp-tab=checks]").click()');
  assert.equal(await run('document.getElementById("elyonEbayDraftBtn").disabled&&document.getElementById("elyonEbayPublishBtn").disabled'),true);
  await run('for(const id of ["elyonEbayDraftBtn","elyonEbayPublishBtn"]){const b=document.getElementById(id);b.disabled=false;b.click();b.disabled=true;}');
  assert.equal(requests.length,0);
  const click=()=>run('document.getElementById("salpApprovalReview").click()');
  const read=()=>run('document.getElementById("salpApprovalResult").textContent');
  await click();await wait(async()=>/Operative Freigabe blockiert/.test(await read()));
  assert.match(await read(),/Risikoklasse: STANDARD_REVIEW/);assert.match(await read(),/V4.4.2: Abgleich erforderlich/);assert.match(await read(),/Draft nicht verifiziert/);
  for(const patch of [{externalStateVerified:true},{automaticRetryAllowed:true},{reservationReleaseAllowed:true},{status:'RECOVERED'}]){recoveryPatch=patch;await click();await wait(async()=>/Ungültiger Recovery-Vertrag/.test(await read())&&await run('!document.getElementById("salpApprovalReview").disabled'));}recoveryPatch={};
  for(const patch of [{sellerHubDraftVerified:true},{automaticRetryAllowed:true},{status:'DRAFT_VERIFIED'}]){feedPatch=patch;await click();await wait(async()=>/Ungültiger Recovery-Vertrag/.test(await read())&&await run('!document.getElementById("salpApprovalReview").disabled'));}feedPatch={};
  for(const patch of [{executionAuthorized:true},{productId:'foreign'},{summary:{...flags,status:'APPROVED',approvalId:null}},{summary:{...flags,status:'BLOCKED',approvalId:'forged'}}]){
   responsePatch=patch;await click();await wait(async()=>/Ungültiger Freigabevertrag/.test(await read())&&await run('!document.getElementById("salpApprovalReview").disabled'));
  }
  responsePatch={};const before=requests.length;
  held=new Promise(r=>{release=r;});await click();await wait(()=>requests.length===before+1);
  await run('localStorage.setItem("elyonSelectedSellerProductId",'+JSON.stringify(other)+');window.ElyonSellerAutoListerParity.mount();');
  release();await new Promise(r=>setTimeout(r,100));
  assert.match(await read(),/Keine operative Freigabe/);
  assert.ok(requests.every(x=>x.method==='GET'&&x.path==='/api/products/ebay-draft'));
  console.log('V4.4.1 Seller Auto Lister Chromium read-only approval regression passed');
 }finally{win.destroy();await new Promise(r=>server.close(r));}
}
main().then(()=>app.exit(0),e=>{console.error(e);app.exit(1);});
