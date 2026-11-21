import crypto from "node:crypto";
const text = value => String(value ?? "").trim();
export const MAX_RECEIPT_BYTES = 192 * 1024;
export const orderIdValid = value => /^[A-Za-z0-9_-]{6,70}$/.test(text(value)) && !/^DEMO-/i.test(text(value));
export function parseOriginalReceipt({orderId,filename,mediaType,base64}) {
  if (!orderIdValid(orderId)) throw Error("invalid_order_id");
  if (typeof base64!=="string" || !base64 || base64.length > Math.ceil(MAX_RECEIPT_BYTES*4/3)+8 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw Error("invalid_base64");
  const bytes=Buffer.from(base64,"base64");
  if (bytes.length<16 || bytes.length>MAX_RECEIPT_BYTES || bytes.toString("base64")!==base64) throw Error("invalid_file_size");
  const pdf=bytes.subarray(0,5).toString("latin1")==="%PDF-";
  const png=bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"));
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const mime=pdf?"application/pdf":png?"image/png":jpeg?"image/jpeg":null;
  if (!mime || (mediaType && mediaType!==mime)) throw Error("unsupported_media_type");
  const name=text(filename).replace(/[\\/\x00-\x1f\x7f]/g,"_").slice(0,120)||"Originalbeleg";
  const digest=crypto.createHash("sha256").update(bytes).digest("hex");
  return {id:"supplier-original-"+crypto.createHash("sha256").update(orderId+"|"+digest).digest("hex"),
    orderId,kind:"supplier_original",filename:name,mediaType:mime,sha256:digest,sizeBytes:bytes.length,
    originalBase64:base64,origin:"user_upload",verification:"user_supplied_unverified",uploadedAt:new Date().toISOString()};
}
export function receiptMetadata(doc) {
  return {id:doc.id,orderId:doc.orderId,kind:doc.kind,filename:doc.filename,mediaType:doc.mediaType,
    sha256:doc.sha256,sizeBytes:doc.sizeBytes,uploadedAt:doc.uploadedAt,
    verification:doc.verification};
}
export function receiptBytes(doc) {
  if (doc?.kind!=="supplier_original" || !doc?.originalBase64) throw Error("missing_original");
  const buffer=Buffer.from(doc.originalBase64,"base64");
  if (buffer.length!==doc.sizeBytes || crypto.createHash("sha256").update(buffer).digest("hex")!==doc.sha256)
    throw Error("receipt_integrity_failed");
  return buffer;
}
