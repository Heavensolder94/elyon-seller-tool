import crypto from "node:crypto";

const PURPOSE = "elyon_nova_supplier_ingest";
const TOKEN_PREFIX = "nv1";
// Manual re-pair after 90 days. Existing 14-day tokens retain their signed expiry.
export const NOVA_PAIR_TTL_SECONDS = 90 * 24 * 60 * 60;
const text = value => String(value ?? "").trim();
const obj = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const SUPPLIERS = Object.freeze({temu:"Temu", aliexpress:"AliExpress", amazon:"Amazon", cj:"CJ Dropshipping"});

function accessKey() {
  let key = String(process.env.ELYON_SELLER_ACCESS_TOKEN || "")
    .normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (key.length >= 2 && ["\"", "'", "`"].includes(key[0]) && key.at(-1) === key[0]) key = key.slice(1,-1).trim();
  return key;
}
function mac(segment,key) {
  return crypto.createHmac("sha256",key).update(PURPOSE + ":" + segment).digest("base64url");
}
function safeEqual(a,b) {
  const first=Buffer.from(text(a)),second=Buffer.from(text(b));
  return first.length>0 && first.length===second.length && crypto.timingSafeEqual(first,second);
}
export function issueNovaPairToken(now = Date.now()) {
  const key=accessKey();
  if(!key) throw new Error("seller_access_not_configured");
  const exp=Math.floor(now/1000)+NOVA_PAIR_TTL_SECONDS;
  const segment=Buffer.from(JSON.stringify({v:1,purpose:PURPOSE,exp,
    nonce:crypto.randomBytes(12).toString("hex")})).toString("base64url");
  return {token:TOKEN_PREFIX+"."+segment+"."+mac(segment,key),expiresAt:new Date(exp*1000).toISOString()};
}
export function verifyNovaPairToken(token,now = Date.now()) {
  const parts=text(token).split(".");
  if(parts.length!==3 || parts[0]!==TOKEN_PREFIX || parts[1].length>512 || parts[2].length>128)return false;
  const key=accessKey();
  if(!key || !safeEqual(parts[2],mac(parts[1],key)))return false;
  try{
    const data=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
    const time=Math.floor(now/1000);
    return data.v===1 && data.purpose===PURPOSE &&
      Number.isSafeInteger(data.exp) && data.exp>time && data.exp<=time+NOVA_PAIR_TTL_SECONDS+60 &&
      /^[a-f0-9]{24}$/.test(data.nonce);
  }catch{return false;}
}
export function parseNovaOrderCapture(input) {
  const raw=obj(input);
  if(raw.schema!=="elyon-supplier-order-capture/v1" || raw.source!=="elyon_nova_direct_sync" || raw.verified!==false)
    throw new Error("invalid_nova_capture");
  const supplierId=text(raw.supplierId),supplierName=SUPPLIERS[supplierId];
  if(!supplierName || raw.supplierName!==supplierName)throw new Error("invalid_supplier");
  const supplierOrderId=text(raw.supplierOrderId);
  if(!/^[A-Za-z0-9-]{7,80}$/.test(supplierOrderId))throw new Error("invalid_supplier_order_id");
  const supplierSku=text(raw.supplierSku);
  if(supplierSku.length>160 || /[\x00-\x1f\x7f]/.test(supplierSku))throw new Error("invalid_supplier_sku");
  const id="nova_supplier_"+crypto.createHash("sha256").update(supplierId+"\u0000"+supplierOrderId).digest("hex").slice(0,24);
  return {id,kind:"nova_supplier_order",schema:raw.schema,supplierId,supplierName,
    supplierOrderId,supplierSku,source:"elyon_nova_direct_sync",
    verified:false,reviewStatus:"pending",createdAt:new Date().toISOString()};
}
export function novaInboxView(financeState) {
  const operations=obj(financeState?.orderOperations);
  return (Array.isArray(financeState?.imports)?financeState.imports:[])
    .filter(x=>x?.kind==="nova_supplier_order")
    .map(x=>{
      const linkedOrders=Object.entries(operations).filter(([id,op])=>id &&
        text(op?.supplierOrderId)===text(x.supplierOrderId) &&
        text(op?.supplierName).toLowerCase()===text(x.supplierName).toLowerCase()).map(([id])=>id);
      return {id:x.id,supplierId:x.supplierId,supplierName:x.supplierName,
        supplierOrderId:x.supplierOrderId,supplierSku:x.supplierSku||"",
        createdAt:x.createdAt,linkedOrders,verified:false,
        schema:"elyon-supplier-order-capture/v1",source:"elyon_nova_manual_capture"};
    })
    .sort((a,b)=>text(b.createdAt).localeCompare(text(a.createdAt))).slice(0,150);
}
