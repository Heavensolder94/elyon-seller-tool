import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createKleinunternehmerInvoicePdf } from "../lib/kleinunternehmer-invoice-pdf.js";
import { buildKleinunternehmerInvoiceSample } from "../lib/kleinunternehmer-invoice-core.js";

const invoice = () => ({
  invoiceNumber:"ELYON-2026-000001",issuedAt:"2026-11-21T09:00:00.000Z",
  orderedAt:"2026-11-20T10:30:00.000Z",orderId:"12-12345-98765",
  taxMode:"small_business",currency:"EUR",
  seller:{brand:"ELYON",name:"Raoul Beispiel",addressLine1:"Musterstraße 10",
    postalCode:"12345",city:"Berlin",country:"DE",taxId:"12/345/67890"},
  buyer:{name:"Änne Müller",addressLine1:"Über den Hügel 3",postalCode:"54321",city:"Köln",country:"DE"},
  lineItems:[{title:"USB-C Schreibtischlampe mit schwenkbarem Leuchtkopf",quantity:2,total:54.8,sku:"ELY-000001"}],
  shipping:5.1,discount:0,total:59.9,
  note:"Für diesen Umsatz gilt die Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen.",
});

const strings = (pdf) => [...pdf.toString("latin1").matchAll(/<([0-9A-F]+)> Tj/g)]
  .map(match=>Buffer.from(match[1],"hex").toString("latin1"));

