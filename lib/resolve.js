import { createPublicClient, http, fallback, keccak256, toBytes } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export const validEth = (n) => /^([a-z0-9-]+\.)+eth$/.test(n);

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

// When a second level .eth name was first registered, read from the chain itself. The ENS metadata service
// returns the wrong date for old names, so it is not used. Three sources, the earliest wins:
//  - the pre-2020 auction registrar (HashRegistered), for names from 2017 and 2018
//  - the current registrar (NameRegistered for names registered since, NameMigrated for names moved over)
// Subnames have no entry and return null. A failed lookup throws, so the check asks the person to try again instead of scoring without a date.
// Logs come from the Blockscout API (free, no key), because public RPC nodes refuse log queries over a wide block range.
const PRO = !!process.env.BLOCKSCOUT_API_KEY; // a key from dev.blockscout.com works on the PRO API, not on the free instance API
const BS = process.env.BLOCKSCOUT_API_LOGS || (PRO ? "https://api.blockscout.com/v2/api" : "https://eth.blockscout.com/api");
const REGISTRAR = "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85", LEGACY = "0x6090a6e47849629b7245dfa1ca21d94cd15878ef";
const T_NEW = "0xb3d987963d01b2f68493b4bdb130988f157ea43070d4ad840fee0466ed9370d9";   // NameRegistered(uint256,address,uint256)
const T_MIG = "0xea3d7e1195a15d2ddcd859b01abd4c6b960fa9f9264e499a70a90c7f0c64b717";   // NameMigrated(uint256,address,uint256)
const T_OLD = "0x0f0c27adfd84b60b6f456b0e87cdccb1e5fb9603991588d87fa99f5b6b61e670";   // HashRegistered(bytes32,address,uint256,uint256)
const KEY = PRO ? `&chainid=1&apikey=${process.env.BLOCKSCOUT_API_KEY}` : "";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// One lookup. Returns a timestamp, 0 when the chain has no such event, and throws when the service could not answer
// (rate limited, timed out, bad reply), so a failure is never mistaken for "no date".
const firstLog = async (address, topic0, topic1, from, to) => {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${BS}?module=logs&action=getLogs&fromBlock=${from}&toBlock=${to}&address=${address}&topic0=${topic0}&topic1=${topic1}&topic0_1_opr=and${KEY}`, { signal: AbortSignal.timeout(9000) });
      const j = await r.json();
      if (Array.isArray(j.result)) {
        const ts = j.result.length ? Math.min(...j.result.map((l) => parseInt(l.timeStamp, 16)).filter(Boolean)) * 1000 : 0;
        return Number.isFinite(ts) && ts > 0 ? ts : 0;
      }
      if (/no logs found/i.test(String(j.message || j.result))) return 0;
      last = new Error(String(j.message || j.result || "bad reply"));
    } catch (e) { last = e; }
    await wait(500 * (i + 1) + Math.random() * 300);
  }
  throw last;
};
const dateCache = new Map();
export async function ensCreated(name) {
  const parts = name.split(".");
  if (parts.length !== 2) return null;
  if (dateCache.has(name)) return dateCache.get(name);
  const hash = keccak256(toBytes(parts[0]));
  // one after another, so the free API is not hit three times at once
  const jobs = [[LEGACY, T_OLD, 3648359, 9380410], [REGISTRAR, T_NEW, 9380410, "latest"], [REGISTRAR, T_MIG, 9380410, "latest"]];
  const found = []; let failed = false;
  for (const [addr, topic, from, to] of jobs) {
    try { const t = await firstLog(addr, topic, hash, from, to); if (t) found.push(t); } catch { failed = true; }
  }
  // every source has to answer: if one failed, the earliest date may be hidden in it, so a partial answer is an error too
  if (failed) throw new Error("name date lookup failed");
  const ts = found.length ? Math.min(...found) : null;
  dateCache.set(name, ts);
  return ts;
}
