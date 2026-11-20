import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupplierRefundProposal, buildReceiptCostProposal, calculateMetrics, selectApprovedEurTransactions, buildEurSummary, exportDatevPreparation, mergeTransactions } from '../seller-finance-core.js';
import { mergeFinanceState, writeFinanceState, readFinanceState } from '../lib/finance-store.js';
import { buildPeriodProfitability, buildMonthCloseReadiness } from '../seller-finance.js';
import handler from '../internal/finance/index.js';
import { createHash } from 'node:crypto';

const purchase=()=>({id:'purchase-1',transactionId:'purchase-1',dedupeKey:'purchase-1',source:'supplier_receipt_verified',category:'supplier_expense',transactionType:'SUPPLIER_PURCHASE',orderId:'123-456',itemId:'SKU-1',currency:'EUR',amount:-10,transactionDate:'2026-11-01T00:00:00.000Z',supplierReceipt:{documentId:'purchase-doc',sha256:'a'.repeat(64),supplier:'Lieferant',invoiceReference:'I-1',allocationCents:1000},status:'approved'});
const proof=()=>({id:'refund-doc',documentType:'refund_proof',sha256:'b'.repeat(64),cloudFileId:'refund-file',supplier:'Lieferant',invoiceReference:'REF-1',currency:'EUR',amount:'3.00',paymentDate:'2026-12-01',documentDate:'2026-11-30'});

