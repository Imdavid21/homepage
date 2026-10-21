// Reads public Hyperliquid info endpoints. No keys needed.
const HL = process.env.HL_API || "https://api.hyperliquid.xyz/info";
const post = async (body) => {
  const r = await fetch(HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HL ${body.type} ${r.status}`);
  return r.json();
};
const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };
const num = (x) => Number(x) || 0;
const DAY = 864e5;

// All fills, oldest first. The API keeps only the most recent 10,000, so the count is capped there.
async function allFills(user) {
  let start = 0, out = [], capped = false;
  for (let i = 0; i < 6; i++) {
    const r = await safe(post({ type: "userFillsByTime", user, startTime: start }), []);
    if (!r.length) break;
    out = out.concat(r);
    if (r.length < 2000) break;
    start = r[r.length - 1].time + 1;
    if (i === 5) capped = true;
  }
  return { fills: out, capped: capped || out.length >= 10000 };
}
// HIP-3 markets are "dex:COIN". HIP-4 outcome markets are "#<n>" (or "+<n>" in balances).
const isHip = (c) => c.includes(":") || c.startsWith("#") || c.startsWith("+");

export async function fetchRaw(user, now = Date.now()) {
  const [portfolio, deleg, spot, { fills, capped }] = await Promise.all([
    safe(post({ type: "portfolio", user }), []),
    safe(post({ type: "delegatorSummary", user }), {}),
    safe(post({ type: "spotClearinghouseState", user }), {}),
    allFills(user),
  ]);
  const all = (portfolio.find?.((p) => p[0] === "allTime") || [])[1] || {};
  const hist = all.accountValueHistory || [];
  const times = [...hist.map((h) => h[0]), ...fills.map((f) => f.time)].filter(Boolean);
  const hype = (spot.balances || []).find((x) => x.coin === "HYPE");
  return {
    firstTs: times.length ? Math.min(...times) : 0,
    volume: num(all.vlm),
    hype: num(deleg.delegated) + num(deleg.undelegated) + num(hype && hype.total),
    hipMarkets: new Set(fills.map((f) => String(f.coin || "")).filter(isHip)).size,
    trades: fills.length,
    tradesCapped: capped,
  };
}
