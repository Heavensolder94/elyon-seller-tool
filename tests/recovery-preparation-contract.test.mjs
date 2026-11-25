// Exact Company OS producer snapshot from 4c029a3719eb535225b8a42a42e1049c96096cd1; not a handwritten response.
import test from 'node:test';
import assert from 'node:assert/strict';
import {describeRecoveryReview,describeHistoricalFeedRecovery,RECOVERY_REVIEW_FLAGS} from './fixtures/company-os-recovery-review-v442.mjs';
import {recoveryPreparationSummary,recoveryPreparationText} from '../lib/product-master-consumer.js';
const identity={productId:'fixture-product',articleNumber:'ELY-123456'};
const legacy={schemaVersion:'elyon-inventory-reservation-status-v4.4',...identity,status:'SUBMITTING',taskId:'11111111-1111-4111-8111-111111111111',payloadSha256:'a'.repeat(64),sourceRevisionSha256:'b'.repeat(64),categoryId:'123',skus:[identity.articleNumber],observedOfferIds:[],...RECOVERY_REVIEW_FLAGS};
function review(l=legacy){return {request:{targetId:identity.productId},transportReadiness:{identity},inventoryReservation:l,recoveryPreparation:describeRecoveryReview(identity,l)};}
test('actual Company OS recovery producer interoperates with Seller Tool read consumer',()=>{
 const x=recoveryPreparationSummary(review());assert.equal(x.status,'RECONCILIATION_REQUIRED');assert.equal(x.reservationState,'HELD');assert.equal(x.canonicalJournalAvailable,false);assert.match(recoveryPreparationText(x),/Abgleich erforderlich/);
 const historical=recoveryPreparationSummary(review({...legacy,status:'UNPUBLISHED_OFFER_VERIFIED',observedOfferIds:['fixture-offer']}));assert.equal(historical.status,'MANUAL_REVIEW_REQUIRED');assert.match(recoveryPreparationText(historical),/Historische Offer-Identität/);
 assert.equal(recoveryPreparationSummary({}),null);
});
test('tampered recovery claims cannot grant authority or replace reservation identity',()=>{
 const r=review();for(const patch of [{productId:'foreign'},{taskId:'11111111-1111-4111-8111-111111111112'},{canonicalJournalAvailable:true},{executionAuthorized:true},{publishAuthorized:true},{automaticRetryAllowed:true},{reservationReleaseAllowed:true},{externalStateVerified:true},{historicalOfferIds:['forged']},{skus:['foreign']},{status:'RECOVERED'}])assert.throws(()=>recoveryPreparationSummary({...r,recoveryPreparation:{...r.recoveryPreparation,...patch}}),{code:'invalid_recovery_preparation_contract'});
});

test('exact historical Feed projection is correlated and never grants draft or retry authority',()=>{
 const r=review(),refs={feedTaskId:'fixture-feed',feedState:'COMPLETED',feedReferenceConflict:false};
 r.transportReadiness.storedExternalReferences=refs;r.recoveryPreparation.feedRecovery=describeHistoricalFeedRecovery(refs);
 const s=recoveryPreparationSummary(r);assert.equal(s.feedRecovery.status,'MANUAL_REVIEW_REQUIRED');assert.equal(s.feedRecovery.sellerHubDraftVerified,false);assert.match(recoveryPreparationText(s),/Draft nicht verifiziert/);
 for(const patch of [{taskId:'foreign'},{feedState:'FAILED'},{externalStateVerified:true},{sellerHubDraftVerified:true},{automaticRetryAllowed:true},{reservationReleaseAllowed:true},{status:'DRAFT_VERIFIED'}])assert.throws(()=>recoveryPreparationSummary({...r,recoveryPreparation:{...r.recoveryPreparation,feedRecovery:{...r.recoveryPreparation.feedRecovery,...patch}}}),{code:'invalid_recovery_preparation_contract'});
});

import {canonicalRecoveryView,canonicalRecoveryText} from '../lib/ebay-canonical-recovery-view.js';
test('canonical isolated recovery projection is correlated and remains separate from historical status',()=>{
 const r=review(),h='a'.repeat(64),taskId=legacy.taskId,approvalId='22222222-2222-4222-8222-222222222222';
 const input={schemaVersion:'elyon-transport-recovery-v4.4.2',...identity,simulation:true,taskId,approvalId,auditRef:approvalId,auditHead:h,payloadSha256:h,status:'PARTIALLY_COMPLETED',transport:'INVENTORY',skus:[identity.articleNumber],knownOfferIds:[],knownFeedTaskIds:[],knownListingIds:[],groupKey:null,revisions:{product:1,listing:2,economics:3,variantsSha256:h},createdAtMs:1,reservationHeld:true,counts:{pending:3,begun:0,confirmed:1},lastBegunOperation:'PUT_INVENTORY_ITEM',lastConfirmedOperation:'PUT_INVENTORY_ITEM',lastConfirmedAtMs:2,error:null,nextAction:'MANUAL_REVIEW',observation:null,...RECOVERY_REVIEW_FLAGS};
 // Identical Company OS pure producer/consumer formatter, pinned by commit.
 r.canonicalRecovery=canonicalRecoveryView(input,identity);assert.ok(r.canonicalRecovery);
 const result=recoveryPreparationSummary(r);assert.equal(result.canonicalRecovery.status,'PARTIALLY_COMPLETED');assert.equal(result.canonicalRecovery.simulation,true);assert.match(recoveryPreparationText(result),/Nur Simulation: PARTIALLY_COMPLETED/);assert.match(canonicalRecoveryText(result.canonicalRecovery,identity),/1\/4/);
 for(const patch of [{simulation:false},{productId:'foreign'},{status:'DRAFT_VERIFIED'},{executionAuthorized:true},{externalStateVerified:true},{reservationHeld:false},{counts:{confirmed:4,pending:2,begun:1}}])assert.throws(()=>recoveryPreparationSummary({...r,canonicalRecovery:{...r.canonicalRecovery,...patch}}),{code:'invalid_recovery_preparation_contract'});
});
