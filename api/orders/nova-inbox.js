import {requireSellerAccess} from "../../lib/seller-access.js";
import {readFinanceState,writeFinanceState,getFinanceStoreDescription} from "../../lib/finance-store.js";
import {verifyNovaPairToken,parseNovaOrderCapture,novaInboxView} from "../../lib/nova-supplier-sync.js";

const str=value=>String(value??"").trim();
export default async function handler(req,res) {
  res.setHeader("Cache-Control","private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false,error:"method_not_allowed"});
  if(req.method==="GET") {
    if(!requireSellerAccess(req,res))return;
    try {
      const data=await readFinanceState();
      return res.status(200).json({ok:true,items:novaInboxView(data),
        persistent:getFinanceStoreDescription().persistent===true});
    } catch {
      return res.status(503).json({ok:false,error:"nova_inbox_unavailable"});
    }
  }

  // No cookie, full SellerTool unlock key, or arbitrary bearer token can
  // authorize this path: only a purpose-scoped, short-lived pairing token.
  const bearer=str(req.headers?.authorization).match(/^Bearer\s+(.+)$/i)?.[1]||"";
  if(!verifyNovaPairToken(bearer))
    return res.status(403).json({ok:false,error:"nova_pairing_required",message:"Nova-Kopplung fehlt oder ist abgelaufen."});
  const bytes=Buffer.byteLength(JSON.stringify(req.body??{}),"utf8");
  if(bytes>4096)return res.status(413).json({ok:false,error:"capture_too_large"});
  if(!getFinanceStoreDescription().persistent)
    return res.status(503).json({ok:false,error:"finance_store_unavailable"});
  let record;
  try {record=parseNovaOrderCapture(req.body);}
  catch(error) {return res.status(400).json({ok:false,error:error.message||"invalid_capture"});}
  try {
    for(let attempt=0;attempt<4;attempt++){
      const before=await readFinanceState();
      const items=before.imports.filter(item=>item?.kind==="nova_supplier_order");
      const previous=items.find(item=>item.id===record.id);
      if(previous){
        if(previous.supplierSku!==record.supplierSku)
          return res.status(409).json({ok:false,error:"capture_reference_conflict",
            message:"Diese Lieferantenbestellung existiert mit anderer SKU. Bitte im SellerTool prüfen."});
        return res.status(200).json({ok:true,duplicate:true,id:record.id});
      }
      if(items.length>=500)return res.status(409).json({ok:false,error:"nova_inbox_full"});
      const outcome=await writeFinanceState({imports:[record]},{
        action:"nova_supplier_order_received",source:"nova_extension",actor:"nova_extension",
        summary:"Lieferantenreferenz in Nova-Eingang aufgenommen; keine eBay- oder Finanzbuchung."
      },{expectedRevision:before.revision});
      if(outcome.ok)return res.status(201).json({ok:true,id:record.id,stored:true});
      if(!outcome.conflict)return res.status(503).json({ok:false,error:"finance_store_unavailable"});
    }
    return res.status(409).json({ok:false,error:"finance_conflict",message:"Bitte Import wiederholen."});
  } catch {
    return res.status(503).json({ok:false,error:"nova_inbox_unavailable"});
  }
}
