import { createPublicClient, http, fallback, keccak256, toBytes } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export const validEth = (n) => /^([a-z0-9-]+\.)+eth$/.test(n);

const toMs = (v) => { if (!v) return 0; const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v); return n && n < 1e12 ? n * 1000 : n || 0; };
let client;
// Several public endpoints, tried in turn; ETH_RPC (your own) goes first if set
const rpc = () => client || (client = createPublicClient({
  chain: mainnet,
  transport: fallback([process.env.ETH_RPC, "https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com", "https://eth.llamarpc.com"].filter(Boolean).map((u) => http(u, { timeout: 8000, retryCount: 1 }))),
}));

export async function resolveName(raw) {
  const name = String(raw || "").trim().toLowerCase();
  if (validEth(name)) {
    const address = await rpc().getEnsAddress({ name: normalize(name) });
    return address ? { name, address: address.toLowerCase(), kind: "eth", nameTs: await ensCreated(normalize(name)) } : { error: `${name} doesn't resolve to an address.` };
  }
  return { error: "Enter a .eth name." };
}

// ENS metadata service: "Created Date" of a second level .eth name. Subnames have no entry.
async function ensCreated(name) {
  const parts = name.split(".");
  if (parts.length !== 2) return null;
  try {
    const id = BigInt(keccak256(toBytes(parts[0]))).toString();
    const r = await fetch(`https://metadata.ens.domains/mainnet/0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const a = ((await r.json()).attributes || []).find((x) => x.trait_type === "Created Date");
    return a ? toMs(a.value) || null : null;
  } catch { return null; }
}
