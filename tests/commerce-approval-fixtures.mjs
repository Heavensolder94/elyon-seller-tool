import {createHash} from 'node:crypto';
import {createSimulationBinding} from '../lib/commerce-approval-v2-3.js';
export const fingerprint=s=>createHash('sha256').update(s).digest('hex');
export function fixtureInput({actor='fixture:alice',workspace='fixture:workspace',account='fixture:account',environment='sandbox',targets,ruleRevision=1,checkedAt=new Date().toISOString()}={}){
 const scope={simulation:true,userId:actor,workspaceId:workspace,ebayAccountId:account,environment,marketplace:'EBAY_DE',action:'Revise'};
 const target=(n,extra={})=>({productId:'p'+n,sku:'ELY-00000'+n,listingId:'000'+n,offerId:'00000'+n,productRevision:'p-rev-1',stateRevision:'ebay-state-1',
  origin:'inventory',currency:'EUR',status:'ACTIVE',environment,marketplace:'EBAY_DE',ebayAccountId:account,
  current:{price:'20.00',quantity:'3'},proposed:{price:null,quantity:'0'},supplier:{quantity:'0',available:false,checkedAt},offerCheckedAt:checkedAt,economicsStatus:'PASS',...extra});
 return {scope,ruleRevision,validationRuleVersion:'1.0.0',evidenceSha256:fingerprint('fixture-proof'),evidenceCheckedAt:checkedAt,targets:targets?targets(target):[target(1)]};
}
export const binding=options=>createSimulationBinding(fixtureInput(options));
