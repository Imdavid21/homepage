import { getJSON, send } from "./_lib.js";

// Live market snapshot from the public Hyperliquid info API (no key).
const HL = "https://api.hyperliquid.xyz/info";
const info = body => getJSON(HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default async function handler(req, res) {
  const out = { updatedAt: Date.now() };
  try {
    const [main, dexs, spot] = await Promise.all([
      info({ type: "metaAndAssetCtxs" }),
      info({ type: "perpDexs" }),
      info({ type: "spotMetaAndAssetCtxs" }).catch(() => null),
    ]);
    let perpVol = 0, oi = 0, markets = 0, hip3Vol = 0, hip3Oi = 0, hip3Markets = 0;
    const all = [];
    const add = (pair, dex) => {
      if (!pair || !pair[0] || !pair[1]) return;
      pair[0].universe.forEach((u, i) => {
        const c = pair[1][i];
        if (!c || u.isDelisted) return;
        const px = +c.markPx || 0, prev = +c.prevDayPx || 0;
        const v = +c.dayNtlVlm || 0, o = (+c.openInterest || 0) * px;
        perpVol += v; oi += o; markets++;
        if (dex) { hip3Vol += v; hip3Oi += o; hip3Markets++; }
        all.push({ n: u.name, v, oi: o, px, chg: prev ? px / prev - 1 : 0, dex: dex || null });
      });
    };
    add(main, null);
    const names = (dexs || []).filter(Boolean).map(d => d.name);
    const extra = await Promise.allSettled(names.map(n => info({ type: "metaAndAssetCtxs", dex: n })));
    extra.forEach((r, i) => { if (r.status === "fulfilled") add(r.value, names[i]); });
    const spotVol = spot ? (spot[1] || []).reduce((s, c) => s + (+c.dayNtlVlm || 0), 0) : null;
    const hype = all.find(m => m.n === "HYPE" && !m.dex);
    all.sort((a, b) => b.v - a.v);
    Object.assign(out, {
      perpVol24h: perpVol,
      spotVol24h: spotVol,
      oi,
      hip3Vol24h: hip3Vol,
      hip3Oi,
      hip3Share: oi ? hip3Oi / oi : null,
      markets,
      hip3Markets,
      hip3Dexes: names.length,
      hype: hype ? { px: hype.px, chg: hype.chg } : null,
      top: all.slice(0, 72).map(m => ({ n: m.n, v: Math.round(m.v), px: m.px, chg: +m.chg.toFixed(5), dex: m.dex })),
    });
  } catch (e) {
    out.error = String(e);
  }
  // Fees and revenue from DefiLlama's free summary endpoints.
  const llama = t => getJSON(`https://api.llama.fi/summary/fees/hyperliquid?dataType=${t}&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`);
  const [fees, rev] = await Promise.allSettled([llama("dailyFees"), llama("dailyRevenue")]);
  if (fees.status === "fulfilled") out.fees = { d24: fees.value.total24h ?? null, all: fees.value.totalAllTime ?? null };
  if (rev.status === "fulfilled") out.revenue = { d24: rev.value.total24h ?? null, all: rev.value.totalAllTime ?? null };
  send(res, out, 30, 120);
}
