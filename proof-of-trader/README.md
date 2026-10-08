# Proof of Trader

Experimental static frontend for checking Hyperliquid trading activity. This is **not** a zero-knowledge verifier or event admission system.

## Eligibility thresholds

- Observed executed notional >= $100,000
- Earliest retrieved fill at least 30 days old
- At least 10 retrieved fills
- All three required

## Privacy and security limitations

Wallet address is submitted from the browser to Hyperliquid's public API. Historical fill queries are incomplete for some accounts. No ZK proof, authenticated full-history witness, nullifier, signature-based wallet ownership, capacity control, backend approval, or QR credential is implemented. The page must not be used to approve attendees.

## Deploy

Render static site: branch `proof-of-trader`, build command `echo ready`, publish directory `proof-of-trader`.
