// Storage for claims and the public leaderboard.
// Supabase when configured, otherwise Vercel Blob, otherwise memory (local dev).
//
// Blob is kept to a handful of operations on purpose: the free plan counts every list and every read
// that misses the CDN, and the first version (a list plus one read per entry on every page load and every
// 15 second status poll) used the whole allowance. Now each collection is ONE small JSON document:
//   lb.json       public leaderboard rows
//   claims.json   who claimed a card (no emails)
//   p/<hash>.json emails, under a path derived from the token so it cannot be guessed
// Reads are cached in the function for TTL and share a CDN key per minute. A write happens only when something changed.
import { createHash } from "node:crypto";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const SB = !!(URL_ && KEY), BLOB = !SB && !!TOKEN;
export const usingDb = () => SB || BLOB;

const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const byScore = (a, b) => b.score - a.score || String(a.updated_at).localeCompare(String(b.updated_at));
const LB_MAX = 400, TTL = 45e3;

/* ---------- memory (local dev, tests) ---------- */
const mem = globalThis.__hlMem2 || (globalThis.__hlMem2 = { lb: new Map(), claims: new Map(), emails: new Map() });

/* ---------- Vercel Blob as single document storage ---------- */
const EMAILS = "p/" + createHash("sha256").update(TOKEN + ":emails").digest("hex").slice(0, 40) + ".json";
const cache = globalThis.__hlDocs || (globalThis.__hlDocs = new Map());
let base = globalThis.__hlBase || (TOKEN ? `https://${(TOKEN.split("_")[3] || "").toLowerCase()}.public.blob.vercel-storage.com` : "");

async function fetchDoc(path, bust) {
  const get = async (u) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("blob read " + r.status);
    return r.json();
  };
  try { return await get(`${base}/${path}?v=${bust}`); }
  catch (e) {
    if (String(e.message).startsWith("blob read")) throw e;
    // the host guess did not resolve: ask the store once where it lives
    const { list } = await import("@vercel/blob");
    const r = await list({ prefix: path, limit: 1 });
    if (!r.blobs.length) return null;
    base = globalThis.__hlBase = new URL(r.blobs[0].url).origin;
    return get(`${r.blobs[0].url}?v=${bust}`);
  }
}
// fresh=true skips every cache; use it only on write paths
async function readDoc(path, fresh = false) {
  const c = cache.get(path);
  if (!fresh && c && Date.now() - c.t < TTL) return c.v;
  try {
    const v = await fetchDoc(path, fresh ? Date.now() : Math.floor(Date.now() / 6e4));
    cache.set(path, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (!fresh && c) return c.v; // serve the last good copy rather than an error
    throw e;
  }
}
async function writeDoc(path, v) {
  const { put } = await import("@vercel/blob");
  const r = await put(path, JSON.stringify(v), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
  try { base = globalThis.__hlBase = new URL(r.url).origin; } catch {}
  cache.set(path, { t: Date.now(), v });
}

/* ---------- claims ---------- */
export async function claims() {
  if (SB) {
    const r = await fetch(`${URL_}/rest/v1/entries?select=address,name,score,updated_at&order=updated_at.asc&limit=500`, { headers: H });
    if (!r.ok) throw new Error("db " + r.status);
    return r.json();
  }
  if (BLOB) return ((await readDoc("claims.json")) || { rows: [] }).rows;
  return [...mem.claims.values()];
}

// One card per wallet and per email. Returns { status: "ok" | "already" | "full" | "email" }.
export async function claimEntry(e, cap) {
  const at = new Date().toISOString();
  if (SB) {
    const rows = await (await fetch(`${URL_}/rest/v1/entries?select=address,email&limit=500`, { headers: H })).json();
    if (rows.some((x) => x.address === e.address)) return { status: "already" };
    if (rows.some((x) => x.email === e.email)) return { status: "email" };
    if (rows.length >= cap) return { status: "full" };
    const r = await fetch(`${URL_}/rest/v1/entries?on_conflict=address`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ address: e.address, name: e.name, score: e.score, parts: e.parts, email: e.email, updated_at: at }) });
    if (!r.ok) throw new Error("db " + r.status);
    return { status: "ok" };
  }
  if (BLOB) {
    for (let i = 0; i < 3; i++) {
      const cl = (await readDoc("claims.json", true)) || { rows: [] };
      if (cl.rows.some((x) => x.address === e.address)) return { status: "already" };
      if (cl.rows.length >= cap) return { status: "full" };
      const em = (await readDoc(EMAILS, true)) || { by: {} };
      if (Object.entries(em.by).some(([a, v]) => v.email === e.email && a !== e.address && cl.rows.some((x) => x.address === a))) return { status: "email" };
      em.by[e.address] = { email: e.email, name: e.name, at };
      await writeDoc(EMAILS, em);
      cl.rows.push({ address: e.address, name: e.name, score: e.score, updated_at: at });
      await writeDoc("claims.json", cl);
      // a parallel claim may have overwritten ours: confirm it stuck
      const chk = await readDoc("claims.json", true);
      if (chk && chk.rows.some((x) => x.address === e.address)) return { status: "ok" };
    }
    throw new Error("claim not confirmed");
  }
  if (mem.claims.has(e.address)) return { status: "already" };
  if ([...mem.emails.values()].includes(e.email)) return { status: "email" };
  if (mem.claims.size >= cap) return { status: "full" };
  mem.claims.set(e.address, { address: e.address, name: e.name, score: e.score, updated_at: at }); mem.emails.set(e.address, e.email);
  return { status: "ok" };
}

/* ---------- public leaderboard: every name that has been checked, best score kept ---------- */
export async function lbList(limit = 50, fresh = false) {
  if (SB) {
    const r = await fetch(`${URL_}/rest/v1/scores?select=address,name,score,parts,updated_at&order=score.desc,updated_at.asc&limit=${limit}`, { headers: H });
    if (!r.ok) throw new Error("db " + r.status);
    return r.json();
  }
  if (BLOB) return (((await readDoc("lb.json", fresh)) || { rows: [] }).rows).slice().sort(byScore).slice(0, limit);
  return [...mem.lb.values()].sort(byScore).slice(0, limit);
}
export async function lbSave(e) {
  const row = { address: e.address, name: e.name, score: e.score, parts: e.parts };
  if (SB) {
    const r = await fetch(`${URL_}/rest/v1/scores?on_conflict=address`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error("db " + r.status);
    return;
  }
  if (BLOB) {
    const seen = ((await readDoc("lb.json")) || { rows: [] }).rows.find((x) => x.address === row.address);
    if (seen && seen.score === row.score && seen.name === row.name) return; // nothing new: no write
    const doc = (await readDoc("lb.json", true)) || { rows: [] };
    const i = doc.rows.findIndex((x) => x.address === row.address);
    const next = { ...row, updated_at: i >= 0 ? doc.rows[i].updated_at : new Date().toISOString() };
    if (i >= 0) doc.rows[i] = next; else doc.rows.push(next);
    doc.rows.sort(byScore); doc.rows.length = Math.min(doc.rows.length, LB_MAX);
    await writeDoc("lb.json", doc);
    return;
  }
  const cur = mem.lb.get(row.address);
  mem.lb.set(row.address, { ...row, updated_at: cur?.updated_at || new Date().toISOString() });
}
