import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

export const MAX_PRODUCT_PDF_BYTES=2*1024*1024;
export const MAX_PRODUCT_PDF_BODY_BYTES=Math.ceil(MAX_PRODUCT_PDF_BYTES/3)*4+8192;
export const PDF_VALIDATION_PROFILE='pdf-classic-xref-limited-v1';
const fail=(code,message,status=422)=>{throw Object.assign(new Error(message),{code,status});};
const hex=bytes=>createHash('sha256').update(bytes).digest('hex');
export const sha256Bytes=hex;

// References only. Never resolve DNS or fetch the supplied URL.
export function normalizeDocumentSourceUrl(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f\\]/.test(value))fail('invalid_source_url','Ungültige HTTPS-Quellreferenz.');
 try{
  const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!host.includes('.')||isIP(host.replace(/^\[|\]$/g,''))||host.split('.').some(p=>!p||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p))||/(?:^|\.)(?:localhost|local|internal|lan|home|onion|test|invalid)$/.test(host)&&!host.endsWith('.invalid'))throw Error();
  // .invalid is reserved/non-resolving and useful for existing offline fixtures.
  // No actual network retrieval occurs even for a syntactically valid name.
  if(u.hostname.endsWith('.'))throw Error();
  return u.href;
 }catch{fail('invalid_source_url','Nur HTTPS-Quellreferenzen ohne IP, lokale Namen, Zugangsdaten, Port, Query oder Fragment zulässig.');}
}
export function validatePdfFilename(value){
 if(typeof value!=='string'||value.length<5||value.length>120||value!==value.trim()||!/^[-\p{L}\p{N}_ .()]+\.pdf$/iu.test(value)||value.startsWith('.')||value.includes('..')||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))fail('invalid_filename','Nur sichere PDF-Dateinamen ohne Pfadbestandteile.');
 return value;
}
export function decodePdfInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['filename','mediaType','base64'].includes(k)))fail('invalid_file_input','Ungültige Dateieingabe.');
 const filename=validatePdfFilename(input.filename);
 if(input.mediaType!==''&&input.mediaType!=='application/pdf')fail('mime_mismatch','Nur PDF-Dateien (application/pdf) werden unterstützt.');
 const b64=input.base64;
 if(typeof b64!=='string'||!b64)fail('empty_file','Datei ist leer.');
 if(b64.length>Math.ceil(MAX_PRODUCT_PDF_BYTES/3)*4)fail('file_too_large','Maximal 2 MiB pro PDF.',413);
 if(b64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64))fail('invalid_base64','Ungültige Dateibytes.');
 const bytes=Buffer.from(b64,'base64');
 if(bytes.toString('base64')!==b64)fail('invalid_base64','Ungültige Dateibytes.');
 if(!bytes.length)fail('empty_file','Datei ist leer.');
 if(bytes.length>MAX_PRODUCT_PDF_BYTES)fail('file_too_large','Maximal 2 MiB pro PDF.',413);
 return {filename,bytes};
}

