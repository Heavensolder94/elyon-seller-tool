const stamp=()=>new Date().toISOString();
export function readback(b,{desired=false,checkedAt=stamp()}={}){
 return {simulation:true,rows:b.targets.map(t=>({sku:t.sku,offerId:t.offerId,listingId:t.listingId,variantId:t.variantId,ebayAccountId:b.scope.ebayAccountId,environment:b.scope.environment,marketplace:b.scope.marketplace,currency:t.currency,origin:'inventory',status:'ACTIVE',checkedAt,productRevision:t.productRevision,stateRevision:t.stateRevision,ruleRevision:b.ruleRevision,validationRuleVersion:b.validationRuleVersion,economicsStatus:'PASS',supplier:{...t.supplier,checkedAt},price:desired?(t.proposed.price??t.current.price):t.current.price,quantity:desired?(t.proposed.quantity??t.current.quantity):t.current.quantity}))};
}
export function response(t,patch={}){
 return {simulation:true,kind:'response',httpStatus:200,body:{responses:[{sku:t.sku,offerId:t.offerId,statusCode:200,...patch}]}};
}
