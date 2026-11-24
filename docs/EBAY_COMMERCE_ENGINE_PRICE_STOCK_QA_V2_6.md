# ELYON Commerce Engine V2.6 — QA checkpoint (partial)
Date: 2026-11-24. This is a partial engineering checkpoint, not final acceptance.

## Baselines
- Seller Tool main: fe5ceb8d109577867d0ed5add47875665a506a3c; post-merge Seller Tool Tests completed successfully (run 45452475681).
- Company OS main: 5c68accb7fdb3387906b43991a0b424402a43396; post-merge Full Company OS CI completed successfully (run 45451893193).
- V2.1–V2.5 PRs are merged. V2.6 feature branches already existed at their respective main baselines.

## Finding P2: incomplete bridge response binding
The existing proxy authenticated the caller and checked global disabled flags, but did not compare the returned proposal identities/values with the current request or verify nested flags and offline artifact integrity. A mismatched canonical response could be displayed/exported, or could select the wrong target for a diagnostic GET. No actual incident or write was observed.
Fix: validate ordered target identity, current/proposed values, rule revision, disabled flags and the complete offline artifact digest/row association before generating the blocked descriptor or requesting a diagnostic readback. Preserve exact string IDs and quantity zero. Regression fixtures cover wrong target, changed values, incomplete responses, nested flags and altered bytes. CI on this change is pending; fixtures are not live evidence.

## Activation gates (not authorized)
1. Enroll an individually verified owner (e.g. passkey, protected enrollment and recovery), bind workspace and eBay account/environment, revoke on account change and invalidate outstanding approvals.
2. Verify actually granted OAuth scopes, explicit deployment environment, and suitable active exact Inventory offer; obtain authoritative offer and supplier readbacks and canonical economics approval.
3. Verify production Upstash isolation, atomicity, persistence, retention and eviction; no production Redis writes without separate permission.
4. Verify one-time approval, reservation, sandbox availability and controlled sandbox write, then authoritative reconciliation; no automatic retry on unknown outcome.
5. Obtain separate explicit approval for an eligible production write and readback. Trading, variant CSV and stock increases stay disabled.
All operational flags remain false. No production writes, publishing, OAuth scope changes or new services.

## Remaining V2.6 acceptance
Full audit of V2.1–V2.5, cross-system E2E fixtures, UI/browser review, regression suite, P0 and Redis integration CI, Vercel preview, performance/cost and Nova inventory, authenticated bridge smoke test, operational readbacks and V3 read-only planning are not claimed complete. V3 is not implemented. No merge without explicit approval.

## V2.6 second implementation pass
The first bridge checkpoint fd6017dd6284f512bdf28132ce875e94e7ccfc3b passed Seller Tool Tests (45456740131), P0 (45456740212) and Vercel commit status. Those are not results for later commits.
- P2: inactive, missing or ambiguous listing targets had editable controls and a diagnostic action. Shared pure eligibility now gates both suggestion and request, requires exact listing identity, limits readback button to one nonvariant Inventory target. Unknown is not interpreted as ended. Existing accordion and design retained.
- P2: selected proposals could survive an accordion collapse after the underlying Product Master or offer snapshot changed. Reconcile only selected rows on existing prepare; discard when the exact current projection differs. Invalidate old displayed review/download when generation changes. Group and deduplicate technical blocker codes in one details area.
- P2: direct duplicate request targets could reach Company OS from non-UI callers. Reject duplicates in Seller proxy before network call.
- Regression additions: pure eligibility, actual Seller route with stubbed Company OS response (auth, exact request/response, error/timeout, no secret leakage, preview readback stays blocked), isolated real Redis path from Product Master projection to explicit fixture binding, zero quantity, Inventory request and reconciliation. No evidence promotion. Existing Redis workflow reused via its existing test file trigger; no extra workflow or service.

## V3 read-only implementation inventory
Seller Tool: api/document-studio.js uses requireSellerAccess and existing Upstash/KV document state key with EVAL revision CAS. lib/document-studio-core.js has document IDs, kinds blank/letter/offer/contract/form/delivery/purchase_note/complaint, templates, blocks, sourceOrderId, archive and version; no typed product association in documentSummary/save. Limits 80 docs, 40 templates, 60 blocks; existing HTML sanitization. No binary product-document storage contract verified. Existing seller-document-studio.js and CSS remain the UI, existing invoice/finance integration stays independent.
Company OS: assets/ebay-templates/document-upload-url.xlsx already registered in V1, existing bounded XLSX parser/generator; existing api/auto-lister-gpsr.js and auto-lister-gpsr.js plus regulatory validation in V1.6. Product Master uses canonical articleNumber, channel listing/offer, product IDs. Nova has company-os-gpsr-cache.js, ebay-draft-gpsr-autofill.js and variant scanner tests. No Media API executable adapter verified here.
Proposed V3 order:
1. V3.1 extend existing Document Studio metadata with explicit product/variant IDs, typed product documents and existing revision handling; preserve existing orders/documents.
2. V3.2 validate associations, content type/size, document provenance/revision and role; design private storage/authorized delivery, not public arbitrary URLs.
3. V3.3 reuse canonical document-url XLSX registry and exact original profile, offline only, test formula/URL safety and row associations.
4. V3.4 isolated Media API contract and fixture lifecycle, no upload until scopes, identity, official API compatibility and data handling verified.
5. V3.5 GPSR and Auto Lister integration using existing bridges; no duplicate compliance model.
6. V3.6 controlled verification, safety/QA and separate live authorization.
Nova baseline: 6b1e86b22864c89dcaa98399a374af72e313365d; read-only inventory, no change. Company OS remains unchanged in this pass. V3 planning is not V3 implementation.

## Acceptance evidence and limits
Existing V1.6, V2.1–V2.5 documentation and source inspected, including Product Master projection, canonical review/economics, bridge, approval/transport fixtures, controlled verification, existing regression and Redis suites. Existing canonical tests exercise exact CSV headers, blank fields, leading zeros, zero, batch all-or-nothing and variant-specific preview (variant CSV blocked). Prior passing CI does not establish a fresh live end-to-end test or browser UI acceptance. New tests exercise the Seller route with a stubbed canonical response, not deployed cross-system authentication. Actual protected UI/session and real offer/supplier account evidence still not accessed. No measured performance or billing numbers; only existing prepare/index and explicit review paths changed, no automatic fetch/poll/AI. Full audit and fresh CI/preview/Redis acceptance must be verified before merge; any remaining unverified areas stay open. No live activation.
