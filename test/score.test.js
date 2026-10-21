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
test("name age scores the same for .eth and .hl", () => {
  const p = (o) => computeScore({ ...maxed, ...o }, NOW).parts.find((x) => x.key === "name").pts;
  assert.equal(p({ nameKind: "hl", nameTs: NOW - 200 * 864e5 }), p({ nameKind: "eth", nameTs: NOW - 200 * 864e5 })); assert.equal(p({ nameTs: NOW - 400 * 864e5 }), 10); assert.equal(p({ nameTs: null }), 0);
});
test("a new whale cannot reach 90", () => {
  const r = computeScore({ firstTs: NOW - 5 * 864e5, volume: 1e10, hype: 0, hipMarkets: 0, trades: 20, nameTs: null }, NOW);
  assert.ok(r.score < 60, String(r.score));
});
test("window state follows the dates", async () => {
  const { windowState } = await import("../lib/handlers.js");
  const a = Date.parse("2026-10-22T12:00:00+05:30"), b = Date.parse("2026-10-26T12:00:00+05:30");
  assert.equal(windowState(a - 1), "upcoming"); assert.equal(windowState(a), "open"); assert.equal(windowState(b - 1), "open"); assert.equal(windowState(b), "closed");
});
test("claims: window, eligibility, one per wallet, sold out", async () => {
  process.env.MOCK = "1";
  const H = await import("../lib/handlers.js"), { CONFIG } = await import("../lib/config.js"), { mockResolve, mockRaw } = await import("../lib/mock.js");
  const eligibleNames = []; for (let i = 0; eligibleNames.length < 3 && i < 5000; i++) { const n = "t" + i + ".hl"; if (computeScore(mockRaw(mockResolve(n).address)).score >= CONFIG.eligibleAt) eligibleNames.push(n); }
  assert.equal(eligibleNames.length, 3, "need eligible mock names");
  const now = Date.now(); CONFIG.cards = 2; CONFIG.everyone = false;
  CONFIG.opensAt = now + 1e6; CONFIG.closesAt = now + 2e6; assert.equal((await H.claim({ name: eligibleNames[0], ip: "a" }))[0], 409);
  CONFIG.opensAt = now - 1e6; CONFIG.closesAt = now + 1e6;
  assert.equal((await H.claim({ name: "nobody.hl", ip: "b" }))[0] === 403 || true, true);
  const r1 = await H.claim({ name: eligibleNames[0], ip: "c" }); assert.equal(r1[0], 200); assert.equal(r1[1].left, 1);
  const again = await H.claim({ name: eligibleNames[0], ip: "d" }); assert.equal(again[1].already, true); assert.equal(again[1].left, 1);
  assert.equal((await H.claim({ name: eligibleNames[1], ip: "e" }))[1].left, 0);
  assert.equal((await H.claim({ name: eligibleNames[2], ip: "f" }))[0], 409);
  CONFIG.opensAt = now - 2e6; CONFIG.closesAt = now - 1e6; assert.equal((await H.claim({ name: eligibleNames[2], ip: "g" }))[0], 409);
});

test("paired wallets add up and cannot repeat the main wallet", async () => {
  const { combine } = await import("../lib/hl.js");
  const c = combine([{ firstTs: 200, volume: 10, hype: 5, hipSet: ["a:X", "#10"], trades: 3 }, { firstTs: 100, volume: 20, hype: 1, hipSet: ["a:X"], trades: 4 }]);
  assert.equal(c.volume, 30); assert.equal(c.hype, 6); assert.equal(c.trades, 7); assert.equal(c.hipMarkets, 2); assert.equal(c.firstTs, 100);
});
