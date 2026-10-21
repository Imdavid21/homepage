// Supabase REST when configured, otherwise an in-memory store so it runs anywhere.
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const mem = globalThis.__hlMem || (globalThis.__hlMem = new Map());
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
export const usingDb = () => !!(URL_ && KEY) || BLOB;
const sb = () => !!(URL_ && KEY);

// Vercel Blob as a small key value store: one JSON file per address under a prefix.
async function blobPut(prefix, address, obj) {
  const { put } = await import("@vercel/blob");
  await put(`${prefix}/${address}.json`, JSON.stringify(obj), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
}
async function blobAll(prefix) {
  const { list } = await import("@vercel/blob");
  let blobs = [], cursor;
  do { const r = await list({ prefix: prefix + "/", cursor, limit: 1000 }); blobs = blobs.concat(r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor && blobs.length < 1000);
  const rows = await Promise.all(blobs.map((b) => fetch(b.url + "?c=" + Date.now()).then((r) => r.json()).catch(() => null)));
  return rows.filter(Boolean);
}
const byScore = (a, b) => b.score - a.score || String(a.updated_at).localeCompare(String(b.updated_at));


export async function list() {
  if (!sb() && BLOB) return (await blobAll("entries")).sort(byScore).slice(0, 500);
  if (!usingDb()) return [...mem.values()];
  const r = await fetch(`${URL_}/rest/v1/entries?select=address,name,handle,score,parts,updated_at&order=score.desc,updated_at.asc&limit=500`, { headers: H });
  if (!r.ok) throw new Error("db " + r.status);
  return r.json();
}

// Keep the best score per address and per handle.
export async function save(e) {
  const rows = await list();
  const clash = e.handle ? rows.find((x) => x.handle === e.handle && x.address !== e.address) : null;
  if (clash && clash.score >= e.score) return { kept: clash };
  const same = rows.find((x) => x.address === e.address);
  if (same && same.score > e.score && same.handle === e.handle) return { kept: same };
  if (!sb() && BLOB) {
    if (clash) { const { del } = await import("@vercel/blob"); await del(`entries/${clash.address}.json`).catch(() => {}); }
    await blobPut("entries", e.address, { ...e, updated_at: new Date().toISOString() });
    return { saved: true };
  }
  if (!usingDb()) {
    if (clash) mem.delete(clash.address);
    mem.set(e.address, { ...e, updated_at: new Date().toISOString() });
    return { saved: true };
  }
  if (clash) await fetch(`${URL_}/rest/v1/entries?address=eq.${clash.address}`, { method: "DELETE", headers: H });
  const r = await fetch(`${URL_}/rest/v1/entries?on_conflict=address`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ ...e, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error("db " + r.status);
  return { saved: true };
}

// Public leaderboard: every name that has been checked, best score kept. Separate from claims.
const lbMem = globalThis.__hlLb || (globalThis.__hlLb = new Map());
export async function lbList(limit = 50) {
  if (!sb() && BLOB) return (await blobAll("scores")).sort(byScore).slice(0, limit);
  if (!usingDb()) return [...lbMem.values()].sort((a, b) => b.score - a.score || a.updated_at.localeCompare(b.updated_at)).slice(0, limit);
  const r = await fetch(`${URL_}/rest/v1/scores?select=address,name,score,parts,updated_at&order=score.desc,updated_at.asc&limit=${limit}`, { headers: H });
  if (!r.ok) throw new Error("db " + r.status);
  return r.json();
}
export async function lbSave(e) {
  const cur = usingDb() ? null : lbMem.get(e.address);
  if (!sb() && BLOB) { await blobPut("scores", e.address, { address: e.address, name: e.name, score: e.score, parts: e.parts, updated_at: new Date().toISOString() }); return; }
  if (!usingDb()) { lbMem.set(e.address, { ...e, updated_at: cur?.updated_at || new Date().toISOString() }); return; }
  const r = await fetch(`${URL_}/rest/v1/scores?on_conflict=address`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ address: e.address, name: e.name, score: e.score, parts: e.parts }) });
  if (!r.ok) throw new Error("db " + r.status);
}
