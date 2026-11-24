// Exercise the actual Studio controller with a minimal DOM test double.
// This is not a browser rendering or protected preview smoke test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {applyStudioChange,documentSummary} from '../lib/document-studio-core.js';
import {PRODUCT_DOCUMENT_TYPES,DOCUMENT_ORIGINS,productDocumentReview} from '../lib/product-document-core.js';
test('V3.1 actual Studio controller: create, type/language, product and variants, save, list filter, archive and restore',async()=>{
 const elements=new Map();
 class Node {
  constructor(tag='div',id=''){this.tagName=tag;this.id=id;this.children=[];this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.multiple=false;this.selected=false;this._value='';this._text='';this._html='';this.classList={toggle(){},contains(){return false;}};}
  set innerHTML(html){this._html=html;this.replaceChildren();for(const match of html.matchAll(/<(\w+)([^>]*\bid="([^"]+)"[^>]*)>/g)){const child=new Node(match[1],match[3]);child.multiple=/\bmultiple\b/.test(match[2]);elements.set(child.id,child);this.append(child);}}
  get innerHTML(){return this._html;}
  append(...items){this.children.push(...items);}
  appendChild(item){this.append(item);return item;}
  replaceChildren(...items){this.children=items;this._text='';}
  get selectedOptions(){return this.children.filter(x=>x.selected);}
  set value(v){this._value=String(v??'');if(this.tagName==='select')for(const x of this.children)x.selected=x.value===this._value;}
  get value(){if(this.tagName==='select'&&this.children.length)return this.selectedOptions[0]?.value??(this.multiple?'':this.children[0].value);return this._value;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}
  addEventListener(event,fn){this.listeners[event]=fn;}
  setAttribute(){}
  contains(n){return this===n||this.children.some(x=>x.contains(n));}
  querySelectorAll(){return this.toolbar||[];}
 }
 const register=(id,tag)=>{const n=new Node(tag,id);elements.set(id,n);return n;};
 const el=id=>elements.get(id)||null;
 const root=register('elyonDocumentStudioTab');
 root.toolbar=['print','docx','save-template','assistant','save','archive','new-product'].map(action=>{const n=new Node('button');n.dataset.edsAction=action;return n;});
 for(const id of ['edsProductEditor','edsBusinessEditor','edsStatus','edsVersion','edsArchiveBtn','edsOrderSourceNotice','edsList'])register(id);
 const catalog={ok:true,schemaVersion:'elyon-product-document-catalog-v3.1',source:'company_os_canonical_projection',executionAuthorized:false,uploadVerified:false,
  reference:{templateId:'ebay.de.document-url',registryVersion:'1.0.0',templateVersion:'1.0',sha256:'a'.repeat(64),documentTypes:['USER_GUIDE_OR_MANUAL'],languages:['GERMAN','ENGLISH','OTHER']},
  products:[{productId:'00001',masterId:'00001',articleNumber:'ELY-000001',sku:'ELY-000001',title:'Fixture',variants:[{key:'sku:ELY-000001-01',sku:'ELY-000001-01',supplierVariantId:'00008',label:'Rot'},{key:'supplier:00009',sku:null,supplierVariantId:'00009',label:'Blau'}]}],
  internalTypes:PRODUCT_DOCUMENT_TYPES,origins:DOCUMENT_ORIGINS};
 let store={revision:0,documents:[{id:'business_0001',kind:'letter',title:'Geschäftsbrief',version:1,sourceOrderId:'0003',archivedAt:null}],customTemplates:[],customBlocks:[]},calls=[];
 const response=data=>({ok:true,json:async()=>data});
 const fetch=async(url,options)=>{
  const action=new URL(url,'https://seller.invalid').searchParams.get('action');calls.push(action);
  if(action==='product-catalog')return response(catalog);
  const body=JSON.parse(options.body);assert.equal(body.expectedRevision,store.revision);
  store=applyStudioChange(store,action,body.document,body.id,{catalog});
  const doc=store.documents.find(x=>x.id===(body.document?.id||body.id));
  return response({ok:true,revision:store.revision,documents:store.documents.map(documentSummary),document:{...doc,review:productDocumentReview(doc)}});
 };
 const window={crypto:{randomUUID:()=> 'product_doc_fixture'},confirm:()=>true};
 const document={readyState:'loading',addEventListener(){},createElement:tag=>new Node(tag),getElementById:el};
 const source=await readFile(new URL('../seller-document-studio.js',import.meta.url),'utf8');
 const anchor='  window.ElyonDocumentStudio = { open: openStudio, openFromOrder };';
 assert.ok(source.includes(anchor));
 vm.runInNewContext(source.replace(anchor,anchor+'\n  window.__studioTest = {state,createProductDocument,loadProductCatalog,saveProduct,archiveOrRestore,renderList,setProductMode,handleInput,runValidationAction};'),{window,document,fetch,URLSearchParams,console});
 const h=window.__studioTest;
 h.state.revision=0;h.state.documents=store.documents.map(documentSummary);
 h.createProductDocument();await h.loadProductCatalog();
 assert.equal(el('edsProductEditor').hidden,false);assert.equal(el('edsBusinessEditor').hidden,true);
 assert.equal(root.toolbar.find(x=>x.dataset.edsAction==='print').hidden,true);
 assert.equal(el('edsProductType').value,'user_manual');
 el('edsProductTitle').value='Anleitung';el('edsProductLanguage').value='GERMAN';el('edsProductOrigin').value='manufacturer';
 el('edsProductEbayType').value='USER_GUIDE_OR_MANUAL';el('edsProductSource').value='Fixture';el('edsProductUrl').value='https://example.invalid/manual.pdf';
 el('edsProductPick').value='00001';el('edsProductAdd').listeners.click();
 const row=el('edsProductAssociations').children[0],select=row.children[2].children[0];
 assert.equal(select.multiple,true);for(const opt of select.children)opt.selected=true;select.listeners.change();
 assert.equal(h.state.dirty,true);
 await h.saveProduct();
 assert.equal(store.documents.length,2);assert.equal(store.documents[0].productDocument.primaryLanguage,'GERMAN');
 assert.equal(store.documents[0].productDocument.associations[0].variants.length,2);
 assert.equal(store.documents[0].productDocument.associations[0].variants[1].sku,null);
 assert.equal(store.documents[1].sourceOrderId,'0003');
 assert.equal(h.state.current.version,1);assert.equal(h.state.dirty,false);
 await h.runValidationAction('revalidate-product',{});assert.equal(h.state.current.version,2);assert.match(el('edsValidationEvidence').textContent,/Identitäten abgeglichen/);
 await h.runValidationAction('add-product-review',{kind:'applicability',decision:'reviewed',reference:'Fixture model',note:'Explicit variants checked manually'});assert.equal(h.state.current.version,3);assert.match(el('edsValidationEvidence').textContent,/Manueller Vermerk/);
 assert.equal(h.state.current.review.validation.regulatoryStatus,'NOT_VERIFIED');
 assert.match(el('edsProductReview').textContent,/nicht verifiziert/);
 h.state.documentFilter='product';h.renderList();assert.match(el('edsList').textContent,/Anleitung/);assert.doesNotMatch(el('edsList').textContent,/Geschäftsbrief/);
 h.state.documentFilter='business';h.renderList();assert.match(el('edsList').textContent,/Geschäftsbrief/);
 await h.archiveOrRestore();assert.equal(h.state.current.review.status,'ARCHIVED');assert.equal(el('edsProductFields').disabled,true);
 await h.archiveOrRestore();assert.equal(h.state.current.archivedAt,null);assert.equal(el('edsProductFields').disabled,false);
 h.setProductMode(false);assert.equal(el('edsBusinessEditor').hidden,false);assert.equal(root.toolbar.find(x=>x.dataset.edsAction==='print').hidden,false);
 assert.deepEqual(calls,['product-catalog','save-product','revalidate-product','add-product-review','archive','restore']);
});
