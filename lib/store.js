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

// pasted values often carry a trailing slash, a newline or the /rest/v1 suffix
const URL_ = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const SB = !!(URL_ && KEY), BLOB = !SB && !!TOKEN;
export const usingDb = () => SB || BLOB;
// A name can be claimed once, whichever of .hl or .eth it was claimed on: david.hl and david.eth share "david"
export const baseOf = (n) => String(n || "").trim().toLowerCase().replace(/\.(hl|eth)$/, "");

// the newer sb_secret_ keys are not JWTs and go in apikey only
const H = { apikey: KEY, ...(KEY.startsWith("sb_") ? {} : { authorization: `Bearer ${KEY}` }), "content-type": "application/json" };
// one place for every Supabase call: a failure says what Supabase answered
async function sb(path, init) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H, ...init, signal: AbortSignal.timeout(10000) });
  if (r.ok || r.status === 409) return r;
  let body = ""; try { body = (await r.text()).slice(0, 180); } catch {}
  throw new Error(`db ${r.status} on ${path.split("?")[0]}: ${body}`);
}
// Names taken off the site: their claim and leaderboard rows are deleted once per server instance, and never shown or saved again.
export const REMOVED = ["uddalak.eth", "dev.eth", "adityajain.eth", "killua.eth", "ayisha.eth", "ayushjr.eth", "subsix.eth", "vestor.eth"];
const hidden = (n) => REMOVED.includes(String(n || "").trim().toLowerCase());
let purged = globalThis.__hlPurged || null;
const purge = () => purged || (purged = globalThis.__hlPurged = Promise.all(REMOVED.map((n) => removeName(n))).catch((e) => { purged = globalThis.__hlPurged = null; console.error("purge", e && e.message); }));
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
  await purge();
  return (await claimsRaw()).filter((x) => !hidden(x.name));
}
async function claimsRaw() {
  if (SB) {
    return (await sb("entries?select=address,name,score,updated_at&order=updated_at.asc&limit=500")).json();
  }
  if (BLOB) return ((await readDoc("claims.json")) || { rows: [] }).rows;
  return [...mem.claims.values()];
}

// One card per wallet and per email. Returns { status: "ok" | "already" | "full" | "email" }.
export async function claimEntry(e, cap) {
  if (hidden(e.name)) return { status: "name" };
  const at = new Date().toISOString();
  if (SB) {
    const rows = await (await sb("entries?select=address,name,email&limit=500")).json();
    if (rows.some((x) => x.address === e.address)) return { status: "already" };
    if (rows.some((x) => baseOf(x.name) === baseOf(e.name))) return { status: "name" };
    if (rows.some((x) => x.email === e.email)) return { status: "email" };
    if (rows.length >= cap) return { status: "full" };
    const r = await sb("entries?on_conflict=address", { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ address: e.address, name: e.name, score: e.score, parts: e.parts, email: e.email, updated_at: at }) });
    if (r.status === 409) return { status: "email" }; // the unique index on email caught a parallel claim
    return { status: "ok" };
  }
  if (BLOB) {
    for (let i = 0; i < 3; i++) {
      const cl = (await readDoc("claims.json", true)) || { rows: [] };
      if (cl.rows.some((x) => x.address === e.address)) return { status: "already" };
      if (cl.rows.some((x) => baseOf(x.name) === baseOf(e.name))) return { status: "name" };
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
  if ([...mem.claims.values()].some((x) => baseOf(x.name) === baseOf(e.name))) return { status: "name" };
  if ([...mem.emails.values()].includes(e.email)) return { status: "email" };
  if (mem.claims.size >= cap) return { status: "full" };
  mem.claims.set(e.address, { address: e.address, name: e.name, score: e.score, updated_at: at }); mem.emails.set(e.address, e.email);
  return { status: "ok" };
}

/* ---------- public leaderboard: every name that has been checked, best score kept ---------- */
export async function lbList(limit = 50, fresh = false) {
  await purge();
  return (await lbRaw(limit, fresh)).filter((x) => !hidden(x.name));
}
async function lbRaw(limit, fresh) {
  if (SB) {
    return (await sb(`scores?select=address,name,score,parts,updated_at&order=score.desc,updated_at.asc&limit=${limit}`)).json();
  }
  if (BLOB) return (((await readDoc("lb.json", fresh)) || { rows: [] }).rows).slice().sort(byScore).slice(0, limit);
  return [...mem.lb.values()].sort(byScore).slice(0, limit);
}
export async function lbSave(e) {
  if (hidden(e.name)) return;
  const row = { address: e.address, name: e.name, score: e.score, parts: e.parts };
  if (SB) {
    await sb("scores?on_conflict=address", { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
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

// For /api/health: what is configured and whether each table answers. Never returns a secret.
export async function health() {
  const out = { storage: SB ? "supabase" : BLOB ? "blob" : "memory (nothing is saved)" };
  if (SB) {
    try { out.host = new URL(URL_).host; } catch { out.host = "SUPABASE_URL is not a valid URL"; }
    out.keyKind = KEY ? (KEY.startsWith("sb_secret_") ? "secret key" : KEY.startsWith("eyJ") ? "JWT key (service_role or anon)" : "unrecognised") : "missing";
    for (const t of ["entries", "scores"]) {
      try { await sb(`${t}?select=address&limit=1`); out[t] = "ok"; } catch (e) { out[t] = String(e.message).slice(0, 220); }
    }
    try { await sb("entries?select=email&limit=1"); out.emailColumn = "ok"; } catch (e) { out.emailColumn = String(e.message).slice(0, 220); }
  } else if (BLOB) {
    for (const d of ["lb.json", "claims.json"]) { try { await readDoc(d, true); out[d] = "ok"; } catch (e) { out[d] = String(e.message).slice(0, 120); } }
  }
  return out;
}

// Admin: take a name off the claims and the leaderboard. Used by /api/admin only.
export async function removeName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return { claims: 0, scores: 0 };
  if (SB) {
    const q = encodeURIComponent(n);
    const a = await (await sb(`entries?name=eq.${q}`, { method: "DELETE", headers: { ...H, prefer: "return=representation" } })).json();
    const b = await (await sb(`scores?name=eq.${q}`, { method: "DELETE", headers: { ...H, prefer: "return=representation" } })).json();
    return { claims: a.length, scores: b.length };
  }
  if (BLOB) {
    const cl = (await readDoc("claims.json", true)) || { rows: [] }, lb = (await readDoc("lb.json", true)) || { rows: [] };
    const c0 = cl.rows.length, l0 = lb.rows.length;
    cl.rows = cl.rows.filter((x) => x.name !== n); lb.rows = lb.rows.filter((x) => x.name !== n);
    if (cl.rows.length !== c0) await writeDoc("claims.json", cl);
    if (lb.rows.length !== l0) await writeDoc("lb.json", lb);
    return { claims: c0 - cl.rows.length, scores: l0 - lb.rows.length };
  }
  let c = 0, s = 0;
  for (const [k, v] of mem.claims) if (v.name === n) { mem.claims.delete(k); mem.emails.delete(k); c++; }
  for (const [k, v] of mem.lb) if (v.name === n) { mem.lb.delete(k); s++; }
  return { claims: c, scores: s };
}

// Is this email on the list approved for the event? Only the database holds the list; without one (local dev) nobody is turned away.
export async function isApproved(email) {
  if (!SB) return true;
  const e = String(email || "").trim().toLowerCase();
  const r = await sb(`approved?email=eq.${encodeURIComponent(e)}&select=email&limit=1`);
  const j = await r.json();
  return Array.isArray(j) && j.length > 0;
}
