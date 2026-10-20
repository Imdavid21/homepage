// Deterministic fake data for local previews only (MOCK=1). Never used in production.
let h = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; };
export const mockResolve = (name) => ({ name, address: "0x" + h(name).toString(16).padStart(8, "0").repeat(5).slice(0, 40), kind: name.endsWith(".eth") ? "eth" : "hl" });
export const mockRaw = (address) => {
  const s = parseInt(address.slice(2, 10), 16), r = (m) => ((s >>> m) % 100) / 100;
  return { firstTs: Date.now() - (60 + r(1) * 640) * 864e5, staked: Math.pow(10, r(3) * 4), volume: Math.pow(10, 3 + r(5) * 4.2), activeDays14: Math.round(r(7) * 14),
    breadth: { perps: r(2) > .1, spot: r(4) > .3, hip3: r(6) > .45, vault: r(8) > .6, hypeHeld: r(9) > .3 }, referrals: Math.round(Math.pow(r(11), 2) * 30) };
};
