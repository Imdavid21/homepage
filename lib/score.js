import { CONFIG as C } from "./config.js";
const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (v, cap) => clamp(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + cap));

// raw: { firstTs, staked, volume, activeDays14, breadth: {perps,spot,hip3,vault,hypeHeld}, referrals }
export function computeScore(raw, now = Date.now()) {
  const W = C.weights;
  const months = raw.firstTs ? Math.max(0, (now - raw.firstTs) / (30.44 * 864e5)) : 0;
  const b = raw.breadth || {};
  const breadthPts = (b.perps ? 4 : 0) + (b.spot ? 4 : 0) + (b.hip3 ? 6 : 0) + (b.vault ? 3 : 0) + (b.hypeHeld ? 3 : 0);
  const parts = [
    { key: "tenure", label: "Time on Hyperliquid", max: W.tenure, pts: W.tenure * clamp(months / C.tenureMonths), detail: raw.firstTs ? `${months.toFixed(1)} months` : "no history found" },
    { key: "staking", label: "HYPE staked", max: W.staking, pts: W.staking * logScale(raw.staked, C.stakedHype), detail: `${fmt(raw.staked)} HYPE` },
    { key: "volume", label: "Trading volume (capped)", max: W.volume, pts: W.volume * logScale(raw.volume, C.volumeUsd), detail: `$${fmt(raw.volume)}` },
    { key: "activity", label: "Recent activity", max: W.activity, pts: W.activity * clamp(raw.activeDays14 / C.activeDays14), detail: `${raw.activeDays14} of the last 14 days` },
    { key: "breadth", label: "Breadth of use", max: W.breadth, pts: Math.min(W.breadth, breadthPts * (W.breadth / 20)), detail: ["perps", "spot", "hip3", "vault", "hypeHeld"].filter((k) => b[k]).map(label).join(", ") || "none" },
    { key: "contribution", label: "Referrals", max: W.contribution, pts: W.contribution * logScale(raw.referrals, C.referrals), detail: `${raw.referrals} referred` },
  ].map((p) => ({ ...p, pts: Math.round(p.pts * 10) / 10 }));
  const score = Math.round(parts.reduce((s, p) => s + p.pts, 0));
  return { score, parts, eligible: score >= C.eligibleAt };
}
const label = (k) => ({ perps: "Perps", spot: "Spot", hip3: "HIP-3", vault: "Vaults", hypeHeld: "HYPE held" })[k];
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(n < 10 ? 2 : 0); }
