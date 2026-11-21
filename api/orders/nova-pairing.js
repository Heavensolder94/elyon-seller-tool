import {requireSellerAccess} from "../../lib/seller-access.js";
import {issueNovaPairToken,NOVA_PAIR_TTL_SECONDS} from "../../lib/nova-supplier-sync.js";

// Pairing requires a logged-in SellerTool user. The real seller unlock secret is
// NEVER returned or stored in the extension. The scoped token can only ingest
// supplier references; it cannot read orders or perform any eBay/finance actions.
export default function handler(req,res) {
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"method_not_allowed"});
  if(!requireSellerAccess(req,res,{maxBodyBytes:2048}))return;
  try {
    const data=issueNovaPairToken();
    return res.status(200).json({ok:true,...data,expiresIn:NOVA_PAIR_TTL_SECONDS,
      scope:"nova_supplier_ingest"});
  } catch {
    return res.status(503).json({ok:false,error:"pairing_unavailable"});
  }
}
