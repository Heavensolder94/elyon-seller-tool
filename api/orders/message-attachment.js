import { readFinanceState } from "../../lib/finance-store.js";
import { verifiedInvoicePdf, verifyAttachmentQuery } from "../../lib/order-message-attachment.js";
import { getProbePdf, verifyProbeAttachmentQuery } from "../../lib/order-message-attachment-probe.js";
const text = x => String(x??"").trim();
// Deliberately no seller session: eBay fetches this short-lived, HMAC-scoped URL.
// Never expose the normal authenticated archive through a public link.
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  if(req.method!=="GET")return res.status(405).end();
  if(text(req.query?.probe)==="1") {
    // Only a short-lived, specially signed synthetic demo; never reads customer records.
    if(!verifyProbeAttachmentQuery(req.query))return res.status(404).end();
    try {
      const pdf=getProbePdf();
      res.setHeader("Content-Type","application/pdf");
      res.setHeader("Content-Disposition",'attachment; filename="ELYON-MUSTER-UNGUELTIG.pdf"');
      res.setHeader("Content-Length",String(pdf.length));
      return res.status(200).end(pdf);
    } catch {return res.status(404).end();}
  }
  const orderId=text(req.query?.orderId);
  if(!/^[A-Za-z0-9_-]{6,70}$/.test(orderId))return res.status(404).end();
  try {
    const state=await readFinanceState();
    const record=state.invoiceMeta?.[orderId];
    if(!record || !verifyAttachmentQuery(req.query,record.snapshotHash))return res.status(404).end();
    const pdf=verifiedInvoicePdf(record,orderId);
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition","attachment; filename=ELYON-Rechnung.pdf");
    res.setHeader("Content-Length",String(pdf.length));
    return res.status(200).end(pdf);
  } catch {return res.status(404).end();}
}
