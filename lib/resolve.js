import { createPublicClient, http, fallback, keccak256, toBytes } from "viem";
import { mainnet } from "viem/chains";
import { normalize, namehash } from "viem/ens";

const HLN = "https://api.hlnames.xyz";
const HLN_KEY = process.env.HLN_KEY || "NILB2EY-R4LUDOA-WN5G5JQ-KHAQOLA"; // public agent key published by HLN; use your own in production

export const validHl = (n) => /^[a-z0-9-]{1,29}\.hl$/.test(n);
export const validEth = (n) => /^([a-z0-9-]+\.)+eth$/.test(n);

const toMs = (v) => { if (!v) return 0; const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v); return n && n < 1e12 ? n * 1000 : n || 0; };
const PLAUSIBLE = [Date.parse("2023-01-01"), () => Date.now() + 864e5];
// HLN does not document a registration date field, so look for one wherever it is: any key that says registered, created or minted
// (not expiry) holding a timestamp from a plausible period. The earliest such value wins.
export function findDate(obj, depth = 0) {
  let best = 0;
  if (!obj || typeof obj !== "object" || depth > 4) return 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") { const d = findDate(v, depth + 1); if (d && (!best || d < best)) best = d; continue; }
    if (!/(regist|creat|mint)/i.test(k) || /expir/i.test(k) || typeof v === "boolean") continue;
    const ms = toMs(v);
    if (ms >= PLAUSIBLE[0] && ms <= PLAUSIBLE[1]() && (!best || ms < best)) best = ms;
  }
  return best;
}

async function hln(path, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(HLN + path, { headers: { "X-API-Key": HLN_KEY }, signal: AbortSignal.timeout(10000) });
      if (r.status === 404 || r.status === 422 || r.ok) return r;
      last = new Error("hln " + r.status);
    } catch (e) { last = e; }
  }
  throw last;
}

let client;
// Several public endpoints, tried in turn; ETH_RPC (your own) goes first if set
const rpc = () => client || (client = createPublicClient({
  chain: mainnet,
  transport: fallback([process.env.ETH_RPC, "https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com", "https://eth.llamarpc.com"].filter(Boolean).map((u) => http(u, { timeout: 8000, retryCount: 1 }))),
}));

export async function resolveName(raw) {
  const name = String(raw || "").trim().toLowerCase();
  if (validHl(name)) {
    const r = await hln(`/resolve/address/${encodeURIComponent(name)}`);
    if (r.status === 404 || r.status === 422) return { error: `${name} isn't registered yet.` };
    const j = await r.json();
    if (!j.address) return { error: `${name} isn't registered yet.` };
    let ts = findDate(j) || null;
    if (!ts) {
      // the resolve call carries no date: ask for the full record by namehash, best effort
      try { const f = await hln(`/records/full_record/${namehash(name)}`, 1); if (f.ok) ts = findDate(await f.json()) || null; } catch {}
    }
    return { name, address: j.address.toLowerCase(), kind: "hl", nameTs: ts };
  }
  if (validEth(name)) {
    const address = await rpc().getEnsAddress({ name: normalize(name) });
    return address ? { name, address: address.toLowerCase(), kind: "eth", nameTs: await ensCreated(normalize(name)) } : { error: `${name} doesn't resolve to an address.` };
  }
  return { error: "Enter a .hl or .eth name." };
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