// A bounded, deliberately conservative classic-xref structural profile.
// No rendering, decompression of embedded streams, script execution or malware
// scanning; xref streams, hybrid/incremental updates are unsupported, not "bad PDFs".
export function inspectPdfBytes(bytes,filename,now=new Date().toISOString()){
 validatePdfFilename(filename);
 if(!Buffer.isBuffer(bytes)||!bytes.length)fail('empty_file','Datei ist leer.');
 if(bytes.length>MAX_PRODUCT_PDF_BYTES)fail('file_too_large','Maximal 2 MiB pro PDF.',413);
 const raw=bytes.toString('latin1');
 if(!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\n|\r)/.test(raw))fail('invalid_pdf_signature','PDF-Dateisignatur fehlt.');
 // Decode PDF name escapes before checking for encryption and unsupported features.
 const names=raw.replace(/#([a-fA-F0-9]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
 if(/\/Encrypt(?=[\s/<>\[\](){}%]|$)/.test(names))fail('encrypted_pdf','Verschlüsselte PDFs sind nicht zugelassen.');
 if(/\/(?:XRefStm|Prev)(?=[\s/<>\[\](){}%]|$)/.test(names)||/\/Type\s*\/(?:XRef|ObjStm)\b/.test(names))fail('unsupported_pdf_structure','PDF mit XRef-Stream, Objektstream oder inkrementellem Update wird noch nicht geprüft.');
 const tail=raw.slice(-4096),end=/startxref[ \t\r\n]+([0-9]{1,10})[ \t\r\n]+%%EOF[ \t\r\n]*$/.exec(tail);
 if(!end)fail('damaged_pdf','PDF-Ende oder startxref fehlt.');
 const xref=Number(end[1]),startxref=raw.length-tail.length+end.index;
 if(!Number.isSafeInteger(xref)||xref<=0||xref>=startxref||!/^xref(?:\r\n|\r|\n)/.test(raw.slice(xref,xref+8)))fail('unsupported_pdf_structure','Klassische PDF-Querverweistabelle nicht gefunden.');
 const xrefText=raw.slice(xref,startxref),trailerIndex=xrefText.indexOf('trailer');
 if(trailerIndex<0)fail('damaged_pdf','PDF-Trailer fehlt.');
 const table=xrefText.slice(0,trailerIndex).trimEnd().split(/\r\n|\r|\n/),trailer=xrefText.slice(trailerIndex);
 const root=/\/Root\s+(\d{1,9})\s+(\d{1,5})\s+R\b/.exec(trailer),size=/\/Size\s+(\d{1,9})\b/.exec(trailer);
 if(!/^trailer\s*<<[\s\S]*>>\s*$/.test(trailer)||!root||!size||Number(size[1])<1||Number(size[1])>20000||table[0]!=='xref')fail('damaged_pdf','PDF-Trailer ist unvollständig.');
 const entries=new Map(),objects=new Map();let pos=1,total=0;
 while(pos<table.length){
  const head=/^(\d{1,9})\s+(\d{1,9})\s*$/.exec(table[pos++]);
  if(!head)fail('damaged_pdf','PDF-Querverweise sind ungültig.');
  const first=Number(head[1]),count=Number(head[2]);total+=count;
  if(!count||total>20000||first+count>Number(size[1])||pos+count>table.length)fail('damaged_pdf','PDF-Querverweise überschreiten die Grenzen.');
  for(let i=0;i<count;i++){
   const match=/^(\d{10})\s(\d{5})\s([nf])\s*$/.exec(table[pos++]),number=first+i;
   if(!match||entries.has(number))fail('damaged_pdf','PDF-Querverweis fehlt oder ist doppelt.');
   entries.set(number,match[3]);
   if(match[3]==='n'){
    const offset=Number(match[1]),generation=Number(match[2]);
    if(!number||offset<=0||offset>=xref||!new RegExp('^'+number+'\\s+'+generation+'\\s+obj\\b').test(raw.slice(offset,offset+80)))fail('damaged_pdf','PDF-Objektposition stimmt nicht.');
    objects.set(number,{offset,generation});
   }
  }
 }
 if(entries.get(0)!=='f'||entries.size!==Number(size[1]))fail('damaged_pdf','PDF-Querverweistabelle ist unvollständig.');
 const ordered=[...objects.entries()].sort((a,b)=>a[1].offset-b[1].offset);
 for(let i=0;i<ordered.length;i++){
  const [number,obj]=ordered[i],limit=ordered[i+1]?.[1].offset??xref;
  if(limit<=obj.offset||!/\bendobj[ \t\r\n]*$/.test(raw.slice(obj.offset,limit)))fail('damaged_pdf','PDF-Objektende fehlt.');
 }
 const rootObj=objects.get(Number(root[1]));
 if(!rootObj||rootObj.generation!==Number(root[2]))fail('damaged_pdf','PDF-Katalog fehlt.');
 const rootEnd=ordered.find(([,obj])=>obj.offset>rootObj.offset)?.[1].offset??xref;
 const rootText=raw.slice(rootObj.offset,rootEnd).replace(/#([a-fA-F0-9]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
 const pages=/\/Pages\s+(\d{1,9})\s+(\d{1,5})\s+R\b/.exec(rootText);
 if(!/\/Type\s*\/Catalog\b/.test(rootText)||!pages||objects.get(Number(pages[1]))?.generation!==Number(pages[2]))fail('damaged_pdf','PDF-Katalog oder Seitenbaum fehlt.');
 return {filename,mimeType:'application/pdf',sizeBytes:bytes.length,sha256:hex(bytes),validatedAt:now,technicalStatus:'LIMITED_STRUCTURE_PASSED',validationProfile:PDF_VALIDATION_PROFILE,signatureChecked:true,xrefChecked:true,encryptionMarkersChecked:true,fullIntegrityVerified:false,malwareScanned:false,contentVerified:false};
}
export function inspectPdfInput(input,now){const {filename,bytes}=decodePdfInput(input);return inspectPdfBytes(bytes,filename,now);}
