import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

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
    return j.address ? { name, address: j.address.toLowerCase(), kind: "hl" } : { error: `${name} isn't registered yet.` };
  }
  if (validEth(name)) {
    const client = createPublicClient({ chain: mainnet, transport: http(process.env.ETH_RPC || "https://cloudflare-eth.com") });
    const address = await client.getEnsAddress({ name: normalize(name) });
    return address ? { name, address: address.toLowerCase(), kind: "eth" } : { error: `${name} doesn't resolve to an address.` };
  }
  return { error: "Enter a .hl or .eth name." };
}
