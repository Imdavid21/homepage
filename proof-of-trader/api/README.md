# Proof of Trader API

Node.js service exposing /health and a public eligibility policy.

**Fails closed:** all proof verification, admission, and check-in endpoints return HTTP 503. This is intentional, because an unaudited ZK proof implementation or unauthenticated Hyperliquid lifetime history must never issue event credentials.

Run: `npm start`. Test: `npm test`. No API keys required. Configure `ALLOWED_ORIGIN` for the deployed frontend.

Production prerequisites: independently authenticated historical fill index, wallet-bound private proof circuit and verifier, stable nullifier, persistent Postgres and transactional capacity enforcement, signed QR passes, and security review. See ../PRODUCTION.md.
