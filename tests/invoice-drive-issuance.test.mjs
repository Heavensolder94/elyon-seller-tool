import test from 'node:test';
import assert from 'node:assert/strict';
import { issueKleinunternehmerInvoice, cancelIssuedInvoice, issueReplacementInvoice, issueInvoiceCorrection } from '../lib/kleinunternehmer-invoice-store.js';
import { readFinanceState, writeFinanceState } from '../lib/finance-store.js';

const order={orderId:'12345-67890-12345',orderPaymentStatus:'PAID',creationDate:'2026-11-20T09:40:00.000Z',fulfillmentStartInstructions:[{shippingStep:{shipTo:{fullName:'Max Muster',contactAddress:{addressLine1:'Testweg 1',postalCode:'54321',city:'Stadt',countryCode:'DE'}}}}],lineItems:[{title:'Beispiel',quantity:1,lineItemCost:{value:'10.00',currency:'EUR'}}],pricingSummary:{total:{value:'10.00',currency:'EUR'}}};
const settings={taxMode:'small_business',sellerLegalName:'Muster',sellerStreet:'Testweg 2',sellerPostalCode:'12345',sellerCity:'Stadt',sellerCountry:'DE',sellerTaxId:'TEST',invoicePrefix:'ELYON'};

test('parallel issuance preserves one invoice and its verified PDF; failed Drive does not issue', async()=>{
 const names=['ELYON_FINANCE_STORE_MODE','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_DRIVE_BACKUP_FOLDER_ID'];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));const oldFetch=globalThis.fetch;
 Object.assign(process.env,{ELYON_FINANCE_STORE_MODE:'upstash',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'test',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_DRIVE_BACKUP_FOLDER_ID:'test-folder'});
 const saved=new Map(), files=new Map();let failDrive=false, counter=0;
 const redis=value=>({ok:true,json:async()=>({result:value})});
 globalThis.fetch=async(url,opts={})=>{
  const target=String(url);
  if(target.includes('redis.invalid/get/'))return redis(saved.get(decodeURIComponent(target.split('/get/')[1])) ?? null);
  if(target.includes('redis.invalid')){const args=JSON.parse(opts.body),count=Number(args[2]);if(count===1){const current=JSON.parse(saved.get(args[3])||'{"revision":0}').revision;if(current!==Number(args[4]))return redis(0);saved.set(args[3],args[5]);return redis(1)}if(count===2){if(saved.has(args[4]))return redis(saved.get(args[4]));const n=Number(saved.get(args[3])??args[5])+1;saved.set(args[3],n);const v=args[6]+String(n).padStart(5,'0');saved.set(args[4],v);return redis(v)}}
  if(target.includes('oauth2.googleapis.com'))return {ok:!failDrive,json:async()=>failDrive?{error:'invalid'}:{access_token:'fake'}};
  if(target.includes('upload/drive/v3/files')){const body=Buffer.from(opts.body);const text=body.toString('latin1');const match=text.match(/\r\n\r\n(\{[^\r\n]+\})\r\n--/);assert.ok(match);const metadata=JSON.parse(match[1]);const start=body.indexOf(Buffer.from('%PDF-'));const end=body.lastIndexOf(Buffer.from('\r\n--'));const bytes=body.subarray(start,end);const id='file_identifier_'+(++counter);files.set(id,{metadata,bytes});return {ok:true,json:async()=>({id})}}
  if(target.includes('drive/v3/files/')){const id=decodeURIComponent(target.split('/files/')[1].split('?')[0]);const f=files.get(id);assert.ok(f);if(target.includes('alt=media'))return {ok:true,arrayBuffer:async()=>f.bytes.buffer.slice(f.bytes.byteOffset,f.bytes.byteOffset+f.bytes.byteLength)};return {ok:true,json:async()=>({parents:['test-folder'],size:String(f.bytes.length),appProperties:f.metadata.appProperties})}}
  throw new Error('Unexpected mock '+target);
 };
 try{
  assert.equal((await writeFinanceState({settings},{},{expectedRevision:0})).ok,true);
  failDrive=true;const failed=await issueKleinunternehmerInvoice(order,{refreshToken:'test'});assert.equal(failed.ok,false);assert.equal((await readFinanceState()).invoiceMeta[order.orderId],undefined);
  failDrive=false;const results=await Promise.all([issueKleinunternehmerInvoice(order,{refreshToken:'test'}),issueKleinunternehmerInvoice(order,{refreshToken:'test'})]);assert.ok(results.every(x=>x.ok));assert.equal(results[0].invoiceNumber,results[1].invoiceNumber);const state=await readFinanceState();assert.equal(Object.keys(state.invoiceMeta).length,1);assert.ok(files.has(state.invoiceMeta[order.orderId].pdfArchive.fileId));assert.equal(results[0].pdfArchive.fileId,results[1].pdfArchive.fileId);
  const originalBefore=JSON.stringify(state.invoiceMeta[order.orderId]);
  const change={field:'buyerCity',newValue:'Neue Stadt',reason:'Adresse berichtigen'};
  assert.equal((await issueInvoiceCorrection(order.orderId,{...change,field:'total'},{refreshToken:'test'})).ok,false);
  const attempts=await Promise.all([issueInvoiceCorrection(order.orderId,change,{refreshToken:'test'}),issueInvoiceCorrection(order.orderId,change,{refreshToken:'test'})]);const correction=attempts.find(x=>x.ok);assert.ok(correction);assert.ok(attempts.filter(x=>x.ok&&!x.existing).length<=1);assert.equal(correction.invoice.oldValue,'Stadt');assert.equal(correction.invoice.newValue,'Neue Stadt');
  assert.equal((await issueInvoiceCorrection(order.orderId,change,{refreshToken:'test'})).existing,true);
  assert.equal((await issueInvoiceCorrection(order.orderId,{...change,newValue:'Andere Stadt'},{refreshToken:'test'})).ok,false);
  const beforeDifferentReason=await readFinanceState();const filesBeforeDifferentReason=files.size;
  const differentReason=await issueInvoiceCorrection(order.orderId,{...change,reason:'Anderer Grund'},{refreshToken:'test'});
  assert.equal(differentReason.ok,false);assert.equal(differentReason.status,409);
  assert.equal(Object.keys((await readFinanceState()).invoiceMeta).length,Object.keys(beforeDifferentReason.invoiceMeta).length);assert.equal(files.size,filesBeforeDifferentReason);

  const sellerChange={field:'sellerStreet',newValue:'Neuer Weg 5',reason:'Adresse korrigieren'};const sellerCorrection=await issueInvoiceCorrection(order.orderId,sellerChange,{refreshToken:'test'});assert.equal(sellerCorrection.ok,true);assert.equal(sellerCorrection.invoice.oldValue,'Testweg 2');assert.equal(sellerCorrection.invoice.newValue,'Neuer Weg 5');
  const badAmount=await issueInvoiceCorrection(order.orderId,{field:'singleLineAmount',newValue:'-1',reason:'Betrag korrigieren'},{refreshToken:'test'});assert.equal(badAmount.ok,false);
  const priceCorrection=await issueInvoiceCorrection(order.orderId,{field:'singleLineAmount',newValue:'12,50',reason:'Betrag korrigieren'},{refreshToken:'test'});assert.equal(priceCorrection.ok,true);assert.equal(priceCorrection.invoice.oldValue,'10.00');assert.equal(priceCorrection.invoice.newValue,'12,50');assert.equal(priceCorrection.invoice.itemTitle,'Beispiel');
  const correctedCancellation=await cancelIssuedInvoice(order.orderId,'Bestellung storniert',{refreshToken:'test'});assert.equal(correctedCancellation.ok,false);assert.match(correctedCancellation.message,/Berichtigung/);
  assert.equal(JSON.stringify((await readFinanceState()).invoiceMeta[order.orderId]),originalBefore);
  const plainOrder={...order,orderId:'22222-22222-22222'};const issued=await issueKleinunternehmerInvoice(plainOrder,{refreshToken:'test'});assert.equal(issued.ok,true);
  const beforeStorno=await issueReplacementInvoice(plainOrder,{refreshToken:'test'});assert.equal(beforeStorno.ok,false);
  failDrive=true;assert.equal((await cancelIssuedInvoice(plainOrder.orderId,'Bestellung storniert',{refreshToken:'test'})).ok,false);
  failDrive=false;const cancellations=await Promise.all([cancelIssuedInvoice(plainOrder.orderId,'Bestellung storniert',{refreshToken:'test'}),cancelIssuedInvoice(plainOrder.orderId,'Bestellung storniert',{refreshToken:'test'})]);
  assert.ok(cancellations.every(x=>x.ok));assert.equal(cancellations[0].invoice.invoiceNumber,cancellations[1].invoice.invoiceNumber);assert.notEqual(cancellations[0].invoice.invoiceNumber,issued.invoiceNumber);
  assert.equal(cancellations[0].invoice.originalInvoiceNumber,issued.invoiceNumber);assert.equal(cancellations[0].invoice.total,-10);
  assert.equal((await cancelIssuedInvoice(plainOrder.orderId,'Bestellung storniert',{refreshToken:'test'})).existing,true);
  assert.equal((await issueInvoiceCorrection(plainOrder.orderId,{...change,field:'buyerName',newValue:'Anders'},{refreshToken:'test'})).ok,false);
  const invalid={...plainOrder,pricingSummary:{total:{value:'15.00',currency:'EUR'}}};assert.equal((await issueReplacementInvoice(invalid,{refreshToken:'test'})).ok,false);
  const replacements=await Promise.all([issueReplacementInvoice(plainOrder,{refreshToken:'test'}),issueReplacementInvoice(plainOrder,{refreshToken:'test'})]);
  assert.ok(replacements.every(x=>x.ok));assert.equal(replacements[0].invoice.invoiceNumber,replacements[1].invoice.invoiceNumber);assert.notEqual(replacements[0].invoice.invoiceNumber,issued.invoiceNumber);assert.notEqual(replacements[0].invoice.invoiceNumber,cancellations[0].invoice.invoiceNumber);
  assert.equal(replacements[0].invoice.originalInvoiceNumber,issued.invoiceNumber);assert.equal(replacements[0].invoice.cancellationInvoiceNumber,cancellations[0].invoice.invoiceNumber);assert.equal((await issueReplacementInvoice(plainOrder,{refreshToken:'test'})).existing,true);
  const racingOrder={...order,orderId:'33333-33333-33333'};assert.equal((await issueKleinunternehmerInvoice(racingOrder,{refreshToken:'test'})).ok,true);
  const competing=await Promise.all([cancelIssuedInvoice(racingOrder.orderId,'Storno Test',{refreshToken:'test'}),issueInvoiceCorrection(racingOrder.orderId,{field:'buyerCity',newValue:'Andere Stadt',reason:'Korrektur'},{refreshToken:'test'})]);
  assert.equal(competing.filter(x=>x.ok).length,1);
  const correctionRaceOrder={...order,orderId:'44444-44444-44444'};assert.equal((await issueKleinunternehmerInvoice(correctionRaceOrder,{refreshToken:'test'})).ok,true);
  const competingCorrections=await Promise.all(['Erster Grund','Zweiter Grund'].map(reason=>issueInvoiceCorrection(correctionRaceOrder.orderId,{field:'buyerCity',newValue:'Neue Stadt',reason},{refreshToken:'test'})));
  assert.equal(competingCorrections.filter(x=>x.ok).length,1);
  const afterRace=await readFinanceState();assert.equal(Object.values(afterRace.invoiceMeta).filter(entry=>entry.invoice?.documentKind==='correction'&&entry.invoice.originalOrderId===correctionRaceOrder.orderId&&entry.invoice.field==='buyerCity').length,1);
  const shippingOrder={...order,orderId:'55555-55555-55555',pricingSummary:{total:{value:'12.00',currency:'EUR'},deliveryCost:{value:'2.00',currency:'EUR'}}};assert.equal((await issueKleinunternehmerInvoice(shippingOrder,{refreshToken:'test'})).ok,true);const shippingCorrection=await issueInvoiceCorrection(shippingOrder.orderId,{field:'singleLineAmount',newValue:'13',reason:'Prüfung'},{refreshToken:'test'});assert.equal(shippingCorrection.ok,false);

 }finally{globalThis.fetch=oldFetch;for(const name of names)old[name]===undefined?delete process.env[name]:process.env[name]=old[name]}
});