test("actual, not HTML-print, A4 PDF has valid header, xref and one-page MediaBox",()=>{
  const pdf=createKleinunternehmerInvoicePdf(invoice());
  const source=pdf.toString("latin1");
  assert.match(source,/^%PDF-1\.4/);
  assert.match(source,/\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(source,/\/Count 1 /);
  assert.match(source,/\/BaseFont \/Helvetica/);
  assert.match(source,/\/BaseFont \/Helvetica-Bold/);
  assert.match(source,/\/Encoding \/WinAnsiEncoding/);
  assert.match(source,/xref\n0 \d+\n0000000000 65535 f /);
  const match=source.match(/startxref\n(\d+)\n%%EOF/);
  assert.ok(match);
  assert.equal(source.slice(Number(match[1]),Number(match[1])+4),"xref");
  assert.ok(pdf.length>2000 && pdf.length<300000);
});

test("invoice text contains DIN-5008-style address, buyer, metadata, tax note and exact total",()=>{
  const data=strings(createKleinunternehmerInvoicePdf(invoice())).join("\n");
  for(const piece of [
    "RECHNUNG","Rechnung für Ihre Bestellung","Rechnungsnummer","Rechnungsdatum",
    "Bestelldatum","eBay-Bestellung","ELYON-2026-000001","Änne Müller",
    "Raoul Beispiel","Musterstraße 10","USB-C Schreibtischlampe",
    "Rechnungsbetrag","59,90", "Kleinunternehmerregelung","§ 19 UStG",
  ]) assert.ok(data.includes(piece),piece);
  assert.ok(!data.includes("Umsatzsteuer 19 %"),"must not introduce VAT");
});

test("watermarked sample is not a real invoice and requires no data write",async()=>{
  const sample=createKleinunternehmerInvoicePdf(invoice(),{demo:true});
  const content=strings(sample).join(" ");
  assert.ok(content.includes("MUSTER  ·  KEINE GÜLTIGE RECHNUNG"));
  assert.ok(content.includes("MUSTER - NICHT ZUR VERWENDUNG"));
  const endpoint=await readFile(new URL("../api/finance/invoice-pdf.js",import.meta.url),"utf8");
  const ui=await readFile(new URL("../seller-order-invoices.js",import.meta.url),"utf8");
  assert.ok(endpoint.includes("req.query?.demo"));
  assert.ok(endpoint.includes("buildKleinunternehmerInvoiceSample(state.settings)"));
  assert.ok(endpoint.includes("createKleinunternehmerInvoicePdf(prepared.sample, { demo: true })"));
  assert.ok(endpoint.includes("seller_invoice_settings_incomplete"));
  assert.ok(endpoint.includes("readFinanceState()"));
  assert.ok(ui.includes("data-eoi-pdf-demo"));
  assert.ok(ui.includes("/api/finance/invoice-pdf?demo=1"));
});

test("demo builds from persisted real seller fields, but keeps fictitious buyer and watermark",()=> {
  const settings={
    taxMode:"small_business",
    sellerLegalName:"Beispiel Unternehmer",
    sellerBrand:"Mein Beispielshop",
    sellerStreet:"Kaufmannstraße 5",
    sellerPostalCode:"10115",
    sellerCity:"Berlin",
    sellerCountry:"DE",
    sellerTaxId:"DE123456789",
  };
  const built=buildKleinunternehmerInvoiceSample(settings,{now:new Date("2026-11-21T12:00:00Z")});
  assert.equal(built.ok,true);
  assert.equal(built.sample.seller.name,settings.sellerLegalName);
  assert.equal(built.sample.seller.addressLine1,settings.sellerStreet);
  assert.equal(built.sample.seller.postalCode,settings.sellerPostalCode);
  assert.equal(built.sample.seller.city,settings.sellerCity);
  assert.equal(built.sample.seller.taxId,settings.sellerTaxId);
  assert.equal(built.sample.seller.brand,settings.sellerBrand);
  assert.equal(built.sample.invoiceNumber,"MUSTER-KEINE-NUMMER");
  assert.equal(built.sample.orderId,"DEMO-1001");
  assert.equal(built.sample.buyer.name,"Erika Beispiel");

  const pdf=createKleinunternehmerInvoicePdf(built.sample,{demo:true});
  const rendered=strings(pdf).join("\n");
  for(const value of [
    "MUSTER - NICHT ZUR VERWENDUNG","MUSTER  ·  KEINE GÜLTIGE RECHNUNG",
    settings.sellerLegalName,settings.sellerStreet,
    settings.sellerPostalCode,settings.sellerCity,settings.sellerTaxId,settings.sellerBrand,
    "Erika Beispiel","MUSTER-KEINE-NUMMER","St.-Nr. / USt-IdNr."]) {
    assert.ok(rendered.includes(value),value);
  }
  assert.ok(!rendered.includes("Max Musterhändler"));
  assert.match(pdf.toString("latin1"),/\/Count 1 /);
});

test("demo never silently substitutes fictional sender data when Finance server settings are incomplete",()=> {
  for(const settings of [{},{taxMode:"small_business",sellerLegalName:"Nur Name"}]){
    const result=buildKleinunternehmerInvoiceSample(settings);
    assert.equal(result.ok,false);
    assert.equal(result.sample,null);
    assert.ok(result.errors.length>0);
  }
});

test("same archived snapshot produces byte-identical PDF with stable checksum",()=>{
  const a=createKleinunternehmerInvoicePdf(invoice());
  const b=createKleinunternehmerInvoicePdf(structuredClone(invoice()));
  assert.ok(a.equals(b));
  assert.equal(crypto.createHash("sha256").update(a).digest("hex").length,64);
});

test("large invoices split into A4 pages and keep all line items",()=>{
  const value=invoice();
  value.lineItems=Array.from({length:38},(_,i)=>({
    title:"Ausführlicher Artikel "+String(i+1).padStart(2,"0")+
      " – in einer hochwertigen, sorgfältig gewählten Ausführung",
    quantity:1,total:2.5,sku:"ELY-"+String(i+1).padStart(6,"0"),
  }));
  value.total=95;
  value.shipping=0;
  const pdf=createKleinunternehmerInvoicePdf(value);
  const content=pdf.toString("latin1");
  assert.match(content,/\/Count [2-9] /);
  assert.ok(strings(pdf).some(line=>line.includes("Ausführlicher Artikel 38")));
  assert.ok(strings(pdf).some(line=>line.includes("95,00")));
});

test("invalid or unsupported data fails visibly instead of producing misleading text",()=>{
  const noTax=invoice();noTax.seller.taxId="";
  assert.throws(()=>createKleinunternehmerInvoicePdf(noTax),/vollständig/);
  const bad=invoice();bad.buyer.name="日本";
  assert.throws(()=>createKleinunternehmerInvoicePdf(bad),/PDF-Schrift unterstützt/);
});

test("PDF is persisted with immutable invoice and SHA-256, with guarded server download",async()=>{
  const [store,endpoint,ui]=await Promise.all([
    readFile(new URL("../lib/kleinunternehmer-invoice-store.js",import.meta.url),"utf8"),
    readFile(new URL("../api/finance/invoice-pdf.js",import.meta.url),"utf8"),
    readFile(new URL("../seller-order-invoices.js",import.meta.url),"utf8"),
  ]);
  assert.match(store,/createKleinunternehmerInvoicePdf\(invoice\)/);
  assert.match(store,/pdfArchiveBase64: pdf\.toString\('base64'\)/);
  assert.match(store,/pdfSha256/);
  assert.match(store,/immutable: true/);
  assert.match(endpoint,/requireSellerAccess\(req, res\)/);
  assert.match(endpoint,/record\.snapshotHash !== actualHash/);
  assert.match(endpoint,/sha256\(pdf\) !== record\.pdfSha256/);
  assert.match(endpoint,/invoice_pdf_integrity_failed/);
  assert.match(endpoint,/Content-Type","application\/pdf"/);
  assert.match(endpoint,/filename="ELYON-Rechnung-/);
  assert.match(ui,/api\/finance\/invoice-pdf\?orderId=/);
  assert.match(ui,/data-eoi-download/);
  assert.match(ui,/data-eoi-archive/);
  assert.match(ui,/downloadInvoice\(pdfDownloadButton\.dataset\.eoiDownload\)/);
});
