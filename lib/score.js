import { CONFIG as C } from "./config.js";
const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (v, cap) => clamp(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + cap));

// raw: { firstTs, volume, pnl, activeDays14, markets, closes, wins }
export function computeScore(raw, now = Date.now()) {
  const W = C.weights;
  const months = raw.firstTs ? Math.max(0, (now - raw.firstTs) / (30.44 * 864e5)) : 0;
  const closes = raw.closes || 0, wr = closes ? (raw.wins || 0) / closes : 0;
  const enough = closes >= C.minCloses;
  const parts = [
    { key: "volume", label: "Trading volume", max: W.volume, pts: W.volume * logScale(raw.volume, C.volumeUsd), detail: `$${fmt(raw.volume)} traded` },
    { key: "profit", label: "Realized profit", max: W.profit, pts: W.profit * logScale(raw.pnl, C.pnlUsd), detail: `${(raw.pnl || 0) < 0 ? "-" : ""}$${fmt(Math.abs(raw.pnl || 0))} all time PnL` },
    { key: "winrate", label: "Win rate", max: W.winrate, pts: enough ? W.winrate * clamp((wr - C.winLow) / (C.winHigh - C.winLow)) : 0, detail: enough ? `${Math.round(wr * 100)}% of ${closes} closed trades` : `needs ${C.minCloses} closed trades, has ${closes}` },
    { key: "activity", label: "Trading days", max: W.activity, pts: W.activity * clamp(raw.activeDays14 / C.activeDays14), detail: `${raw.activeDays14} of the last 14 days` },
    { key: "markets", label: "Markets traded", max: W.markets, pts: W.markets * clamp((raw.markets || 0) / C.markets), detail: `${raw.markets || 0} markets in 90 days` },
    { key: "history", label: "Trading history", max: W.history, pts: W.history * clamp(months / C.historyMonths), detail: raw.firstTs ? `${months.toFixed(1)} months` : "no history found" },
  ].map((p) => ({ ...p, pts: Math.round(p.pts * 10) / 10 }));
  const score = Math.round(parts.reduce((s, p) => s + p.pts, 0));
  return { score, parts, eligible: score >= C.eligibleAt };
}
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(n < 10 ? 2 : 0); }
