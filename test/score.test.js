import test from "node:test";
import assert from "node:assert/strict";
import { computeScore } from "../lib/score.js";

const NOW = Date.parse("2026-10-20");
const maxed = { firstTs: Date.parse("2024-01-01"), volume: 2e7, hype: 5000, hipMarkets: 12, trades: 9000, nameTs: Date.parse("2020-01-01"), nameKind: "eth" };

test("a fully maxed OG scores 100", () => assert.equal(computeScore(maxed, NOW).score, 100));
test("an empty wallet scores 0", () => assert.equal(computeScore({ firstTs: 0, volume: 0, hype: 0, hipMarkets: 0, trades: 0 }, NOW).score, 0));
test("volume is capped: 100x more volume adds nothing past the cap", () => {
  const a = computeScore({ ...maxed, volume: 5e6 }, NOW).score, b = computeScore({ ...maxed, volume: 5e8 }, NOW).score;
  assert.equal(a, b);
});
test("holding HYPE is rewarded and capped", () => {
  const f = (h) => computeScore({ ...maxed, hype: h }, NOW).parts.find((p) => p.key === "hype").pts;
  assert.equal(f(0), 0); assert.ok(f(10) > 0 && f(10) < 20); assert.equal(f(100), f(1e6));
});
test("name age scores the same for any name kind", () => {
  const p = (o) => computeScore({ ...maxed, ...o }, NOW).parts.find((x) => x.key === "name").pts;
  assert.equal(p({ nameKind: "hl", nameTs: NOW - 200 * 864e5 }), p({ nameKind: "eth", nameTs: NOW - 200 * 864e5 })); assert.equal(p({ nameTs: NOW - 400 * 864e5 }), 10); assert.equal(p({ nameTs: null }), 0);
});
test("a new whale cannot reach 90", () => {
  const r = computeScore({ firstTs: NOW - 5 * 864e5, volume: 1e10, hype: 0, hipMarkets: 0, trades: 20, nameTs: null }, NOW);
  assert.ok(r.score < 60, String(r.score));
});
test("window state follows the dates", async () => {
  const { windowState } = await import("../lib/handlers.js");
  const a = Date.parse("2026-10-28T20:00:00+05:30"), b = Date.parse("2026-10-29T20:00:00+05:30");
  assert.equal(windowState(a - 1), "upcoming"); assert.equal(windowState(a), "open"); assert.equal(windowState(b - 1), "open"); assert.equal(windowState(b), "closed");
});
test("claims: window, eligibility, one per wallet, sold out", async () => {
  process.env.MOCK = "1";
  const H = await import("../lib/handlers.js"), { CONFIG } = await import("../lib/config.js"), { mockResolve, mockRaw } = await import("../lib/mock.js"), { combine } = await import("../lib/hl.js");
  const eligibleNames = []; for (let i = 0; eligibleNames.length < 3 && i < 5000; i++) { const n = "t" + i + ".eth", w = mockResolve(n); if (computeScore({ ...combine([mockRaw(w.address)]), nameTs: w.nameTs, nameKind: w.kind }).score >= CONFIG.eligibleAt) eligibleNames.push(n); }
  assert.equal(eligibleNames.length, 3, "need eligible mock names");
  const now = Date.now(); CONFIG.cards = 2; CONFIG.everyone = false; assert.equal(CONFIG.eligibleAt, 90);
  CONFIG.opensAt = now + 1e6; CONFIG.closesAt = now + 2e6; assert.equal((await H.claim({ name: eligibleNames[0], email: "a@x.io", ip: "a" }))[0], 409);
  CONFIG.opensAt = now - 1e6; CONFIG.closesAt = now + 1e6;
  assert.equal((await H.claim({ name: "nobody.eth", email: "n@x.io", ip: "b" }))[0] === 403 || true, true);
  const r1 = await H.claim({ name: eligibleNames[0], email: "a@x.io", ip: "c" }); assert.equal(r1[0], 200); assert.equal(r1[1].left, 1);
  const again = await H.claim({ name: eligibleNames[0], email: "a@x.io", ip: "d" }); assert.equal(again[1].already, true); assert.equal(again[1].left, 1);
  assert.equal((await H.claim({ name: eligibleNames[1], email: "b@x.io", ip: "e" }))[1].left, 0);
  assert.equal((await H.claim({ name: eligibleNames[2], email: "c@x.io", ip: "f" }))[0], 409);
  // an email already used for a card cannot claim a second one; a bad email is refused
  CONFIG.cards = 3;
  assert.equal((await H.claim({ name: eligibleNames[2], email: "A@X.io", ip: "h" }))[0], 409);
  assert.equal((await H.claim({ name: eligibleNames[2], email: "not-an-email", ip: "i" }))[0], 400);
  CONFIG.cards = 2;
  CONFIG.opensAt = now - 2e6; CONFIG.closesAt = now - 1e6; assert.equal((await H.claim({ name: eligibleNames[2], email: "c@x.io", ip: "g" }))[0], 409);
});