test('partial supplier refund links a verified purchase and preserves receipt and payment dates',()=>{
 const result=buildSupplierRefundProposal(proof(),'purchase-1',[purchase()],{});assert.equal(result.ok,true,JSON.stringify(result.errors));
 const row=result.allocations[0];assert.equal(row.amount,3);assert.equal(row.transactionDate,'2026-12-01');assert.equal(row.category,'supplier_refund');assert.equal(row.status,'needs_review');assert.equal(row.supplierReceipt.originalTransactionId,'purchase-1');assert.equal(row.supplierReceipt.originalDocumentId,'purchase-doc');assert.equal(row.supplierReceipt.documentDate,'2026-11-30');
});
test('refund rejects ambiguity, missing proof, duplicate evidence and amounts above the remaining purchase',()=>{
 const purchaseRow=purchase();const accepted=buildSupplierRefundProposal(proof(),'purchase-1',[purchaseRow],{}).allocations[0];
 const cases=[{...proof(),documentType:'supplier_credit'},{...proof(),cloudFileId:''},{...proof(),currency:'USD'},{...proof(),supplier:'Other'},{...proof(),amount:'10.01'},{...proof(),paymentDate:'2026-02-30'},{...proof(),paymentDate:'2026-10-01'},{...proof(),sha256:'a'.repeat(64)}];
 for(const doc of cases)assert.equal(buildSupplierRefundProposal(doc,'purchase-1',[purchaseRow],{}).ok,false);
 assert.equal(buildSupplierRefundProposal(proof(),'purchase-1',[purchaseRow,purchaseRow],{}).ok,false);
 assert.equal(buildSupplierRefundProposal(proof(),'purchase-1',[purchaseRow,accepted],{}).ok,false);
 const newProof={...proof(),id:'second',sha256:'c'.repeat(64),invoiceReference:'REF-2',amount:'7.01'};
 assert.equal(buildSupplierRefundProposal(newProof,'purchase-1',[purchaseRow,accepted],{}).ok,false);
 assert.equal(buildSupplierRefundProposal({...newProof,amount:'7.00'},'purchase-1',[purchaseRow,accepted],{}).ok,true);
 assert.equal(buildSupplierRefundProposal({...newProof,amount:'1.00'},'purchase-1',[purchaseRow,{...accepted,amount:9}],{}).ok,false);
 assert.equal(buildSupplierRefundProposal({...newProof,amount:'1.00'},'purchase-1',[purchaseRow,{...accepted,supplierReceipt:{kind:'refund'}}],{}).ok,false);
 assert.equal(buildSupplierRefundProposal({...newProof,amount:'1.00'},'purchase-1',[purchaseRow],{'2026-12':{closedAt:'2026-12-31'}}).ok,false);
});
test('refund adjusts economic cost but blocks tax exports and month close pending classification',()=>{
 const refund=buildSupplierRefundProposal(proof(),'purchase-1',[purchase()],{}).allocations[0];
 const sale={id:'sale',transactionId:'sale',transactionType:'SALE',category:'revenue',orderId:'123-456',itemId:'SKU-1',amount:30,currency:'EUR',transactionDate:'2026-11-15T12:00:00Z',status:'approved'};
 const rows=[sale,purchase(),{...refund,status:'approved'}];const metrics=calculateMetrics(rows);
 assert.equal(metrics.revenue,30);assert.equal(metrics.supplier,7);assert.equal(metrics.profit,23);
 const view=buildPeriodProfitability(rows,{start:'2026-11-01T00:00:00Z',end:'2026-11-30T23:59:59Z'});
 assert.equal(view.orders[0].profit,23);assert.equal(view.orders[0].supplier,7);assert.equal(view.products[0].costs,7);
 assert.equal(selectApprovedEurTransactions(rows).ready,false);assert.equal(selectApprovedEurTransactions(rows).unclassifiedRefundCount,1);
 assert.throws(()=>exportDatevPreparation(rows));assert.match(buildEurSummary(rows).disclaimer,/nicht enthalten/);
 const disguised={...refund,category:'other_income',status:'approved'};assert.equal(selectApprovedEurTransactions([disguised]).ready,false);assert.throws(()=>exportDatevPreparation([disguised]));assert.match(buildEurSummary([disguised]).disclaimer,/nicht enthalten/);
 assert.equal(buildMonthCloseReadiness([{...refund,status:'approved'}],[proof()]).ready,false);
});
test('regular sync cannot inject or alter a receipt-backed supplier refund',()=>{
 const refund=buildSupplierRefundProposal(proof(),'purchase-1',[purchase()],{}).allocations[0];
 const injected=mergeFinanceState({}, {transactions:[refund]});assert.equal(injected.state.transactions.length,0);
 const merged=mergeTransactions([refund],[{...refund,amount:500,orderId:'other',supplierReceipt:{kind:'refund',allocationCents:50000}}]);
 assert.equal(merged.transactions[0].amount,3);assert.equal(merged.transactions[0].orderId,'123-456');assert.equal(merged.transactions[0].supplierReceipt.allocationCents,300);
 const initial=mergeFinanceState({}, {transactions:[purchase(),refund]}, {}, {allowReceiptCosts:true}).state;
 const attempt=mergeFinanceState(initial,{transactions:initial.transactions.map(row=>({...row,voidedAt:'2026-12-10T12:00:00Z',voidReason:'fake',status:'voided'}))}).state;
 assert.ok(attempt.transactions.every(row=>!row.voidedAt));assert.ok(attempt.transactions.every(row=>row.status!=='voided'));
});
test('server verifies both originals and rejects concurrent or repeated refund recording',async()=>{
 const keys=['ELYON_FINANCE_STORE_MODE','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ELYON_SELLER_ACCESS_TOKEN','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_DRIVE_BACKUP_FOLDER_ID'];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]])),oldFetch=globalThis.fetch;
 Object.assign(process.env,{ELYON_FINANCE_STORE_MODE:'upstash',UPSTASH_REDIS_REST_URL:'https://example.invalid',UPSTASH_REDIS_REST_TOKEN:'test',ELYON_SELLER_ACCESS_TOKEN:'synthetic-token',GOOGLE_CLIENT_ID:'test-id',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_DRIVE_BACKUP_FOLDER_ID:'test-folder'});
 const fileBytes=[Buffer.from('synthetic purchase'),Buffer.from('synthetic refund'),Buffer.from('synthetic refund 2'),Buffer.from('synthetic refund 3')];
 const originalDoc={id:'doc_original123',sha256:createHash('sha256').update(fileBytes[0]).digest('hex'),cloudFileId:'original-file',documentType:'supplier_invoice',supplier:'Lieferant',invoiceReference:'I-1',documentDate:'2026-11-01',paymentDate:'2026-11-02',amount:'10.00',currency:'EUR'};
 const refundDoc={...proof(),id:'doc_refund123',cloudFileId:'refund-file',sha256:createHash('sha256').update(fileBytes[1]).digest('hex')};
 const extraDocs=[2,3].map(index=>({...refundDoc,id:`doc_refund${index}abc`,cloudFileId:`refund-file-${index}`,sha256:createHash('sha256').update(fileBytes[index]).digest('hex'),invoiceReference:`REF-${index}`,amount:'7.00'}));
 const files=new Map([['original-file',{doc:originalDoc,bytes:fileBytes[0]}],['refund-file',{doc:refundDoc,bytes:fileBytes[1]}],...extraDocs.map((doc,index)=>[doc.cloudFileId,{doc,bytes:fileBytes[index+2]}])]);let saved=null,driveOK=true;const redis=value=>({ok:true,json:async()=>({result:value})});
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);if(target.includes('oauth2.googleapis.com/token'))return {ok:true,json:async()=>({access_token:'test-access'})};
  if(target.includes('drive/v3/files/')){const id=decodeURIComponent(target.split('/files/')[1].split('?')[0]),file=files.get(id);assert.ok(file);if(target.includes('alt=media'))return {ok:driveOK,arrayBuffer:async()=>file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength)};return {ok:driveOK,json:async()=>({size:String(file.bytes.length),parents:['test-folder'],appProperties:{elyonFinanceDocument:'true',documentId:file.doc.id,sha256:file.doc.sha256}})};}
  if(!options.method||options.method==='GET')return redis(saved);const args=JSON.parse(options.body);assert.equal(args[0],'EVAL');const revision=JSON.parse(saved||'{"revision":0}').revision;if(revision!==Number(args[4]))return redis(0);saved=args[5];return redis(1);
 };
 const response=()=>({status(code){this.code=code;return this},setHeader(){return this},json(body){this.body=body;return this}});
 try{
  const cost=buildReceiptCostProposal(originalDoc,[{orderId:'123-456',itemId:'SKU-1',amount:'10.00'}],[],[originalDoc],{}).allocations;
  assert.equal((await writeFinanceState({documents:[originalDoc,refundDoc,...extraDocs],transactions:cost},{},{expectedRevision:0,allowReceiptCosts:true})).ok,true);
  const request=(revision,confirm=true,documentId=refundDoc.id)=>({method:'POST',query:{action:'record-supplier-refund'},headers:{'x-elyon-seller-token':'synthetic-token',host:'localhost',cookie:'elyon_google_drive_refresh_token=test-refresh'},body:{expectedRevision:revision,documentId,originalTransactionId:cost[0].transactionId,confirm}});
  const noConfirm=response();await handler(request(1,false),noConfirm);assert.equal(noConfirm.code,400);
  driveOK=false;const noDrive=response();await handler(request(1),noDrive);assert.equal(noDrive.code,503);assert.equal((await readFinanceState()).transactions.length,1);
  driveOK=true;const first=response(),second=response();await Promise.all([handler(request(1),first),handler(request(1),second)]);assert.deepEqual([first.code,second.code].sort(),[200,409]);
  const after=await readFinanceState();assert.equal(after.transactions.filter(row=>row.category==='supplier_refund').length,1);
  const retry=response();await handler(request(after.revision),retry);assert.equal(retry.code,409);assert.equal((await readFinanceState()).transactions.length,2);
  const third=response(),fourth=response();await Promise.all([handler(request(after.revision,true,extraDocs[0].id),third),handler(request(after.revision,true,extraDocs[1].id),fourth)]);assert.deepEqual([third.code,fourth.code].sort(),[200,409]);
  const fullyRefunded=await readFinanceState();const rejectedId=third.code===409?extraDocs[0].id:extraDocs[1].id;const beyond=response();await handler(request(fullyRefunded.revision,true,rejectedId),beyond);assert.equal(beyond.code,409);assert.equal(fullyRefunded.transactions.filter(row=>row.category==='supplier_refund').length,2);
  const eur=response();await handler({method:'GET',query:{action:'eur'},headers:{'x-elyon-seller-token':'synthetic-token',host:'localhost'}},eur);assert.equal(eur.code,409);assert.equal(eur.body.unclassifiedRefundCount,2);
 }finally{globalThis.fetch=oldFetch;for(const key of keys)before[key]===undefined?delete process.env[key]:process.env[key]=before[key];}
});
