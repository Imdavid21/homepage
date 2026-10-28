// Reads a wallet's Ethereum footprint: first transaction, transaction count, ETH balance. No keys needed.
import { createPublicClient, http, fallback } from "viem";
import { mainnet } from "viem/chains";

let client;
const rpc = () => client || (client = createPublicClient({
  chain: mainnet,
  transport: fallback([process.env.ETH_RPC, "https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com", "https://eth.llamarpc.com"].filter(Boolean).map((u) => http(u, { timeout: 8000, retryCount: 1 }))),
}));
const BS = process.env.BLOCKSCOUT_API || "https://eth.blockscout.com/api/v2";
const get = async (path) => { const r = await fetch(BS + path, { signal: AbortSignal.timeout(9000), headers: { accept: "application/json" } }); if (!r.ok) throw new Error("blockscout " + r.status); return r.json(); };
const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };

export async function fetchEthRaw(address) {
  const a = address.toLowerCase();
  const [bal, nonce, counters, first] = await Promise.all([
    safe(rpc().getBalance({ address: a }), 0n),
    safe(rpc().getTransactionCount({ address: a }), 0),
    safe(get(`/addresses/${a}/counters`), {}),
    safe(get(`/addresses/${a}/transactions?sort=block_number&order=asc`), {}),
  ]);
  const ts = Date.parse(((first.items || [])[0] || {}).timestamp || "");
  return { ethFirstTs: Number.isFinite(ts) ? ts : 0, ethTxs: Math.max(Number(nonce) || 0, Number(counters.transactions_count) || 0), ethBal: Number(bal) / 1e18 };
}

// Several wallets under one name: transactions and ETH add up, age is the earliest wallet.
export function combineEth(raws) {
  const firsts = raws.map((r) => r.ethFirstTs).filter(Boolean);
  return { ethFirstTs: firsts.length ? Math.min(...firsts) : 0, ethTxs: raws.reduce((s, r) => s + (r.ethTxs || 0), 0), ethBal: raws.reduce((s, r) => s + (r.ethBal || 0), 0) };
}
