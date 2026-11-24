# ELYON Commerce V2.4 — Transport adapters, result processing and reconciliation

## Scope and baseline
Seller Tool owns the sole operations ledger. Company OS remains the canonical validation, economics and transport-candidate router; V2.3 approval and scope boundaries are unchanged. Baselines: Seller Tool 97e5c2909462da6ac00ae6de5d85454668ea5452; Company OS 4f6df5769114058f9ed8f268d00cb34bb6680a38; Nova unchanged. This is fixture-only code, not a live eBay adapter. No production API route imports it, no credentials, no fetch/HTTP fallback, no production Redis writes. No change to OAuth, draft, publish, relist, feed, upload or CSV generation.

## Compatibility and routing
Official eBay references (documentation, not account-level verification):
- https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/bulkUpdatePriceQuantity
- https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/getOffer
- https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/getOffers
- https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/getInventoryItem
- https://developer.ebay.com/devzone/xml/docs/reference/ebay/ReviseInventoryStatus.html
- https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetItem.html
Inventory bulk update uses SKU and offer identifiers with offer-level price and/or availableQuantity. Never generate shipToLocationAvailability/global inventory changes. Zero is preserved, unchanged fields omitted. Offer-level quantity alone and zero semantics still require controlled account verification. A conservative one-SKU, one-offer request policy is used (also within the documented bulk limit of 25); review max 50 is not the API batch limit. Duplicate SKU/offer remains blocked by V2.3 binding, including multiple offers per SKU; distinct variants may be represented with distinct SKU/offer identities, listing locks stay conservative. Trading ReviseInventoryStatus is a fixed-price candidate (up to four InventoryStatus entries; exact ItemID/SKU for variations; zero depends on out-of-stock behavior). Inventory-created listings cannot be revised through Trading. Trading is NOT implemented as an executable adapter: V2.3 bindings admit inventory only. GetItem is a future readback candidate; absent Inventory offer or prior Seller Hub/feed history is not proof of Trading origin. No fallback to Trading, FX_DRAFT, FX_LISTING or CSV. Company OS existing candidate router remains the authority, no parallel router added.

## Request and persistence
commerce-inventory-transport.js builds immutable pure request representations from branded V2.3 bindings; this does not constitute a plan or authorization. Existing createSimulationLedger reads actual reserved operation, verifies scope/binding/hash, consumed approval, revision, target ownership, fresh approval and evidence in the same Lua script before preparing. Plan contains operation ID, approval, scope, target/desired values, per-part request body/hash, manifest, overall request/plan hashes and prerequisites. Lua stores manifest only, not raw request or API body. All simulation keys remain in the same V2.3 isolated Redis hash. One HSET per mutation, no second ledger. 50 targets max, 128 KiB input bound, existing 4000-field cap. Readback includes exact offer/listing/SKU/variant/account/environment/marketplace/origin/status/currency, current price/quantity, product/state/rule/validation revisions, fixture supplier facts, economics PASS and timestamps. Preflight maximum age 15 min, Redis TIME checks freshness and approval expiry at init and every part begin. Changes fail closed without altering binding. A failed preflight leaves RESERVED; no automatic supersede/release. prepareTransport alone persists PREPARED for inspection; simulateTransport performs its own preparation and never resumes an initialized operation.
 
## Result and recovery
Only data fixtures accepted, no executable network adapter. Before processing each response, persist MAYBE_SUBMITTED; normalize response per exact SKU + offer ID (listing ID if provided), row status, bounded numeric error/warning IDs. A matching 200 row without errors is simulated SUCCEEDED, a definitive selected 4xx with errors FAILED; ambiguous status, identity, duplicate/missing row, contradictory diagnostics, timeout or invalid envelope UNKNOWN_OUTCOME. HTTP alone does not confirm outcome. Raw responses and external IDs not stored, externalStateVerified and causalityVerified false. Subsequent parts remain NOT_SUBMITTED after unknown response; known row failure can continue other parts; aggregate success/failure/partial retained. No retransmission. Lost Redis acknowledgment raises ledger_unavailable_outcome_unknown; explicit recoverTransport uses persisted checkpoint and stops all remaining requests, even when definitely not submitted. No automatic retry, no automatic target release, no auto-reconsumption. Existing generic transition path blocked once V2.4 checkpoint exists.
Reconciliation compares original, desired and observed values per target, with identity and timestamp checks. Reports target/original/partial/different/conflict/stale/unknown. Fixture observation of a target state does not establish causality. Post-response timestamps must not precede checkpoint; explicit reconciliation resolves only a fully successful simulation with every target matched. Partial/failed/unknown outcomes keep all batch locks, even when target observed. No partial release, no live success inference. Definite before-send stop is explicitly NOT_SUBMITTED and conservatively remains locked for review. V2.3 legacy fixture transition remains for existing tests on operations without transport. No TTL releases unresolved records.

## UI and resource impact
Existing price-stock review displays blocked candidate, readback prerequisites and reconciliation notice. No new actions, polling, API requests at Product Master opening, API routes, dependencies, cron, database or AI calls. No new production traffic. Tests reuse existing Redis 7 service workflow. Production Upstash EVAL, consistency, retention and costs remain unverified. No live account data, no real secrets, no genuine write/readback call performed.

## V2.5 readiness matrix
| Prerequisite | Status and next controlled verification |
|---|---|
| Individual user + workspace + eBay account binding | OPEN; shared seller session cannot authorize, implement and verify mapping server-side |
| Environment/marketplace/currency | Fixture tested; verify OAuth/account isolation and matching offer readback in sandbox |
| OAuth | OPEN; inspect granted sell.inventory / readonly scopes for exact intended read methods, do not expand scopes automatically |
| Offer / inventory readbacks | Candidate getOffer/getOffers/getInventoryItem, verify actual account/offer identity and format, no production write |
| Trading | Candidate only; verify origin, fixed-price format, variation IDs and zero/out-of-stock semantics before separate implementation |
| Supplier evidence | OPEN; obtain authenticated current supplier availability and source identity |
| Canonical revisions and economics | V2.3 fingerprints and fixture preflight; verify actual product/rule/validation revisions and stable expected state |
| Atomic ledger | Redis 7 isolated test workflow; deployed Upstash EVAL, persistence, eviction, retention/archiving and concurrency OPEN |
| Inventory payload | Fixture only, one SKU/offer per part; verify actual API offer-level quantity, zero, currency, multi-offer constraints and response schema |
| Result/reconciliation | Fixture tested; authenticate fresh external readbacks, distinguish causality and unknown outcomes, design controlled manual resolution |
| Explicit approval | OPEN; user-specific authorization and reservation must be verified before enabling any transport |
| Operational flags | All false; V2.5 separate user-approved scope, no live permission inherited |

## Tests and merge
Unit fixtures cover request parts, identity/preflight, response diagnostics and reconciliation. Existing Redis integration extended for stored reservation, full success, partial result, timeout, lost checkpoint acknowledgement, concurrency and safe before-send stop. Standard suite skips isolated Redis tests unless service supplied; verify dedicated workflow separately. CI, P0 and Vercel preview are required before merge. Seller Tool only PR; Company OS and Nova unchanged. Merge only after explicit approval; verify main CI and production preview. No claim of actual live compatibility.
