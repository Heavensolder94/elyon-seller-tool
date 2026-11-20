import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptCostProposal } from '../seller-finance-core.js';
import { mergeFinanceState, writeFinanceState, readFinanceState } from '../lib/finance-store.js';
import handler from '../internal/finance/index.js';
import { createHash } from 'node:crypto';

const receipt = () => ({ id:'doc1', sha256:'a'.repeat(64), cloudFileId:'test-cloud-file', documentType:'supplier_invoice', supplier:'Sample Supply', invoiceReference:'INV-42', documentDate:'2026-11-01', paymentDate:'2026-11-03', amount:'10.00', currency:'EUR' });
const allocations = () => [{orderId:'123-456',itemId:'ELY-000001',amount:'4.99'},{orderId:'123-789',itemId:'ELY-000002',amount:'5.01'}];

test('receipt allocations preserve cents, payment date and documentary provenance', () => {
 const result=buildReceiptCostProposal(receipt(),allocations(),[],[receipt()],{});
 assert.equal(result.ok,true); assert.equal(result.allocations.length,2);
 assert.equal(result.allocations.reduce((sum,r)=>sum+Math.round(r.amount*100),0),-1000);
 assert.equal(result.allocations[0].transactionDate,'2026-11-03');
 assert.equal(result.allocations[0].status,'needs_review');
 assert.equal(result.allocations[1].supplierReceipt.documentId,'doc1');
 assert.equal(result.allocations[0].source,'supplier_receipt_verified');
});

test('missing evidence, invalid allocations, closed months and foreign currency fail closed', () => {
 for (const doc of [{...receipt(),cloudFileId:''},{...receipt(),currency:'USD'},{...receipt(),paymentDate:''},{...receipt(),documentType:'order_confirmation'},{...receipt(),paymentDate:'2026-02-30'}]) assert.equal(buildReceiptCostProposal(doc,allocations(),[],[doc],{}).ok,false);
 assert.equal(buildReceiptCostProposal(receipt(),[{orderId:'123-456',amount:'9.99'}],[],[receipt()],{}).ok,false);
 assert.equal(buildReceiptCostProposal(receipt(),allocations(),[],[receipt()],{'2026-11':{closedAt:'2026-12-01'}}).ok,false);
 const mismatched={...receipt(),receiptLineItemsV1:[{title:'Item',quantity:1,amount:'8.00'}],receiptShippingAmountV1:'1.00'};
 assert.equal(buildReceiptCostProposal(mismatched,allocations(),[],[mismatched],{}).ok,false);
 const matching={...receipt(),receiptLineItemsV1:[{title:'Item',quantity:1,amount:'8.00'}],receiptShippingAmountV1:'2.00'};
 assert.equal(buildReceiptCostProposal(matching,allocations(),[],[matching],{}).ok,true);
});

test('duplicate detection works by document, bytes, and frozen supplier reference even after metadata changes', () => {
 const doc=receipt(); const first=buildReceiptCostProposal(doc,allocations(),[],[doc],{}).allocations;
 assert.equal(buildReceiptCostProposal(doc,allocations(),first,[doc],{}).ok,false);
 const sameFile={...doc,id:'different'};
 assert.equal(buildReceiptCostProposal(sameFile,allocations(),first,[sameFile],{}).ok,false);
 const sameInvoice={...doc,id:'different',sha256:'b'.repeat(64)};
 assert.equal(buildReceiptCostProposal(sameInvoice,allocations(),first,[sameInvoice],{}).ok,false);
});

test('ordinary sync cannot create verified allocations or change recorded amounts, references and provenance', () => {
 const doc=receipt(); const rows=buildReceiptCostProposal(doc,allocations(),[],[doc],{}).allocations;
 const injected=mergeFinanceState({}, {transactions:rows}).state;
 assert.equal(injected.transactions.length,0);
 const created=mergeFinanceState({}, {transactions:rows},{},{allowReceiptCosts:true}).state;
 const changed=rows.map(x=>({...x,amount:-0.01,orderId:'fake-order',supplierReceipt:{sha256:'fake'},status:'approved'}));
 const after=mergeFinanceState(created,{transactions:changed}).state;
 assert.equal(after.transactions.length,2);
 const row=after.transactions.find(x=>x.transactionId===rows[0].transactionId);
 assert.equal(row.amount,-4.99); assert.equal(row.orderId,'123-456'); assert.equal(row.supplierReceipt.sha256,doc.sha256); assert.equal(row.status,'approved');
});

test('server action rejects parallel and repeat recording without duplicate costs', async () => {
 const envNames=['ELYON_FINANCE_STORE_MODE','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ELYON_SELLER_ACCESS_TOKEN','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_DRIVE_BACKUP_FOLDER_ID'];
 const before=Object.fromEntries(envNames.map(k=>[k,process.env[k]])); const oldFetch=globalThis.fetch;
 Object.assign(process.env,{ELYON_FINANCE_STORE_MODE:'upstash',UPSTASH_REDIS_REST_URL:'https://example.invalid',UPSTASH_REDIS_REST_TOKEN:'test',ELYON_SELLER_ACCESS_TOKEN:'synthetic-token',GOOGLE_CLIENT_ID:'test-id',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_DRIVE_BACKUP_FOLDER_ID:'test-folder'});
 const bytes=Buffer.from('synthetic original'); const doc={...receipt(),id:'doc_synthetic123',cloudFileId:'testCloudFileId123',sha256:createHash('sha256').update(bytes).digest('hex')};
 let saved=null; let driveOK=true; const result=value=>({ok:true,json:async()=>({result:value})});
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target.includes('oauth2.googleapis.com/token')) return {ok:true,json:async()=>({access_token:'test-access'})};
  if(target.includes('drive/v3/files/') && target.includes('alt=media')) return {ok:driveOK,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  if(target.includes('drive/v3/files/')) return {ok:driveOK,json:async()=>({size:String(bytes.length),parents:['test-folder'],appProperties:{elyonFinanceDocument:'true',documentId:doc.id,sha256:doc.sha256}})};
  if(!options.method || options.method==='GET')return result(saved);
  const args=JSON.parse(options.body); assert.equal(args[0],'EVAL');
  const revision=JSON.parse(saved || '{"revision":0}').revision;
  if(revision!==Number(args[4]))return result(0);
  saved=args[5]; return result(1);
 };
 const request=revision=>({method:'POST',query:{action:'record-receipt-costs'},headers:{'x-elyon-seller-token':'synthetic-token',host:'localhost',cookie:'elyon_google_drive_refresh_token=test-refresh'},body:{expectedRevision:revision,documentId:doc.id,allocations:allocations()}});
 const response=()=>({status(code){this.code=code;return this},setHeader(){return this},json(body){this.body=body;return this}});
 try {
  const init=await writeFinanceState({documents:[doc]},{},{expectedRevision:0}); assert.equal(init.ok,true);
  driveOK=false; const unavailable=response(); await handler(request(1),unavailable); assert.equal(unavailable.code,503); assert.equal((await readFinanceState()).transactions.length,0);
  driveOK=true; const a=response(),b=response(); await Promise.all([handler(request(1),a),handler(request(1),b)]);
  assert.deepEqual([a.code,b.code].sort(),[200,409]);
  const state=await readFinanceState(); assert.equal(state.transactions.length,2);
  const repeat=response(); await handler(request(state.revision),repeat); assert.equal(repeat.code,409);
  assert.equal((await readFinanceState()).transactions.length,2);
 } finally {
  globalThis.fetch=oldFetch;
  for(const k of envNames) before[k]===undefined ? delete process.env[k] : process.env[k]=before[k];
 }
});
