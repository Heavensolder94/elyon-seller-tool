import { loadProductMasterForSeller, resolveProductMasterRecord, fetchCompanyOsAdvancedListingReview, draftApprovalStatusSummary, draftApprovalReviewText } from "../../lib/product-master-consumer.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

function text(value) {
  return String(value ?? "").trim();
}

async function loadProducts() {
  const result = await loadProductMasterForSeller();
  return result.products;
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  try {
    // Explicit read-only approval metadata for the Seller Auto Lister.
    if(Object.hasOwn(req.query||{},'approvalReview')){
      const q=req.query;
      if(req.method!=='GET'||q.approvalReview!=='1'||Object.keys(q).length!==2||typeof q.productId!=='string')return res.status(422).json({ok:false,error:'invalid_approval_review_query'});
      const review=await fetchCompanyOsAdvancedListingReview({productId:q.productId});
      const summary=draftApprovalStatusSummary(review);
      return res.status(200).json({schemaVersion:'elyon-seller-approval-review-v4.4.1',productId:q.productId,summary,displayText:draftApprovalReviewText(summary),executionAuthorized:false,publishAuthorized:false,automaticApprovalAllowed:false,liveEnabled:false});
    }
    // Opt-in branch, no effect on the existing draft route.
    if(Object.hasOwn(req.query||{},"advancedReview")){
      const q=req.query;
      if(req.method!=="GET"||q.advancedReview!=="1"||Object.keys(q).length!==2||typeof q.productId!=="string")return res.status(422).json({ok:false,error:"invalid_advanced_review_query"});
      res.setHeader("Cache-Control","no-store");
      const review=await fetchCompanyOsAdvancedListingReview({productId:q.productId});
      return res.status(200).json(review);
    }
    const products = await loadProducts();
    const identity = text(req.query?.id || req.query?.articleNumber || req.query?.sku || req.query?.listingId || req.query?.offerId);
    const product = identity ? resolveProductMasterRecord(products, {
      articleNumber: identity,
      sku: identity,
      listingId: identity,
      offerId: identity,
      productId: identity,
      companyOsProductId: identity,
      productKey: identity,
      sourceImportId: identity,
      supplierSku: identity,
    }) : null;
    if (!product) return res.status(404).json({ ok: false, error: "Produkt nicht gefunden" });

    return res.status(200).json({
      ok: true,
      status: "draft_prepared",
      productId: product.identity.productId || product.identity.companyOsProductId || product.identity.articleNumber,
      sourceOfTruth: "company_os_canonical_state",
      draft: {
        title: text(product.listing?.title || product.title || "Produkt").slice(0, 80),
        description: product.listing?.descriptionHtml || product.description || "Bitte Beschreibung prüfen",
        price: product.economics?.salePrice ?? null,
        images: Array.isArray(product.images) ? product.images : [],
        manualApprovalRequired: true,
        automaticPublishAllowed: false,
        channelState: product.channels?.ebay || null,
      },
      safety: { automaticListing: false, automaticOrder: false },
    });
  } catch (error) {
    return res.status(Number(error?.status || 503)).json({ ok: false, error: error?.message || "Draft Fehler" });
  }
}
