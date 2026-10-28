import { CONFIG as C } from "./config.js";
const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (v, cap) => clamp(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + cap));
const MO = 30.44 * 864e5, day = (t) => new Date(t).toISOString().slice(0, 10);
const round = (p) => ({ ...p, pts: Math.round(p.pts * 10) / 10 });

// raw: Hyperliquid { firstTs, volume, hype, hipMarkets, trades, tradesCapped }, Ethereum { ethFirstTs, ethTxs, ethBal }, name { nameTs, nameKind }
// A wallet is scored on both networks and the higher score counts.
export function computeScore(raw, now = Date.now()) {
  const nameMonths = raw.nameTs ? Math.max(0, (now - raw.nameTs) / MO) : 0;
  const nameKnown = !!raw.nameTs;
  const nameNote = "registration date not available, so the other measures count out of 100";
  // The name's age is out of the track's own total; with no date the rest is scaled to 100 so a missing date never counts against anyone.
  const total = (parts, nameMax) => { const sum = parts.reduce((s, p) => s + p.pts, 0); return Math.round(nameKnown ? sum : sum * 100 / (100 - nameMax)); };

  const W = C.weights, months = raw.firstTs ? Math.max(0, (now - raw.firstTs) / MO) : 0;
  const hl = [
    { key: "tenure", label: "Time on Hyperliquid", max: W.tenure, pts: W.tenure * clamp(months / C.tenureMonths), detail: raw.firstTs ? `${months.toFixed(1)} months, since ${day(raw.firstTs)}` : "no history found" },
    { key: "hype", label: "HYPE holding", max: W.hype, pts: W.hype * logScale(raw.hype, C.hypeCap), detail: `${fmt(raw.hype)} HYPE, held and staked` },
    { key: "volume", label: "Lifetime volume", max: W.volume, pts: W.volume * logScale(raw.volume, C.volumeUsd), detail: `$${fmt(raw.volume)} traded` },
    { key: "hip", label: "HIP-3 and HIP-4 markets", max: W.hip, pts: W.hip * clamp((raw.hipMarkets || 0) / C.hipMarkets), detail: `${raw.hipMarkets || 0} markets traded` },
    { key: "trades", label: "Total trades", max: W.trades, pts: W.trades * logScale(raw.trades, C.trades), detail: `${Math.round(raw.trades || 0).toLocaleString("en-US")}${raw.tradesCapped ? "+" : ""} trades` },
    { key: "name", label: "Name age", max: W.name, pts: W.name * clamp(nameMonths / C.nameMonths), detail: nameKnown ? `${nameMonths.toFixed(1)} months, registered ${day(raw.nameTs)}` : nameNote },
  ].map(round);
  const out = { track: "Hyperliquid", score: total(hl, W.name), parts: hl };

  if (raw.ethFirstTs !== undefined || raw.ethTxs !== undefined || raw.ethBal !== undefined) {
    const E = C.eth, EW = E.weights, em = raw.ethFirstTs ? Math.max(0, (now - raw.ethFirstTs) / MO) : 0;
    const eth = [
      { key: "age", label: "Time on Ethereum", max: EW.age, pts: EW.age * clamp(em / E.ageMonths), detail: raw.ethFirstTs ? `${em.toFixed(1)} months, since ${day(raw.ethFirstTs)}` : "no history found" },
      { key: "txs", label: "Ethereum transactions", max: EW.txs, pts: EW.txs * logScale(raw.ethTxs, E.txs), detail: `${Math.round(raw.ethTxs || 0).toLocaleString("en-US")} transactions` },
      { key: "bal", label: "ETH holding", max: EW.bal, pts: EW.bal * logScale((raw.ethBal || 0) * 100, E.balEth * 100), detail: `${(raw.ethBal || 0).toFixed(raw.ethBal >= 1 ? 2 : 3)} ETH` },
      { key: "name", label: "Name age", max: EW.name, pts: EW.name * clamp(nameMonths / C.nameMonths), detail: nameKnown ? `${nameMonths.toFixed(1)} months, registered ${day(raw.nameTs)}` : nameNote },
    ].map(round);
    const es = total(eth, EW.name);
    if (es > out.score) { out.track = "Ethereum"; out.score = es; out.parts = eth; }
  }
  return { score: out.score, parts: out.parts, track: out.track, eligible: out.score >= C.eligibleAt };
}
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(n < 10 ? 2 : 0); }
