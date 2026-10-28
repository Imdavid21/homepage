import { CONFIG as C } from "./config.js";
import { computeScore } from "./score.js";
import { resolveName, validEth } from "./resolve.js";
import { fetchRaw, combine } from "./hl.js";
import { fetchEthRaw, combineEth } from "./eth.js";
import { mockResolve, mockRaw, mockEth } from "./mock.js";
import * as store from "./store.js";

const isMock = () => process.env.MOCK === "1";
const hits = new Map();
const limited = (ip) => { const t = Date.now(), a = (hits.get(ip) || []).filter((x) => t - x < 60000); a.push(t); hits.set(ip, a); return a.length > 12; };

export const explorerLinks = (who) => C.explorers.filter((x) => !x.only || x.only === who.kind).map((x) => ({ label: x.label, url: x.url.replace("{a}", who.address).replace("{n}", encodeURIComponent(who.name)) }));

export const windowState = (now = Date.now()) => (now < C.opensAt ? "upcoming" : now < C.closesAt ? "open" : "closed");

async function status() {
  const base = { mock: isMock(), cards: C.cards, threshold: C.eligibleAt, opensAt: C.opensAt, closesAt: C.closesAt, now: Date.now(), state: windowState() };
  try { return { ...base, left: Math.max(0, C.cards - (await store.claims()).length) }; }
  catch (e) { console.error("status", e && e.message); return { ...base, left: C.cards, degraded: true }; }
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
  const n = String(name || "").trim().toLowerCase();
  if (!validEth(n)) return { error: "Enter a .eth name." };
  const who = isMock() ? mockResolve(n) : await resolveName(n);
  if (who.error) return { error: who.error };
  const extra = cleanWallets(wallets, who.address), all = [who.address, ...extra];
  const [raws, eths] = await Promise.all([
    Promise.all(all.map((a) => (isMock() ? mockRaw(a) : fetchRaw(a)))),
    Promise.all(all.map((a) => (isMock() ? mockEth(a) : fetchEthRaw(a)))),
  ]);
  const r = computeScore({ ...combine(raws), ...combineEth(eths), nameTs: who.nameTs, nameKind: who.kind });
  return { who, wallets: all.length, score: r.score, parts: r.parts, track: r.track, eligible: C.everyone ? true : r.eligible };
}

// Anyone can check. Nothing is stored.
export async function check({ name, wallets, ip = "x" }) {
  if (limited(ip)) return [429, { error: "Too many checks. Try again in a minute." }];
  if (badWallets(wallets).length) return [400, { error: "One of the paired wallets is not a valid 0x address." }];
  let e;
  try { e = await evaluate(name, wallets); } catch { return [502, { error: "Couldn't reach the network. Try again." }]; }
  if (e.error) return [404, { error: e.error }];
  try { await store.lbSave({ address: e.who.address, name: e.who.name, score: e.score, parts: e.parts }); } catch (err) { console.error("lbSave", err && err.message); }
  let claimed = false, nameTaken = false, no = 1;
  try {
    const rows = await store.claims();
    claimed = rows.some((x) => x.address === e.who.address);
    no = cardNo(rows, e.who.address);
    nameTaken = !claimed && rows.some((x) => store.baseOf(x.name) === store.baseOf(e.who.name));
  } catch {}
  return [200, { name: e.who.name, address: e.who.address, explorers: explorerLinks(e.who), score: e.score, track: e.track, wallets: e.wallets, parts: e.parts, eligible: e.eligible, gate: !C.everyone, claimed, nameTaken, no, ...(await status()) }];
}

export const validEmail = (v) => v.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v);

// Recomputed server side. Only inside the window, only if eligible, one per wallet and one per email.
// The email is the one used to register on Luma; it is stored apart from the public data and never returned.
export async function claim({ name, wallets, email, ip = "x" }) {
  if (limited(ip)) return [429, { error: "Too many attempts. Try again in a minute." }];
  if (!isMock() && !store.usingDb()) return [503, { error: "Claims aren't available yet. Check back when they open." }];
  const state = windowState();
  if (state !== "open") return [409, { error: state === "upcoming" ? "Claims haven't opened yet." : "Claims are closed.", ...(await status()) }];
  const mail = String(email || "").trim().toLowerCase();
  if (!validEmail(mail)) return [400, { error: "Enter the email you used to register on Luma." }];
  if (badWallets(wallets).length) return [400, { error: "One of the paired wallets is not a valid 0x address." }];
  let e;
  try { e = await evaluate(name, wallets); } catch { return [502, { error: "Couldn't reach the network. Try again." }]; }
  if (e.error) return [404, { error: e.error }];
  if (!e.eligible) return [403, { error: `A score of ${C.eligibleAt} or more is needed to claim. This name scored ${e.score}.`, ...(await status()) }];
  let r;
  try { r = await store.claimEntry({ address: e.who.address, name: e.who.name, score: e.score, parts: e.parts, email: mail }, C.cards); }
  catch (err) { console.error("claim", err && err.message); return [503, { error: "Claims are temporarily unavailable. Try again in a few minutes." }]; }
  const st = await status();
  let no; try { no = cardNo(await store.claims(), e.who.address); } catch {}
  if (r.status === "already") return [200, { name: e.who.name, claimed: true, already: true, no, ...st }];
  if (r.status === "name") return [409, { error: `A card for "${store.baseOf(e.who.name)}" has already been claimed.`, ...st }];
  if (r.status === "email") return [409, { error: "A card has already been claimed with this email.", ...st }];
  if (r.status === "full") return [409, { error: "All cards have been claimed.", ...st }];
  return [200, { name: e.who.name, claimed: true, no, ...st }];
}

// The card number: its place in the claim order once claimed, otherwise the next number up
export function cardNo(rows, address) { const i = rows.findIndex((x) => x.address === address); return i >= 0 ? i + 1 : Math.min(C.cards, rows.length + 1); }

const DEMO = ["vitalik.eth", "hyperwhale.eth", "purr.eth", "mumbai.eth", "kolkata.eth", "degen.eth", "satoshi.eth", "liquid.eth"];
export async function getLeaderboard({ fresh = false } = {}) {
  if (isMock() && !(await store.lbList(1)).length) for (const n of DEMO) { const who = mockResolve(n), r = computeScore({ ...mockRaw(who.address), ...mockEth(who.address) }); await store.lbSave({ address: who.address, name: n, score: r.score, parts: r.parts }); }
  let rows = [], got = new Set();
  try { rows = await store.lbList(300, fresh); } catch (err) { console.error("leaderboard", err && err.message); return [502, { error: "Leaderboard unavailable." }]; }
  // only .eth names are ranked
  rows = rows.filter((x) => validEth(String(x.name || "").trim().toLowerCase())).slice(0, 200);
  try { got = new Set((await store.claims()).map((x) => x.address)); } catch {}
  // claimed names first, each group keeping its score order
  rows = [...rows.filter((x) => got.has(x.address)), ...rows.filter((x) => !got.has(x.address))];
  return [200, { cards: C.cards, rows: rows.map((x, i) => ({ rank: i + 1, name: x.name, score: x.score, parts: x.parts, eligible: C.everyone ? true : x.score >= C.eligibleAt, claimed: got.has(x.address) })) }];
}
