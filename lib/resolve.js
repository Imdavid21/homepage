import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { keccak256, toBytes } from "viem";

const HLN = "https://api.hlnames.xyz";
const HLN_KEY = process.env.HLN_KEY || "NILB2EY-R4LUDOA-WN5G5JQ-KHAQOLA"; // public agent key published by HLN; use your own in production

export const validHl = (n) => /^[a-z0-9-]{1,29}\.hl$/.test(n);
export const validEth = (n) => /^([a-z0-9-]+\.)+eth$/.test(n);

export async function resolveName(raw) {
  const name = String(raw || "").trim().toLowerCase();
  if (validHl(name)) {
    const r = await fetch(`${HLN}/resolve/address/${encodeURIComponent(name)}`, { headers: { "X-API-Key": HLN_KEY }, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) return { error: `${name} isn't registered yet.` };
    if (!r.ok) throw new Error("hln " + r.status);
    const j = await r.json();
    // HLN registration date: field name unverified, reads the likely ones
    const ts = [j.registeredAt, j.registered_at, j.createdAt, j.created_at, j.mintedAt, j.minted_at].map(toMs).find(Boolean) || null;
    return j.address ? { name, address: j.address.toLowerCase(), kind: "hl", nameTs: ts } : { error: `${name} isn't registered yet.` };
  }
  if (validEth(name)) {
    const client = createPublicClient({ chain: mainnet, transport: http(process.env.ETH_RPC || "https://cloudflare-eth.com") });
    const address = await client.getEnsAddress({ name: normalize(name) });
    return address ? { name, address: address.toLowerCase(), kind: "eth", nameTs: await ensCreated(name) } : { error: `${name} doesn't resolve to an address.` };
  }
  return { error: "Enter a .hl or .eth name." };
}

const toMs = (v) => { if (!v) return 0; const n = typeof v === "number" ? v : Date.parse(v); return n && n < 1e12 ? n * 1000 : n || 0; };

// ENS metadata service: "Created Date" of a second level .eth name. Subnames have no entry.
async function ensCreated(name) {
  const parts = name.split(".");
  if (parts.length !== 2) return null;
  try {
    const id = BigInt(keccak256(toBytes(parts[0]))).toString();
    const r = await fetch(`https://metadata.ens.domains/mainnet/0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const a = ((await r.json()).attributes || []).find((x) => x.trait_type === "Created Date");
    return a ? Number(a.value) : null;
  } catch { return null; }
}
