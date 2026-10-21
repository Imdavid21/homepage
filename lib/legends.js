// Seeds the leaderboard with well known accounts from Hyperliquid's own public leaderboard.
// Only accounts that chose a display name there are used, and every score is computed live like any other entry.
import { computeScore } from "./score.js";
import { fetchRaw } from "./hl.js";
import * as store from "./store.js";

const LB = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const COUNT = 12;

export async function seedLegends(force = false) {
  if (!force && (await store.lbList(200)).some((r) => r.legend)) return { seeded: false, reason: "already seeded" };
  const r = await fetch(LB, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("leaderboard " + r.status);
  const rows = (await r.json()).leaderboardRows || [];
  const vlm = (x) => Number(((x.windowPerformances || []).find((w) => w[0] === "allTime") || [])[1]?.vlm) || 0;
  const picks = rows.filter((x) => x.displayName && String(x.displayName).trim()).sort((a, b) => vlm(b) - vlm(a)).slice(0, COUNT);
  const out = [];
  for (let i = 0; i < picks.length; i += 4) {
    await Promise.all(picks.slice(i, i + 4).map(async (p) => {
      try {
        const address = p.ethAddress.toLowerCase(), res = computeScore(await fetchRaw(address));
        await store.lbSave({ address, name: String(p.displayName).trim().slice(0, 32), score: res.score, parts: res.parts, legend: true });
        out.push(p.displayName);
      } catch {}
    }));
  }
  return { seeded: true, count: out.length, names: out };
}
