// Wick Runner (STRAT x Hyperliquid India) leaderboard for the House of HYPE night.
// Players enter with their Telegram username, which is also their name on the board.
// Supabase (tables wick_players, wick_runs, function wick_submit) is the source of truth;
// Vercel Blob keeps a mirror and is the fallback if Supabase is unreachable.
// Scores stop counting at CLOSES_AT; the top PRIZE_SLOTS real players (seed = false) win.
import { get, put } from '@vercel/blob';

const CLOSES_AT = Date.parse('2026-11-03T23:59:59+05:30');
const PRIZE_SLOTS = 10;
const MAX_SCORE = 5000000;
const BLOB_KEY = 'wick-runner/house-of-hype-2026-11-03.json';
const SB = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SK = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const meta = () => ({ closesAt: CLOSES_AT, closed: Date.now() > CLOSES_AT, slots: PRIZE_SLOTS });

async function sb(path, init = {}) {
  if (!SB || !SK) throw new Error('supabase not configured');
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SK, authorization: `Bearer ${SK}`, 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function blobRead() {
  try {
    const r = await get(BLOB_KEY, { access: 'private', useCache: false });
    if (!r) return [];
    const d = JSON.parse(await new Response(r.stream).text());
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}
async function blobWrite(tg, display, score) {
  try {
    const rows = await blobRead();
    const i = rows.findIndex(r => r.tg === tg);
    if (i >= 0) { rows[i].name = display; if (score > rows[i].score) { rows[i].score = score; rows[i].at = Date.now(); } }
    else rows.push({ tg, name: display, score, at: Date.now() });
    rows.sort((a, b) => b.score - a.score || a.at - b.at);
    await put(BLOB_KEY, JSON.stringify(rows.slice(0, 1000)), { access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false });
  } catch (e) {}
}
async function board(full) {
  try {
    const sel = full ? 'tg,display,score,best_at,runs,seed' : 'display,score,best_at';
    const rows = await sb(`wick_players?select=${sel}&score=gt.0&order=score.desc,best_at.asc&limit=${full ? 1000 : 100}`);
    return rows.map(r => full ? r : ({ name: r.display, score: r.score, at: Date.parse(r.best_at) || 0 }));
  } catch (e) {
    const rows = (await blobRead()).filter(r => r.score > 0);
    return full ? rows : rows.slice(0, 100).map(({ name, score, at }) => ({ name, score, at }));
  }
}

const cleanTg = h => {
  const v = String(h || '').trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v) ? v : '';
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const admin = process.env.WICK_ADMIN_KEY;
      if (admin && url.searchParams.get('admin') === admin) {
        const rows = await board(true);
        return json({ ...meta(), winners: rows.filter(r => !r.seed).slice(0, PRIZE_SLOTS), rows });
      }
      return json({ ...meta(), rows: await board(false) });
    }
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (Date.now() > CLOSES_AT) return json({ error: 'closed', ...meta() }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400); }
    const display = cleanTg(body.tg), score = Math.floor(Number(body.score));
    if (!display || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: 'invalid' }, 400);
    const tg = display.toLowerCase();
    let ok = true;
    try { await sb('rpc/wick_submit', { method: 'POST', body: JSON.stringify({ p_tg: tg, p_display: display, p_score: score }) }); }
    catch (e) { ok = false; console.error(e.message); }
    await blobWrite(tg, display, score);
    return json({ ok: true, store: ok ? 'supabase' : 'blob', ...meta(), rows: await board(false) });
  },
};
