# Hyperliquid score page

Name (.hl or .eth) + X handle -> score out of 100 from public Hyperliquid data -> public leaderboard. 80+ is needed to claim; the first 25 to claim get a card, one per wallet, email and name (david.hl and david.eth count as one).

## Deploy (Vercel + Supabase)
1. Supabase: run supabase/schema.sql in the SQL editor.
2. Vercel: import this folder. Storage is Vercel Blob (BLOB_READ_WRITE_TOKEN) or Supabase. Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, optional HLN_KEY (your own), ETH_RPC (a reliable mainnet RPC).
3. Run `npm run smoke -- 0xYourWallet` locally first to check live API shapes (scripts/smoke.js).
4. Tune lib/config.js (eligibleAt) after the first real scores.

Local preview with fake data: `npm run dev` (MOCK=1), tests: `npm test`.

## UI source
The page is React (framer-motion) in ui/src, bundled with esbuild (cd ui && npm i && npm run build) and inlined into public/index.html together with the card engine (ui/src/engine-api.js). public/index.html is the file Vercel serves.


## Claims and storage

Claiming asks for the email the person used on Luma. It is stored apart from the public data (Blob: a path derived from the token, never listed; Supabase: `entries.email`, run supabase/schema.sql) and is never returned by any endpoint. One card per wallet and per email.

Blob holds three small JSON documents (`lb.json`, `claims.json`, one private emails file), cached in the function for 45 s. Keep it that way: the free plan counts every list and every read that misses the CDN.

The back of the card switches to the genesis only hex record when `genesisTx` and `genesisBlock` are set in the engine (public/index.html, `const D`).
