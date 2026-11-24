import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {suggestChange,makeReviewChange,buildReviewRequest,reviewEligibility} from '../seller-price-stock-review-core.js';
const model={identity:{articleNumber:'ELY-000123',sku:'ELY-000123'},environment:'production',rows:[{}],economics:{source:'company_os_saved',currency:'EUR',savedSalePrice:18,minimumRulePassed:false}};
const row={sku:'ELY-000123',identityStatus:'MATCHED',ages:{supplier:'recent',price:'recent'},supplierStock:{quantity:0,available:false,conflict:false},supplierPrice:{provenance:'stored_verified',currency:'EUR'},offer:{status:'ACTIVE',listingId:'0001',offerId:'0002',origin:'inventory',marketplace:'EBAY_DE',currency:'EUR',price:20,quantity:3}};
test('proposes only stored price comparison and stock reduction, including zero',()=>{
 const s=suggestChange(model,row);assert.equal(s.price,'18.00');assert.equal(s.quantity,'0');
 const c=makeReviewChange(model,row,{quantity:'0'});assert.equal(c.quantity,'0');assert.equal(c.price,null);assert.equal(c.listingId,'0001');
 assert.equal(makeReviewChange(model,row,{price:'20,50'}).price,'20.50');
 assert.throws(()=>makeReviewChange(model,row,{price:'20',quantity:'3'}),/Keine Änderung/);
});
test('no fabricated stock or automatic increases, stale and conflicts blocked',()=>{
 for(const supplierStock of [{quantity:null,available:null},{quantity:18,available:true}]){
  const r={...row,supplierStock};assert.equal(suggestChange(model,r).quantity,null);
  assert.throws(()=>makeReviewChange(model,r,{quantity:'4'}),/Bestandserhöhung/);
 }
 const stale={...row,ages:{supplier:'stale',price:'recent'}};
 assert.equal(suggestChange(model,stale).quantity,null);
 assert.throws(()=>makeReviewChange(model,stale,{quantity:'0'}),/Lieferantenbestand/);
 for(const patch of [{currency:'USD'},{marketplace:'EBAY_US'},{status:'DRAFT'}]){
  assert.throws(()=>makeReviewChange(model,{...row,offer:{...row.offer,...patch}},{price:'25'}));
 }
 assert.throws(()=>makeReviewChange(model,{...row,identityStatus:'IDENTITY_CONFLICT'},{price:'25'}));
});
test('variant gets independent review and no parent price suggestion',()=>{
 const r={...row,sku:'ELY-000123-01'};assert.equal(suggestChange(model,r).price,null);
 const c=makeReviewChange(model,r,{price:'21.00',quantity:'0'});
 assert.equal(c.sku,r.sku);assert.equal(c.price,'21.00');
 assert.equal(buildReviewRequest([c]).changes.length,1);
 assert.throws(()=>buildReviewRequest([c,c]),/Doppeltes/);
 assert.throws(()=>buildReviewRequest([c,{...c,sku:'ELY-000123-02'}]),/Doppeltes/);
});
test('explicit selection and protected read-only bridge; no client authority or persistence',async()=>{
 const ui=await readFile(new URL('../seller-price-stock-review.js',import.meta.url),'utf8');
 const base=await readFile(new URL('../seller-price-stock-foundation.js',import.meta.url),'utf8');
 const api=await readFile(new URL('../api/price-stock-preview.js',import.meta.url),'utf8');
 assert.match(ui,/Vorschlag verwerfen/);assert.match(ui,/Auswahl prüfen/);assert.match(ui,/Offline-CSV exportieren/);
 assert.match(ui,/NICHT bei eBay hochladen/);assert.match(base,/mountPriceStockReview/);
 assert.doesNotMatch(ui,/\blocalStorage\.|\bsetInterval\(|innerHTML\s*=/);
 assert.match(api,/requireSellerAccess/);assert.match(api,/redirect:'error'/);assert.match(api,/evidenceAuthenticated!==false/);
});

test('V2.6 review and diagnostic controls are restricted to identifiable active targets',()=>{
 assert.deepEqual(reviewEligibility(model,row),{reviewable:true,readbackEligible:true});
 for(const offer of [null,{...row.offer,status:'DRAFT'},{...row.offer,listingId:null},{...row.offer,offerId:null},{...row.offer,marketplace:'EBAY_US'}]){
  const r={...row,offer};assert.equal(reviewEligibility(model,r).reviewable,false);
  assert.throws(()=>makeReviewChange(model,r,{price:'25'}));
 }
 assert.equal(reviewEligibility(model,{...row,sku:'ELY-000123-01'}).readbackEligible,false);
 assert.equal(reviewEligibility(model,{...row,offer:{...row.offer,origin:'unknown'}}).readbackEligible,false);
 assert.equal(reviewEligibility({...model,identity:{...model.identity,groupKey:'group'}},row).readbackEligible,false);
});

test('V2.6 existing accordion DOM controls: no offer empty state, variant diagnostic omitted, stale selection discarded',async()=>{
 const {mountPriceStockReview,reconcilePriceStockReviews,clearPriceStockReviews}=await import('../seller-price-stock-review.js');
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.isConnected=true;this._text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}
  addEventListener(event,fn){this.listeners[event]=fn;}
  setAttribute(){}
 }
 const oldDoc=globalThis.document,oldWindow=globalThis.window;
 const collect=(n,tag)=>[...(n.tagName===tag?[n]:[]),...n.children.flatMap(c=>collect(c,tag))];
 try{
  globalThis.document={createElement:tag=>new Node(tag)};globalThis.window={ElyonSellerAuth:{isAuthenticated:()=>true}};
  const noOffer=new Node('section');mountPriceStockReview(noOffer,model,{...row,offer:null});
  assert.equal(collect(noOffer,'button').length,0);assert.match(noOffer.textContent,/Kein eindeutig zugeordnetes aktives/);
  const variant=new Node('section');mountPriceStockReview(variant,model,{...row,sku:'ELY-000123-01'});
  assert.equal(collect(variant,'button').some(b=>b.textContent==='Angebot lesend verifizieren'),false);
  const active=new Node('section');mountPriceStockReview(active,model,row);
  const buttons=collect(active,'button');
  assert.equal(buttons.some(b=>b.textContent==='Angebot lesend verifizieren'),true);
  buttons.find(b=>b.textContent==='Vorschlag auswählen').listeners.click();
  await Promise.resolve();
  assert.match(active.textContent,/1 ausgewählt/);
  reconcilePriceStockReviews(()=>({...model,rows:[{...row,offer:{...row.offer,quantity:2}}]}));
  assert.match(active.textContent,/0 ausgewählt/);
  assert.equal(buttons.find(b=>b.textContent==='Auswahl prüfen').disabled,true);
 }finally{clearPriceStockReviews();if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
