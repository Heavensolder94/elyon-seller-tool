import { suggestChange,makeReviewChange,reviewKey,buildReviewRequest,SCHEMA } from './seller-price-stock-review-core.js';

// Session-memory only, no product or localStorage writes. A changed source
// invalidates the selected review. All buttons are deliberately non-submit.
const selected=new Map(), mounted=new Set();
let generation=0,busy=false;
const auth=()=>window.ElyonSellerAuth?.isAuthenticated?.()===true;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
const button=(label,fn)=>{const b=node('button',label);b.type='button';b.className='secondary';b.addEventListener('click',fn);return b;};
const money=v=>v==null?'unbekannt':Number(v).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const signature=(m,r)=>JSON.stringify([m.identity,m.syncedAt,r]);
function redraw(){
 for(const entry of mounted){
  if(!entry.host.isConnected){mounted.delete(entry);continue;}
  const list=[...selected.values()].map(x=>x.change);
  entry.summary.textContent=list.length+' ausgewählt · '+list.filter(x=>x.price!==null).length+' Preis · '+list.filter(x=>x.quantity!==null).length+' Bestand';
  entry.batch.disabled=busy||!list.length;
  entry.single.disabled=busy;
 }
}
export function clearPriceStockReviews(){generation++;selected.clear();mounted.clear();busy=false;}
async function run(changes,result,download,entry){
 if(busy||!auth())return;
 let request;
 try{request=buildReviewRequest(changes);}catch(e){result.textContent=e.message;return;}
 const token=++generation;busy=true;redraw();download.hidden=true;download.onclick=null;
 result.textContent='Kanonische Vorschau wird geprüft …';
 try{
  const response=await fetch('/api/price-stock-preview',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  const data=await response.json();
  if(token!==generation||!auth()||!entry.host.isConnected)return;
  if(!response.ok||data.ok!==true||data.schemaVersion!==SCHEMA||data.executionAuthorized!==false||
     data.evidenceAuthenticated!==false||data.operationalEnabled!==false||data.uploadVerified!==false||data.releaseEligible!==false)throw Error('Kanonische Vorschau derzeit nicht verfügbar.');
  result.replaceChildren(node('p','Offline-Prüfung · Regelrevision '+data.ruleRevision+' · keine Freigabe.'));
  for(const p of data.proposals||[]){
   const calc=p.calculation,b=p.baseline;
   result.append(node('p',p.target.sku+' · '+p.kind+' · Ist '+money(p.current.price)+' / '+(p.current.quantity??'unbekannt')+' → Soll '+(p.proposed.price===null?'unverändert':money(p.proposed.price))+' / '+(p.proposed.quantity??'unverändert')));
   if(calc)result.append(node('p','Hypothetisch: Gewinn '+money(calc.profit)+' · Marge '+(calc.margin??'unbekannt')+' % · '+calc.status+' · bisherige Kalkulation '+money(b?.profit)+' / '+(b?.margin??'unbekannt')+' %'+(calc.profit!=null&&b?.profit!=null?' · Gewinnänderung '+money(calc.profit-b.profit):'')+(calc.margin!=null&&b?.margin!=null?' · Margenänderung '+(calc.margin-b.margin).toFixed(2)+' Prozentpunkte':'')));
   else result.append(node('p','Kalkulationsgrundlage fehlt.'));
   if(calc?.reasons?.length)result.append(node('p',calc.reasons.join(' ')));
   result.append(node('p','Nachweise / Blocker: '+[...p.missing,...p.blockers,...p.exportBlockers].join(' · ')));
   result.append(node('p','Transportkandidat (unverifiziert): '+(p.transport?.candidate?.api||'unbekannt')));
  }
  if(data.plan)result.append(node('p','Commerce Dry Run: '+data.plan.structureStatus+' / '+data.plan.status+' · '+(data.plan.diagnostics||[]).map(d=>d.code).join(' · ')));
  const approval=data.approvalReview;
  const approvalBox=node('div');approvalBox.className='elyon-ps-note';
  approvalBox.append(node('strong','Freigabeprüfung (V2.3) – keine eBay-Aktion'));
  if(approval?.schemaVersion==='elyon-commerce-approval-v2.3'&&approval.status==='EVIDENCE_REQUIRED'&&approval.confirmationAllowed===false&&approval.persisted===false){
   approvalBox.append(node('p','Serverseitig geprüft · Bestätigung und Reservierung gesperrt.'));
   approvalBox.append(node('p','Prüfzeit '+new Date(approval.checkedAt).toLocaleString('de-DE')+' · erneute Prüfung spätestens '+new Date(approval.expiresAt).toLocaleString('de-DE')));
   approvalBox.append(node('p','Individueller Benutzer, Workspace, eBay-Konto und authentifizierte Angebots-/Lieferantennachweise fehlen. Es wurde keine Freigabe gespeichert.'));
   const details=node('details');details.append(node('summary','Nachweisdetails'),node('p',(approval.blockers||[]).join(' · ')));approvalBox.append(details);
  }else approvalBox.append(node('p','Freigabestatus nicht verifiziert – gesperrt.'));
  const confirmation=button('Prüfung bestätigen – gesperrt',()=>{});confirmation.disabled=true;approvalBox.append(confirmation);
  result.append(approvalBox);
  const transportBox=node('div');transportBox.className='elyon-ps-note';
  transportBox.append(node('strong','Transport & Abgleich (V2.4) – gesperrt'));
  transportBox.append(node('p','Inventory: nur vorgesehener Offer-bezogener Transport. Trading: nicht aktivierter Kandidat. Kein automatischer Wechsel zu einem anderen Transport.'));
  transportBox.append(node('p','Vor einer späteren Ausführung sind Konto, Angebot, Lieferbestand und kanonische Revision erneut zu prüfen. Bei unklarer Antwort ist ein Ergebnisabgleich erforderlich; keine automatische Wiederholung.'));
  transportBox.append(node('p','Keine Operation angelegt, keine eBay-Änderung ausgeführt. Die Simulation ist nicht Bestandteil der produktiven Historie.'));
  result.append(transportBox);
  const artifact=data.artifact;
  if(artifact?.status==='EXPORT_READY_OFFLINE'&&artifact.executionAuthorized===false&&artifact.uploadVerified===false&&typeof artifact.base64==='string'&&artifact.base64.length<500000){
   result.append(node('p','Struktureller Offline-Export: '+artifact.rowCount+' Zeilen. NICHT bei eBay hochladen. Nachweise und Freigabe fehlen.'));
   download.hidden=false;download.onclick=()=>{
    if(!auth()||generation!==token||!entry.host.isConnected)return;
    const bytes=Uint8Array.from(atob(artifact.base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:'text/csv;charset=utf-8'}));
    const a=node('a');a.href=url;a.download='elyon-price-quantity-OFFLINE-NOT-FOR-UPLOAD.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   };
  }else result.append(node('p','Kein CSV-Export: Auswahl oder Nachweise prüfen.'));
 }catch(e){if(token===generation&&entry.host.isConnected)result.textContent=e.message||'Vorschau nicht verfügbar.';}
 finally{if(token===generation){busy=false;redraw();}}
}
export function mountPriceStockReview(section,model,row){
 const suggestion=suggestChange(model,row),key=model.identity.articleNumber+'|'+row.sku,sig=signature(model,row);
 const previous=selected.get(key);
 if(previous&&previous.signature!==sig){selected.delete(key);generation++;busy=false;}
 const details=node('details');details.className='elyon-ps-note';details.append(node('summary','Änderungsvorschlag prüfen'));
 details.append(node('p',suggestion.reasons.join(' ')));
 const grid=node('div');grid.className='elyon-ps-grid';
 const price=node('input'),quantity=node('input');price.type='text';price.inputMode='decimal';quantity.type='text';quantity.inputMode='numeric';
 price.placeholder='Unverändert';quantity.placeholder='Unverändert';price.maxLength=12;quantity.maxLength=9;
 price.value=previous?.signature===sig?previous.change.price??'':suggestion.price??'';
 quantity.value=previous?.signature===sig?previous.change.quantity??'':suggestion.quantity??'';
 const pl=node('label','Soll-VK (EUR) '),ql=node('label','Soll-Bestand ');pl.append(price);ql.append(quantity);grid.append(pl,ql);details.append(grid);
 const summary=node('p'),result=node('div');result.setAttribute('aria-live','polite');
 const get=()=>makeReviewChange(model,row,{price:price.value,quantity:quantity.value});
 const download=button('Offline-CSV exportieren',()=>{});download.hidden=true;
 const entry={host:details,summary,batch:null,single:null};
 const invalidate=()=>{generation++;busy=false;selected.delete(key);download.hidden=true;download.onclick=null;result.textContent='Änderung noch nicht geprüft.';redraw();};
 price.addEventListener('input',invalidate);quantity.addEventListener('input',invalidate);
 const select=button('Vorschlag auswählen',()=>{try{const change=get();if(!selected.has(key)&&selected.size>=50)throw Error('Maximal 50 Änderungen.');selected.set(reviewKey(change),{change,signature:sig});result.textContent='Nur lokale Review-Auswahl gespeichert.';generation++;busy=false;download.hidden=true;redraw();}catch(e){result.textContent=e.message;}});
 const discard=button('Vorschlag verwerfen',()=>{price.value='';quantity.value='';invalidate();});
 entry.single=button('Preis / Änderung erneut prüfen',()=>{try{run([get()],result,download,entry);}catch(e){result.textContent=e.message;}});
 entry.batch=button('Auswahl prüfen',()=>run([...selected.values()].map(v=>v.change),result,download,entry));
 details.append(select,discard,entry.single,entry.batch,summary,result,download);section.append(details);mounted.add(entry);
 // No extra observer or polling; the existing accordion owns render lifecycle.
 queueMicrotask(redraw);
}
