# Hyperliquid score page

Name (.hl or .eth) + X handle -> score out of 100 from public Hyperliquid data -> public leaderboard. 90+ is eligible, top 25 eligible get a card.

## Deploy (Vercel + Supabase)
1. Supabase: run supabase/schema.sql in the SQL editor.
2. Vercel: import this folder. Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, optional HLN_KEY (your own), ETH_RPC (a reliable mainnet RPC).
3. Run `npm run smoke -- 0xYourWallet` locally first to check live API shapes (scripts/smoke.js).
4. Tune lib/config.js after the first real scores so 90 is a sensible cut.

Local preview with fake data: `npm run dev` (MOCK=1), tests: `npm test`.
