import {requireSellerAccess} from "../../lib/seller-access.js";
import {readFinanceState,writeFinanceState,getFinanceStoreDescription} from "../../lib/finance-store.js";
import {parseOriginalReceipt,receiptBytes,receiptMetadata,orderIdValid} from "../../lib/order-supplier-receipts.js";

const str=value=>String(value??"").trim();
const documentsFor=(state,orderId)=>(Array.isArray(state.documents)?state.documents:[])
  .filter(doc=>doc?.kind==="supplier_original" && doc.orderId===orderId);
export default async function handler(req,res){
  res.setHeader("Cache-Control","private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!requireSellerAccess(req,res,{maxBodyBytes:280*1024})) return;
  if(!["GET","POST"].includes(req.method)) return res.status(405).json({ok:false,error:"method_not_allowed"});
  const orderId=str(req.method==="GET"?req.query?.orderId:req.body?.orderId);
  if(!orderIdValid(orderId)) return res.status(400).json({ok:false,error:"invalid_order_id"});
  try{
    if(req.method==="GET"){
      const state=await readFinanceState();
      const list=documentsFor(state,orderId);
      const documentId=str(req.query?.documentId);
      if(documentId){
        const doc=list.find(d=>d.id===documentId);
        if(!doc)return res.status(404).json({ok:false,error:"receipt_not_found"});
        const bytes=receiptBytes(doc);
        res.setHeader("Content-Type",doc.mediaType);
        res.setHeader("Content-Disposition","attachment; filename*=UTF-8''"+encodeURIComponent(doc.filename));
        res.setHeader("Content-Length",String(bytes.length));
        return res.status(200).end(bytes);
      }
      return res.status(200).json({ok:true,orderId,documents:list.map(receiptMetadata)});
    }
    if(!getFinanceStoreDescription().persistent) return res.status(503).json({ok:false,error:"finance_store_unavailable"});
    const body=req.body && typeof req.body==="object" && !Array.isArray(req.body)?req.body:{};
    if(!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0)
      return res.status(409).json({ok:false,error:"revision_required"});
    let receipt;
    try {receipt=parseOriginalReceipt(body);}
    catch(error){return res.status(400).json({ok:false,error:error.message});}
    const state=await readFinanceState();
    if(state.revision!==body.expectedRevision) return res.status(409).json({ok:false,error:"finance_conflict",currentRevision:state.revision});
    const existing=documentsFor(state,orderId).find(d=>d.id===receipt.id);
    if(existing){
      receiptBytes(existing);
      return res.status(200).json({ok:true,existing:true,revision:state.revision,document:receiptMetadata(existing)});
    }
    if(documentsFor(state,orderId).length>=15)return res.status(409).json({ok:false,error:"receipt_limit_reached"});
    const result=await writeFinanceState({documents:[receipt]},{
      action:"supplier_receipt_uploaded",actor:"seller",source:"orders_center",
      summary:"Originaldatei vom Nutzer einer Bestellung zugeordnet; keine Lieferantenrechnung erzeugt."
    },{expectedRevision:state.revision});
    if(!result.ok)return res.status(result.conflict?409:503).json({ok:false,error:result.conflict?"finance_conflict":"finance_store_unavailable"});
    return res.status(201).json({ok:true,revision:result.state.revision,document:receiptMetadata(receipt)});
  }catch{
    return res.status(503).json({ok:false,error:"receipt_unavailable",message:"Belegspeicher oder Integritätsprüfung nicht verfügbar."});
  }
}
