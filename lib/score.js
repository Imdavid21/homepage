import { CONFIG as C } from "./config.js";
const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (v, cap) => clamp(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + cap));

// raw: { firstTs, volume, hype, hipMarkets, trades, tradesCapped }
export function computeScore(raw, now = Date.now()) {
  const W = C.weights;
  const months = raw.firstTs ? Math.max(0, (now - raw.firstTs) / (30.44 * 864e5)) : 0;
  const parts = [
    { key: "tenure", label: "Time on Hyperliquid", max: W.tenure, pts: W.tenure * clamp(months / C.tenureMonths), detail: raw.firstTs ? `${months.toFixed(1)} months, since ${new Date(raw.firstTs).toISOString().slice(0, 10)}` : "no history found" },
    { key: "hype", label: "HYPE holding", max: W.hype, pts: W.hype * logScale(raw.hype, C.hypeCap), detail: `${fmt(raw.hype)} HYPE, held and staked` },
    { key: "volume", label: "Lifetime volume", max: W.volume, pts: W.volume * logScale(raw.volume, C.volumeUsd), detail: `$${fmt(raw.volume)} traded` },
    { key: "hip", label: "HIP-3 and HIP-4 markets", max: W.hip, pts: W.hip * clamp((raw.hipMarkets || 0) / C.hipMarkets), detail: `${raw.hipMarkets || 0} markets traded` },
    { key: "trades", label: "Total trades", max: W.trades, pts: W.trades * logScale(raw.trades, C.trades), detail: `${Math.round(raw.trades || 0).toLocaleString("en-US")}${raw.tradesCapped ? "+" : ""} trades` },
  ].map((p) => ({ ...p, pts: Math.round(p.pts * 10) / 10 }));
  const score = Math.round(parts.reduce((s, p) => s + p.pts, 0));
  return { score, parts, eligible: score >= C.eligibleAt };
}
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(n < 10 ? 2 : 0); }
