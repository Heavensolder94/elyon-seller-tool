import { extractUblReceipt } from './receipt-ubl.js';
import { extractReceiptTextSuggestions } from './receipt-text.js';

// Extract exactly one embedded XML. Original PDF bytes remain untouched.
export async function extractStructuredReceiptFromPdf(bytes) {
 if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > 2500000 || Buffer.from(bytes.subarray(0,5)).toString() !== '%PDF-') throw new Error('Ungültiges PDF oder Datei größer als 2,5 MB.');
 const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading = getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,disableWorker:true});
 let doc;
 try {
  doc=await loading.promise;
  const attachments=await doc.getAttachments();
  const xml=Object.values(attachments || {}).filter(item=>/\.xml$/i.test(String(item.filename||'')));
  if(xml.length>1)throw new Error('Mehrere eingebettete XML-Dateien; bitte Original manuell prüfen.');
  if(xml.length===0){
   if(doc.numPages>10)throw new Error('PDF enthält zu viele Seiten für die Texterkennung.');
   const lines=[];let count=0;
   for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
    const page=await doc.getPage(pageNumber);const content=await page.getTextContent();let line='',lastY;
    for(const item of content.items){
     if(typeof item.str!=='string')continue;
     count+=item.str.length;if(count>200000)throw new Error('PDF-Text überschreitet das Limit.');
     const y=Array.isArray(item.transform)?item.transform[5]:undefined;
     if(line && Number.isFinite(y) && Number.isFinite(lastY) && Math.abs(y-lastY)>2){lines.push(line);line='';}
     line+=(line?' ':'')+item.str;lastY=y;
     if(item.hasEOL){lines.push(line);line='';lastY=undefined;}
    }
    if(line)lines.push(line);page.cleanup();
   }
   if(!lines.some(line=>line.trim()))throw new Error('Kein auslesbarer PDF-Text; Original manuell prüfen.');
   return extractReceiptTextSuggestions(lines.join('\n'));
  }
  const data=xml[0].content;
  if(!(data instanceof Uint8Array)||data.length>1000000)throw new Error('Eingebettetes XML fehlt oder überschreitet 1 MB.');
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(data)}catch{throw new Error('XML-Kodierung wird nicht unterstützt; Original manuell prüfen.');}
  return extractUblReceipt(text);
 } finally { if(doc)await doc.destroy();else await loading.destroy(); }
}
