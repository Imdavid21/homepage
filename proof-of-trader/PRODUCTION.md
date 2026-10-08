# Production architecture and implementation gates

## Release status
The deployed frontend is a **public-data prototype**, not an admission service. Never issue tickets from the browser-side threshold calculation.

## Mandatory eligibility policy
- Lifetime executed notional >= 100000 USD.
- Earliest qualifying fill >= 30 days before an authenticated snapshot.
- >= 10 distinct fills.
- All three checks must pass.

## Security invariants
1. No wallet address or raw fills in organizer HTTP requests, logs, analytics, or database.
2. Indexer output must be authenticated and complete. Hyperliquid userFillsByTime alone is insufficient for lifetime metrics.
3. A zero-knowledge proof must verify membership in the authenticated snapshot, thresholds, wallet control, and deterministic wallet-bound event nullifier.
4. The event nullifier must be unique under a transactional database constraint.
5. Capacity allocation must use a serializable transaction or atomic update and stop at 150.
6. QR credentials must be signed, expire, and be single-use. Scanners must atomically consume tickets.
7. Admin access must be authenticated and auditable, without exposing wallet identity.
8. Attestation root rotation, proof expiry, and policy-version pinning must be supported.

## Trust and privacy
A conventional data indexer or zkTLS service may observe wallet lookups. A true claim that no service ever sees the address requires an independently designed and audited private lookup mechanism. Until then, the accurate promise is narrower: the organizer backend never receives wallet addresses.

## Production components
- Historical Hyperliquid fills archive indexer and reconciliation against official historical records.
- Authenticated Merkle commitment to per-wallet metrics at a fixed snapshot.
- Wallet ownership signature verification bound to event and policy.
- ZK circuit (Noir or equivalent), trusted setup/verifier keys, independent circuit tests.
- API service accepting only proof and public inputs, with verifier and anti-replay checks.
- PostgreSQL for event capacity, nullifiers, passes, waitlist, check-ins.
- Staff scanner and admin dashboard with authenticated roles.
- Privacy and adversarial security review.

## Go-live gates
- Full-history index coverage measured and documented.
- Proof soundness tests against forged data, invalid ownership, replay, stale roots, and duplicate nullifiers.
- No sensitive wallet data captured by server, logging, telemetry, or analytics.
- Concurrency test with >150 simultaneous qualified applicants.
- QR replay and unauthorized scanner tests.
- Independent review of cryptographic assumptions.

**No production admissions until all gates pass.**
