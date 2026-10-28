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
// Subnames have no entry, and a failed lookup returns null, so a missing date never counts against anyone.
// Logs come from the Blockscout API (free, no key), because public RPC nodes refuse log queries over a wide block range.
const BS = process.env.BLOCKSCOUT_API_LOGS || "https://eth.blockscout.com/api";
const REGISTRAR = "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85", LEGACY = "0x6090a6e47849629b7245dfa1ca21d94cd15878ef";
const T_NEW = "0xb3d987963d01b2f68493b4bdb130988f157ea43070d4ad840fee0466ed9370d9";   // NameRegistered(uint256,address,uint256)
const T_MIG = "0xea3d7e1195a15d2ddcd859b01abd4c6b960fa9f9264e499a70a90c7f0c64b717";   // NameMigrated(uint256,address,uint256)
const T_OLD = "0x0f0c27adfd84b60b6f456b0e87cdccb1e5fb9603991588d87fa99f5b6b61e670";   // HashRegistered(bytes32,address,uint256,uint256)
const firstLog = async (address, topic0, topic1, from, to) => {
  try {
    const r = await fetch(`${BS}?module=logs&action=getLogs&fromBlock=${from}&toBlock=${to}&address=${address}&topic0=${topic0}&topic1=${topic1}&topic0_1_opr=and`, { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    const ts = Array.isArray(j.result) && j.result.length ? Math.min(...j.result.map((l) => parseInt(l.timeStamp, 16)).filter(Boolean)) * 1000 : 0;
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  } catch { return 0; }
};
export async function ensCreated(name) {
  const parts = name.split(".");
  if (parts.length !== 2) return null;
  const hash = keccak256(toBytes(parts[0]));
  const found = (await Promise.all([
    firstLog(LEGACY, T_OLD, hash, 3648359, 9380410),
    firstLog(REGISTRAR, T_NEW, hash, 9380410, "latest"),
    firstLog(REGISTRAR, T_MIG, hash, 9380410, "latest"),
  ])).filter(Boolean);
  return found.length ? Math.min(...found) : null;
}
