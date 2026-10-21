import { CONFIG as C } from "./config.js";
import { computeScore } from "./score.js";
import { resolveName } from "./resolve.js";
import { fetchRaw } from "./hl.js";
import { mockResolve, mockRaw } from "./mock.js";
import * as store from "./store.js";

const isMock = () => process.env.MOCK === "1";
const hits = new Map();
const limited = (ip) => { const t = Date.now(), a = (hits.get(ip) || []).filter((x) => t - x < 60000); a.push(t); hits.set(ip, a); return a.length > 12; };

export const explorerLinks = (who) => C.explorers.filter((x) => !x.only || x.only === who.kind).map((x) => ({ label: x.label, url: x.url.replace("{a}", who.address).replace("{n}", encodeURIComponent(who.name)) }));

export const windowState = (now = Date.now()) => (now < C.opensAt ? "upcoming" : now < C.closesAt ? "open" : "closed");

async function status() {
  const taken = (await store.list()).length;
  return { mock: isMock(), cards: C.cards, left: Math.max(0, C.cards - taken), opensAt: C.opensAt, closesAt: C.closesAt, now: Date.now(), state: windowState() };
}
export async function getStatus() { return [200, await status()]; }

async function evaluate(name) {
  const who = isMock() ? mockResolve(String(name).trim().toLowerCase()) : await resolveName(name);
  if (who.error) return { error: who.error };
  const raw = isMock() ? mockRaw(who.address) : await fetchRaw(who.address);
  const r = computeScore({ ...raw, nameTs: who.nameTs, nameKind: who.kind });
  return { who, score: r.score, parts: r.parts, eligible: C.everyone ? true : r.eligible };
}

// Anyone can check. Nothing is stored.
export async function check({ name, ip = "x" }) {
  if (limited(ip)) return [429, { error: "Too many checks. Try again in a minute." }];
  let e;
  try { e = await evaluate(name); } catch { return [502, { error: "Couldn't reach the network. Try again." }]; }
  if (e.error) return [404, { error: e.error }];
  try { await store.lbSave({ address: e.who.address, name: e.who.name, score: e.score, parts: e.parts }); } catch {}
  const rows = await store.list();
  const claimed = rows.some((x) => x.address === e.who.address);
  return [200, { name: e.who.name, address: e.who.address, explorers: explorerLinks(e.who), score: e.score, parts: e.parts, eligible: e.eligible, gate: !C.everyone, claimed, ...(await status()) }];
}

// Recomputed server side. Only inside the window, only if eligible, one per wallet.
export async function claim({ name, ip = "x" }) {
  if (limited(ip)) return [429, { error: "Too many attempts. Try again in a minute." }];
  if (!isMock() && !store.usingDb()) return [503, { error: "Claims aren't available yet. Check back when they open." }];
  const state = windowState();
  if (state !== "open") return [409, { error: state === "upcoming" ? "Claims haven't opened yet." : "Claims are closed.", ...(await status()) }];
  let e;
  try { e = await evaluate(name); } catch { return [502, { error: "Couldn't reach the network. Try again." }]; }
  if (e.error) return [404, { error: e.error }];
  if (!e.eligible) return [403, { error: "This name isn't eligible for a card.", ...(await status()) }];
  const rows = await store.list();
  if (rows.some((x) => x.address === e.who.address)) return [200, { name: e.who.name, claimed: true, already: true, ...(await status()) }];
  if (rows.length >= C.cards) return [409, { error: "All cards have been claimed.", ...(await status()) }];
  await store.save({ address: e.who.address, name: e.who.name, handle: null, score: e.score, parts: e.parts });
  return [200, { name: e.who.name, claimed: true, ...(await status()) }];
}

const DEMO = ["vitalik.eth", "hyperwhale.hl", "purr.hl", "mumbai.hl", "kolkata.eth", "degen.hl", "satoshi.eth", "liquid.hl"];
export async function getLeaderboard() {
  if (isMock() && !(await store.lbList(1)).length) for (const n of DEMO) { const who = mockResolve(n), r = computeScore(mockRaw(who.address)); await store.lbSave({ address: who.address, name: n, score: r.score, parts: r.parts }); }
  let rows = [];
  try { rows = await store.lbList(200); } catch { return [502, { error: "Leaderboard unavailable." }]; }
  const claimed = new Set((await store.list().catch(() => [])).map((x) => x.address));
  return [200, { cards: C.cards, rows: rows.map((x, i) => ({ rank: i + 1, name: x.name, score: x.score, parts: x.parts, eligible: C.everyone ? true : x.score >= C.eligibleAt, claimed: claimed.has(x.address) })) }];
}
