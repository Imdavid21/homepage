// Deterministic fake data for local previews only (MOCK=1). Never used in production.
let h = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; };
export const mockResolve = (name) => ({ name, address: name.startsWith("elite") ? "0xe11e" + h(name).toString(16).padStart(8, "0").repeat(5).slice(0, 36) : "0x" + h(name).toString(16).padStart(8, "0").repeat(5).slice(0, 40), kind: name.endsWith(".eth") ? "eth" : "hl" });
export const mockRaw = (address) => {
  if (address.startsWith("0xe11e")) return { firstTs: Date.parse("2024-06-01"), volume: 9e6, hype: 5000, hipMarkets: 12, trades: 6000 };
  const s = parseInt(address.slice(2, 10), 16), r = (m) => ((s >>> m) % 100) / 100;
  return { firstTs: Date.now() - (60 + r(1) * 760) * 864e5, volume: Math.pow(10, 3 + r(5) * 4.2), hype: Math.pow(10, r(8) * 3.5), hipMarkets: Math.round(r(4) * 12), trades: Math.round(Math.pow(10, r(3) * 4)) };
};
