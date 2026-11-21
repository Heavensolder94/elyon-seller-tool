import crypto from "node:crypto";
import {
  signedAttachmentQuery, verifyAttachmentQuery, attachmentBaseStatus,
} from "./order-message-attachment.js";
import { createKleinunternehmerInvoicePdf } from "./kleinunternehmer-invoice-pdf.js";

// Non-customer diagnostics. This fixed, invalid invoice never enters the Finance store.
export const PROBE_ORDER_ID = "ELYON-PDF-PROBE";
const sample = {
  taxMode:"small_business",currency:"EUR",invoiceNumber:"MUSTER-KEINE-NUMMER",
  orderId:PROBE_ORDER_ID,issuedAt:"2026-11-21T10:00:00.000Z",orderedAt:"2026-11-20T10:00:00.000Z",
  seller:{brand:"ELYON MUSTER",name:"Musterhandel (keine echte Firma)",addressLine1:"Musterstraße 1",
    postalCode:"12345",city:"Musterstadt",country:"DE",taxId:"MUSTER-KEINE-STEUERNUMMER"},
  buyer:{name:"Erika Beispiel",addressLine1:"Beispielweg 7",
    postalCode:"54321",city:"Beispielstadt",country:"DE"},
  lineItems:[{title:"Musterartikel (kein Kauf)",quantity:1,total:19.90,sku:"ELY-DEMO-000001"}],
  shipping:0,discount:0,total:19.90,
  note:"Für diesen Umsatz gilt die Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen.",
};
const SAMPLE_HASH = crypto.createHash("sha256").update(JSON.stringify(sample)).digest("hex");

export function makeProbeAttachmentUrl(baseUrl,{now=Date.now()}={}) {
  const base = attachmentBaseStatus(baseUrl);
  if(!base.valid)throw new Error("PDF-Basisadresse ist keine gültige HTTPS-Adresse.");
  const q=signedAttachmentQuery({
    orderId:PROBE_ORDER_ID,invoiceHash:SAMPLE_HASH,ttlSeconds:90,now,
  });
  const url=new URL("/api/orders/message-attachment",base.origin);
  url.searchParams.set("probe","1");
  for(const [key,value] of Object.entries(q))url.searchParams.set(key,String(value));
  return url;
}

export function verifyProbeAttachmentQuery(query,{now=Date.now()}={}) {
  return String(query?.probe ?? "")==="1" &&
    String(query?.orderId ?? "")===PROBE_ORDER_ID &&
    verifyAttachmentQuery(query,SAMPLE_HASH,{now});
}

export function getProbePdf() {
  // Watermarked, synthetic and never connected to actual order or customer data.
  return createKleinunternehmerInvoicePdf(sample,{demo:true});
}
