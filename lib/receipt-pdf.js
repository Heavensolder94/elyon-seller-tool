import { extractUblReceipt } from './receipt-ubl.js';

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
  if(xml.length!==1)throw new Error('PDF muss genau eine eingebettete XML-Datei enthalten; bitte Original manuell prüfen.');
  const data=xml[0].content;
  if(!(data instanceof Uint8Array)||data.length>1000000)throw new Error('Eingebettetes XML fehlt oder überschreitet 1 MB.');
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(data)}catch{throw new Error('XML-Kodierung wird nicht unterstützt; Original manuell prüfen.');}
  return extractUblReceipt(text);
 } finally { if(doc)await doc.destroy();else await loading.destroy(); }
}
