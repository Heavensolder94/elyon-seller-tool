import crypto from "node:crypto";
import { requireSellerAccess } from "../../lib/seller-access.js";
import { readFinanceState } from "../../lib/finance-store.js";
import { createKleinunternehmerInvoicePdf } from "../../lib/kleinunternehmer-invoice-pdf.js";
import { buildKleinunternehmerInvoiceSample } from "../../lib/kleinunternehmer-invoice-core.js";

const text = (value) => String(value ?? "").trim();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"method_not_allowed" });

  if (text(req.query?.demo) === "1") {
    // Read only: no eBay call, invoice numbering, customer send or finance writes.
    // The seller is always taken from the server-stored settings, not browser input.
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const state = await readFinanceState();
      const prepared = buildKleinunternehmerInvoiceSample(state.settings);
      if (!prepared.ok) return res.status(422).json({
        ok: false, error: "seller_invoice_settings_incomplete",
        message: "Geschäftsdaten sind noch nicht vollständig im Finance-Server gespeichert. In Finanzen → Einstellungen prüfen und 'Persistent sichern' verwenden.",
        blockers: prepared.errors,
      });
      const pdf = createKleinunternehmerInvoicePdf(prepared.sample, { demo: true });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'inline; filename="ELYON-Musterrechnung-A4-UNGUELTIG.pdf"');
      res.setHeader("Content-Length", String(pdf.length));
      return res.status(200).end(pdf);
    } catch (error) {
      return res.status(503).json({
        ok: false, error: "invoice_demo_unavailable",
        message: "Muster-PDF kann nicht geladen werden. Finanz-Server und gespeicherte Geschäftsdaten prüfen.",
      });
    }
  }

  const orderId = text(req.query?.orderId);
  if (!/^[A-Za-z0-9_-]{6,70}$/.test(orderId)) return res.status(400).json({
    ok:false, error:"invalid_order_id", message:"Gültige Bestellnummer erforderlich."
  });
  try {
    const state = await readFinanceState();
    const record = state.invoiceMeta?.[orderId];
    if (record?.immutable !== true || record.orderId !== orderId || !record.invoice ||
      record.invoice?.orderId !== orderId || record.invoice?.invoiceNumber !== record.invoiceNumber ||
      !record.invoiceNumber || !/^[A-Za-z0-9_-]{4,90}$/.test(record.invoiceNumber)) {
      return res.status(404).json({
        ok:false, error:"invoice_not_archived",
        message:"Kein vollständig ausgestellter Rechnungsbeleg für diese Bestellung vorhanden."
      });
    }
    const actualHash = sha256(JSON.stringify(record.invoice));
    if (!record.snapshotHash || record.snapshotHash !== actualHash) return res.status(409).json({
      ok:false, error:"invoice_snapshot_invalid",
      message:"Archivierter Rechnungsstand ist nicht verifizierbar. Bitte den Beleg prüfen."
    });
    let pdf;
    if (record.pdfArchiveBase64 && record.pdfSha256) {
      pdf = Buffer.from(record.pdfArchiveBase64, "base64");
      if (pdf.length !== record.pdfSizeBytes || pdf.length > 300_000 ||
        !pdf.subarray(0,8).toString("latin1").startsWith("%PDF-1.") ||
        sha256(pdf) !== record.pdfSha256) return res.status(409).json({
          ok:false, error:"invoice_pdf_integrity_failed",
          message:"Die archivierte PDF-Prüfsumme stimmt nicht. Datei nicht ausgegeben."
        });
    } else {
      // Historical immutable invoices predate PDF archiving: regenerate read-only
      // from their verified original invoice snapshot without mutating it.
      pdf = createKleinunternehmerInvoicePdf(record.invoice);
    }
    const download = text(req.query?.download) === "1";
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",(download?"attachment":"inline")+
      '; filename="ELYON-Rechnung-'+record.invoiceNumber+'.pdf"');
    res.setHeader("Content-Length",String(pdf.length));
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Cache-Control","private, no-store, max-age=0");
    return res.status(200).end(pdf);
  } catch (error) {
    return res.status(503).json({
      ok:false, error:"invoice_pdf_unavailable",
      message:"PDF konnte nicht geladen werden: "+(error?.message||"Unbekannter Fehler")
    });
  }
}
