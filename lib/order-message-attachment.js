import crypto from "node:crypto";
import { createKleinunternehmerInvoicePdf } from "./kleinunternehmer-invoice-pdf.js";
const str = value => String(value ?? "").trim();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const validOrder = value => /^[A-Za-z0-9_-]{6,70}$/.test(str(value));

export function verifiedInvoicePdf(record, orderId) {
  if (!validOrder(orderId) || record?.immutable !== true || record?.orderId !== orderId ||
      record?.invoice?.orderId !== orderId ||
      !record?.invoiceNumber || record?.invoice?.invoiceNumber !== record.invoiceNumber ||
      !record?.snapshotHash || sha(JSON.stringify(record.invoice)) !== record.snapshotHash) {
    throw new Error("Ausgestellter Rechnungsbeleg ist nicht eindeutig verifizierbar.");
  }
  let buffer;
  if (record.pdfArchiveBase64 && record.pdfSha256) {
    buffer=Buffer.from(record.pdfArchiveBase64,"base64");
    if (buffer.length!==record.pdfSizeBytes || sha(buffer)!==record.pdfSha256)
      throw new Error("Die PDF-Prüfsumme im Rechnungsarchiv stimmt nicht.");
  } else {
    buffer=createKleinunternehmerInvoicePdf(record.invoice);
  }
  if(buffer.length>300000 || buffer.length<200 || !buffer.subarray(0,8).toString("latin1").startsWith("%PDF-1."))
    throw new Error("Ungültige oder zu große Rechnungs-PDF.");
  return buffer;
}

function signingSecret(){
  const value=str(process.env.ELYON_SELLER_ACCESS_TOKEN);
  if(value.length<20) throw new Error("Serverseitiges Zugriffsgeheimnis ist nicht eingerichtet.");
  return value;
}
function mac(payload) { return crypto.createHmac("sha256",signingSecret()).update(payload).digest("hex"); }
export function signedAttachmentQuery({orderId,invoiceHash,ttlSeconds=600,now=Date.now()}) {
  if(!validOrder(orderId) || !/^[a-f0-9]{64}$/.test(str(invoiceHash)))
    throw new Error("Bestellidentität oder Rechnungs-Hash ungültig.");
  const expiry=Math.floor(now/1000)+Math.min(900,Math.max(60,ttlSeconds));
  const payload=orderId+"|"+invoiceHash+"|"+expiry;
  return {orderId,exp:expiry,sig:mac(payload)};
}
export function verifyAttachmentQuery(query,invoiceHash,{now=Date.now()}={}) {
  const orderId=str(query?.orderId),exp=Number(query?.exp),sig=str(query?.sig);
  if(!validOrder(orderId) || !Number.isSafeInteger(exp) ||
     exp<Math.floor(now/1000) || exp>Math.floor(now/1000)+900 ||
     !/^[0-9a-f]{64}$/.test(sig) || !/^[0-9a-f]{64}$/.test(str(invoiceHash))) return false;
  const expected=mac(orderId+"|"+invoiceHash+"|"+exp);
  return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));
}
export function attachmentUrl({orderId,invoiceHash,baseUrl}) {
  const base=new URL(str(baseUrl));
  if(base.protocol!=="https:" || base.username || base.password ||
     base.search || base.hash || base.pathname!=="/" || !base.hostname ||
     base.hostname.endsWith(".local") || base.hostname==="localhost")
    throw new Error("Eine öffentliche HTTPS-Domain für sichere PDF-Anhänge ist erforderlich.");
  const query=signedAttachmentQuery({orderId,invoiceHash});
  const url=new URL("/api/orders/message-attachment",base.origin);
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  return url.toString();
}
export function messageDeliveryEnabled() {
  return process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED === "true" &&
    Boolean(str(process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL));
}
