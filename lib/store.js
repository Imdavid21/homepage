// Supabase REST when configured, otherwise an in-memory store so it runs anywhere.
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const mem = globalThis.__hlMem || (globalThis.__hlMem = new Map());
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

export const usingDb = () => !!(URL_ && KEY);

export async function list() {
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
