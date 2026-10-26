import { CONFIG as C } from "./config.js";
import { computeScore } from "./score.js";
import { resolveName, validHl, validEth } from "./resolve.js";
import { fetchRaw, combine } from "./hl.js";
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

const ADDR = /^0x[a-fA-F0-9]{40}$/;
// Up to 4 extra wallets can be paired to the name. The name's own wallet always counts and always identifies the entry.
function cleanWallets(list, main) {
  const seen = new Set([String(main).toLowerCase()]), out = [];
  for (const a of Array.isArray(list) ? list : []) { const v = String(a || "").trim().toLowerCase(); if (ADDR.test(v) && !seen.has(v)) { seen.add(v); out.push(v); } }
  return out.slice(0, 4);
}
export const badWallets = (list) => (Array.isArray(list) ? list : []).map((a) => String(a || "").trim()).filter((a) => a && !ADDR.test(a));

async function evaluate(name, wallets) {
  const who = isMock() ? mockResolve(String(name).trim().toLowerCase()) : await resolveName(name);
  if (who.error) return { error: who.error };
  const extra = cleanWallets(wallets, who.address), all = [who.address, ...extra];
  const raws = await Promise.all(all.map((a) => (isMock() ? mockRaw(a) : fetchRaw(a))));
  const r = computeScore({ ...combine(raws), nameTs: who.nameTs, nameKind: who.kind });
  return { who, wallets: all.length, score: r.score, parts: r.parts, eligible: C.everyone ? true : r.eligible };
}

// Anyone can check. Nothing is stored.
export async function check({ name, wallets, ip = "x" }) {
  if (limited(ip)) return [429, { error: "Too many checks. Try again in a minute." }];
  if (badWallets(wallets).length) return [400, { error: "One of the paired wallets is not a valid 0x address." }];
  let e;
  try { e = await evaluate(name, wallets); } catch { return [502, { error: "Couldn't reach the network. Try again." }]; }
  if (e.error) return [404, { error: e.error }];
  try { await store.lbSave({ address: e.who.address, name: e.who.name, score: e.score, parts: e.parts, wallets: e.wallets }); } catch {}
  const rows = await store.list();
  const claimed = rows.some((x) => x.address === e.who.address);
  return [200, { name: e.who.name, address: e.who.address, explorers: explorerLinks(e.who), score: e.score, wallets: e.wallets, parts: e.parts, eligible: e.eligible, gate: !C.everyone, claimed, ...(await status()) }];
}

// Recomputed server side. Only inside the window, only if eligible, one per wallet.
export async function claim({ name, wallets, ip = "x" }) {
  if (limited(ip)) return [429, { error: "Too many attempts. Try again in a minute." }];
  if (!isMock() && !store.usingDb()) return [503, { error: "Claims aren't available yet. Check back when they open." }];
  const state = windowState();
  if (state !== "open") return [409, { error: state === "upcoming" ? "Claims haven't opened yet." : "Claims are closed.", ...(await status()) }];
  if (badWallets(wallets).length) return [400, { error: "One of the paired wallets is not a valid 0x address." }];
  let e;
  try { e = await evaluate(name, wallets); } catch { return [502, { error: "Couldn't reach the network. Try again." }]; }
  if (e.error) return [404, { error: e.error }];
  if (!e.eligible) return [403, { error: "This name isn't eligible for a card.", ...(await status()) }];
  const rows = await store.list();
  if (rows.some((x) => x.address === e.who.address)) return [200, { name: e.who.name, claimed: true, already: true, ...(await status()) }];
  if (rows.length >= C.cards) return [409, { error: "All cards have been claimed.", ...(await status()) }];
  await store.save({ address: e.who.address, name: e.who.name, handle: null, score: e.score, parts: e.parts, wallets: e.wallets });
  return [200, { name: e.who.name, claimed: true, ...(await status()) }];
}

const DEMO = ["vitalik.eth", "hyperwhale.hl", "purr.hl", "mumbai.hl", "kolkata.eth", "degen.hl", "satoshi.eth", "liquid.hl"];
export async function getLeaderboard() {
  if (isMock() && !(await store.lbList(1)).length) for (const n of DEMO) { const who = mockResolve(n), r = computeScore(mockRaw(who.address)); await store.lbSave({ address: who.address, name: n, score: r.score, parts: r.parts }); }
  let rows = [];
  try { rows = await store.lbList(300); } catch { return [502, { error: "Leaderboard unavailable." }]; }
  // only .hl and .eth names are ranked; anything else (older seeded display names) stays out of the public board
  rows = rows.filter((x) => { const n = String(x.name || "").trim().toLowerCase(); return validHl(n) || validEth(n); }).slice(0, 200);
  const claimed = new Set((await store.list().catch(() => [])).map((x) => x.address));
  return [200, { cards: C.cards, rows: rows.map((x, i) => ({ rank: i + 1, name: x.name, score: x.score, parts: x.parts, legend: !!x.legend, eligible: C.everyone ? true : x.score >= C.eligibleAt, claimed: claimed.has(x.address) })) }];
}
