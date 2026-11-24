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
