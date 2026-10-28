// Reads a wallet's Ethereum footprint: first transaction, transaction count, ETH balance. No keys needed.
import { createPublicClient, http, fallback } from "viem";
import { mainnet } from "viem/chains";

let client;
const rpc = () => client || (client = createPublicClient({
  chain: mainnet,
  transport: fallback([process.env.ETH_RPC, "https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com", "https://eth.llamarpc.com"].filter(Boolean).map((u) => http(u, { timeout: 8000, retryCount: 1 }))),
}));
const KEY = process.env.BLOCKSCOUT_API_KEY; // a key from dev.blockscout.com works on the PRO API
const BS = process.env.BLOCKSCOUT_API || (KEY ? "https://api.blockscout.com/1/api/v2" : "https://eth.blockscout.com/api/v2");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Retries rate limits and server errors; throws when the service never answers, so a failure is not read as "no history".
const get = async (path) => {
  const url = BS + path + (KEY ? (path.includes("?") ? "&" : "?") + "apikey=" + KEY : "");
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { accept: "application/json" } });
      if (r.ok) return r.json();
      if (r.status === 404) return {};
      last = new Error("blockscout " + r.status);
    } catch (e) { last = e; }
    await wait(500 * (i + 1) + Math.random() * 300);
  }
  throw last;
};
const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };

export async function fetchEthRaw(address) {
  const a = address.toLowerCase();
  const [bal, nonce, counters, first] = await Promise.all([
    safe(rpc().getBalance({ address: a }), 0n),
    safe(rpc().getTransactionCount({ address: a }), 0),
    get(`/addresses/${a}/counters`),
    get(`/addresses/${a}/transactions?sort=block_number&order=asc`),
  ]);
  const ts = Date.parse(((first.items || [])[0] || {}).timestamp || "");
  return { ethFirstTs: Number.isFinite(ts) ? ts : 0, ethTxs: Math.max(Number(nonce) || 0, Number(counters.transactions_count) || 0), ethBal: Number(bal) / 1e18 };
}

// Several wallets under one name: transactions and ETH add up, age is the earliest wallet.
export function combineEth(raws) {
  const firsts = raws.map((r) => r.ethFirstTs).filter(Boolean);
  return { ethFirstTs: firsts.length ? Math.min(...firsts) : 0, ethTxs: raws.reduce((s, r) => s + (r.ethTxs || 0), 0), ethBal: raws.reduce((s, r) => s + (r.ethBal || 0), 0) };
}
