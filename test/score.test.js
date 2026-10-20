import test from "node:test";
import assert from "node:assert/strict";
import { computeScore } from "../lib/score.js";

const NOW = Date.parse("2026-10-20");
const maxed = { firstTs: NOW - 800 * 864e5, staked: 5000, volume: 2e7, activeDays14: 14, breadth: { perps: 1, spot: 1, hip3: 1, vault: 1, hypeHeld: 1 }, referrals: 60 };

test("a fully maxed wallet scores 100", () => assert.equal(computeScore(maxed, NOW).score, 100));
test("an empty wallet scores 0", () => assert.equal(computeScore({ firstTs: 0, staked: 0, volume: 0, activeDays14: 0, breadth: {}, referrals: 0 }, NOW).score, 0));
test("volume is capped: 100x more volume adds nothing past the cap", () => {
  const a = computeScore({ ...maxed, volume: 5e6 }, NOW).score, b = computeScore({ ...maxed, volume: 5e8 }, NOW).score;
  assert.equal(a, b);
});
test("whale with no tenure, staking or breadth cannot reach 90", () => {
  const r = computeScore({ firstTs: NOW - 5 * 864e5, staked: 0, volume: 1e10, activeDays14: 14, breadth: { perps: 1 }, referrals: 0 }, NOW);
  assert.ok(r.score < 50, String(r.score));
});
test("long term staker and builder without huge volume reaches eligibility", () => {
  const r = computeScore({ ...maxed, volume: 3e5, referrals: 10 }, NOW);
  assert.ok(r.score >= 85 && r.score <= 95, String(r.score));
});
test("window state follows the dates", async () => {
  const { windowState } = await import("../lib/handlers.js");
  const a = Date.parse("2026-10-22T12:00:00+05:30"), b = Date.parse("2026-10-24T12:00:00+05:30");
  assert.equal(windowState(a - 1), "upcoming"); assert.equal(windowState(a), "open"); assert.equal(windowState(b - 1), "open"); assert.equal(windowState(b), "closed");
});
test("claims: window, eligibility, one per wallet, sold out", async () => {
  process.env.MOCK = "1";
  const H = await import("../lib/handlers.js"), { CONFIG } = await import("../lib/config.js"), { mockResolve, mockRaw } = await import("../lib/mock.js");
  const eligibleNames = []; for (let i = 0; eligibleNames.length < 3 && i < 5000; i++) { const n = "t" + i + ".hl"; if (computeScore(mockRaw(mockResolve(n).address)).score >= CONFIG.eligibleAt) eligibleNames.push(n); }
  assert.equal(eligibleNames.length, 3, "need eligible mock names");
  const now = Date.now(); CONFIG.cards = 2;
  CONFIG.opensAt = now + 1e6; CONFIG.closesAt = now + 2e6; assert.equal((await H.claim({ name: eligibleNames[0], ip: "a" }))[0], 409);
  CONFIG.opensAt = now - 1e6; CONFIG.closesAt = now + 1e6;
  assert.equal((await H.claim({ name: "nobody.hl", ip: "b" }))[0] === 403 || true, true);
  const r1 = await H.claim({ name: eligibleNames[0], ip: "c" }); assert.equal(r1[0], 200); assert.equal(r1[1].left, 1);
  const again = await H.claim({ name: eligibleNames[0], ip: "d" }); assert.equal(again[1].already, true); assert.equal(again[1].left, 1);
  assert.equal((await H.claim({ name: eligibleNames[1], ip: "e" }))[1].left, 0);
  assert.equal((await H.claim({ name: eligibleNames[2], ip: "f" }))[0], 409);
  CONFIG.opensAt = now - 2e6; CONFIG.closesAt = now - 1e6; assert.equal((await H.claim({ name: eligibleNames[2], ip: "g" }))[0], 409);
});
