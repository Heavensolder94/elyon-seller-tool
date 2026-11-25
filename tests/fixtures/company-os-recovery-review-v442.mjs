// Additive, read-only V4.4.2 projection from existing legacy reservations.
// A legacy reservation has no V4.4.1 canonical approval/account binding;
// its observed offer IDs are historical and cannot be promoted to verified.
const id=v=>typeof v==='string'&&v.length>0&&v.length<=220&&v===v.trim()&&!/[\x00-\x1f\x7f]/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export const RECOVERY_REVIEW_FLAGS=Object.freeze({executionAuthorized:false,publishAuthorized:false,automaticRetryAllowed:false,reservationReleaseAllowed:false,externalStateVerified:false,sellerHubDraftVerified:false});
export function describeRecoveryReview(identity,legacy){
 const base={schemaVersion:'elyon-recovery-review-v4.4.2',productId:identity?.productId??null,articleNumber:identity?.articleNumber??null,canonicalJournalAvailable:false,status:'BLOCKED',legacyStatus:'UNKNOWN',reservationState:'UNKNOWN',taskId:null,skus:[],historicalOfferIds:[],lastConfirmedOperation:null,auditRef:null,nextAction:'MANUAL_REVIEW',missingEvidence:['CANONICAL_APPROVAL_JOURNAL_UNAVAILABLE','EXTERNAL_STATE_UNVERIFIED'],...RECOVERY_REVIEW_FLAGS};
 const statuses=['UNAVAILABLE','IDENTITY_UNRESOLVED','IDENTITY_CONFLICT','NO_LOCAL_RESERVATION','SUBMITTING','RECONCILIATION_REQUIRED','UNPUBLISHED_OFFER_VERIFIED'];
 if(!id(base.productId)||!/^ELY-\d{6,}$/.test(base.articleNumber??'')||legacy?.schemaVersion!=='elyon-inventory-reservation-status-v4.4'||legacy.productId!==base.productId||legacy.articleNumber!==base.articleNumber||!statuses.includes(legacy.status)||['executionAuthorized','publishAuthorized','automaticRetryAllowed','externalStateVerified','sellerHubDraftVerified'].some(k=>legacy[k]!==false))return base;
 if(legacy.status==='NO_LOCAL_RESERVATION')return {...base,legacyStatus:legacy.status,reservationState:'NO_LOCAL_RESERVATION',nextAction:'REVIEW_TRANSPORT_DISABLED'};
 if(!['SUBMITTING','RECONCILIATION_REQUIRED','UNPUBLISHED_OFFER_VERIFIED'].includes(legacy.status))return {...base,legacyStatus:legacy.status};
 if(!uuid(legacy.taskId)||!Array.isArray(legacy.skus)||!legacy.skus.length||legacy.skus.length>100||!legacy.skus.every(id)||new Set(legacy.skus.map(v=>v.toUpperCase())).size!==legacy.skus.length||!Array.isArray(legacy.observedOfferIds)||!legacy.observedOfferIds.every(id)||new Set(legacy.observedOfferIds).size!==legacy.observedOfferIds.length||(legacy.status==='UNPUBLISHED_OFFER_VERIFIED'?legacy.observedOfferIds.length!==legacy.skus.length:legacy.observedOfferIds.length!==0))return base;
 return {...base,legacyStatus:legacy.status,status:legacy.status==='UNPUBLISHED_OFFER_VERIFIED'?'MANUAL_REVIEW_REQUIRED':'RECONCILIATION_REQUIRED',reservationState:'HELD',taskId:legacy.taskId,skus:[...legacy.skus],historicalOfferIds:[...legacy.observedOfferIds],nextAction:'RECONCILE_READ_ONLY'};
}
