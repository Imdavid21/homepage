import { CONFIG as C } from "./config.js";
const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (v, cap) => clamp(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + cap));

// raw: { firstTs, volume, activeDays14, activeDays90, markets }
export function computeScore(raw, now = Date.now()) {
  const W = C.weights;
  const months = raw.firstTs ? Math.max(0, (now - raw.firstTs) / (30.44 * 864e5)) : 0;
  const early = !!raw.firstTs && raw.firstTs < C.hlGenesis;
  const parts = [
    { key: "tenure", label: "Time on Hyperliquid", max: W.tenure, pts: W.tenure * clamp(months / C.tenureMonths), detail: raw.firstTs ? `${months.toFixed(1)} months, since ${new Date(raw.firstTs).toISOString().slice(0, 10)}` : "no history found" },
    { key: "early", label: "Before HYPE genesis", max: W.early, pts: early ? W.early : 0, detail: early ? "active before 29 Nov 2024" : "first seen after genesis" },
    { key: "volume", label: "Lifetime volume", max: W.volume, pts: W.volume * logScale(raw.volume, C.volumeUsd), detail: `$${fmt(raw.volume)} traded` },
    { key: "days", label: "Trading days", max: W.days, pts: W.days * clamp((raw.activeDays90 || 0) / C.days90), detail: `${raw.activeDays90 || 0} days in the last 90` },
    { key: "recent", label: "Still trading", max: W.recent, pts: W.recent * clamp(raw.activeDays14 / C.activeDays14), detail: `${raw.activeDays14} of the last 14 days` },
    { key: "markets", label: "Markets traded", max: W.markets, pts: W.markets * clamp((raw.markets || 0) / C.markets), detail: `${raw.markets || 0} markets in 90 days` },
  ].map((p) => ({ ...p, pts: Math.round(p.pts * 10) / 10 }));
  const score = Math.round(parts.reduce((s, p) => s + p.pts, 0));
  return { score, parts, eligible: score >= C.eligibleAt };
}
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(n < 10 ? 2 : 0); }