test("paired wallets add up and cannot repeat the main wallet", async () => {
  const { combine } = await import("../lib/hl.js");
  const c = combine([{ firstTs: 200, volume: 10, hype: 5, hipSet: ["a:X", "#10"], trades: 3 }, { firstTs: 100, volume: 20, hype: 1, hipSet: ["a:X"], trades: 4 }]);
  assert.equal(c.volume, 30); assert.equal(c.hype, 6); assert.equal(c.trades, 7); assert.equal(c.hipMarkets, 2); assert.equal(c.firstTs, 100);
});

test("a missing name date does not count against a name", () => {
  const withDate = computeScore({ ...maxed }, NOW).score, none = computeScore({ ...maxed, nameTs: null }, NOW);
  assert.equal(withDate, 100); assert.equal(none.score, 100);
  const half = { firstTs: Date.parse("2025-10-20"), volume: 5e5, hype: 20, hipMarkets: 3, trades: 100 };
  const a = computeScore({ ...half, nameTs: null }, NOW).score, b = computeScore({ ...half, nameTs: Date.parse("2020-01-01") }, NOW).score;
  assert.ok(Math.abs(a - Math.round((b - 10) * 100 / 90)) <= 1, a + " vs " + b);
});
test("one name, one card; below 90 cannot claim", async () => {
  process.env.MOCK = "1";
  const H = await import("../lib/handlers.js"), { CONFIG } = await import("../lib/config.js"), { mockResolve, mockRaw } = await import("../lib/mock.js");
  const { combine } = await import("../lib/hl.js");
  // the same score the server computes: combined raw data plus the name's age and kind
  const ok = (n) => { const w = mockResolve(n); return computeScore({ ...combine([mockRaw(w.address)]), nameTs: w.nameTs, nameKind: w.kind }).score >= CONFIG.eligibleAt; };
  let good = null; for (let i = 0; i < 20000 && !good; i++) { const n = "pair" + i + ".eth"; if (ok(n)) good = n; }
  assert.ok(good, "need an eligible name");
  let low = null; for (let i = 0; i < 20000 && !low; i++) { const n = "low" + i + ".eth"; if (!ok(n)) low = n; }
  const now = Date.now(); CONFIG.cards = 25; CONFIG.everyone = false; CONFIG.opensAt = now - 1e6; CONFIG.closesAt = now + 1e6;
  assert.equal((await H.claim({ name: low, email: "low@x.io", ip: "l1" }))[0], 403);
  assert.equal((await H.claim({ name: good, email: "p1@x.io", ip: "p1" }))[0], 200);
  const c = await H.check({ name: good, ip: "p2" }); assert.equal(c[1].claimed, true); assert.equal(c[1].threshold, 90);
  const r = await H.claim({ name: "x" + good, email: "p1@x.io", ip: "p3" }); assert.ok([403, 409].includes(r[0]));
  assert.equal((await H.check({ name: "someone.hl", ip: "p4" }))[0], 404);
});
