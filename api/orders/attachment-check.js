import crypto from "node:crypto";
import { requireSellerAccess } from "../../lib/seller-access.js";
import { attachmentBaseStatus, messageDeliveryEnabled } from "../../lib/order-message-attachment.js";
import { makeProbeAttachmentUrl, getProbePdf } from "../../lib/order-message-attachment-probe.js";

async function request(url) {
  return fetch(url,{
    method:"GET",redirect:"error",headers:{Accept:"application/pdf"},
    signal:AbortSignal.timeout(12000),
  });
}

export default async function handler(req,res) {
  if(!requireSellerAccess(req,res))return;
  res.setHeader("Cache-Control","no-store, private, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({ok:false,error:"method_not_allowed"});
  }
  const base=attachmentBaseStatus(process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL);
  const status={
    mode:"synthetic_pdf_only",
    attachmentBase:base,
    messageSendingEnabled:messageDeliveryEnabled(),
    signedPdfRetrieved:false,
    contentVerified:false,
    missingSignatureBlocked:false,
    alteredSignatureBlocked:false,
    expiredSignatureBlocked:false,
    ebayMessageSent:false,
    realInvoiceIssued:false,
  };
  if(!base.valid) return res.status(503).json({
    ok:false,error:"attachment_base_invalid",...status,
  });
  try {
    const signedUrl=makeProbeAttachmentUrl(base.origin);
    const signed=await request(signedUrl);
    if(signed.status!==200)return res.status(503).json({
      ok:false,error:"signed_pdf_unavailable",httpStatus:signed.status,...status,
    });
    const pdf=Buffer.from(await signed.arrayBuffer());
    const expected=getProbePdf();
    status.signedPdfRetrieved=true;
    status.contentVerified=
      String(signed.headers.get("content-type")||"").toLowerCase().includes("application/pdf") &&
      pdf.length>200 && pdf.length<300000 &&
      pdf.subarray(0,8).toString("latin1").startsWith("%PDF-1.") &&
      crypto.createHash("sha256").update(pdf).digest("hex")===
        crypto.createHash("sha256").update(expected).digest("hex");

    const unsigned=new URL(signedUrl);
    unsigned.searchParams.delete("sig");
    const altered=new URL(signedUrl);
    altered.searchParams.set("sig","0".repeat(64));
    const expired=makeProbeAttachmentUrl(base.origin,{now:Date.now()-300000});

    // Verify the public endpoint fails closed on missing, tampered, and expired signatures.
    const [u,a,e]=await Promise.all([request(unsigned),request(altered),request(expired)]);
    status.missingSignatureBlocked=u.status===404;
    status.alteredSignatureBlocked=a.status===404;
    status.expiredSignatureBlocked=e.status===404;
    const ok=status.contentVerified && status.missingSignatureBlocked &&
      status.alteredSignatureBlocked && status.expiredSignatureBlocked;
    return res.status(ok?200:503).json({
      ok,error:ok?undefined:"attachment_security_check_failed",...status,
    });
  } catch {
    // No URLs, HMAC signatures, tokens, customer details or user secrets in diagnostics.
    return res.status(503).json({
      ok:false,error:"attachment_fetch_failed",...status,
      message:"Abruf der signierten Muster-PDF fehlgeschlagen. Hosting oder Netzwerk prüfen.",
    });
  }
}
