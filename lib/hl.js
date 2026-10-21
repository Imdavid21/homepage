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

export async function fetchRaw(user, now = Date.now()) {
  const [portfolio, fees, fills] = await Promise.all([
    safe(post({ type: "portfolio", user }), []),
    safe(post({ type: "userFees", user }), {}),
    safe(post({ type: "userFillsByTime", user, startTime: now - 90 * DAY }), []),
  ]);
  const all = (portfolio.find?.((p) => p[0] === "allTime") || [])[1] || {};
  const hist = all.accountValueHistory || [], pl = all.pnlHistory || [];
  const firstTs = hist.length ? Math.min(...hist.map((h) => h[0])) : (fills.length ? Math.min(...fills.map((f) => f.time)) : 0);
  const daily = fees.dailyUserVlm || [];
  const cutoff = new Date(now - 14 * DAY).toISOString().slice(0, 10);
  const activeDays14 = daily.filter((d) => d.date >= cutoff && (num(d.userCross) + num(d.userAdd)) > 0).length;
  const closed = fills.filter((f) => num(f.closedPnl) !== 0);
  return {
    firstTs,
    volume: num(all.vlm),
    pnl: pl.length ? num(pl[pl.length - 1][1]) : 0,
    activeDays14,
    markets: new Set(fills.map((f) => String(f.coin || ""))).size,
    closes: closed.length,
    wins: closed.filter((f) => num(f.closedPnl) > 0).length,
  };
}
